'use client';

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { DesignEvent, EventType, EventStatus } from '../../stores/event-store';
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
  children: React.ReactNode;
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
  children,
}: DeploymentProviderProps) {
  const [currentStep, setCurrentStep] = useState<DeploymentStep>('review');
  const [config, setConfig] = useState<DeploymentConfig>(DEFAULT_CONFIG);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [schemaVersions, setSchemaVersions] = useState<ProjectVersion[]>([]);
  const [currentSchemaVersion, setCurrentSchemaVersion] = useState<ProjectVersion | null>(null);

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
