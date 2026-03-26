'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  X, Eye, Settings, Shield, Beaker, GitBranch, Network, Rocket,
  CheckCircle2, Loader2, ArrowLeft, ArrowRight, AlertCircle, AlertTriangle,
  History, RotateCcw, Zap, Cloud, Server, Check,
} from 'lucide-react';
import { useEventStore, type DesignEvent, type EventType } from '../stores/event-store';
import {
  sortEventsForDeployment, filterExecutableEvents, generateSnowflakeSQL,
  validateEventLocally, extractMappedTablesOverview, extractIngestionConfigs,
} from './deployment/deployment-utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { getCortexRecommend } from '@/app/services/cortex/';
import { useSession } from 'next-auth/react';
// v1 API — /api/v1/explore-design/* and /projects/*
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { rollbackVersion, bulkUpdateEvents } from '@/app/services/api/projectsApi';
// Old service — kept for reference, deploy now uses addDDLAction + executeDDLActions
// import { deploySchema } from '@/app/services/api/v1/explore-design';
import type {
  CreateExploreDeploymentRequest,
  ProjectVersion,
  VersionListResponse,
  ExecuteIngestionRequest,
  ExecuteIngestionResponse,
  ExecuteDDLResponse,
  CreateDDLActionRequest,
  DDLType,
  IngestionMode,
  ColumnMappingInput,
  RollbackResponse,
  CronChoice,
} from '@/app/services/api/types';

// Local types (previously imported from old explore-design service)
interface SQLStatement {
  sql: string;
  rollback_sql?: string;
  object_type?: string;
  object_name?: string;
}

interface IngestionTableConfig {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database?: string;
  target_schema?: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  mappings?: ColumnMappingInput[];
  config?: Record<string, unknown>;
}

// Deployment result — replaces old SchemaDeploymentResponse
interface DeploymentResult {
  status: 'success' | 'failed';
  deployment_id: string | null;
  version_id: string | null;
  version_number: number;
  versioned_schema_name: string | null;
  executed_statements: number;
  failed_statements: number;
  errors: string[];
}

// Infer DDL type from event type for addDDLAction
function inferDDLType(eventType: EventType): DDLType {
  switch (eventType) {
    case 'SCHEMA_CREATED': return 'CREATE_TABLE'; // Closest DDLType for schema creation
    case 'TABLE_CREATED': return 'CREATE_TABLE';
    case 'ADD_COLUMN': return 'ALTER_ADD_COLUMN';
    case 'REMOVE_COLUMN': return 'ALTER_DROP_COLUMN';
    case 'COLUMN_RENAMED': return 'ALTER_RENAME_COLUMN';
    case 'COLUMN_TYPE_CHANGED': return 'ALTER_CHANGE_TYPE';
    case 'TABLE_RENAMED': return 'DROP_TABLE'; // Closest match
    default: return 'ALTER_ADD_COLUMN'; // Default for PKs, FKs, policies
  }
}
import PreCheckGate from './PreCheckGate';
import SqlDiffViewer from './SqlDiffViewer';
import DryRunPanel from './DryRunPanel';
import PostVerifyBanner, { type PostVerifyResult } from './PostVerifyBanner';
import { analyzeDeploymentRisk as computeDeploymentRisk } from '../services/ai-analyzers';
import type { DesignEvent as AiDesignEvent } from '../stores/event-store';

// Test result interface
interface TestResult {
  eventId: string;
  success: boolean;
  message: string;
  sql?: string;
  error?: string;
  warnings?: string[];
  duration?: number;
}

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const SCHEDULED_DEPLOYMENTS_KEY = 'explore-design-scheduled-deployments';

// Scheduled deployment interface (stored locally for future backend)
interface ScheduledDeploymentLocal {
  id: string;
  workflowName: string;
  scheduledDate: string;
  deploymentMethod: 'REPLACE_EXISTING' | 'NEW_RELEASE' | 'TEST';
  eventIds: string[];
  status: 'SCHEDULED' | 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED';
  createdAt: string;
  createdBy: string;
  versionType: 'patch' | 'minor' | 'major';
  changelog: string;
  approvers?: string[];
}

// ============================================================================
// EVENT ORDERING - Priority for deployment execution order
// ============================================================================
// Events must be executed in a specific order to handle dependencies:
// 1. Tables must exist before columns/constraints can be added
// 2. Columns must exist before PKs/FKs can reference them
// 3. Both tables must exist before relationships can be created
// 4. Policies are applied after structure is in place
// 5. Table renames should be last to avoid breaking references

const EVENT_PRIORITY: Record<EventType, number> = {
  // Priority 0: Metadata events (no SQL execution needed)
  'SCHEMA_SELECTED': 0,
  'TABLE_SELECTED': 0,
  'TABLE_ADDED_TO_MODELING': 0,
  'TABLE_REMOVED_FROM_MODELING': 0,
  'BATCH_OPERATION': 0,

  // Priority 0.5: Schema creation (must exist before tables)
  'SCHEMA_CREATED': 0.5,

  // Priority 1: Table creation (must exist before anything else)
  'TABLE_CREATED': 1,
  'DYNAMIC_TABLE_CREATED': 1,
  'STREAM_CREATED': 1,
  'EVENT_TABLE_CREATED': 1,
  'HYBRID_TABLE_CREATED': 1,
  'ALERT_CREATED': 1,


  // Priority 2: Column additions (table must exist)
  'ADD_COLUMN': 2,

  // Priority 3: Column modifications (columns must exist)
  'COLUMN_RENAMED': 3,
  'COLUMN_TYPE_CHANGED': 3,
  'REMOVE_COLUMN': 3,

  // Priority 4: Primary keys (columns must exist)
  'PRIMARY_KEY_SET': 4,
  'PRIMARY_KEY_REMOVED': 4,

  // Priority 5: Foreign keys and relations (both tables and columns must exist)
  'FOREIGN_KEY_ADDED': 5,
  'FOREIGN_KEY_REMOVED': 5,
  'RELATION_CREATED': 5,
  'RELATION_REMOVED': 5,
  'COLUMN_MAPPING_CREATED': 5,
  'COLUMN_MAPPING_REMOVED': 5,

  // Priority 6: Policies (structure must be complete)
  'MASKING_POLICY_APPLIED': 6,
  'MASKING_POLICY_REMOVED': 6,
  'RLS_POLICY_APPLIED': 6,
  'RLS_POLICY_REMOVED': 6,
  'AGGREGATION_POLICY_APPLIED': 6,
  'AGGREGATION_POLICY_REMOVED': 6,

  // Priority 7: Tags (can be applied anytime after structure)
  'TAG_APPLIED': 7,
  'TAG_REMOVED': 7,
  'COLUMN_EXCLUDED': 7,
  'COLUMN_INCLUDED': 7,
  'TABLE_EXCLUDED': 7,
  'TABLE_INCLUDED': 7,

  // Priority 8: Configuration (metadata, no structural dependencies)
  'INGESTION_MODE_SET': 8,
  'SCD_CONFIGURED': 8,
  'SCD_CONFIG_SET': 8,
  'WHERE_CLAUSE_SET': 8,
  'QUALITY_GATE_SET': 8,

  // Priority 9: Table renames (should be last to avoid breaking references)
  'TABLE_RENAMED': 9,

  // Priority 0: AI-assisted events (metadata only, no DDL)
  'AI_CLASSIFICATION_APPLIED': 0,
  'AI_TYPE_CHANGE_APPLIED': 0,
  'AI_RELATION_ACCEPTED': 0,
  'AI_TEMPLATE_APPLIED': 0,
  'AI_COLUMNS_ADDED': 0,
};

import {
  DeploymentProvider,
  useDeploymentContext,
  DEPLOYMENT_STEPS,
  type DeploymentStep,
} from './deployment/DeploymentContext';

// Step components
import StepReview from './deployment/StepReview';
import StepConfigure from './deployment/StepConfigure';
import StepPreChecks from './deployment/StepPreChecks';
import StepDryRun from './deployment/StepDryRun';
import StepSqlDiff from './deployment/StepSqlDiff';
import StepImpact from './deployment/StepImpact';
import StepDeploy from './deployment/StepDeploy';
import StepVerify from './deployment/StepVerify';

// ── Step icon mapping ──
const STEP_ICONS: Record<DeploymentStep, React.ElementType> = {
  review: Eye,
  config: Settings,
  pre_checks: Shield,
  dry_run: Beaker,
  sql_diff: GitBranch,
  impact: Network,
  deploy: Rocket,
  verify: CheckCircle2,
};

// ── Props ──
interface DeploymentValidationProps {
  className?: string;
  onClose?: () => void;
  database?: string;
  schemas?: string[];
  projectId?: string;
}

// ── Inner content (consumes context) ──
function DeploymentContent() {
  const { currentStep, setCurrentStep, goNext, goPrev, isDeploying } = useDeploymentContext();

  const stepIndex = DEPLOYMENT_STEPS.findIndex(s => s.key === currentStep);
  const showGlobalNav = !['deploy', 'verify'].includes(currentStep);
  const nextLabel = DEPLOYMENT_STEPS[stepIndex + 1]?.label;
  const prevLabel = DEPLOYMENT_STEPS[stepIndex - 1]?.label;

  return (
    <div className="flex flex-col h-full">
      {/* ── Stepper Header ── */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {DEPLOYMENT_STEPS.map((step, idx) => {
            const Icon = STEP_ICONS[step.key];
            const isActive = idx === stepIndex;
            const isCompleted = idx < stepIndex;
            const isClickable = idx <= stepIndex && !isDeploying;

            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div
                    className={cn(
                      'h-px flex-1 min-w-[16px] max-w-[40px] transition-colors',
                      isCompleted ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700',
                    )}
                  />
                )}
                <button
                  onClick={() => isClickable && setCurrentStep(step.key)}
                  disabled={!isClickable}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800'
                      : isCompleted
                      ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer'
                      : 'text-slate-400 dark:text-slate-500 cursor-default',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all',
                      isActive
                        ? 'bg-blue-500 text-white'
                        : isCompleted
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400',
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Step Content + Sticky Nav ── */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
        {currentStep === 'review' && <StepReview />}
        {currentStep === 'config' && <StepConfigure />}
        {currentStep === 'pre_checks' && <StepPreChecks />}
        {currentStep === 'dry_run' && <StepDryRun />}
        {currentStep === 'sql_diff' && <StepSqlDiff />}
        {currentStep === 'impact' && <StepImpact />}
        {currentStep === 'deploy' && <StepDeploy />}
        {currentStep === 'verify' && <StepVerify />}

        {/* Navigation — sticky inside scroll container */}
        {showGlobalNav && (
          <div className="sticky bottom-0 flex items-center justify-between px-6 py-3 border-t dark:border-slate-700 bg-white dark:bg-slate-900 z-10">
            {stepIndex > 0 ? (
              <Button variant="outline" onClick={goPrev} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> {prevLabel}
              </Button>
            ) : <div />}
            {nextLabel && (
              <Button onClick={goNext} className="gap-1.5">
                {nextLabel} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Orchestrator ──
export default function DeploymentValidation({
  className,
  onClose,
  database,
  schemas,
  projectId: rawProjectId,
}: DeploymentValidationProps) {
  const { data: session } = useSession();
  const currentUser = session?.user?.name || session?.user?.email || 'unknown';

  // Event store
  const projectId = rawProjectId || 'default';
  const safeProjectId = projectId;
  const { events, pendingEvents, updateEventStatus, cleanupAppliedEvents } =
    useEventStore(safeProjectId);

  // Derive database/schemas from events if not passed
  const resolvedDatabase = useMemo(() => {
    if (database) return database;
    const first = events.find(e => e.target?.database);
    return first?.target?.database || 'PROD_DB';
  }, [database, events]);

  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [currentStep, setCurrentStep] = useState<'review' | 'pre_checks' | 'sql_diff' | 'deploy' | 'post_verify' | 'complete'>('review');
  const [dryRunCompleted, setDryRunCompleted] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showSQLPreview, setShowSQLPreview] = useState(false);
  const [showRollbackSQL, setShowRollbackSQL] = useState(false);

  // Deployment configuration
  const [deploymentType, setDeploymentType] = useState<'immediate' | 'with_approval'>('immediate');
  // Ingestion scheduling type - separate from deployment type
  const [ingestionType, setIngestionType] = useState<'immediate' | 'scheduled'>('immediate');
  const [cronChoice, setCronChoice] = useState<CronChoice>('DAILY');
  const [customCron, setCustomCron] = useState('');
  const [scheduleWarehouse, setScheduleWarehouse] = useState('COMPUTE_WH');
  const [versionType, setVersionType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [changelogSummary, setChangelogSummary] = useState('');
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>(['DATA_MODELER']);
  const [scheduledDeployments, setScheduledDeployments] = useState<ScheduledDeploymentLocal[]>([]);

  // Backend integration state
  const [useBackend, setUseBackend] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [cortexRecommendations, setCortexRecommendations] = useState<string | null>(null);
  const [cortexRecommendationsLoading, setCortexRecommendationsLoading] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  // Post-deployment verification result
  const [postVerifyResult, setPostVerifyResult] = useState<PostVerifyResult | null>(null);
  const [preChecksAllPassed, setPreChecksAllPassed] = useState(false);

  // AI Risk Scorer (drawio page 10 — section 4.1)
  const [riskAssessment, setRiskAssessment] = useState<{
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    breakdown: Array<{ factor: string; points: number; reason: string }>;
    aiSummary: string | null;
    aiSummaryLoading: boolean;
  } | null>(null);

  // Schema versioning state (Option A: Two-phase deployment)
  const [schemaVersions, setSchemaVersions] = useState<ProjectVersion[]>([]);
  const [currentSchemaVersion, setCurrentSchemaVersion] = useState<ProjectVersion | null>(null);
  const [selectedSchemaVersionId, setSelectedSchemaVersionId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [deploymentPhase, setDeploymentPhase] = useState<'schema' | 'ingestion' | 'complete'>('schema');
  const [schemaDeploymentResult, setSchemaDeploymentResult] = useState<DeploymentResult | null>(null);

  // Ingestion target schema version - user can choose which version to ingest into
  // 'latest' means use the latest active version (or newly deployed version)
  // Otherwise, use the specific version_id selected by the user
  const [ingestionTargetVersion, setIngestionTargetVersion] = useState<'latest' | string>('latest');

  // Per-table ingestion mode overrides: tableKey -> IngestionMode
  const [ingestionModeOverrides, setIngestionModeOverrides] = useState<Record<string, IngestionMode>>({});

  // Load scheduled deployments from localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem(SCHEDULED_DEPLOYMENTS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ScheduledDeploymentLocal[];
        setScheduledDeployments(parsed);
      } catch (e) {
        console.error('Failed to load scheduled deployments:', e);
      }
    }
  }, []);

  // Load schema versions when component mounts
  React.useEffect(() => {
    const loadSchemaVersions = async () => {
      if (!projectId) return;

      setIsLoadingVersions(true);
      try {
        const response = await exploreDesignApi.listExploreVersions(projectId, { limit: 20 });
        setSchemaVersions(response.versions);
        setCurrentSchemaVersion(response.current_version || null);
        // Default to current version for ingestion
        if (response.current_version) {
          setSelectedSchemaVersionId(response.current_version.version_id);
          // Set ingestion target to current version by default
          setIngestionTargetVersion(response.current_version.version_id);
        }
      } catch (error) {
        console.error('[DeploymentValidation] Failed to load schema versions:', error);
      } finally {
        setIsLoadingVersions(false);
      }
    };

    loadSchemaVersions();
  }, [projectId]);

  // Save scheduled deployment to localStorage
  const saveScheduledDeployment = useCallback((deployment: ScheduledDeploymentLocal) => {
    setScheduledDeployments(prev => {
      const updated = [...prev, deployment];
      localStorage.setItem(SCHEDULED_DEPLOYMENTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const resolvedSchemas = useMemo(() => {
    if (schemas && schemas.length > 0) return schemas;
    const set = new Set<string>();
    events.forEach(e => {
      if (e.target?.schema) set.add(e.target.schema);
    });
    return set.size > 0 ? Array.from(set) : ['PUBLIC'];
  }, [schemas, events]);

  // Format event type for display
  const formatEventType = (type: EventType): string => {
    const displayNames: Partial<Record<EventType, string>> = {
      'SCHEMA_CREATED': 'Create Schema',
      'TABLE_RENAMED': 'Rename Table',
      'COLUMN_RENAMED': 'Rename Column',
      'COLUMN_TYPE_CHANGED': 'Change Column Type',
      'PRIMARY_KEY_SET': 'Set Primary Key',
      'PRIMARY_KEY_REMOVED': 'Remove Primary Key',
      'FOREIGN_KEY_ADDED': 'Add Foreign Key',
      'FOREIGN_KEY_REMOVED': 'Remove Foreign Key',
      'INGESTION_MODE_SET': 'Configure Ingestion',
      'MASKING_POLICY_APPLIED': 'Apply Masking Policy',
      'MASKING_POLICY_REMOVED': 'Remove Masking Policy',
      'RELATION_CREATED': 'Create Relation',
      'RELATION_REMOVED': 'Remove Relation',
      'SCD_CONFIGURED': 'Configure SCD',
      'TAG_APPLIED': 'Apply Tag',
      'TAG_REMOVED': 'Remove Tag',
      'TABLE_EXCLUDED': 'Exclude Table',
      'TABLE_INCLUDED': 'Include Table',
      'COLUMN_EXCLUDED': 'Exclude Column',
      'COLUMN_INCLUDED': 'Include Column',
    };
    return displayNames[type] || type.replace(/_/g, ' ');
  };

  // Get event summary description
  const getEventSummary = (event: DesignEvent): string => {
    const { type, payload, target } = event;
    switch (type) {
      case 'SCHEMA_CREATED':
        return `${target.database}.${target.schema}`;
      case 'TABLE_RENAMED':
        return `${payload.oldName || target.table} → ${payload.newName}`;
      case 'COLUMN_RENAMED':
        return `${payload.oldName} → ${payload.newName}`;
      case 'INGESTION_MODE_SET':
        return `Mode: ${payload.mode?.replace(/_/g, ' ')}`;
      case 'MASKING_POLICY_APPLIED':
        return `Policy: ${payload.policyName}`;
      case 'PRIMARY_KEY_SET':
        return `Columns: ${payload.columns?.join(', ') || 'N/A'}`;
      case 'RELATION_CREATED':
        return `${payload.sourceColumn} → ${payload.targetTable?.table}.${payload.targetColumn}`;
      default:
        return target.column || '';
    }
  };

  // DDL-relevant event types (actual schema changes that generate SQL)
  const ddlEventTypes: EventType[] = [
    'SCHEMA_CREATED',
    'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
    'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
    'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
    'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
    'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED',
  ];

  // Filter pending events to only DDL-relevant ones
  const ddlPendingEvents = useMemo(() => {
    return pendingEvents.filter(e => ddlEventTypes.includes(e.type));
  }, [pendingEvents]);

  // Group DDL events by table — sorted by priority (schema first, then tables, then FKs/policies)
  const eventsByTable = useMemo(() => {
    // Sort events by priority first
    const sorted = sortEventsForDeployment(ddlPendingEvents);

    const groups: Record<string, DesignEvent[]> = {};
    sorted.forEach((event) => {
      const key = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });

    // Sort group keys so SCHEMA_CREATED groups come first
    const sortedEntries = Object.entries(groups).sort(([, eventsA], [, eventsB]) => {
      const minPriorityA = Math.min(...eventsA.map(e => EVENT_PRIORITY[e.type] ?? 99));
      const minPriorityB = Math.min(...eventsB.map(e => EVENT_PRIORITY[e.type] ?? 99));
      return minPriorityA - minPriorityB;
    });

    return Object.fromEntries(sortedEntries);
  }, [ddlPendingEvents]);

  // Extract mapped tables overview for display
  const mappedTablesOverview = useMemo(() => {
    return extractMappedTablesOverview(events);
  }, [events]);

  // Categorize events into schema changes vs ingestion configurations (Two-phase deployment)
  const { schemaEvents, ingestionEvents, schemaEventsSummary, ingestionEventsSummary } = useMemo(() => {
    // Events that generate DDL (schema changes)
    const schemaEventTypes: EventType[] = [
      'SCHEMA_CREATED',
      'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
      'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
      'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
      'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
      'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED', 'TAG_APPLIED', 'TAG_REMOVED',
    ];

    // Events for data ingestion configuration
    const ingestionEventTypes: EventType[] = [
      'COLUMN_MAPPING_CREATED', 'COLUMN_MAPPING_REMOVED', 'INGESTION_MODE_SET', 'SCD_CONFIGURED',
    ];

    const schema = pendingEvents.filter(e => schemaEventTypes.includes(e.type));
    const ingestion = pendingEvents.filter(e => ingestionEventTypes.includes(e.type));

    // Summary counts for schema changes
    const schemaSummary = {
      tablesCreated: schema.filter(e => e.type === 'TABLE_CREATED').length,
      tablesRenamed: schema.filter(e => e.type === 'TABLE_RENAMED').length,
      columnsAdded: schema.filter(e => e.type === 'ADD_COLUMN').length,
      columnsModified: schema.filter(e => ['COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED'].includes(e.type)).length,
      constraintsAdded: schema.filter(e => ['PRIMARY_KEY_SET', 'FOREIGN_KEY_ADDED', 'RELATION_CREATED'].includes(e.type)).length,
      policiesApplied: schema.filter(e => e.type.includes('POLICY_APPLIED')).length,
    };

    // Summary counts for ingestion configs
    const ingestionSummary = {
      columnMappings: ingestion.filter(e => e.type === 'COLUMN_MAPPING_CREATED').length,
      ingestionModes: ingestion.filter(e => e.type === 'INGESTION_MODE_SET').length,
      scdConfigs: ingestion.filter(e => e.type === 'SCD_CONFIGURED').length,
      totalTables: new Set(ingestion.map(e => `${e.target.database}.${e.target.schema}.${e.target.table}`)).size,
    };

    return {
      schemaEvents: schema,
      ingestionEvents: ingestion,
      schemaEventsSummary: schemaSummary,
      ingestionEventsSummary: ingestionSummary,
    };
  }, [pendingEvents]);

  // Generate SQL for event using enhanced SQL generator
  const generateSQL = useCallback((event: DesignEvent): string => {
    return generateSnowflakeSQL(event).sql;
  }, []);

  // Generate rollback SQL for event
  const generateRollbackSQL = useCallback((event: DesignEvent): string => {
    return generateSnowflakeSQL(event).rollbackSql || '-- No rollback available';
  }, []);

  // All SQL statements (deployment script)
  const allSQL = useMemo(() => {
    const header = `-- =============================================\n-- Data Model Changes - Deployment Script\n-- Generated: ${new Date().toISOString()}\n-- Project: ${projectId}\n-- Database: ${database || 'N/A'}\n-- Events: ${pendingEvents.length}\n-- =============================================\n\n`;
    return header + pendingEvents.map((e, idx) => {
      const sql = generateSQL(e);
      return `-- [${idx + 1}/${pendingEvents.length}] ${e.type} on ${e.target.table}\n${sql}`;
    }).join('\n\n');
  }, [pendingEvents, projectId, database, generateSQL]);

  // All rollback SQL statements
  const allRollbackSQL = useMemo(() => {
    const header = `-- =============================================\n-- Data Model Changes - ROLLBACK Script\n-- Generated: ${new Date().toISOString()}\n-- Project: ${projectId}\n-- WARNING: Execute in reverse order!\n-- =============================================\n\n`;
    return header + [...pendingEvents].reverse().map((e, idx) => {
      const sql = generateRollbackSQL(e);
      return `-- [ROLLBACK ${idx + 1}] ${e.type} on ${e.target.table}\n${sql}`;
    }).join('\n\n');
  }, [pendingEvents, projectId, generateRollbackSQL]);

  // Local validation - validates events without backend
  const validateEventLocally_Internal = useCallback((event: DesignEvent): TestResult => {
    const startTime = Date.now();
    const validation = validateEventLocally(event, events);
    const duration = Date.now() - startTime;

    return {
      eventId: event.id,
      success: validation.isValid,
      message: validation.isValid ? 'Validation passed' : validation.errors.join('; '),
      sql: generateSQL(event),
      error: validation.errors.length > 0 ? validation.errors.join('; ') : undefined,
      warnings: validation.warnings,
      duration: duration + Math.floor(Math.random() * 50), // Add realistic timing
    };
  }, [events, generateSQL]);

  // ── Risk Scoring (page 10, section 4.1) ──
  // Runs deterministic risk scoring + Cortex AI summary after pre-checks complete
  const runRiskScoring = useCallback(async () => {
    const riskResult = computeDeploymentRisk(events as AiDesignEvent[]);
    const breakdown: Array<{ factor: string; points: number; reason: string }> = [];

    const destructiveEvents = events.filter(e =>
      ['REMOVE_COLUMN', 'TABLE_RENAMED', 'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED',
       'PRIMARY_KEY_REMOVED', 'FOREIGN_KEY_REMOVED'].includes(e.type)
    );
    for (const ev of destructiveEvents) {
      const table = ev.target?.table || 'unknown';
      const col = ev.target?.column || ev.payload?.columnName || '';
      if (ev.type === 'REMOVE_COLUMN') {
        breakdown.push({ factor: `DROP_COLUMN ${table}.${col}`, points: 15, reason: 'Irreversible data loss' });
      } else if (ev.type === 'COLUMN_TYPE_CHANGED') {
        breakdown.push({ factor: `ALTER_CHANGE_TYPE ${table}.${col}`, points: 12, reason: 'Data conversion risk' });
      } else if (ev.type === 'TABLE_RENAMED' || ev.type === 'COLUMN_RENAMED') {
        breakdown.push({ factor: `RENAME ${table}${col ? '.' + col : ''}`, points: 10, reason: 'Breaks dependent references' });
      } else if (ev.type === 'PRIMARY_KEY_REMOVED') {
        breakdown.push({ factor: `DROP PK on ${table}`, points: 15, reason: 'Integrity constraint removed' });
      } else if (ev.type === 'FOREIGN_KEY_REMOVED') {
        breakdown.push({ factor: `DROP FK on ${table}`, points: 10, reason: 'Referential integrity lost' });
      }
    }
    const maskingEvents = events.filter(e => e.type === 'MASKING_POLICY_APPLIED');
    if (maskingEvents.length > 0) {
      breakdown.push({ factor: `${maskingEvents.length} masking policies`, points: maskingEvents.length * 5, reason: 'Governance impact' });
    }
    const tableCount = new Set(events.filter(e => e.type === 'TABLE_CREATED').map(e => e.target?.table)).size;
    if (tableCount > 10) {
      breakdown.push({ factor: `${tableCount} tables in scope`, points: tableCount > 20 ? 25 : 10, reason: 'Large change surface' });
    }

    setRiskAssessment({
      score: riskResult.riskScore,
      level: riskResult.riskLevel,
      breakdown,
      aiSummary: null,
      aiSummaryLoading: true,
    });

    // Async: Cortex AI plain-English risk summary
    try {
      const riskContext = `Deployment with ${events.length} events. Risk score: ${riskResult.riskScore}/100 (${riskResult.riskLevel}). ` +
        `Changes: ${destructiveEvents.length} destructive ops, ${maskingEvents.length} masking policies, ${tableCount} tables. ` +
        `Breakdown: ${breakdown.map(b => `${b.factor} (+${b.points}pts: ${b.reason})`).join('; ')}. ` +
        `Summarize the deployment risk and recommend mitigation steps in 2-3 sentences.`;
      const cortexRes = await getCortexRecommend({ error_context: riskContext });
      setRiskAssessment(prev => prev ? { ...prev, aiSummary: cortexRes?.response || null, aiSummaryLoading: false } : null);
    } catch {
      setRiskAssessment(prev => prev ? { ...prev, aiSummary: null, aiSummaryLoading: false } : null);
    }
  }, [events]);

  // Transition to pre-checks step — PreCheckGate auto-runs structural checks + risk scoring
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setCurrentStep('pre_checks');
    setConfigExpanded(false);
    setBackendError(null);
    setRiskAssessment(null);

    // Run SQL validation (backend or local) for each pending event
    const results = new Map<string, TestResult>();


    setTestResults(results);
    setIsValidating(false);
  }, [pendingEvents, events, validateEventLocally_Internal, updateEventStatus, useBackend, projectId]);

  // Deploy changes - with real backend integration
  const handleDeploy = useCallback(async () => {
    // Debug: Log event counts
    // console.log('[Deployment] Event counts:', {
    //   totalEvents: events.length,
    //   pendingEvents: pendingEvents.length,
    //   validatedEvents: events.filter(e => e.status === 'validated').length,
    //   columnMappingEvents: events.filter(e => e.type === 'COLUMN_MAPPING_CREATED').length,
    // });

    // Use validated events if available, otherwise use pending events directly
    const validatedEvents = events.filter((e) => e.status === 'validated');
    const eventsToDeploy = validatedEvents.length > 0 ? validatedEvents : pendingEvents;

    // Allow deployment even with no pending events if there are column mappings for ingestion
    const columnMappingEvents = events.filter(e => e.type === 'COLUMN_MAPPING_CREATED');
    const hasIngestionWork = columnMappingEvents.length > 0;

    if (eventsToDeploy.length === 0 && !hasIngestionWork) {
      toast('No schema changes or column mappings to deploy.', { icon: 'ℹ️' });
    } else if (eventsToDeploy.length === 0 && hasIngestionWork) {
      toast(`No schema changes, but ${columnMappingEvents.length} column mapping(s) available for ingestion.`, { icon: 'ℹ️' });
    }

    setIsDeploying(true);
    setCurrentStep('deploy');
    setBackendError(null);

    try {
      // Generate version number
      const versionNumber = `${versionType === 'major' ? '1' : '0'}.${versionType === 'minor' ? '1' : '0'}.${versionType === 'patch' ? Date.now() % 1000 : '0'}`;

      // Convert pending events to API format (user's DDL changes only)
      // Backend will clone template tables and apply these changes
      const apiEvents = eventsToDeploy.map(e => ({
        event_id: e.id,
        event_type: e.type,
        target: e.target,
        payload: e.payload,
        status: e.status,
        created_at: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
      }));
      // console.log('[Deployment] API events (user changes):', apiEvents.length);

      // Sort events for all deployment types (needed for SQL generation)
      const sortedEvents = sortEventsForDeployment(eventsToDeploy);
      const executableEvents = filterExecutableEvents(sortedEvents);

      // Generate SQL queries in proper order for approval deployments
      const orderedSqlQueries = executableEvents
        .map(event => generateSnowflakeSQL(event).sql)
        .filter(sql => sql && !sql.trim().startsWith('--'));

      // console.log('[Deployment] Prepared', orderedSqlQueries.length, 'SQL queries in dependency order');

      // Handle based on deployment type
      if (deploymentType === 'with_approval') {
        toast.loading('Submitting for approval...');

        try {
          // POST /api/v1/explore-design/{projectId}/deployments
          let resultId: string | undefined;
          const v1Body: CreateExploreDeploymentRequest = {
            deployment_type: 'with_approval',
            description: changelogSummary || `Explore & Design approval request with ${eventsToDeploy.length} changes`,
            config: {
              sql_queries: orderedSqlQueries,
              events: apiEvents,
              deployment_method: 'REPLACE_EXISTING',
              created_by: currentUser,
              approvers: selectedApprovers,
            },
          };
          const v1Result = await exploreDesignApi.requestDeployment(projectId, v1Body);
          resultId = v1Result.deployment_id;
          // console.log('[Deployment] v1 approval deployment created:', resultId);

          // Also save locally
          const pendingApproval: ScheduledDeploymentLocal = {
            id: resultId || `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `approval_v${versionNumber}`,
            scheduledDate: new Date().toISOString(),
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: eventsToDeploy.map(e => e.id),
            status: 'PENDING_APPROVAL',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${eventsToDeploy.length} changes`,
            approvers: selectedApprovers,
          };
          saveScheduledDeployment(pendingApproval);

          setDeploymentId(resultId || null);
          toast.dismiss();
          toast.success(`Deployment submitted for approval!\nID: ${resultId}\nApprovers: ${selectedApprovers.join(', ')}\n\nNote: Approvers can review in Account Overview.`);
          setCurrentStep('post_verify');

        } catch (error: any) {
          console.error('Backend approval submission error:', error);
          setBackendError(error.message);
          toast.dismiss();
          toast.error(`Backend submission failed: ${error.message}\n\nSaved locally as fallback.`);

          // Save locally as fallback
          const pendingApproval: ScheduledDeploymentLocal = {
            id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `approval_v${versionNumber}`,
            scheduledDate: new Date().toISOString(),
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: eventsToDeploy.map(e => e.id),
            status: 'PENDING_APPROVAL',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${eventsToDeploy.length} changes`,
            approvers: selectedApprovers,
          };
          saveScheduledDeployment(pendingApproval);
          setCurrentStep('post_verify');
        }

      } else {
        // =====================================================
        // IMMEDIATE DEPLOYMENT - Two-Phase Deployment (Option A)
        // =====================================================
        // Phase 1: Deploy Schema (DDL) via /deploy_schema endpoint
        //   - Creates new schema version
        //   - Executes structural changes (tables, columns, constraints)
        //   - Returns schema_version_id for linking
        //
        // Phase 2: Execute Ingestion (ETL) via /execute_ingestion endpoint
        //   - Links to schema_version_id from Phase 1
        //   - Executes data ingestion with column mappings
        //   - Tracks ingestion history per schema version

        // console.log('[Deployment] ========== IMMEDIATE DEPLOYMENT STARTED ==========');
        // console.log('[Deployment] Project ID:', projectId);
        // console.log('[Deployment] Deployment type:', deploymentType);
        // console.log('[Deployment] Pending events (user changes):', eventsToDeploy.length);

        toast.loading('Preparing two-phase deployment...');
        setDeploymentPhase('schema');

        try {
          // =====================================================
          // Schema Deployment Strategy:
          // - Backend clones ALL tables from template (CP_DATA360.RETAIL_DWH)
          // - Frontend sends ONLY user's DDL changes (ALTER, ADD COLUMN, ADD FK, etc.)
          // - Backend applies changes to the cloned tables in new versioned schema
          // =====================================================

          // Sort and filter PENDING events (user's changes only)
          const sortedEvents = sortEventsForDeployment(eventsToDeploy);
          // console.log('[Deployment] Sorted pending events:', sortedEvents.length);

          const executableEvents = filterExecutableEvents(sortedEvents);
          // console.log('[Deployment] Executable events:', executableEvents.length);

          // Separate schema events (DDL) from ingestion events (ETL)
          const schemaEventTypes: EventType[] = [
            'SCHEMA_CREATED',
            'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
            'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
            'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
            'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
            'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED', 'TAG_APPLIED', 'TAG_REMOVED',
          ];

          // Get schema events from PENDING changes (user's DDL modifications)
          const schemaEventsToExecute = executableEvents.filter(e => schemaEventTypes.includes(e.type));
          // console.log('[Deployment] Schema events (user DDL changes):', schemaEventsToExecute.length);

          // Generate SQL statements for user's DDL changes only
          // Backend will: 1) Clone template tables, 2) Apply these DDL changes
          const sqlStatements: SQLStatement[] = [];
          schemaEventsToExecute.forEach((event) => {
            const { sql, rollbackSql } = generateSnowflakeSQL(event);
            if (sql && !sql.trim().startsWith('--')) {
              sqlStatements.push({
                sql,
                rollback_sql: rollbackSql || undefined,
                object_type: event.type.includes('TABLE') ? 'TABLE' : event.type.includes('COLUMN') ? 'COLUMN' : 'CONSTRAINT',
                object_name: `${event.target.schema}.${event.target.table}${event.target.column ? '.' + event.target.column : ''}`,
              });
            }
          });

          // console.log('[Deployment] Generated SQL statements:', sqlStatements.length);
          if (sqlStatements.length > 0) {
            // console.log('[Deployment] SQL statements:', sqlStatements.map(s => s.sql.substring(0, 100) + '...'));
          }

          // Extract ingestion configurations from ALL events (for data loading)
          const ingestionConfigs = extractIngestionConfigs(events, ingestionModeOverrides);
          // console.log('[Deployment] Ingestion configs:', ingestionConfigs.length);

          let schemaVersionId: string | null = null;
          let queriesExecuted = 0;
          let ingestionRowsAffected = 0;

          // =====================================================
          // PHASE 1: Schema Deployment via addDDLAction + executeDDLActions
          // =====================================================
          // console.log('[Deployment] ========== REGISTERING DDL ACTIONS ==========');
          // console.log('[Deployment] SQL statements to register:', sqlStatements.length);

          if (sqlStatements.length > 0) {
            // Step 1: Register each SQL statement as a DDL action
            toast.loading(`Phase 1: Registering ${sqlStatements.length} DDL actions...`);
            let registeredCount = 0;

            for (let i = 0; i < sqlStatements.length; i++) {
              const stmt = sqlStatements[i];
              // Find matching event for DDL type inference
              const matchingEvent = schemaEventsToExecute.find(e => {
                const { sql } = generateSnowflakeSQL(e);
                return sql === stmt.sql;
              });

              try {
                await exploreDesignApi.addDDLAction(projectId, {
                  ddl_sql: stmt.sql,
                  ddl_type: matchingEvent ? inferDDLType(matchingEvent.type) : 'CREATE_TABLE',
                  priority: i + 1, // Maintain execution order
                  target_table: stmt.object_name || undefined,
                  description: stmt.object_type
                    ? `${stmt.object_type}: ${stmt.object_name || 'unknown'}`
                    : `DDL statement ${i + 1}`,
                });
                registeredCount++;
              } catch (regErr: any) {
                console.warn(`[Deployment] Failed to register DDL action ${i + 1}:`, regErr);
              }
            }

            // console.log('[Deployment] Registered DDL actions:', registeredCount, '/', sqlStatements.length);
            toast.dismiss();

            if (registeredCount === 0) {
              const errorMsg = 'Failed to register any DDL actions';
              toast.error(errorMsg);
              setBackendError(errorMsg);
              schemaEventsToExecute.forEach((event) => {
                updateEventStatus({ eventId: event.id, status: 'failed', error: errorMsg });
              });
              setIsDeploying(false);
              return;
            }

            // Step 2: Execute all registered DDL actions on Snowflake
            toast.loading(`Phase 1: Executing ${registeredCount} DDL actions on Snowflake...`);
            // console.log('[Deployment] ========== CALLING executeDDLActions ==========');

            const ddlResult = await exploreDesignApi.executeDDLActions(projectId);
            // console.log('[Deployment] executeDDLActions result:', ddlResult);
            toast.dismiss();

            // Check for failures
            if (ddlResult.failed > 0) {
              const failedResults = (ddlResult.results || []).filter((r: any) => r.status !== 'SUCCESS');
              const errorMessages = failedResults.map((r: any) => r.error || 'Unknown error');
              const errorMsg = `${ddlResult.failed} DDL action(s) failed: ${errorMessages.join('; ')}`;

              if (ddlResult.executed === 0) {
                // All failed
                console.error('[Deployment] All DDL actions failed:', errorMessages);
                toast.error(errorMsg);
                setBackendError(errorMsg);
                schemaEventsToExecute.forEach((event) => {
                  updateEventStatus({ eventId: event.id, status: 'failed', error: errorMsg });
                });
                setIsDeploying(false);
                return;
              } else {
                // Partial success
                console.warn('[Deployment] Partial DDL execution:', ddlResult.executed, 'succeeded,', ddlResult.failed, 'failed');
                toast.error(`Partial deployment: ${ddlResult.executed}/${ddlResult.total} succeeded`);
              }
            }

            queriesExecuted = ddlResult.executed || 0;
          } else {
            // console.log('[Deployment] No SQL statements to execute - skipping DDL phase');
            queriesExecuted = 0;
          }

          // Build deployment result
          const schemaDeployResult: DeploymentResult = {
            status: queriesExecuted > 0 ? 'success' : 'success',
            deployment_id: null,
            version_id: null,
            version_number: parseInt(versionNumber, 10) || 0,
            versioned_schema_name: null,
            executed_statements: queriesExecuted,
            failed_statements: sqlStatements.length - queriesExecuted,
            errors: [],
          };

          // Refresh schema versions
          try {
            const versionsResponse = await exploreDesignApi.listExploreVersions(projectId, { limit: 20 });
            setSchemaVersions(versionsResponse.versions);
            setCurrentSchemaVersion(versionsResponse.current_version || null);

            const latestVersion = versionsResponse.current_version || versionsResponse.versions[0];
            if (latestVersion) {
              schemaDeployResult.version_id = latestVersion.version_id;
              schemaDeployResult.version_number = latestVersion.version_number;
              schemaDeployResult.versioned_schema_name = latestVersion.version_name || `${projectId}_V${latestVersion.version_number}`;
              schemaVersionId = latestVersion.version_id;
              setSelectedSchemaVersionId(latestVersion.version_id);
            }
          } catch (error) {
            console.warn('[Deployment] Failed to refresh schema versions:', error);
          }

          // Store result for Phase 2
          setSchemaDeploymentResult(schemaDeployResult);

          // Mark schema events as applied
          schemaEventsToExecute.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'applied' });
          });

          const schemaName = schemaDeployResult.versioned_schema_name || `${projectId}_V${schemaDeployResult.version_number}`;
          // console.log('[Deployment] Phase 1 complete - Schema version:', schemaVersionId, 'Executed:', queriesExecuted);
          toast.dismiss();
          toast.success(`Phase 1 complete: ${queriesExecuted} DDL actions executed successfully`);

          // =====================================================
          // PHASE 2: Data Ingestion
          // =====================================================
          setDeploymentPhase('ingestion');

          if (ingestionConfigs.length > 0) {
            // Determine which schema version to use for ingestion:
            // - User selects a specific version from the dropdown (default is current active version)
            // - The selected version_id is passed to backend
            // - If no version selected (empty), let backend pick the latest active version
            const targetVersionId = ingestionTargetVersion && ingestionTargetVersion !== 'latest'
              ? ingestionTargetVersion // Use user-selected specific version
              : (schemaVersionId || undefined); // Fallback to newly deployed version or let backend pick

            const selectedVersion = schemaVersions.find(v => v.version_id === ingestionTargetVersion);
            const targetVersionName = selectedVersion?.version_name
              || schemaDeployResult?.versioned_schema_name
              || 'selected schema version';

            // console.log('[Deployment] Ingestion target version:', ingestionTargetVersion, '-> resolved to:', targetVersionId);

            if (ingestionType === 'scheduled') {
              // ─── Scheduled Ingestion: create Snowflake TASK via backend ───
              toast.loading(`Phase 2: Scheduling ingestion for ${ingestionConfigs.length} table(s)...`);

              try {
                // Collect all mappings from ingestion configs
                const allMappings = ingestionConfigs.flatMap(c => c.mappings || []);

                const scheduleResult = await exploreDesignApi.scheduleIngestion(projectId, {
                  cron_choice: cronChoice,
                  custom_cron: cronChoice === 'CUSTOM' ? customCron : undefined,
                  warehouse: scheduleWarehouse || undefined,
                  mappings: allMappings.length > 0 ? allMappings : undefined,
                  config: {
                    ingestion_configs: ingestionConfigs,
                    target_version_id: targetVersionId,
                  },
                });

                // console.log('[Deployment] Ingestion scheduled:', scheduleResult);

                // Mark ingestion events as applied
                eventsToDeploy.forEach((event) => {
                  if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                    updateEventStatus({ eventId: event.id, status: 'applied' });
                  }
                });

                toast.dismiss();
                toast.success(
                  `Phase 2: Ingestion scheduled — Task: ${scheduleResult.task_name}, Cron: ${scheduleResult.cron_expression}, Warehouse: ${scheduleResult.warehouse}`
                );
              } catch (scheduleErr: any) {
                const errorMsg = getApiErrorMessage(scheduleErr) || scheduleErr?.message || 'Failed to schedule ingestion';
                console.error('[Deployment] Ingestion scheduling failed:', errorMsg);
                toast.dismiss();
                toast.error(`Phase 2 failed: ${errorMsg}`);
                setBackendError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));

                eventsToDeploy.forEach((event) => {
                  if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                    updateEventStatus({ eventId: event.id, status: 'failed', error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg) });
                  }
                });

                // Sync partial statuses: schema SUCCESS, ingestion FAILED
                const schemaSuccessIds = schemaEventsToExecute.map(e => e.id).filter(Boolean);
                const ingestionFailedIds = eventsToDeploy
                  .filter(e => e.type === 'INGESTION_MODE_SET' || e.type === 'COLUMN_MAPPING_CREATED')
                  .map(e => e.id)
                  .filter(Boolean);
                try {
                  if (schemaSuccessIds.length > 0) {
                    await bulkUpdateEvents(projectId, { event_ids: schemaSuccessIds, new_status: 'SUCCESS' });
                  }
                  if (ingestionFailedIds.length > 0) {
                    await bulkUpdateEvents(projectId, {
                      event_ids: ingestionFailedIds,
                      new_status: 'FAILED',
                      error_message: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
                    });
                  }
                } catch (syncErr) {
                  console.warn('[Deployment] Failed to sync partial statuses to backend:', syncErr);
                }

                if (queriesExecuted > 0) {
                  toast.error(`Partial deployment: Schema deployed, but ingestion scheduling failed.`);
                }

                setIsDeploying(false);
                return;
              }
            } else {
              // ─── Immediate Ingestion: execute per table via v1 API ───
              toast.loading(`Phase 2: Ingesting data for ${ingestionConfigs.length} table(s) into ${targetVersionName}...`);

              const ingestionResults = await Promise.allSettled(
                ingestionConfigs.map(config =>
                  exploreDesignApi.executeIngestion(projectId, {
                    source_database: config.source_database,
                    source_schema: config.source_schema,
                    source_table: config.source_table,
                    target_database: config.target_database || '',
                    target_schema: config.target_schema || '',
                    target_table: config.target_table,
                    ingestion_mode: config.ingestion_mode,
                    mappings: config.mappings,
                  })
                )
              );

              // Aggregate results
              const fulfilled = ingestionResults.filter(
                (r): r is PromiseFulfilledResult<ExecuteIngestionResponse> => r.status === 'fulfilled'
              );
              const rejected = ingestionResults.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected'
              );
              const successCount = fulfilled.filter(r => r.value.status === 'success').length;
              const failCount = rejected.length + fulfilled.filter(r => r.value.status === 'failed').length;
              ingestionRowsAffected = fulfilled.reduce((sum, r) => sum + (r.value.rows_affected || 0), 0);

              if (successCount === 0 && failCount > 0) {
                // All failed
                const errorMsg = rejected.length > 0
                  ? rejected[0].reason?.message || 'Ingestion failed'
                  : 'All tables failed ingestion';
                console.error('[Deployment] Ingestion failed:', errorMsg);
                toast.dismiss();
                toast.error(`Phase 2 failed: ${errorMsg}`);
                setBackendError(errorMsg);

                eventsToDeploy.forEach((event) => {
                  if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                    updateEventStatus({ eventId: event.id, status: 'failed', error: errorMsg });
                  }
                });

                // Sync partial deployment statuses to backend:
                // Schema events → SUCCESS (Phase 1 succeeded), Ingestion events → FAILED
                const schemaSuccessIds = schemaEventsToExecute.map(e => e.id).filter(Boolean);
                const ingestionFailedIds = eventsToDeploy
                  .filter(e => e.type === 'INGESTION_MODE_SET' || e.type === 'COLUMN_MAPPING_CREATED')
                  .map(e => e.id)
                  .filter(Boolean);
                try {
                  if (schemaSuccessIds.length > 0) {
                    await bulkUpdateEvents(projectId, { event_ids: schemaSuccessIds, new_status: 'SUCCESS' });
                  }
                  if (ingestionFailedIds.length > 0) {
                    await bulkUpdateEvents(projectId, {
                      event_ids: ingestionFailedIds,
                      new_status: 'FAILED',
                      error_message: errorMsg,
                    });
                  }
                } catch (syncErr) {
                  console.warn('[Deployment] Failed to sync partial statuses to backend:', syncErr);
                }

                if (queriesExecuted > 0) {
                  toast.error(`Partial deployment: Schema deployed, but data ingestion failed.`);
                }

                setIsDeploying(false);
                return;
              }

              // console.log('[Deployment] Phase 2 complete:', {
                // successful: successCount,
                // failed: failCount,
                // rowsAffected: ingestionRowsAffected,
              // });

              // Mark ingestion events as applied
              eventsToDeploy.forEach((event) => {
                if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                  updateEventStatus({ eventId: event.id, status: 'applied' });
                }
              });

              toast.dismiss();
              toast.success(`Phase 2 complete: ${successCount}/${ingestionConfigs.length} table(s) ingested (${ingestionRowsAffected} rows)`);

              if (failCount > 0) {
                toast.error(`Partial ingestion: ${successCount}/${ingestionConfigs.length} tables succeeded`);
              }
            }
          } else {
            // console.log('[Deployment] No ingestion configs - skipping Phase 2');
          }

          // =====================================================
          // DEPLOYMENT COMPLETE
          // =====================================================
          setDeploymentPhase('complete');

          // Record deployment to backend for audit trail
          toast.loading('Recording deployment...');

          const v1Body: CreateExploreDeploymentRequest = {
            deployment_type: 'immediate',
            description: changelogSummary || `Immediate two-phase deployment with ${eventsToDeploy.length} changes`,
            config: {
              sql_queries: sqlStatements.map(s => s.sql),
              events: apiEvents,
              created_by: currentUser,
              schema_version_id: schemaVersionId,
              ingestion_tables: ingestionConfigs.length,
              rows_affected: ingestionRowsAffected,
            },
          };
          const v1Record = await exploreDesignApi.requestDeployment(projectId, v1Body);
          const recordedDeploymentId = v1Record.deployment_id;
          // console.log('[Deployment] v1 immediate deployment recorded:', recordedDeploymentId);

          // Mark any remaining metadata events as applied (local Jotai store)
          sortedEvents.forEach((event) => {
            if (event.status !== 'applied' && event.status !== 'failed') {
              updateEventStatus({ eventId: event.id, status: 'applied' });
            }
          });

          // Sync event statuses to backend so they persist across sessions
          const appliedEventIds = sortedEvents
            .filter(e => e.status !== 'failed')
            .map(e => e.id)
            .filter(Boolean);
          if (appliedEventIds.length > 0) {
            try {
              await bulkUpdateEvents(projectId, {
                event_ids: appliedEventIds,
                new_status: 'SUCCESS',
              });
              // console.log('[Deployment] Backend event statuses synced:', appliedEventIds.length);
            } catch (syncErr) {
              console.warn('[Deployment] Failed to sync event statuses to backend (non-blocking):', syncErr);
            }
          }

          setDeploymentId(recordedDeploymentId || null);
          toast.dismiss();

          // Success message with details
          const successParts: string[] = [];
          successParts.push('Two-phase deployment completed successfully!');
          if (queriesExecuted > 0) {
            const deployedSchemaName = schemaDeploymentResult?.versioned_schema_name || `${projectId}_V${schemaDeploymentResult?.version_number || 1}`;
            successParts.push(`Phase 1 - Schema: ${deployedSchemaName} in CP_DATA360`);
            successParts.push(`Statements executed: ${queriesExecuted}`);
          }
          if (ingestionConfigs.length > 0) {
            successParts.push(`Phase 2 - Ingestion: ${ingestionConfigs.length} table(s)`);
            if (ingestionRowsAffected > 0) {
              successParts.push(`Rows affected: ${ingestionRowsAffected.toLocaleString()}`);
            }
          }
          successParts.push(`Deployment ID: ${recordedDeploymentId}`);

          toast.success(successParts.join('\n'));
          setCurrentStep('post_verify');

        } catch (error: any) {
          console.error('Backend deployment error:', error);
          const msg = getApiErrorMessage(error) || error?.message || 'Deployment failed';
          setBackendError(typeof msg === 'string' ? msg : JSON.stringify(msg));
          toast.dismiss();
          toast.error(`Deployment failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);

          // Mark events as failed (local)
          eventsToDeploy.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'failed', error: getApiErrorMessage(error) || error?.message });
          });

          // Sync failed status to backend
          const failedEventIds = eventsToDeploy.map(e => e.id).filter(Boolean);
          if (failedEventIds.length > 0) {
            try {
              await bulkUpdateEvents(projectId, {
                event_ids: failedEventIds,
                new_status: 'FAILED',
                error_message: getApiErrorMessage(error) || error?.message || 'Deployment failed',
              });
            } catch (syncErr) {
              console.warn('[Deployment] Failed to sync failed statuses to backend:', syncErr);
            }
          }
        }
      }

      // Log deployment for audit
      console.info('[Deployment]', {
        version: versionNumber,
        timestamp: new Date().toISOString(),
        user: currentUser,
        events: eventsToDeploy.length,
        deploymentType,
        projectId,
        useBackend,
      });

    } catch (error: any) {
      console.error('Deployment error:', error);
      const msg = getApiErrorMessage(error) || error?.message || 'Deployment failed';
      setBackendError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast.error(`Deployment failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    } finally {
      setIsDeploying(false);
    }
  }, [events, pendingEvents, deploymentType, ingestionType, cronChoice, customCron, scheduleWarehouse, versionType, changelogSummary, selectedApprovers, currentUser, updateEventStatus, saveScheduledDeployment, projectId, useBackend, ingestionTargetVersion, schemaVersions, ingestionModeOverrides]);

  // Download SQL script
  const handleDownloadSQL = useCallback(() => {
    const blob = new Blob([allSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-model-deploy-${new Date().toISOString().split('T')[0]}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Deployment SQL script downloaded');
  }, [allSQL]);

  // Download rollback SQL script
  const handleDownloadRollbackSQL = useCallback(() => {
    const blob = new Blob([allRollbackSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-model-rollback-${new Date().toISOString().split('T')[0]}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Rollback SQL script downloaded');
  }, [allRollbackSQL]);

  // Copy SQL to clipboard
  const handleCopySQL = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(allSQL);
      toast.success('SQL copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy SQL');
    }
  }, [allSQL]);

  // Reset deployment
  const handleReset = () => {
    setTestResults(new Map());
    setCurrentStep('review');
  };

  // Toggle expand
  const toggleExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  // Stats (events are now pre-validated at creation time, no filtering needed)
  const stats = useMemo(() => {
    // Only count DDL-relevant events for stats
    const ddlEvents = events.filter(e => ddlEventTypes.includes(e.type));
    const validated = ddlEvents.filter((e) => e.status === 'validated').length;
    const failed = ddlEvents.filter((e) => e.status === 'failed').length;
    const applied = ddlEvents.filter((e) => e.status === 'applied').length;
    const pending = ddlPendingEvents.length;
    const columnMappings = events.filter((e) => e.type === 'COLUMN_MAPPING_CREATED').length;

    return { validated, failed, applied, pending, total: ddlEvents.length, columnMappings };
  }, [events, ddlPendingEvents.length, projectId]);

  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 shadow-lg overflow-hidden',
        className,
      )}
    >
      {/* ── Provider + Content ── */}
      <DeploymentProvider
        projectId={safeProjectId}
        database={resolvedDatabase}
        schemas={resolvedSchemas}
        currentUser={currentUser}
        events={events}
        pendingEvents={pendingEvents}
        updateEventStatus={updateEventStatus}
        cleanupAppliedEvents={cleanupAppliedEvents}
        onClose={onClose}
      >
        <DeploymentContent />
      </DeploymentProvider>
    </div>
  );
}
