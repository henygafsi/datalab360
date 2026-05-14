'use client';

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { DesignEvent, EventType, EventStatus } from '../../stores/event-store';
import {
  startDeployment as trackStart,
  advanceStep as trackAdvance,
  completeDeployment as trackComplete,
  type DeploymentStep as TrackedStep,
} from '@/app/services/deployment-tracking';
import { pingNotifications } from '@/hooks/useNotifications';
import type {
  IngestionMode,
  CronChoice,
  ProjectVersion,
  PreDeployChecksResult,
  DeploymentRiskResult,
  EnhancedImpactAnalysisResult,
} from '@/app/services/api/types';
import type { PostVerifyResult } from '../PostVerifyBanner';

// ── Local types ──
export interface SQLStatement {
  sql: string;
  rollback_sql?: string;
  object_type?: string;
  object_name?: string;
}

export interface IngestionTableConfig {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database?: string;
  target_schema?: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  mappings?: Array<{
    source_columns: string[];
    target_column: string;
    transformation?: string;
  }>;
  config?: Record<string, unknown>;
}

export interface DeploymentResult {
  status: 'success' | 'failed';
  deployment_id: string | null;
  version_id: string | null;
  version_number: number;
  versioned_schema_name: string | null;
  executed_statements: number;
  failed_statements: number;
  errors: string[];
}

export interface TestResult {
  eventId: string;
  success: boolean;
  message: string;
  sql?: string;
  error?: string;
  warnings?: string[];
  duration?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ColumnMappingOverview {
  sourceColumns: string[];
  targetColumn: string;
  transformation?: string | null;
}

export interface MappedTableOverview {
  sourceDatabase: string;
  sourceSchema: string;
  sourceTable: string;
  targetDatabase: string;
  targetSchema: string;
  targetTable: string;
  ingestionMode?: string;
  columnMappings: ColumnMappingOverview[];
}

export interface ScheduledDeploymentLocal {
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

// ── Step definition ──
export type DeploymentStep =
  | 'review'
  | 'config'
  | 'pre_checks'
  | 'dry_run'
  | 'sql_diff'
  | 'impact'
  | 'deploy'
  | 'verify';

export const DEPLOYMENT_STEPS: Array<{
  key: DeploymentStep;
  label: string;
  description: string;
}> = [
  { key: 'review', label: 'Review', description: 'Review DDL & ETL changes' },
  { key: 'config', label: 'Configure', description: 'Deployment configuration' },
  { key: 'pre_checks', label: 'Pre-Checks', description: 'Validate schema' },
  { key: 'dry_run', label: 'Dry Run', description: 'Simulate deployment' },
  { key: 'sql_diff', label: 'SQL Diff', description: 'Compare changes' },
  { key: 'impact', label: 'Impact', description: 'Impact analysis' },
  { key: 'deploy', label: 'Deploy', description: 'Execute deployment' },
  { key: 'verify', label: 'Verify', description: 'Post-deploy check' },
];

// ── Config state ──
export interface DeploymentConfig {
  deploymentType: 'immediate' | 'with_approval';
  atomicDeployment: boolean;
  ingestionType: 'immediate' | 'scheduled';
  cronChoice: CronChoice;
  customCron: string;
  scheduleWarehouse: string;
  versionType: 'patch' | 'minor' | 'major';
  changelogSummary: string;
  selectedApprovers: string[];
  ingestionTargetVersion: 'latest' | string;
  ingestionModeOverrides: Record<string, IngestionMode>;
}

export const DEFAULT_CONFIG: DeploymentConfig = {
  deploymentType: 'immediate',
  atomicDeployment: false,
  ingestionType: 'immediate',
  cronChoice: 'DAILY',
  customCron: '',
  scheduleWarehouse: 'COMPUTE_WH',
  versionType: 'patch',
  changelogSummary: '',
  selectedApprovers: ['DATA_MODELER'],
  ingestionTargetVersion: 'latest',
  ingestionModeOverrides: {},
};

// ── Results state ──
export interface DeploymentResults {
  testResults: Map<string, TestResult>;
  preChecksResult: PreDeployChecksResult | null;
  preChecksAllPassed: boolean;
  dryRunCompleted: boolean;
  serverRiskResult: DeploymentRiskResult | null;
  enhancedImpactResult: EnhancedImpactAnalysisResult | null;
  riskAssessment: {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    breakdown: Array<{ factor: string; points: number; reason: string }>;
    aiSummary: string | null;
    aiSummaryLoading: boolean;
  } | null;
  schemaDeploymentResult: DeploymentResult | null;
  postVerifyResult: PostVerifyResult | null;
  deploymentId: string | null;
  deploymentPhase: 'schema' | 'ingestion' | 'complete';
  backendError: string | null;
}

// ── Context shape ──
export interface DeploymentContextValue {
  // Identity
  projectId: string;
  database: string;
  schemas: string[];
  currentUser: string;

  // Events
  events: DesignEvent[];
  pendingEvents: DesignEvent[];
  updateEventStatus: (params: { eventId: string; status: EventStatus; error?: string }) => void;
  cleanupAppliedEvents: () => void;

  // Navigation
  currentStep: DeploymentStep;
  setCurrentStep: (step: DeploymentStep) => void;
  goNext: () => void;
  goPrev: () => void;
  canGoNext: boolean;

  // Config
  config: DeploymentConfig;
  updateConfig: <K extends keyof DeploymentConfig>(key: K, value: DeploymentConfig[K]) => void;

  // Results
  results: DeploymentResults;
  setResults: React.Dispatch<React.SetStateAction<DeploymentResults>>;

  // Loading
  isValidating: boolean;
  setIsValidating: (v: boolean) => void;
  isDeploying: boolean;
  setIsDeploying: (v: boolean) => void;

  // Schema versions
  schemaVersions: ProjectVersion[];
  setSchemaVersions: React.Dispatch<React.SetStateAction<ProjectVersion[]>>;
  currentSchemaVersion: ProjectVersion | null;
  setCurrentSchemaVersion: React.Dispatch<React.SetStateAction<ProjectVersion | null>>;

  // Close handler
  onClose?: () => void;
}

const DeploymentContext = createContext<DeploymentContextValue | null>(null);

export function useDeploymentContext() {
  const ctx = useContext(DeploymentContext);
  if (!ctx) throw new Error('useDeploymentContext must be used within DeploymentProvider');
  return ctx;
}

interface DeploymentProviderProps {
  projectId: string;
  database: string;
  schemas: string[];
  currentUser: string;
  events: DesignEvent[];
  pendingEvents: DesignEvent[];
  updateEventStatus: (params: { eventId: string; status: EventStatus; error?: string }) => void;
  cleanupAppliedEvents: () => void;
  onClose?: () => void;
  /** Optional: name displayed in tracking notifications. */
  projectName?: string;
  children: React.ReactNode;
}

/**
 * Map the popup's 8-step lifecycle onto the 5-step tracking model:
 *   review        → review
 *   config        → configure
 *   pre_checks    → dry_run
 *   dry_run       → dry_run
 *   sql_diff      → dry_run
 *   impact        → dry_run
 *   deploy        → deploy
 *   verify        → verify
 */
function toTrackedStep(step: DeploymentStep): TrackedStep {
  switch (step) {
    case 'review':     return 'review';
    case 'config':     return 'configure';
    case 'deploy':     return 'deploy';
    case 'verify':     return 'verify';
    default:           return 'dry_run';
  }
}

export function DeploymentProvider({
  projectId,
  database,
  schemas,
  currentUser,
  events,
  pendingEvents,
  updateEventStatus,
  cleanupAppliedEvents,
  onClose,
  projectName,
  children,
}: DeploymentProviderProps) {
  const [currentStep, setCurrentStep] = useState<DeploymentStep>('review');
  const [config, setConfig] = useState<DeploymentConfig>(DEFAULT_CONFIG);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [schemaVersions, setSchemaVersions] = useState<ProjectVersion[]>([]);
  const [currentSchemaVersion, setCurrentSchemaVersion] = useState<ProjectVersion | null>(null);

  // ----- Deployment tracking sync -----
  // Mirror every popup step transition + terminal state into the backend
  // /deployments/track lifecycle. The header chip + notification dropdown
  // pick it up automatically via their own polling.
  const trackedIdRef = useRef<string | null>(null);
  const trackedStepRef = useRef<TrackedStep | null>(null);
  const completedRef = useRef(false);

  // 1. Start lifecycle on first mount.
  useEffect(() => {
    if (trackedIdRef.current || !projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await trackStart({
          project_id: projectId,
          project_name: projectName,
          requires_approval: config.deploymentType === 'with_approval',
          approver_username: config.deploymentType === 'with_approval'
            ? (config.selectedApprovers[0] ?? undefined)
            : undefined,
          payload: { events_pending: pendingEvents.length },
          ui_origin: 'explore-design',
        });
        if (cancelled) return;
        trackedIdRef.current = row.deployment_id;
        trackedStepRef.current = 'review';
        pingNotifications();
      } catch {
        // Tracking is a side-channel — never block the user's deploy.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 2. Advance step whenever currentStep changes.
  useEffect(() => {
    if (!trackedIdRef.current || completedRef.current) return;
    const target = toTrackedStep(currentStep);
    if (target === trackedStepRef.current) return;
    const prior = trackedStepRef.current;
    trackedStepRef.current = target;
    void trackAdvance(trackedIdRef.current, {
      step: target,
      completed: prior !== null,   // mark the previous step done when we move on
    }).catch(() => undefined);
  }, [currentStep]);

  // 3. Finalize when schemaDeploymentResult is set (success or failure).
  // Wired below in setResults wrapper.
  // 4. Cancel-on-close: if user closes the popup before a terminal state,
  // we leave the tracked deploy as-is. The chip will keep showing it as
  // active; the user can come back to resume.

  const [results, setResults] = useState<DeploymentResults>({
    testResults: new Map(),
    preChecksResult: null,
    preChecksAllPassed: false,
    dryRunCompleted: false,
    serverRiskResult: null,
    enhancedImpactResult: null,
    riskAssessment: null,
    schemaDeploymentResult: null,
    postVerifyResult: null,
    deploymentId: null,
    deploymentPhase: 'schema',
    backendError: null,
  });

  // 3. Finalize tracking when the schema deploy returns a terminal result.
  useEffect(() => {
    if (!trackedIdRef.current || completedRef.current) return;
    const r = results.schemaDeploymentResult;
    if (!r) return;
    const status = r.status === 'success' ? 'SUCCEEDED' : 'FAILED';
    completedRef.current = true;
    void trackComplete(trackedIdRef.current, {
      status,
      error: r.status === 'failed' ? (r.errors?.[0] ?? 'Deploy failed') : undefined,
    }).then(() => pingNotifications()).catch(() => undefined);
  }, [results.schemaDeploymentResult]);

  // Surface backend errors per step into the tracked errors_by_step.
  useEffect(() => {
    if (!trackedIdRef.current || completedRef.current || !results.backendError) return;
    void trackAdvance(trackedIdRef.current, {
      step: toTrackedStep(currentStep),
      errors: [{ message: results.backendError }],
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.backendError]);

  const updateConfig = useCallback(<K extends keyof DeploymentConfig>(key: K, value: DeploymentConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const stepIndex = DEPLOYMENT_STEPS.findIndex(s => s.key === currentStep);

  const goNext = useCallback(() => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < DEPLOYMENT_STEPS.length) {
      setCurrentStep(DEPLOYMENT_STEPS[nextIdx].key);
    }
  }, [stepIndex]);

  const goPrev = useCallback(() => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) {
      setCurrentStep(DEPLOYMENT_STEPS[prevIdx].key);
    }
  }, [stepIndex]);

  const value = useMemo<DeploymentContextValue>(() => ({
    projectId,
    database,
    schemas,
    currentUser,
    events,
    pendingEvents,
    updateEventStatus,
    cleanupAppliedEvents,
    currentStep,
    setCurrentStep,
    goNext,
    goPrev,
    canGoNext: stepIndex < DEPLOYMENT_STEPS.length - 1,
    config,
    updateConfig,
    results,
    setResults,
    isValidating,
    setIsValidating,
    isDeploying,
    setIsDeploying,
    schemaVersions,
    setSchemaVersions,
    currentSchemaVersion,
    setCurrentSchemaVersion,
    onClose,
  }), [
    projectId, database, schemas, currentUser,
    events, pendingEvents, updateEventStatus, cleanupAppliedEvents,
    currentStep, goNext, goPrev, stepIndex,
    config, updateConfig, results, isValidating, isDeploying,
    schemaVersions, currentSchemaVersion, onClose,
  ]);

  return (
    <DeploymentContext.Provider value={value}>
      {children}
    </DeploymentContext.Provider>
  );
}
