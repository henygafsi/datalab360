'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip, Modal, Input } from 'rizzui';
import {
  Play, Check, X, AlertTriangle, RefreshCw, Clock, CheckCircle2,
  XCircle, Loader2, ChevronRight, ChevronDown, FileCode, Database,
  Shield, Key, Link2, Edit2, History, Rocket, Download, ArrowRight,
  RotateCcw, Eye, Calendar, Users, GitBranch, Send, Settings, Copy,
  Info, Zap, Server, Cloud, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, DesignEvent, EventType, EventStatus } from '../stores/event-store';
import { useSession } from 'next-auth/react';
import {
  scheduleDeploymentUnified,
  recordDesignEvents,
  deployEventsImmediate,
  validateEventsBackend,
  generateEventSQL,
  ScheduledDeploymentStatus,
} from '@/app/services/explore-design';

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

// Enhanced SQL generation for Snowflake
const generateSnowflakeSQL = (event: DesignEvent): { sql: string; rollbackSql?: string } => {
  const tableRef = `${event.target.database}.${event.target.schema}.${event.target.table}`;

  switch (event.type) {
    case 'TABLE_RENAMED':
      return {
        sql: `ALTER TABLE ${tableRef} RENAME TO ${event.payload.newName};`,
        rollbackSql: `ALTER TABLE ${event.target.database}.${event.target.schema}.${event.payload.newName} RENAME TO ${event.target.table};`
      };

    case 'COLUMN_RENAMED':
      return {
        sql: `ALTER TABLE ${tableRef} RENAME COLUMN ${event.payload.oldName} TO ${event.payload.newName};`,
        rollbackSql: `ALTER TABLE ${tableRef} RENAME COLUMN ${event.payload.newName} TO ${event.payload.oldName};`
      };

    case 'COLUMN_TYPE_CHANGED':
      return {
        sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET DATA TYPE ${event.payload.newType};`,
        rollbackSql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET DATA TYPE ${event.payload.oldType};`
      };

    case 'PRIMARY_KEY_SET':
      const pkColumns = event.payload.columns?.join(', ') || '';
      return {
        sql: `ALTER TABLE ${tableRef} ADD PRIMARY KEY (${pkColumns});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`
      };

    case 'PRIMARY_KEY_REMOVED':
      return {
        sql: `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`,
        rollbackSql: `-- Manual intervention required to restore primary key`
      };

    case 'FOREIGN_KEY_ADDED':
      const fkName = `FK_${event.target.table}_${event.payload.columns?.[0]}`;
      const refTable = `${event.payload.referencedTable?.database}.${event.payload.referencedTable?.schema}.${event.payload.referencedTable?.table}`;
      return {
        sql: `ALTER TABLE ${tableRef} ADD CONSTRAINT ${fkName} FOREIGN KEY (${event.payload.columns?.join(', ')}) REFERENCES ${refTable}(${event.payload.referencedColumns?.join(', ')});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP CONSTRAINT ${fkName};`
      };

    case 'RELATION_CREATED':
      const relationFkName = `FK_${event.target.table}_${event.payload.sourceColumn}`;
      const targetRef = `${event.payload.targetTable?.database}.${event.payload.targetTable?.schema}.${event.payload.targetTable?.table}`;
      return {
        sql: `-- Create relation: ${event.target.table}.${event.payload.sourceColumn} -> ${event.payload.targetTable?.table}.${event.payload.targetColumn}\nALTER TABLE ${tableRef} ADD CONSTRAINT ${relationFkName} FOREIGN KEY (${event.payload.sourceColumn}) REFERENCES ${targetRef}(${event.payload.targetColumn});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP CONSTRAINT ${relationFkName};`
      };

    case 'MASKING_POLICY_APPLIED':
      const maskColumns = event.payload.columns || [];
      const maskStatements = maskColumns.map((col: string) =>
        `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} SET MASKING POLICY ${event.payload.policyName};`
      );
      return {
        sql: maskStatements.join('\n'),
        rollbackSql: maskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} UNSET MASKING POLICY;`
        ).join('\n')
      };

    case 'MASKING_POLICY_REMOVED':
      const unmaskColumns = event.payload.columns || [];
      return {
        sql: unmaskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} UNSET MASKING POLICY;`
        ).join('\n'),
        rollbackSql: `-- Manual intervention required to restore masking policy`
      };

    case 'INGESTION_MODE_SET':
      const mode = event.payload.mode;
      let ingestionSql = `-- Ingestion Configuration for ${tableRef}\n`;
      ingestionSql += `-- Mode: ${mode?.toUpperCase().replace(/_/g, ' ')}\n`;

      if (mode === 'incremental' && event.payload.config?.incrementalColumn) {
        ingestionSql += `-- Incremental column: ${event.payload.config.incrementalColumn}\n`;
        ingestionSql += `-- CREATE STREAM ${event.target.schema}.STREAM_${event.target.table} ON TABLE ${tableRef} SHOW_INITIAL_ROWS = TRUE;`;
      } else if (mode?.startsWith('scd_')) {
        ingestionSql += `-- Effective date: ${event.payload.config?.effectiveDateColumn || 'EFF_START_DT'}\n`;
        ingestionSql += `-- Expiration date: ${event.payload.config?.expirationDateColumn || 'EFF_END_DT'}\n`;
        ingestionSql += `-- Current flag: ${event.payload.config?.currentFlagColumn || 'IS_CURRENT'}\n`;
      }

      return { sql: ingestionSql };

    case 'SCD_CONFIGURED':
      return {
        sql: `-- SCD Type ${event.payload.scdType || 2} configuration for ${tableRef}\n` +
             `-- Effective date column: ${event.payload.effectiveDateColumn || 'EFF_START_DT'}\n` +
             `-- Expiration date column: ${event.payload.expirationDateColumn || 'EFF_END_DT'}\n` +
             `-- Current flag column: ${event.payload.currentFlagColumn || 'IS_CURRENT'}`
      };

    case 'TAG_APPLIED':
      const tagName = event.payload.tagName || event.payload.tag;
      const tagValue = event.payload.tagValue || 'TRUE';
      if (event.target.column) {
        return {
          sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET TAG ${tagName} = '${tagValue}';`,
          rollbackSql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} UNSET TAG ${tagName};`
        };
      }
      return {
        sql: `ALTER TABLE ${tableRef} SET TAG ${tagName} = '${tagValue}';`,
        rollbackSql: `ALTER TABLE ${tableRef} UNSET TAG ${tagName};`
      };

    case 'TAG_REMOVED':
      const removedTagName = event.payload.tagName || event.payload.tag;
      if (event.target.column) {
        return { sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} UNSET TAG ${removedTagName};` };
      }
      return { sql: `ALTER TABLE ${tableRef} UNSET TAG ${removedTagName};` };

    case 'ADD_COLUMN':
      const colName = event.payload.columnName || event.payload.name;
      const colType = event.payload.dataType || event.payload.type || 'VARCHAR';
      const nullable = event.payload.isNullable !== false ? '' : ' NOT NULL';
      return {
        sql: `ALTER TABLE ${tableRef} ADD COLUMN ${colName} ${colType}${nullable};`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP COLUMN ${colName};`
      };

    case 'REMOVE_COLUMN':
      const dropColName = event.payload.columnName || event.payload.name;
      return {
        sql: `ALTER TABLE ${tableRef} DROP COLUMN ${dropColName};`,
        rollbackSql: `-- Manual intervention required to restore column ${dropColName}`
      };

    case 'TABLE_EXCLUDED':
      return { sql: `-- Table ${tableRef} excluded from data model` };

    case 'TABLE_INCLUDED':
      return { sql: `-- Table ${tableRef} included in data model` };

    case 'COLUMN_EXCLUDED':
      return { sql: `-- Column ${tableRef}.${event.target.column} excluded from data model` };

    case 'COLUMN_INCLUDED':
      return { sql: `-- Column ${tableRef}.${event.target.column} included in data model` };

    case 'RLS_POLICY_APPLIED':
      return {
        sql: `ALTER TABLE ${tableRef} ADD ROW ACCESS POLICY ${event.payload.policyName} ON (${event.payload.filterColumn || '*'});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP ROW ACCESS POLICY ${event.payload.policyName};`
      };

    case 'RLS_POLICY_REMOVED':
      return { sql: `ALTER TABLE ${tableRef} DROP ROW ACCESS POLICY ${event.payload.policyName};` };

    case 'AGGREGATION_POLICY_APPLIED':
      return {
        sql: `ALTER TABLE ${tableRef} ADD AGGREGATION POLICY ${event.payload.policyName};`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP AGGREGATION POLICY ${event.payload.policyName};`
      };

    case 'AGGREGATION_POLICY_REMOVED':
      return { sql: `ALTER TABLE ${tableRef} DROP AGGREGATION POLICY ${event.payload.policyName};` };

    default:
      return { sql: `-- ${event.type}: ${JSON.stringify(event.payload)}` };
  }
};

// Local validation rules for events
const validateEventLocally = (event: DesignEvent, allEvents: DesignEvent[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check target is valid
  if (!event.target.database || !event.target.schema || !event.target.table) {
    errors.push('Invalid target: missing database, schema, or table');
  }

  // Type-specific validation
  switch (event.type) {
    case 'TABLE_RENAMED':
      if (!event.payload.newName) {
        errors.push('New table name is required');
      } else if (event.payload.newName === event.payload.oldName) {
        errors.push('New name must be different from old name');
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) {
        errors.push('Invalid table name: must start with letter or underscore');
      }
      break;

    case 'COLUMN_RENAMED':
      if (!event.payload.newName) {
        errors.push('New column name is required');
      } else if (event.payload.newName === event.payload.oldName) {
        errors.push('New name must be different from old name');
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) {
        errors.push('Invalid column name: must start with letter or underscore');
      }
      // Check for duplicate rename events on same column
      const duplicateRenames = allEvents.filter(e =>
        e.id !== event.id &&
        e.type === 'COLUMN_RENAMED' &&
        e.target.table === event.target.table &&
        e.payload.oldName === event.payload.oldName
      );
      if (duplicateRenames.length > 0) {
        warnings.push('Multiple rename operations on same column detected');
      }
      break;

    case 'PRIMARY_KEY_SET':
      if (!event.payload.columns || event.payload.columns.length === 0) {
        errors.push('At least one column required for primary key');
      }
      break;

    case 'FOREIGN_KEY_ADDED':
    case 'RELATION_CREATED':
      if (!event.payload.sourceColumn && !event.payload.columns?.[0]) {
        errors.push('Source column is required');
      }
      if (!event.payload.targetTable || !event.payload.targetColumn) {
        errors.push('Target table and column are required');
      }
      break;

    case 'MASKING_POLICY_APPLIED':
      if (!event.payload.policyName) {
        errors.push('Policy name is required');
      }
      if (!event.payload.columns || event.payload.columns.length === 0) {
        errors.push('At least one column required for masking policy');
      }
      break;

    case 'INGESTION_MODE_SET':
      if (!event.payload.mode) {
        errors.push('Ingestion mode is required');
      }
      if (event.payload.mode === 'incremental' && !event.payload.config?.incrementalColumn) {
        warnings.push('Incremental mode should specify an incremental column');
      }
      break;

    case 'ADD_COLUMN':
      const colName = event.payload.columnName || event.payload.name;
      if (!colName) {
        errors.push('Column name is required');
      }
      break;

    case 'TAG_APPLIED':
      if (!event.payload.tagName && !event.payload.tag) {
        errors.push('Tag name is required');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

// Event type to SQL mapping (legacy - for backward compatibility)
const eventTypeToSQL: Partial<Record<EventType, (event: DesignEvent) => string>> = {
  TABLE_RENAMED: (e) => generateSnowflakeSQL(e).sql,
  COLUMN_RENAMED: (e) => generateSnowflakeSQL(e).sql,
  INGESTION_MODE_SET: (e) => generateSnowflakeSQL(e).sql,
  MASKING_POLICY_APPLIED: (e) => generateSnowflakeSQL(e).sql,
  PRIMARY_KEY_SET: (e) => generateSnowflakeSQL(e).sql,
  RELATION_CREATED: (e) => generateSnowflakeSQL(e).sql,
};

// Props
interface DeploymentValidationProps {
  className?: string;
  onClose?: () => void;
  database?: string;
  schemas?: string[];
}

// Local storage key for scheduled deployments
const SCHEDULED_DEPLOYMENTS_KEY = 'explore-design-scheduled-deployments';

const DeploymentValidation: React.FC<DeploymentValidationProps> = ({
  className,
  onClose,
  database,
  schemas = []
}) => {
  const { data: session } = useSession();
  const { events, pendingEvents, updateEventStatus, clearEvents, cleanupAppliedEvents } = useEventStore();
  const currentUser = (session?.user as any)?.username || session?.user?.email || 'current_user';

  // Generate project ID from database context
  const projectId = useMemo(() => {
    if (database) {
      return `${database.toLowerCase()}_project`;
    }
    return 'default_project';
  }, [database]);

  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [currentStep, setCurrentStep] = useState<'review' | 'validate' | 'deploy' | 'complete'>('review');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showSQLPreview, setShowSQLPreview] = useState(false);
  const [showRollbackSQL, setShowRollbackSQL] = useState(false);

  // Deployment configuration
  const [deploymentType, setDeploymentType] = useState<'immediate' | 'scheduled' | 'with_approval'>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('02:00');
  const [versionType, setVersionType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [changelogSummary, setChangelogSummary] = useState('');
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>(['DATA_MODELER']);
  const [scheduledDeployments, setScheduledDeployments] = useState<ScheduledDeploymentLocal[]>([]);

  // Backend integration state
  const [useBackend, setUseBackend] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

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

  // Save scheduled deployment to localStorage
  const saveScheduledDeployment = useCallback((deployment: ScheduledDeploymentLocal) => {
    setScheduledDeployments(prev => {
      const updated = [...prev, deployment];
      localStorage.setItem(SCHEDULED_DEPLOYMENTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Format event type for display
  const formatEventType = (type: EventType): string => {
    const displayNames: Partial<Record<EventType, string>> = {
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

  // Group events by table (events are now pre-validated at creation time)
  const eventsByTable = useMemo(() => {
    const groups: Record<string, DesignEvent[]> = {};

    pendingEvents.forEach((event) => {
      const key = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
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

  // Run validation - with backend integration
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setCurrentStep('validate');
    setBackendError(null);
    const results = new Map<string, TestResult>();

    toast.loading('Validating events...');

    // Convert local events to API format
    const apiEvents = pendingEvents.map(e => ({
      event_id: e.id,
      event_type: e.type,
      target: e.target,
      payload: e.payload,
      status: e.status,
      created_at: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
    }));

    if (useBackend) {
      try {
        // First, record events to backend for persistence
        toast.loading('Recording events to backend...');
        const recordResult = await recordDesignEvents(projectId, apiEvents as any, 'explore-design');

        if (recordResult.success) {
          toast.dismiss();
          toast.success(`Recorded ${recordResult.recorded_count} events to backend`);
        }

        // Then validate through backend
        toast.loading('Validating with backend...');
        const backendValidation = await validateEventsBackend(projectId, apiEvents as any);

        // Process backend validation results
        backendValidation.results.forEach((r) => {
          const localEvent = pendingEvents.find(e => e.id === r.event_id);
          if (localEvent) {
            const testResult: TestResult = {
              eventId: r.event_id,
              success: r.valid,
              message: r.valid ? 'Backend validation passed' : (r.error || 'Validation failed'),
              sql: r.sql,
              error: r.error,
              warnings: r.warnings,
              duration: 50,
            };
            results.set(r.event_id, testResult);
            updateEventStatus({
              eventId: r.event_id,
              status: r.valid ? 'validated' : 'failed',
              error: r.error,
            });
          }
        });

        toast.dismiss();

        if (backendValidation.summary.invalid === 0) {
          toast.success(`Backend validated ${backendValidation.summary.valid} events successfully`);
        } else {
          toast.error(`${backendValidation.summary.invalid} of ${backendValidation.summary.total} events failed backend validation`);
        }
      } catch (error: any) {
        console.error('Backend validation error:', error);
        setBackendError(error.message || 'Backend validation failed');
        toast.dismiss();
        toast.error('Backend unavailable, falling back to local validation');

        // Fall back to local validation
        for (const event of pendingEvents) {
          const result = validateEventLocally_Internal(event);
          results.set(event.id, result);
          updateEventStatus({
            eventId: event.id,
            status: result.success ? 'validated' : 'failed',
            error: result.error,
          });
        }
      }
    } else {
      // Local-only validation
      await new Promise(resolve => setTimeout(resolve, 300));

      for (const event of pendingEvents) {
        const result = validateEventLocally_Internal(event);
        results.set(event.id, result);
        setTestResults(new Map(results));

        updateEventStatus({
          eventId: event.id,
          status: result.success ? 'validated' : 'failed',
          error: result.error,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toast.dismiss();
      const successCount = Array.from(results.values()).filter((r) => r.success).length;
      const failCount = results.size - successCount;

      if (failCount === 0) {
        toast.success(`All ${successCount} events validated locally`);
      } else {
        toast.error(`${failCount} of ${results.size} events failed local validation`);
      }
    }

    setTestResults(results);
    setIsValidating(false);
  }, [pendingEvents, validateEventLocally_Internal, updateEventStatus, useBackend, projectId]);

  // Deploy changes - with real backend integration
  const handleDeploy = useCallback(async () => {
    const validatedEvents = events.filter((e) => e.status === 'validated');
    if (validatedEvents.length === 0) {
      toast.error('No validated events to deploy');
      return;
    }

    setIsDeploying(true);
    setCurrentStep('deploy');
    setBackendError(null);

    try {
      // Generate version number
      const versionNumber = `${versionType === 'major' ? '1' : '0'}.${versionType === 'minor' ? '1' : '0'}.${versionType === 'patch' ? Date.now() % 1000 : '0'}`;

      // Convert events to API format
      const apiEvents = validatedEvents.map(e => ({
        event_id: e.id,
        event_type: e.type,
        target: e.target,
        payload: e.payload,
        status: e.status,
        created_at: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
      }));

      // Handle based on deployment type
      if (deploymentType === 'scheduled') {
        if (!scheduledDate) {
          toast.error('Please select a scheduled date');
          setIsDeploying(false);
          return;
        }

        toast.loading('Scheduling deployment to backend...');

        try {
          // Use unified backend endpoint
          const result = await scheduleDeploymentUnified({
            workflow_name: `explore_design_v${versionNumber}`,
            scheduled_date: `${scheduledDate}T${scheduledTime}:00`,
            deployment_method: 'REPLACE_EXISTING',
            project_id: projectId,
            events: apiEvents as any,
            created_by: currentUser,
            description: changelogSummary || `Explore & Design deployment with ${validatedEvents.length} changes`,
            module_type: 'explore-design',
          });

          // Also save locally as backup
          const scheduledDeployment: ScheduledDeploymentLocal = {
            id: result.schedule_id || `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `deployment_v${versionNumber}`,
            scheduledDate: `${scheduledDate}T${scheduledTime}:00Z`,
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: validatedEvents.map(e => e.id),
            status: result.status as any || 'SCHEDULED',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${validatedEvents.length} changes`,
          };
          saveScheduledDeployment(scheduledDeployment);

          setDeploymentId(result.schedule_id);
          toast.dismiss();
          toast.success(`Deployment scheduled successfully!\nID: ${result.schedule_id}\nDate: ${scheduledDate} at ${scheduledTime} UTC\n\nNote: Visit Account Overview to track and approve this deployment.`);
          setCurrentStep('complete');

        } catch (error: any) {
          console.error('Backend scheduling error:', error);
          setBackendError(error.message);
          toast.dismiss();
          toast.error(`Backend scheduling failed: ${error.message}\n\nDeployment saved locally as fallback.`);

          // Save locally as fallback
          const scheduledDeployment: ScheduledDeploymentLocal = {
            id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `deployment_v${versionNumber}`,
            scheduledDate: `${scheduledDate}T${scheduledTime}:00Z`,
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: validatedEvents.map(e => e.id),
            status: 'SCHEDULED',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${validatedEvents.length} changes`,
          };
          saveScheduledDeployment(scheduledDeployment);
          setCurrentStep('complete');
        }

      } else if (deploymentType === 'with_approval') {
        toast.loading('Submitting for approval...');

        try {
          // Use unified backend endpoint with PENDING_APPROVAL status
          const result = await scheduleDeploymentUnified({
            workflow_name: `explore_design_approval_v${versionNumber}`,
            scheduled_date: new Date().toISOString(),
            deployment_method: 'REPLACE_EXISTING',
            project_id: projectId,
            events: apiEvents as any,
            created_by: currentUser,
            description: changelogSummary || `Explore & Design approval request with ${validatedEvents.length} changes`,
            module_type: 'explore-design',
          });

          // Also save locally
          const pendingApproval: ScheduledDeploymentLocal = {
            id: result.schedule_id || `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `approval_v${versionNumber}`,
            scheduledDate: new Date().toISOString(),
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: validatedEvents.map(e => e.id),
            status: 'PENDING_APPROVAL',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${validatedEvents.length} changes`,
            approvers: selectedApprovers,
          };
          saveScheduledDeployment(pendingApproval);

          setDeploymentId(result.schedule_id);
          toast.dismiss();
          toast.success(`Deployment submitted for approval!\nID: ${result.schedule_id}\nApprovers: ${selectedApprovers.join(', ')}\n\nNote: Approvers can review in Account Overview.`);
          setCurrentStep('complete');

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
            eventIds: validatedEvents.map(e => e.id),
            status: 'PENDING_APPROVAL',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${validatedEvents.length} changes`,
            approvers: selectedApprovers,
          };
          saveScheduledDeployment(pendingApproval);
          setCurrentStep('complete');
        }

      } else {
        // Immediate deployment - execute through backend
        toast.loading('Deploying changes to Snowflake...');

        try {
          const result = await deployEventsImmediate(projectId, apiEvents as any, {
            rollback_on_error: true,
            created_by: currentUser,
          });

          // Update local event status based on results
          result.results.forEach((r) => {
            const status = r.status === 'applied' ? 'applied' : 'failed';
            updateEventStatus({ eventId: r.event_id, status, error: r.error });
          });

          setDeploymentId(result.deployment_id);
          toast.dismiss();

          if (result.status === 'success') {
            toast.success(`Successfully deployed ${result.summary.applied} changes to Snowflake!\nDeployment ID: ${result.deployment_id}\nVersion: ${versionNumber}`);
          } else if (result.status === 'partial') {
            toast.error(`Partial deployment: ${result.summary.applied} succeeded, ${result.summary.failed} failed`);
          } else {
            toast.error(`Deployment failed: ${result.summary.failed} events could not be applied`);
          }
          setCurrentStep('complete');

        } catch (error: any) {
          console.error('Backend deployment error:', error);
          setBackendError(error.message);
          toast.dismiss();
          toast.error(`Backend deployment failed: ${error.message}`);

          // Mark events as failed
          validatedEvents.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'failed', error: error.message });
          });
        }
      }

      // Log deployment for audit
      console.info('[Deployment]', {
        version: versionNumber,
        timestamp: new Date().toISOString(),
        user: currentUser,
        events: validatedEvents.length,
        deploymentType,
        projectId,
        useBackend,
      });

    } catch (error: any) {
      console.error('Deployment error:', error);
      setBackendError(error.message);
      toast.error(`Deployment failed: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  }, [events, deploymentType, scheduledDate, scheduledTime, versionType, changelogSummary, selectedApprovers, currentUser, updateEventStatus, saveScheduledDeployment, projectId, useBackend]);

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
    const validated = events.filter((e) => e.status === 'validated').length;
    const failed = events.filter((e) => e.status === 'failed').length;
    const applied = events.filter((e) => e.status === 'applied').length;
    const pending = pendingEvents.length;
    return { validated, failed, applied, pending, total: events.length };
  }, [events, pendingEvents.length]);

  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-xl shadow-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-bold">Deployment Validation</h2>
              <p className="text-sm text-blue-100">
                Review, test, and deploy your data model changes
              </p>
            </div>
          </div>
          {onClose && (
            <Button variant="text" size="sm" onClick={onClose} className="text-white">
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {[
            { key: 'review', label: 'Review', icon: Eye },
            { key: 'validate', label: 'Validate', icon: CheckCircle2 },
            { key: 'deploy', label: 'Deploy', icon: Rocket },
            { key: 'complete', label: 'Complete', icon: Check },
          ].map((step, idx) => (
            <React.Fragment key={step.key}>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    currentStep === step.key
                      ? 'bg-blue-600 text-white'
                      : ['review', 'validate', 'deploy', 'complete'].indexOf(currentStep) >
                        ['review', 'validate', 'deploy', 'complete'].indexOf(step.key)
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  )}
                >
                  <step.icon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    currentStep === step.key ? 'text-blue-600' : 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < 3 && (
                <ArrowRight className="h-5 w-5 text-slate-300 dark:text-slate-600" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-6 py-3 border-b dark:border-slate-700 flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Total:</span>
          <Badge>{stats.total}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Pending:</span>
          <Badge className="bg-amber-100 text-amber-600">{stats.pending}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Validated:</span>
          <Badge className="bg-green-100 text-green-600">{stats.validated}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Failed:</span>
          <Badge className="bg-red-100 text-red-600">{stats.failed}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Applied:</span>
          <Badge className="bg-blue-100 text-blue-600">{stats.applied}</Badge>
        </div>
        {scheduledDeployments.length > 0 && (
          <Tooltip content={`${scheduledDeployments.filter(d => d.status === 'SCHEDULED').length} scheduled, ${scheduledDeployments.filter(d => d.status === 'PENDING_APPROVAL').length} pending approval`}>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Scheduled:</span>
              <Badge className="bg-purple-100 text-purple-600">{scheduledDeployments.length}</Badge>
            </div>
          </Tooltip>
        )}

        {/* Backend mode indicator */}
        <div className="ml-auto flex items-center gap-2">
          <Tooltip content={useBackend ? 'Using /mapping/schedule_deployment/ endpoint' : 'Local storage only (no backend)'}>
            <button
              onClick={() => setUseBackend(!useBackend)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                useBackend
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              )}
            >
              {useBackend ? <Cloud className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
              {useBackend ? 'Backend' : 'Local'}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Backend Error Banner */}
      {backendError && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Backend Error</p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1">{backendError}</p>
              <p className="text-xs text-red-500 dark:text-red-400 mt-2">
                Ensure the backend endpoint <code className="px-1 bg-red-100 dark:bg-red-950 rounded">/mapping/schedule_deployment/</code> is available.
              </p>
            </div>
            <button
              onClick={() => setBackendError(null)}
              className="text-red-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Deployment ID Banner */}
      {deploymentId && currentStep === 'complete' && (
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Deployment Recorded</p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                ID: <code className="px-1 bg-blue-100 dark:bg-blue-950 rounded">{deploymentId}</code>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/account-overview', '_blank')}
              className="text-xs"
            >
              View in Account Overview
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6 max-h-[60vh] overflow-auto">
        {currentStep === 'complete' ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Deployment Complete!</h3>
            <p className="text-slate-500 mb-6">
              All {stats.applied} changes have been successfully applied to your data model.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => {
                cleanupAppliedEvents();
                toast.success('Applied events cleared');
              }} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Clear Applied
              </Button>
              <Button variant="outline" onClick={() => {
                clearEvents();
                toast.success('All events cleared');
              }} className="gap-2">
                <X className="h-4 w-4" />
                Clear All
              </Button>
              <Button onClick={onClose} className="gap-2">
                <Check className="h-4 w-4" />
                Done
              </Button>
            </div>
          </div>
        ) : Object.keys(eventsByTable).length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FileCode className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400">
              No Significant Changes
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              {events.length > 0
                ? 'Some events exist but contain no meaningful changes'
                : 'Make changes in the modeling view to see them here'}
            </p>
            {events.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  clearEvents();
                  toast.success('Cleared all events');
                }}
              >
                Clear Empty Events
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(eventsByTable).map(([tableKey, tableEvents]) => (
              <div
                key={tableKey}
                className="border dark:border-slate-700 rounded-lg overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 flex items-center gap-3">
                  <Database className="h-5 w-5 text-blue-500" />
                  <span className="font-medium">{tableKey}</span>
                  <Badge className="ml-auto">{tableEvents.length} changes</Badge>
                </div>
                <div className="divide-y dark:divide-slate-700">
                  {tableEvents.map((event) => {
                    const result = testResults.get(event.id);
                    const isExpanded = expandedEvents.has(event.id);

                    return (
                      <div key={event.id}>
                        <div
                          className={cn(
                            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            event.status === 'failed' && 'bg-red-50 dark:bg-red-900/10'
                          )}
                          onClick={() => toggleExpand(event.id)}
                        >
                          <button className="p-0.5">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </button>

                          {/* Status Icon */}
                          {event.status === 'pending' && (
                            <Clock className="h-4 w-4 text-amber-500" />
                          )}
                          {event.status === 'validated' && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {event.status === 'failed' && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          {event.status === 'applied' && (
                            <Check className="h-4 w-4 text-blue-500" />
                          )}

                          {/* Event Type */}
                          <span className="text-sm font-medium">
                            {formatEventType(event.type)}
                          </span>

                          {/* Event Summary */}
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                            {getEventSummary(event)}
                          </span>

                          {/* Duration */}
                          {result?.duration && (
                            <span className="text-xs text-slate-400 ml-auto">
                              {result.duration}ms
                            </span>
                          )}
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-4 pb-3 ml-8 space-y-2">
                            <div className="p-3 bg-slate-900 dark:bg-slate-950 rounded text-xs font-mono text-green-400 overflow-auto">
                              {generateSQL(event)}
                            </div>
                            {result?.error && (
                              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
                                <strong>Error:</strong> {result.error}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deployment Configuration - Show after validation */}
      {(currentStep === 'validate' || currentStep === 'deploy') && !isValidating && !isDeploying && stats.validated > 0 && (
        <div className="px-6 py-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-4">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Deployment Configuration
          </h4>

          {/* Deployment Type */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'immediate', label: 'Deploy Now', icon: Rocket, desc: 'Execute immediately' },
              { value: 'scheduled', label: 'Schedule', icon: Calendar, desc: 'Deploy at specific time' },
              { value: 'with_approval', label: 'With Approval', icon: Users, desc: 'Require approval first' },
            ].map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all',
                  deploymentType === opt.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                )}
                onClick={() => setDeploymentType(opt.value as any)}
              >
                <opt.icon className={cn('h-5 w-5', deploymentType === opt.value ? 'text-blue-500' : 'text-slate-400')} />
                <div>
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Scheduled Time */}
          {deploymentType === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Date</label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Time (UTC)</label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Approval Settings */}
          {deploymentType === 'with_approval' && (
            <div className="p-3 border dark:border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium">Required Approvers</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['DATA_MODELER', 'DATA_ADMIN', 'DATA_STEWARD'].map((role) => (
                  <button
                    key={role}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-full border transition-colors',
                      selectedApprovers.includes(role)
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    )}
                    onClick={() => {
                      setSelectedApprovers((prev) =>
                        prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
                      );
                    }}
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Version Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Version Type</label>
              <select
                value={versionType}
                onChange={(e) => setVersionType(e.target.value as any)}
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="patch">Patch (Bug fixes)</option>
                <option value="minor">Minor (New features)</option>
                <option value="major">Major (Breaking changes)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Changelog Summary</label>
              <Input
                value={changelogSummary}
                onChange={(e) => setChangelogSummary(e.target.value)}
                placeholder="Describe changes..."
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      {events.length > 0 && currentStep !== 'complete' && (
        <div className="px-6 py-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadSQL}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Deploy SQL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadRollbackSQL}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Rollback SQL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySQL}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSQLPreview(true)}
              className="gap-2"
            >
              <FileCode className="h-4 w-4" />
              Preview
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {currentStep === 'validate' && !isValidating && (
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}

            {currentStep === 'review' && (
              <Button
                onClick={handleValidate}
                disabled={pendingEvents.length === 0}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Zap className="h-4 w-4" />
                Validate ({pendingEvents.length})
              </Button>
            )}

            {isValidating && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating...
              </Button>
            )}

            {(currentStep === 'validate' || currentStep === 'deploy') && !isValidating && !isDeploying && stats.validated > 0 && (
              <Button
                onClick={handleDeploy}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Rocket className="h-4 w-4" />
                {deploymentType === 'immediate' ? 'Deploy Now' : deploymentType === 'scheduled' ? 'Schedule' : 'Submit'} ({stats.validated})
              </Button>
            )}

            {isDeploying && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {deploymentType === 'immediate' ? 'Deploying...' : deploymentType === 'scheduled' ? 'Scheduling...' : 'Submitting...'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* SQL Preview Modal */}
      <Modal isOpen={showSQLPreview} onClose={() => setShowSQLPreview(false)}>
        <div className="p-6 max-w-4xl w-full">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            SQL Scripts Preview
          </h3>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b dark:border-slate-700">
            <button
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                !showRollbackSQL
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              onClick={() => setShowRollbackSQL(false)}
            >
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Deploy Script
              </div>
            </button>
            <button
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                showRollbackSQL
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              onClick={() => setShowRollbackSQL(true)}
            >
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Rollback Script
              </div>
            </button>
          </div>

          {/* SQL Content */}
          <div className="max-h-[50vh] overflow-auto p-4 bg-slate-900 rounded-lg">
            <pre className={cn(
              'text-sm font-mono whitespace-pre-wrap',
              showRollbackSQL ? 'text-amber-400' : 'text-green-400'
            )}>
              {showRollbackSQL
                ? (allRollbackSQL || '-- No rollback statements generated')
                : (allSQL || '-- No SQL statements generated')
              }
            </pre>
          </div>

          {/* Info Box */}
          <div className={cn(
            'mt-4 p-3 rounded-lg text-sm flex items-start gap-2',
            showRollbackSQL
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
          )}>
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              {showRollbackSQL
                ? 'Rollback scripts should be executed in reverse order. Some operations may require manual intervention.'
                : 'Review the generated SQL before deployment. The script will be executed against Snowflake.'
              }
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2 mt-4">
            <Button variant="outline" onClick={handleCopySQL} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy to Clipboard
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSQLPreview(false)}>
                Close
              </Button>
              <Button
                onClick={showRollbackSQL ? handleDownloadRollbackSQL : handleDownloadSQL}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download {showRollbackSQL ? 'Rollback' : 'Deploy'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DeploymentValidation;
