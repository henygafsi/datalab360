/**
 * Explore & Design API Service
 *
 * This service handles all API calls for the Explore & Design feature
 * including metadata fetching, event management, and deployment
 */

import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const EXPLORE_DESIGN_BASE = `${API_URL}/explore-design`;

// Types
export type IngestionMode =
  | 'full_refresh'
  | 'incremental'
  | 'snapshot'
  | 'scd_type1'
  | 'scd_type2'
  | 'scd_type3';

export type EventType =
  | 'TABLE_SELECTED'
  | 'TABLE_RENAMED'
  | 'COLUMN_RENAMED'
  | 'COLUMN_TYPE_CHANGED'
  | 'ADD_COLUMN'
  | 'REMOVE_COLUMN'
  | 'PRIMARY_KEY_SET'
  | 'PRIMARY_KEY_REMOVED'
  | 'FOREIGN_KEY_ADDED'
  | 'FOREIGN_KEY_REMOVED'
  | 'INGESTION_MODE_SET'
  | 'SCD_CONFIGURED'
  | 'MASKING_POLICY_APPLIED'
  | 'MASKING_POLICY_REMOVED'
  | 'RLS_POLICY_APPLIED'
  | 'RLS_POLICY_REMOVED'
  | 'AGGREGATION_POLICY_APPLIED'
  | 'AGGREGATION_POLICY_REMOVED'
  | 'RELATION_CREATED'
  | 'RELATION_REMOVED'
  | 'TAG_APPLIED'
  | 'TAG_REMOVED'
  | 'TABLE_EXCLUDED'
  | 'TABLE_INCLUDED'
  | 'COLUMN_EXCLUDED'
  | 'COLUMN_INCLUDED'
  | 'BATCH_OPERATION';

export type EventStatus = 'pending' | 'validated' | 'failed' | 'applied';

export interface TableReference {
  database: string;
  schema: string;
  table: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  default_value?: string;
  comment?: string;
}

export interface TableMetadata extends TableReference {
  column_count: number;
  row_count?: number;
  size_bytes?: number;
  last_modified?: string;
  columns?: ColumnInfo[];
  constraints?: {
    primary_keys: string[];
    foreign_keys: Array<{
      columns: string[];
      references_table: string;
      references_columns: string[];
    }>;
    unique_keys: string[][];
  };
}

export interface IngestionConfig {
  mode: IngestionMode;
  config?: {
    incremental_column?: string;
    tracking_columns?: string[];
    effective_date_column?: string;
    expiration_date_column?: string;
    current_flag_column?: string;
    previous_value_column?: string;
    snapshot_date_column?: string;
  };
}

export interface DesignEvent {
  event_id: string;
  event_type: EventType;
  target: TableReference & { column?: string };
  payload: Record<string, any>;
  status: EventStatus;
  created_at: string;
  user_id?: string;
  error?: string;
}

export interface ValidationResult {
  event_id: string;
  status: 'validated' | 'failed';
  sql?: string;
  error?: string;
  warnings?: string[];
  estimated_impact?: {
    affected_rows: number;
    dependent_objects: number;
  };
}

export interface DeploymentResult {
  event_id: string;
  status: 'applied' | 'failed' | 'skipped';
  sql_executed?: string;
  execution_time_ms?: number;
  error?: string;
}

export interface SensitiveColumnDetection {
  database: string;
  schema: string;
  table: string;
  column: string;
  confidence: number;
  pattern_matched: string;
  sample_match_rate?: number;
  recommended_masking?: string;
  recommended_tag?: string;
}

export interface RelationDetection {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  confidence: number;
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  detection_method: string;
  value_overlap_percent?: number;
}

// Helper to get auth headers with Snowflake account context
// Works in both server-side (SSR) and client-side contexts
async function getAuthHeaders() {
  const session = await getAuthSession();
  if (!session?.user?.access_token) {
    throw new Error('No authentication token available');
  }
  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
}

// ============================================
// METADATA APIS
// ============================================

/**
 * Fetch metadata for multiple tables in a single request
 */
export async function batchGetTableMetadata(
  tables: TableReference[],
  options?: {
    include_columns?: boolean;
    include_statistics?: boolean;
    include_constraints?: boolean;
  }
): Promise<{ tables: TableMetadata[]; metadata: { fetched_at: string; total_tables: number } }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${API_URL}/mapping/metadata/batch`,
    {
      tables,
      include_columns: options?.include_columns ?? true,
      include_statistics: options?.include_statistics ?? false,
      include_constraints: options?.include_constraints ?? true,
    },
    { headers }
  );
  return response.data;
}

// ============================================
// INGESTION CONFIGURATION APIS
// ============================================

/**
 * Set ingestion mode for a table
 */
export async function setIngestionConfig(
  projectId: string,
  table: TableReference,
  ingestionMode: IngestionMode,
  config?: IngestionConfig['config']
): Promise<{ success: boolean; table_id: string; config_id: string; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/config`,
    {
      project_id: projectId,
      table,
      ingestion_mode: ingestionMode,
      config,
    },
    { headers }
  );
  return response.data;
}

/**
 * Bulk set ingestion mode for multiple tables
 */
export async function bulkSetIngestionConfig(
  projectId: string,
  tables: TableReference[],
  ingestionMode: IngestionMode,
  config?: { incremental_column_pattern?: string }
): Promise<{ success: boolean; updated: number; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/config/bulk`,
    {
      project_id: projectId,
      tables,
      ingestion_mode: ingestionMode,
      config,
    },
    { headers }
  );
  return response.data;
}

// ============================================
// DETECTION APIS
// ============================================

/**
 * Detect sensitive columns in tables
 */
export async function detectSensitiveColumns(
  tables: TableReference[],
  options?: {
    patterns?: string[];
    sample_data?: boolean;
    sample_size?: number;
  }
): Promise<{
  detections: SensitiveColumnDetection[];
  summary: { tables_scanned: number; columns_scanned: number; sensitive_found: number };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/detect/sensitive`,
    {
      tables,
      patterns: options?.patterns ?? ['email', 'ssn', 'phone', 'address', 'credit_card', 'dob'],
      sample_data: options?.sample_data ?? true,
      sample_size: options?.sample_size ?? 100,
    },
    { headers }
  );
  return response.data;
}

/**
 * Auto-detect foreign key relationships
 */
export async function detectRelations(
  sourceTables: TableReference[],
  targetTables: TableReference[],
  options?: {
    detection_methods?: ('naming_convention' | 'data_type_match' | 'value_overlap')[];
    sample_size?: number;
  }
): Promise<{
  detected_relations: RelationDetection[];
  suggestions: RelationDetection[];
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/detect/relations`,
    {
      source_tables: sourceTables,
      target_tables: targetTables,
      detection_methods: options?.detection_methods ?? ['naming_convention', 'data_type_match', 'value_overlap'],
      sample_size: options?.sample_size ?? 1000,
    },
    { headers }
  );
  return response.data;
}

/**
 * Detect primary key candidates
 */
export async function detectPrimaryKeys(
  tables: TableReference[],
  options?: {
    patterns?: string[];
    check_uniqueness?: boolean;
    check_nullability?: boolean;
  }
): Promise<{
  detections: Array<{
    database: string;
    schema: string;
    table: string;
    column: string;
    confidence: number;
    is_unique: boolean;
    has_nulls: boolean;
    pattern_matched: string;
    recommendation: string;
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/detect/primary-keys`,
    {
      tables,
      patterns: options?.patterns ?? ['*_ID', 'ID_*', '*_PK', '*_KEY'],
      check_uniqueness: options?.check_uniqueness ?? true,
      check_nullability: options?.check_nullability ?? true,
    },
    { headers }
  );
  return response.data;
}

// ============================================
// EVENT MANAGEMENT APIS
// ============================================

/**
 * Record a design event
 */
export async function recordEvent(
  projectId: string,
  eventType: EventType,
  target: TableReference & { column?: string },
  payload: Record<string, any>
): Promise<{ event_id: string; status: EventStatus; created_at: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/events`,
    {
      project_id: projectId,
      event_type: eventType,
      target,
      payload,
    },
    { headers }
  );
  return response.data;
}

/**
 * Get all events for a project
 */
export async function getProjectEvents(
  projectId: string,
  filters?: {
    status?: EventStatus;
    event_type?: EventType;
  }
): Promise<{
  project_id: string;
  events: DesignEvent[];
  summary: { total: number; pending: number; validated: number; failed: number };
}> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.event_type) params.append('event_type', filters.event_type);

  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/events/${projectId}?${params.toString()}`,
    { headers }
  );
  return response.data;
}

/**
 * Delete an event
 */
export async function deleteEvent(
  projectId: string,
  eventId: string
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.delete(
    `${EXPLORE_DESIGN_BASE}/events/${projectId}/${eventId}`,
    { headers }
  );
  return response.data;
}

// ============================================
// VALIDATION APIS
// ============================================

/**
 * Validate pending events before deployment
 */
export async function validateEvents(
  projectId: string,
  eventIds: string[],
  dryRun: boolean = true
): Promise<{
  results: ValidationResult[];
  summary: { validated: number; failed: number };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/events/validate`,
    {
      project_id: projectId,
      event_ids: eventIds,
      dry_run: dryRun,
    },
    { headers }
  );
  return response.data;
}

// ============================================
// DEPLOYMENT APIS
// ============================================

/**
 * Deploy validated events
 */
export async function deployEvents(
  projectId: string,
  eventIds: string[],
  options?: { rollback_on_error?: boolean }
): Promise<{
  deployment_id: string;
  status: 'completed' | 'partial' | 'failed';
  results: DeploymentResult[];
  summary: { applied: number; failed: number; skipped: number };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/events/deploy`,
    {
      project_id: projectId,
      event_ids: eventIds,
      rollback_on_error: options?.rollback_on_error ?? true,
    },
    { headers }
  );
  return response.data;
}

// ============================================
// PROJECT STATE APIS
// ============================================

export interface ProjectState {
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tables: Array<{
    id: string;
    database: string;
    schema: string;
    table: string;
    display_name?: string;
    status: 'pending' | 'configured';
    ingestion?: IngestionConfig;
    masking?: Array<{ column: string; policy: string }>;
    primary_keys?: string[];
    relations?: Array<{
      column: string;
      target_table: string;
      target_column: string;
      type: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
    }>;
  }>;
  pending_events: number;
}

/**
 * Get project state
 */
export async function getProjectState(projectId: string): Promise<ProjectState> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/project/${projectId}`,
    { headers }
  );
  return response.data;
}

/**
 * Save project state
 */
export async function saveProjectState(
  projectId: string,
  state: Partial<ProjectState>
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.put(
    `${EXPLORE_DESIGN_BASE}/project/${projectId}`,
    state,
    { headers }
  );
  return response.data;
}

/**
 * Create a new project
 */
export async function createProject(
  name: string,
  tables?: TableReference[]
): Promise<{ project_id: string; name: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/project`,
    { name, tables },
    { headers }
  );
  return response.data;
}

// ============================================
// TEMPLATE APIS
// ============================================

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  config: {
    default_ingestion_mode: IngestionMode;
    pk_detection_patterns: string[];
    sensitive_column_patterns: string[];
    masking_rules: Array<{ pattern: string; policy: string }>;
    required_policies: string[];
    scd_defaults: {
      effective_date_column: string;
      expiration_date_column: string;
      current_flag_column: string;
    };
  };
}

/**
 * List available templates
 */
export async function getTemplates(): Promise<ConfigTemplate[]> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/templates`,
    { headers }
  );
  return response.data;
}

/**
 * Save a configuration template
 */
export async function saveTemplate(
  template: Omit<ConfigTemplate, 'id'>
): Promise<{ template_id: string; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/templates`,
    template,
    { headers }
  );
  return response.data;
}

/**
 * Apply template to tables
 */
export async function applyTemplate(
  templateId: string,
  projectId: string,
  tables: TableReference[]
): Promise<{ success: boolean; applied_to: number; events_created: number }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/templates/${templateId}/apply`,
    { project_id: projectId, tables },
    { headers }
  );
  return response.data;
}

// ============================================
// SCHEMA CHANGE DETECTION
// ============================================

export interface SchemaChange {
  new_tables: Array<TableReference & { column_count: number }>;
  modified_tables: Array<{
    table: TableReference;
    new_columns: string[];
    removed_columns: string[];
    type_changes: Array<{ column: string; old_type: string; new_type: string }>;
  }>;
  removed_tables: TableReference[];
}

/**
 * Detect schema changes since last sync
 */
export async function detectSchemaChanges(
  projectId: string
): Promise<{ last_sync: string; changes: SchemaChange }> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/schema-changes/${projectId}`,
    { headers }
  );
  return response.data;
}

// ============================================
// COMPLIANCE VALIDATION
// ============================================

export interface ComplianceCheck {
  rule: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  tables?: string[];
  columns?: string[];
}

/**
 * Validate compliance rules
 */
export async function validateCompliance(
  projectId: string,
  rules: string[]
): Promise<{
  status: 'pass' | 'warning' | 'fail';
  score: number;
  checks: ComplianceCheck[];
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/compliance/validate`,
    { project_id: projectId, compliance_rules: rules },
    { headers }
  );
  return response.data;
}

// ============================================
// DEPLOYMENT APIs
// ============================================

export type DeploymentType = 'immediate' | 'scheduled' | 'conditional' | 'staged';
export type DeploymentStatus = 'draft' | 'pending_review' | 'approved' | 'deploying' | 'deployed' | 'failed' | 'rolled_back';

export interface DeploymentConfig {
  immediate: boolean;
  scheduled_at?: string;
  staged_rollout?: {
    enabled: boolean;
    initial_percentage: number;
    ramp_up_interval_minutes: number;
    final_percentage: number;
  };
  rollback_on_error: boolean;
  notification_channels: string[];
  approvers: string[];
}

export interface Deployment {
  deployment_id: string;
  project_id: string;
  version: string;
  type: DeploymentType;
  status: DeploymentStatus;
  config: DeploymentConfig;
  event_ids: string[];
  created_at: string;
  approved_at?: string;
  deployed_at?: string;
}

/**
 * Create a new deployment
 */
export async function createDeployment(
  projectId: string,
  version: string,
  type: DeploymentType,
  eventIds: string[],
  config?: Partial<DeploymentConfig>
): Promise<{
  deployment_id: string;
  status: DeploymentStatus;
  approval_required: boolean;
  approval_request_id?: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/deployments`,
    {
      project_id: projectId,
      version,
      type,
      event_ids: eventIds,
      config: {
        immediate: type === 'immediate',
        rollback_on_error: true,
        notification_channels: ['email'],
        approvers: [],
        ...config,
      },
    },
    { headers }
  );
  return response.data;
}

/**
 * Get deployment details
 */
export async function getDeployment(deploymentId: string): Promise<Deployment & {
  execution_log: Array<{
    timestamp: string;
    event_id: string;
    status: string;
    duration_ms: number;
    error?: string;
  }>;
  metrics?: {
    total_events: number;
    succeeded: number;
    failed: number;
    duration_seconds: number;
  };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/deployments/${deploymentId}`,
    { headers }
  );
  return response.data;
}

/**
 * Execute a deployment
 */
export async function executeDeployment(
  deploymentId: string,
  options?: { execution_mode?: 'immediate' | 'dry_run'; dry_run?: boolean }
): Promise<{
  deployment_id: string;
  status: DeploymentStatus;
  execution_started: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/deployments/${deploymentId}/execute`,
    {
      execution_mode: options?.execution_mode ?? 'immediate',
      dry_run: options?.dry_run ?? false,
    },
    { headers }
  );
  return response.data;
}

/**
 * Rollback a deployment
 */
export async function rollbackDeployment(
  deploymentId: string,
  targetVersion: string,
  reason: string
): Promise<{ success: boolean; message: string; rollback_deployment_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/deployments/${deploymentId}/rollback`,
    {
      target_version: targetVersion,
      reason,
    },
    { headers }
  );
  return response.data;
}

/**
 * List deployments for a project
 */
export async function listDeployments(
  projectId: string,
  filters?: { status?: DeploymentStatus; limit?: number }
): Promise<{ deployments: Deployment[]; total: number }> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.limit) params.append('limit', String(filters.limit));

  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/deployments/project/${projectId}?${params.toString()}`,
    { headers }
  );
  return response.data;
}

// ============================================
// VERSION APIs
// ============================================

export type VersionType = 'major' | 'minor' | 'patch';
export type VersionStatus = 'draft' | 'published' | 'deployed' | 'archived' | 'deprecated';

export interface Version {
  version_id: string;
  project_id: string;
  version: string;
  previous_version?: string;
  status: VersionStatus;
  created_at: string;
  created_by: string;
  deployed_at?: string;
  deployed_by?: string;
  environment?: string;
  changelog: {
    summary: string;
    changes: Array<{
      type: string;
      table?: string;
      column?: string;
      from?: string;
      to?: string;
    }>;
  };
}

/**
 * Create a new version
 */
export async function createVersion(
  projectId: string,
  versionType: VersionType,
  changelogSummary: string,
  snapshotEvents?: boolean
): Promise<{ version_id: string; version: string; previous_version?: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/versions`,
    {
      project_id: projectId,
      version_type: versionType,
      changelog: changelogSummary,
      snapshot_events: snapshotEvents ?? true,
    },
    { headers }
  );
  return response.data;
}

/**
 * List versions for a project
 */
export async function listVersions(projectId: string): Promise<{ versions: Version[] }> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/versions/${projectId}`,
    { headers }
  );
  return response.data;
}

/**
 * Get version details
 */
export async function getVersion(versionId: string): Promise<Version & { snapshot: any }> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/versions/detail/${versionId}`,
    { headers }
  );
  return response.data;
}

/**
 * Compare two versions
 */
export async function compareVersions(
  fromVersionId: string,
  toVersionId: string
): Promise<{
  from_version: string;
  to_version: string;
  diff: {
    tables_added: string[];
    tables_removed: string[];
    tables_modified: Array<{
      table: string;
      changes: Array<{ type: string; column?: string; from?: string; to?: string }>;
    }>;
    policies_added: string[];
    policies_removed: string[];
  };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/versions/${fromVersionId}/compare/${toVersionId}`,
    { headers }
  );
  return response.data;
}

/**
 * Publish a version
 */
export async function publishVersion(versionId: string): Promise<{ success: boolean; published_at: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/versions/${versionId}/publish`,
    {},
    { headers }
  );
  return response.data;
}

/**
 * Archive a version
 */
export async function archiveVersion(versionId: string): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/versions/${versionId}/archive`,
    {},
    { headers }
  );
  return response.data;
}

// ============================================
// APPROVAL APIs
// ============================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  approval_request_id: string;
  project_id: string;
  deployment_id: string;
  version: string;
  requested_by: string;
  requested_at: string;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  changes_summary: {
    total_events: number;
    by_category: Record<string, number>;
    high_risk_changes: number;
    affected_tables: number;
  };
  approvers: Array<{
    user_id: string;
    role: string;
    status: ApprovalStatus;
    approved_at?: string;
    comment?: string;
    required: boolean;
  }>;
  deadline?: string;
  comments: Array<{
    user_id: string;
    comment: string;
    created_at: string;
  }>;
}

/**
 * Get pending approvals for current user
 */
export async function getPendingApprovals(): Promise<{
  pending: ApprovalRequest[];
  total: number;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/approvals/pending`,
    { headers }
  );
  return response.data;
}

/**
 * Get approval details
 */
export async function getApprovalDetails(approvalId: string): Promise<ApprovalRequest> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/approvals/${approvalId}`,
    { headers }
  );
  return response.data;
}

/**
 * Approve a request
 */
export async function approveRequest(
  approvalId: string,
  comment?: string
): Promise<{ success: boolean; deployment_status: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/approvals/${approvalId}/approve`,
    { comment },
    { headers }
  );
  return response.data;
}

/**
 * Reject a request
 */
export async function rejectRequest(
  approvalId: string,
  comment: string,
  requiredChanges?: Array<{ type: string; table?: string; column?: string }>
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/approvals/${approvalId}/reject`,
    {
      comment,
      required_changes: requiredChanges,
    },
    { headers }
  );
  return response.data;
}

/**
 * Add comment to approval request
 */
export async function addApprovalComment(
  approvalId: string,
  comment: string
): Promise<{ success: boolean; comment_id: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/approvals/${approvalId}/comment`,
    { comment },
    { headers }
  );
  return response.data;
}

// ============================================
// INGESTION APIs
// ============================================

export interface SnowpipeConfig {
  pipe_name: string;
  auto_ingest: boolean;
  source: {
    type: 'S3' | 'AZURE' | 'GCS';
    location: string;
    file_format: string;
    pattern?: string;
  };
  error_handling: {
    on_error: 'CONTINUE' | 'SKIP_FILE' | 'ABORT_STATEMENT';
    max_file_errors: number;
  };
}

export interface BatchTaskConfig {
  task_name: string;
  schedule: {
    type: 'cron' | 'interval' | 'after_stream';
    cron_expression?: string;
    interval_minutes?: number;
    depends_on_stream?: string;
  };
  warehouse: string;
  warehouse_size: 'XSMALL' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';
  sql_statements: string[];
}

/**
 * Create/configure Snowpipe
 */
export async function createSnowpipe(
  projectId: string,
  tableId: string,
  config: SnowpipeConfig
): Promise<{ pipe_id: string; pipe_name: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/snowpipe`,
    {
      project_id: projectId,
      table_id: tableId,
      config,
    },
    { headers }
  );
  return response.data;
}

/**
 * Create batch task
 */
export async function createBatchTask(
  projectId: string,
  tableId: string,
  config: BatchTaskConfig
): Promise<{ task_id: string; task_name: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/batch-task`,
    {
      project_id: projectId,
      table_id: tableId,
      config,
    },
    { headers }
  );
  return response.data;
}

/**
 * Create stream for CDC
 */
export async function createStream(
  projectId: string,
  streamName: string,
  sourceTable: string,
  options?: { append_only?: boolean; show_initial_rows?: boolean }
): Promise<{ stream_id: string; stream_name: string; status: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/stream`,
    {
      project_id: projectId,
      stream_name: streamName,
      source_table: sourceTable,
      append_only: options?.append_only ?? false,
      show_initial_rows: options?.show_initial_rows ?? false,
    },
    { headers }
  );
  return response.data;
}

/**
 * Pause ingestion (pipe or task)
 */
export async function pauseIngestion(
  ingestionId: string,
  type: 'snowpipe' | 'task'
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/${ingestionId}/pause`,
    { type },
    { headers }
  );
  return response.data;
}

/**
 * Resume ingestion (pipe or task)
 */
export async function resumeIngestion(
  ingestionId: string,
  type: 'snowpipe' | 'task'
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/${ingestionId}/resume`,
    { type },
    { headers }
  );
  return response.data;
}

// ============================================
// CONDITION APIs
// ============================================

export type ConditionType = 'time_based' | 'dependency' | 'data_availability' | 'approval' | 'resource' | 'custom_sql' | 'external_api';

export interface EventCondition {
  id: string;
  type: ConditionType;
  config: Record<string, any>;
  required: boolean;
}

/**
 * Add conditions to an event
 */
export async function addEventConditions(
  eventId: string,
  conditions: Omit<EventCondition, 'id'>[]
): Promise<{ success: boolean; condition_ids: string[] }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/events/${eventId}/conditions`,
    { conditions },
    { headers }
  );
  return response.data;
}

/**
 * Evaluate event conditions
 */
export async function evaluateConditions(eventId: string): Promise<{
  all_met: boolean;
  results: Array<{
    condition_id: string;
    type: ConditionType;
    met: boolean;
    reason?: string;
    next_valid_window?: string;
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/events/${eventId}/conditions/evaluate`,
    {},
    { headers }
  );
  return response.data;
}

// ============================================
// EXPORT/IMPORT
// ============================================

/**
 * Export project configuration
 */
export async function exportProject(projectId: string): Promise<Blob> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/export/${projectId}`,
    { headers, responseType: 'blob' }
  );
  return response.data;
}

/**
 * Import project configuration
 */
export async function importProject(
  file: File
): Promise<{ project_id: string; imported_tables: number; imported_events: number }> {
  const headers = await getAuthHeaders();
  delete (headers as any)['Content-Type']; // Let browser set multipart boundary

  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/import`,
    formData,
    { headers }
  );
  return response.data;
}

// ============================================
// SCHEMA CLONE & VERSIONING APIs
// ============================================

/**
 * Schema Clone Configuration
 */
export interface SchemaCloneRequest {
  source_database: string;
  source_schema: string;
  target_database: string;
  target_schema: string;
  naming_strategy: 'version_suffix' | 'timestamp_suffix' | 'custom';
  include_data: boolean;
  include_constraints: boolean;
  include_policies: boolean;
  include_grants: boolean;
  warehouse?: string;
}

export interface SchemaCloneResponse {
  clone_id: string;
  status: 'pending' | 'cloning' | 'completed' | 'failed' | 'rollback';
  started_at: string;
  completed_at?: string;
  tables_cloned: number;
  tables_total: number;
  error?: string;
  ddl_statements: string[];
  rollback_ddl: string[];
}

export interface IngestionAdaptationRequest {
  version_id: string;
  table: string;
  original_config: {
    mode: string;
    source_schema: string;
    target_schema: string;
    schedule?: string;
  };
  adapted_config: {
    mode: string;
    source_schema: string;
    target_schema: string;
    schedule?: string;
    pause_during_clone?: boolean;
    resume_after_clone?: boolean;
  };
}

/**
 * Create a schema clone for versioning
 * POST /explore-design/schema-clone
 */
export async function createSchemaClone(request: SchemaCloneRequest): Promise<SchemaCloneResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.post<SchemaCloneResponse>(
    `${EXPLORE_DESIGN_BASE}/schema-clone`,
    request,
    { headers }
  );
  return response.data;
}

/**
 * Get schema clone status
 * GET /explore-design/schema-clone/{clone_id}/status
 */
export async function getSchemaCloneStatus(clone_id: string): Promise<SchemaCloneResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.get<SchemaCloneResponse>(
    `${EXPLORE_DESIGN_BASE}/schema-clone/${clone_id}/status`,
    { headers }
  );
  return response.data;
}

/**
 * Execute schema clone DDL
 * POST /explore-design/schema-clone/{clone_id}/execute
 */
export async function executeSchemaClone(clone_id: string, warehouse?: string): Promise<{
  success: boolean;
  tables_cloned: number;
  execution_time_ms: number;
  errors?: string[];
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/schema-clone/${clone_id}/execute`,
    { warehouse },
    { headers }
  );
  return response.data;
}

/**
 * Rollback schema clone (drop versioned schema)
 * POST /explore-design/schema-clone/{clone_id}/rollback
 */
export async function rollbackSchemaClone(clone_id: string): Promise<{
  success: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/schema-clone/${clone_id}/rollback`,
    {},
    { headers }
  );
  return response.data;
}

/**
 * List all schema clones
 * GET /explore-design/schema-clone/list
 */
export async function listSchemaClones(project_id?: string): Promise<SchemaCloneResponse[]> {
  const headers = await getAuthHeaders();
  const params = project_id ? { project_id } : {};
  const response = await axios.get<SchemaCloneResponse[]>(
    `${EXPLORE_DESIGN_BASE}/schema-clone/list`,
    { headers, params }
  );
  return response.data;
}

/**
 * Preview schema clone DDL without executing
 * POST /explore-design/schema-clone/preview
 */
export async function previewSchemaCloneDDL(request: Omit<SchemaCloneRequest, 'warehouse'>): Promise<{
  ddl_statements: string[];
  rollback_ddl: string[];
  estimated_tables: number;
  estimated_size_bytes?: number;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/schema-clone/preview`,
    request,
    { headers }
  );
  return response.data;
}

/**
 * Adapt ingestion configurations for versioned schema
 * POST /explore-design/ingestion/adapt
 */
export async function adaptIngestionForVersion(
  version_id: string,
  source_schema: string,
  target_schema: string
): Promise<{
  adaptations: Array<{
    table: string;
    streams_to_recreate: string[];
    tasks_to_recreate: string[];
    pipes_to_recreate: string[];
    ddl_statements: string[];
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/adapt`,
    { version_id, source_schema, target_schema },
    { headers }
  );
  return response.data;
}

/**
 * Pause ingestion during schema clone
 * POST /explore-design/ingestion/{table}/pause
 */
export async function pauseIngestionForClone(
  database: string,
  schema: string,
  table: string
): Promise<{
  success: boolean;
  paused_objects: {
    streams: string[];
    tasks: string[];
    pipes: string[];
  };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/pause`,
    { database, schema, table },
    { headers }
  );
  return response.data;
}

/**
 * Resume ingestion after schema clone
 * POST /explore-design/ingestion/{table}/resume
 */
export async function resumeIngestionAfterClone(
  database: string,
  schema: string,
  table: string,
  target_schema: string
): Promise<{
  success: boolean;
  resumed_objects: {
    streams: string[];
    tasks: string[];
    pipes: string[];
  };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/resume`,
    { database, schema, table, target_schema },
    { headers }
  );
  return response.data;
}

/**
 * Create versioned ingestion objects (streams, tasks, pipes) for new schema
 * POST /explore-design/ingestion/create-versioned
 */
export async function createVersionedIngestion(
  version_id: string,
  database: string,
  source_schema: string,
  target_schema: string,
  tables: string[]
): Promise<{
  success: boolean;
  created_objects: Array<{
    table: string;
    stream?: string;
    task?: string;
    pipe?: string;
  }>;
  ddl_executed: string[];
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/ingestion/create-versioned`,
    { version_id, database, source_schema, target_schema, tables },
    { headers }
  );
  return response.data;
}

/**
 * Compare two schema versions
 * GET /explore-design/versions/{from_version_id}/compare/{to_version_id}
 */
export async function compareSchemaVersions(
  from_version_id: string,
  to_version_id: string
): Promise<{
  from_version: string;
  to_version: string;
  diff: {
    tables_added: Array<{ table: string; columns: string[] }>;
    tables_removed: Array<{ table: string }>;
    tables_modified: Array<{
      table: string;
      columns_added: string[];
      columns_removed: string[];
      columns_modified: Array<{ column: string; from_type: string; to_type: string }>;
      ingestion_changed?: { from: string; to: string };
    }>;
    policies_added: Array<{ type: string; name: string; table?: string }>;
    policies_removed: Array<{ type: string; name: string; table?: string }>;
  };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/versions/${from_version_id}/compare/${to_version_id}`,
    { headers }
  );
  return response.data;
}

/**
 * Promote version to target environment
 * POST /explore-design/versions/{version_id}/promote
 */
export async function promoteVersion(
  version_id: string,
  target_environment: string,
  target_database?: string
): Promise<{
  success: boolean;
  deployment_id: string;
  target_schema: string;
  promoted_at: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/versions/${version_id}/promote`,
    { target_environment, target_database },
    { headers }
  );
  return response.data;
}

/**
 * Get version migration script (DDL to migrate from one version to another)
 * GET /explore-design/versions/{from_version_id}/migration/{to_version_id}
 */
export async function getVersionMigrationScript(
  from_version_id: string,
  to_version_id: string
): Promise<{
  migration_script: string[];
  rollback_script: string[];
  estimated_downtime_seconds?: number;
  requires_data_migration: boolean;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/versions/${from_version_id}/migration/${to_version_id}`,
    { headers }
  );
  return response.data;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate SQL preview for an event
 */
export function generateEventSQL(event: DesignEvent): string {
  const { event_type, target, payload } = event;
  const tableRef = `${target.database}.${target.schema}.${target.table}`;

  switch (event_type) {
    case 'TABLE_RENAMED':
      return `ALTER TABLE ${tableRef} RENAME TO ${payload.new_name};`;
    case 'COLUMN_RENAMED':
      return `ALTER TABLE ${tableRef} RENAME COLUMN ${payload.old_name} TO ${payload.new_name};`;
    case 'PRIMARY_KEY_SET':
      return `ALTER TABLE ${tableRef} ADD PRIMARY KEY (${payload.columns?.join(', ')});`;
    case 'PRIMARY_KEY_REMOVED':
      return `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`;
    case 'FOREIGN_KEY_ADDED':
      return `ALTER TABLE ${tableRef} ADD CONSTRAINT fk_${payload.columns?.[0]} FOREIGN KEY (${payload.columns?.join(', ')}) REFERENCES ${payload.referenced_table}(${payload.referenced_columns?.join(', ')});`;
    case 'INGESTION_MODE_SET':
      return `-- Configure ingestion mode: ${payload.mode}\n-- Applied to: ${tableRef}`;
    case 'MASKING_POLICY_APPLIED':
      return `ALTER TABLE ${tableRef} MODIFY COLUMN ${target.column} SET MASKING POLICY ${payload.policy_name};`;
    case 'MASKING_POLICY_REMOVED':
      return `ALTER TABLE ${tableRef} MODIFY COLUMN ${target.column} UNSET MASKING POLICY;`;
    case 'RELATION_CREATED':
      return `-- Relation: ${tableRef}.${payload.source_column} -> ${payload.target_table}.${payload.target_column} (${payload.relation_type})`;
    case 'TAG_APPLIED':
      return `ALTER TABLE ${tableRef} SET TAG ${payload.tag_name} = '${payload.tag_value}';`;
    default:
      return `-- ${event_type}: ${JSON.stringify(payload)}`;
  }
}

/**
 * Batch generate SQL for multiple events
 */
export function generateBatchSQL(events: DesignEvent[]): string {
  return events
    .filter(e => e.status === 'pending' || e.status === 'validated')
    .map(e => generateEventSQL(e))
    .join('\n\n');
}

// ============================================
// PROJECT MANAGEMENT HELPERS
// ============================================

/**
 * Ensure project exists before adding events
 * Creates the project if it doesn't exist, otherwise returns existing project_id
 */
export async function ensureProjectExists(
  projectName: string
): Promise<{ project_id: string; created: boolean }> {
  const headers = await getAuthHeaders();

  try {
    // Try to create the project - if it already exists, backend may return it
    const response = await axios.post(
      `${API_URL}/mapping/create_project`,
      { name: projectName },
      { headers }
    );

    return {
      project_id: response.data.project_id || projectName,
      created: true,
    };
  } catch (error: any) {
    // If project already exists (409 or similar), return existing
    if (error.response?.status === 409 || error.response?.data?.detail?.includes('already exists')) {
      return {
        project_id: projectName,
        created: false,
      };
    }

    // For other errors, log but continue - the project might exist
    console.warn('[ensureProjectExists] Warning:', error.response?.data?.detail || error.message);
    return {
      project_id: projectName,
      created: false,
    };
  }
}

// ============================================
// SCHEDULED DEPLOYMENT APIs (Unified with Mapping Module)
// ============================================

export type ScheduledDeploymentStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type DeploymentMethod = 'REPLACE_EXISTING' | 'NEW_RELEASE' | 'TEST';

export interface ScheduledDeploymentConfig {
  workflow_name: string;
  scheduled_date: string; // ISO datetime
  deployment_method: DeploymentMethod;
  project_id: string;
  version_id?: string;
  event_ids?: string[];
  schema_clone_config?: SchemaCloneRequest;
  rollback_on_error: boolean;
  notification_emails?: string[];
  created_by: string;
  description?: string;
}

export interface ScheduledDeployment {
  schedule_id: string;
  workflow_name: string;
  project_id: string;
  version_id?: string;
  scheduled_date: string;
  deployment_method: DeploymentMethod;
  status: ScheduledDeploymentStatus;
  created_by: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  executed_at?: string;
  completed_at?: string;
  error?: string;
  execution_log?: Array<{
    timestamp: string;
    message: string;
    level: 'info' | 'warning' | 'error';
  }>;
}

// ============================================
// UNIFIED DEPLOYMENT API (Uses /explore-design/ endpoints)
// ============================================

/**
 * Schedule a deployment using the /explore-design/deployments endpoint
 * This creates a deployment with type='scheduled' for explore-design events
 *
 * For 'with_approval' deployments, we set requires_approval=true
 *
 * Backend endpoint: POST /explore-design/deployments
 * Request body: { project_id, version, type, event_ids, config, scheduled_at }
 */
export async function scheduleDeploymentUnified(
  config: {
    workflow_name: string;
    scheduled_date: string;
    deployment_method: DeploymentMethod;
    project_id: string;
    events: DesignEvent[];
    created_by: string;
    description?: string;
    module_type: 'explore-design' | 'mapping' | 'workflow';
    requires_approval?: boolean;
  }
): Promise<{
  schedule_id: string;
  status: ScheduledDeploymentStatus;
  scheduled_date: string;
  message: string;
  workflow_name: string;
  event_id?: string;
  deployment_id?: string;
}> {
  const headers = await getAuthHeaders();

  // First, record all events to the backend using POST /explore-design/add-event
  // Backend expects: { project_id, event_type, event_details, module_type }
  const eventIds: string[] = [];
  for (const event of config.events) {
    try {
      const eventPayload = {
        project_id: config.project_id,
        event_type: event.event_type,
        event_details: {
          // Target information
          database: event.target?.database,
          schema: event.target?.schema,
          table: event.target?.table,
          column: event.target?.column,
          // Event payload (contains oldName, newName, policyName, etc.)
          ...event.payload,
          // Generated SQL for reference
          sql: generateEventSQL(event),
        },
        module_type: config.module_type || 'explore-design',
      };

      console.log('[scheduleDeploymentUnified] Recording event:', JSON.stringify(eventPayload, null, 2));

      const response = await axios.post(
        `${EXPLORE_DESIGN_BASE}/add-event`,
        eventPayload,
        { headers }
      );
      eventIds.push(response.data.event_id || response.data.project_id || event.event_id);
    } catch (e: any) {
      const errorDetail = e.response?.data?.detail || e.message;
      console.warn(`Failed to record event ${event.event_id}:`, errorDetail);
      eventIds.push(event.event_id); // Use local ID as fallback
    }
  }

  // Create the scheduled deployment
  const deploymentPayload = {
    project_id: config.project_id,
    version: config.workflow_name,
    type: 'scheduled',
    event_ids: eventIds,
    scheduled_at: config.scheduled_date,
    config: {
      immediate: false,
      scheduled_at: config.scheduled_date,
      rollback_on_error: true,
      notification_channels: ['email'],
      approvers: config.requires_approval ? ['DATA_MODELER', 'DATA_ADMIN'] : [],
      requires_approval: config.requires_approval || false,
      deployment_method: config.deployment_method,
      created_by: config.created_by,
      description: config.description || `Scheduled deployment: ${config.workflow_name}`,
      events: config.events.map(event => ({
        event_id: event.event_id,
        event_type: event.event_type,
        sql: generateEventSQL(event),
        target: event.target,
        payload: event.payload,
      })),
    },
  };

  console.log('[scheduleDeploymentUnified] Creating scheduled deployment:', JSON.stringify(deploymentPayload, null, 2));

  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/deployments`,
    deploymentPayload,
    { headers }
  );

  const deploymentId = response.data.deployment_id || response.data.id;

  return {
    schedule_id: deploymentId || `sched_${Date.now()}`,
    status: config.requires_approval ? 'PENDING_APPROVAL' : 'SCHEDULED',
    scheduled_date: config.scheduled_date,
    message: response.data.message || 'Deployment scheduled successfully',
    workflow_name: config.workflow_name,
    event_id: deploymentId,
    deployment_id: deploymentId,
  };
}

/**
 * Record design events to the backend using POST /explore-design/add-event endpoint
 * This stores events persistently in the database and auto-creates project if needed
 *
 * Backend schema:
 * {
 *   "project_id": "string",
 *   "event_type": "TABLE_RENAMED | COLUMN_RENAMED | etc.",
 *   "event_details": { ... event-specific data ... },
 *   "module_type": "explore-design" | "mapping" | "workflow"
 * }
 */
export async function recordDesignEvents(
  projectId: string,
  events: DesignEvent[],
  moduleType: 'explore-design' | 'mapping' | 'workflow' = 'explore-design'
): Promise<{
  success: boolean;
  recorded_count: number;
  event_ids: string[];
}> {
  const headers = await getAuthHeaders();
  const recordedIds: string[] = [];

  for (const event of events) {
    try {
      // Use POST /explore-design/add-event endpoint
      // Backend expects: { project_id, event_type, event_details, module_type }
      const eventPayload = {
        project_id: projectId,
        event_type: event.event_type,
        event_details: {
          // Target information
          database: event.target?.database,
          schema: event.target?.schema,
          table: event.target?.table,
          column: event.target?.column,
          // Event payload (contains oldName, newName, policyName, etc.)
          ...event.payload,
          // Generated SQL for reference
          sql: generateEventSQL(event),
        },
        module_type: moduleType,
      };

      console.log('[recordDesignEvents] 🔍 DEBUG - Sending to /explore-design/add-event:', {
        url: `${EXPLORE_DESIGN_BASE}/add-event`,
        payload: JSON.stringify(eventPayload, null, 2),
        headers: Object.keys(headers),
      });

      const response = await axios.post(
        `${EXPLORE_DESIGN_BASE}/add-event`,
        eventPayload,
        { headers }
      );

      console.log('[recordDesignEvents] ✅ SUCCESS - Response:', response.data);
      recordedIds.push(response.data?.event_id || response.data?.project_id || event.event_id);
    } catch (error: any) {
      // Enhanced error logging
      console.error('[recordDesignEvents] ❌ ERROR - Failed to record event:', {
        event_id: event.event_id,
        event_type: event.event_type,
        url: `${EXPLORE_DESIGN_BASE}/add-event`,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorMessage: error.message,
        errorDetail: error.response?.data?.detail,
        fullResponse: error.response?.data,
      });
    }
  }

  return {
    success: recordedIds.length > 0,
    recorded_count: recordedIds.length,
    event_ids: recordedIds,
  };
}

/**
 * Deploy events immediately by executing SQL through the backend
 * Uses /explore-design/deployments + /explore-design/deployments/{id}/execute endpoints
 */
export async function deployEventsImmediate(
  projectId: string,
  events: DesignEvent[],
  options?: {
    rollback_on_error?: boolean;
    created_by?: string;
  }
): Promise<{
  deployment_id: string;
  status: 'success' | 'partial' | 'failed';
  results: Array<{
    event_id: string;
    status: 'applied' | 'failed' | 'skipped';
    sql_executed?: string;
    error?: string;
    duration_ms?: number;
  }>;
  summary: {
    total: number;
    applied: number;
    failed: number;
    skipped: number;
  };
}> {
  const headers = await getAuthHeaders();

  // Step 1: Create a deployment
  const createPayload = {
    project_id: projectId,
    version: `v${Date.now()}`,
    type: 'immediate',
    event_ids: events.map(e => e.event_id),
    config: {
      rollback_on_error: options?.rollback_on_error ?? true,
      created_by: options?.created_by || 'system',
      events: events.map(event => ({
        event_id: event.event_id,
        event_type: event.event_type,
        sql: generateEventSQL(event),
        target: event.target,
        payload: event.payload,
      })),
    },
  };

  console.log('[deployEventsImmediate] Creating deployment:', JSON.stringify(createPayload, null, 2));

  try {
    // Create the deployment
    const createResponse = await axios.post(
      `${API_URL}/explore-design/deployments`,
      createPayload,
      { headers }
    );

    const deploymentId = createResponse.data.deployment_id || createResponse.data.id;
    console.log('[deployEventsImmediate] Deployment created:', deploymentId);

    // Step 2: Execute the deployment
    const executeResponse = await axios.post(
      `${API_URL}/explore-design/deployments/${deploymentId}/execute`,
      { rollback_on_error: options?.rollback_on_error ?? true },
      { headers }
    );

    console.log('[deployEventsImmediate] Deployment executed:', executeResponse.data);

    return {
      deployment_id: deploymentId,
      status: executeResponse.data.status || 'success',
      results: executeResponse.data.results || events.map(e => ({
        event_id: e.event_id,
        status: 'applied' as const,
        sql_executed: generateEventSQL(e),
      })),
      summary: executeResponse.data.summary || {
        total: events.length,
        applied: events.length,
        failed: 0,
        skipped: 0,
      },
    };
  } catch (error: any) {
    // Handle deployment errors gracefully
    console.error('Deployment error:', error);
    const errorDetail = error.response?.data?.detail || error.response?.data || error.message;
    throw new Error(typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail));
  }
}

/**
 * Validate events before deployment
 *
 * Note: /mapping/test_mapping/ expects column mapping payloads (source_columns, target_columns, etc.)
 * For explore-design events, we do local validation + record events to backend
 *
 * This function validates events locally and optionally records them to the backend
 */
export async function validateEventsBackend(
  projectId: string,
  events: DesignEvent[]
): Promise<{
  results: Array<{
    event_id: string;
    valid: boolean;
    sql: string;
    error?: string;
    warnings?: string[];
  }>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
}> {
  const results: Array<{
    event_id: string;
    valid: boolean;
    sql: string;
    error?: string;
    warnings?: string[];
  }> = [];

  let validCount = 0;
  let invalidCount = 0;
  let warningCount = 0;

  // Perform local validation for each event
  for (const event of events) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation rules
    if (!event.target?.database || !event.target?.schema || !event.target?.table) {
      errors.push('Invalid target: missing database, schema, or table');
    }

    // Event type specific validation
    switch (event.event_type) {
      case 'TABLE_RENAMED':
        if (!event.payload?.newName) {
          errors.push('New table name is required');
        } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) {
          errors.push('Invalid table name format');
        }
        break;

      case 'COLUMN_RENAMED':
        if (!event.payload?.newName) {
          errors.push('New column name is required');
        }
        break;

      case 'PRIMARY_KEY_SET':
        if (!event.payload?.columns || event.payload.columns.length === 0) {
          errors.push('At least one column required for primary key');
        }
        break;

      case 'MASKING_POLICY_APPLIED':
        if (!event.payload?.policyName) {
          errors.push('Policy name is required');
        }
        break;

      case 'RELATION_CREATED':
      case 'FOREIGN_KEY_ADDED':
        if (!event.payload?.targetTable || !event.payload?.targetColumn) {
          errors.push('Target table and column are required');
        }
        break;
    }

    const isValid = errors.length === 0;
    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
    }
    if (warnings.length > 0) {
      warningCount++;
    }

    results.push({
      event_id: event.event_id,
      valid: isValid,
      sql: generateEventSQL(event),
      error: errors.length > 0 ? errors.join('; ') : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  }

  // Optionally record validated events to backend
  if (validCount > 0) {
    try {
      await recordDesignEvents(projectId, events.filter((_, i) => results[i].valid), 'explore-design');
    } catch (e) {
      console.warn('Failed to record events to backend:', e);
    }
  }

  return {
    results,
    summary: {
      total: events.length,
      valid: validCount,
      invalid: invalidCount,
      warnings: warningCount,
    },
  };
}

/**
 * Get all scheduled deployments from backend
 * Uses /mapping/get_scheduled_deployments/ endpoint
 */
export async function getScheduledDeploymentsFromBackend(): Promise<{
  deployments: Array<{
    workflow_name: string;
    project_id: string;
    scheduled_date: string;
    deployment_method: string;
    status: string;
    created_by: string;
    created_at: string;
    module_type?: string;
    mappings?: any[];
  }>;
}> {
  const headers = await getAuthHeaders();

  try {
    const response = await axios.get(
      `${API_URL}/mapping/get_scheduled_deployments/`,
      { headers }
    );

    return {
      deployments: response.data.deployments || [],
    };
  } catch (error: any) {
    console.error('Failed to get scheduled deployments:', error);
    return { deployments: [] };
  }
}

/**
 * Approve a scheduled deployment
 * Uses /mapping/approve_deployment/ endpoint
 */
export async function approveScheduledDeploymentBackend(
  workflowName: string
): Promise<{ status: string; message: string }> {
  const headers = await getAuthHeaders();

  const response = await axios.post(
    `${API_URL}/mapping/approve_deployment/`,
    { workflow_name: workflowName },
    { headers }
  );

  return response.data;
}

/**
 * Activate (execute) an approved deployment
 * Uses /mapping/activate_deployment/ endpoint
 */
export async function activateDeploymentBackend(
  workflowName: string
): Promise<{ status: string; message: string }> {
  const headers = await getAuthHeaders();

  const response = await axios.post(
    `${API_URL}/mapping/activate_deployment/`,
    { workflow_name: workflowName },
    { headers }
  );

  return response.data;
}

/**
 * Schedule a deployment for a future date
 * POST /explore-design/schedule-deployment (fallback to /mapping/schedule_deployment/)
 */
export async function scheduleDeployment(
  config: ScheduledDeploymentConfig
): Promise<{
  schedule_id: string;
  status: ScheduledDeploymentStatus;
  scheduled_date: string;
  requires_approval: boolean;
  approval_request_id?: string;
}> {
  const headers = await getAuthHeaders();

  // Try /mapping/schedule_deployment/ first (which exists on the backend)
  try {
    const response = await axios.post(
      `${API_URL}/mapping/schedule_deployment/`,
      {
        ...config,
        module_type: 'explore-design',
        status: 'PENDING_APPROVAL',
      },
      { headers }
    );
    return {
      schedule_id: response.data.schedule_id || `sched_${Date.now()}`,
      status: 'PENDING_APPROVAL',
      scheduled_date: config.scheduled_date,
      requires_approval: true,
      ...response.data,
    };
  } catch (mappingError: any) {
    // Fall back to explore-design endpoint
    console.warn('Falling back to explore-design endpoint:', mappingError.message);
    try {
      const response = await axios.post(
        `${EXPLORE_DESIGN_BASE}/schedule-deployment`,
        config,
        { headers }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.detail ||
        mappingError.response?.data?.detail ||
        'Failed to schedule deployment. Please ensure the backend endpoint is configured.'
      );
    }
  }
}

/**
 * Get all scheduled deployments for a project
 * Uses /mapping/get_scheduled_deployments/ which is the working backend endpoint
 * Filters for explore-design module deployments
 */
export async function getScheduledDeployments(
  projectId?: string,
  filters?: {
    status?: ScheduledDeploymentStatus;
    from_date?: string;
    to_date?: string;
  }
): Promise<{
  scheduled_deployments: ScheduledDeployment[];
  total: number;
}> {
  const headers = await getAuthHeaders();

  try {
    // Use the working /mapping/get_scheduled_deployments/ endpoint
    const response = await axios.get(
      `${API_URL}/mapping/get_scheduled_deployments/`,
      { headers }
    );

    // Filter deployments for explore-design module if needed
    let deployments = response.data?.deployments || [];

    // Apply filters
    if (projectId) {
      deployments = deployments.filter((d: any) => d.project_id === projectId);
    }
    if (filters?.status) {
      deployments = deployments.filter((d: any) => d.status === filters.status);
    }

    // Map to ScheduledDeployment format
    const scheduled_deployments: ScheduledDeployment[] = deployments.map((d: any) => ({
      schedule_id: d.event_id || d.deployment_id || `sched_${Date.now()}`,
      workflow_name: d.workflow_name,
      project_id: d.project_id,
      version_id: d.version_id,
      scheduled_date: d.scheduled_date,
      deployment_method: d.deployment_method,
      status: d.status,
      created_by: d.created_by,
      created_at: d.created_at,
      approved_by: d.approved_by,
      approved_at: d.approved_at,
      executed_at: d.executed_at,
      completed_at: d.completed_at,
      error: d.error,
    }));

    return {
      scheduled_deployments,
      total: scheduled_deployments.length,
    };
  } catch (error: any) {
    console.warn('Failed to get scheduled deployments:', error.message);
    return { scheduled_deployments: [], total: 0 };
  }
}

/**
 * Get details of a specific scheduled deployment
 * GET /explore-design/scheduled-deployments/{schedule_id}
 */
export async function getScheduledDeploymentDetails(
  scheduleId: string
): Promise<ScheduledDeployment & {
  deployment_config: ScheduledDeploymentConfig;
  events_preview?: DesignEvent[];
  approval_history?: Array<{
    user_id: string;
    action: 'approved' | 'rejected';
    comment?: string;
    timestamp: string;
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}`,
    { headers }
  );
  return response.data;
}

/**
 * Approve a scheduled deployment
 * POST /explore-design/scheduled-deployments/{schedule_id}/approve
 */
export async function approveScheduledDeployment(
  scheduleId: string,
  comment?: string
): Promise<{
  success: boolean;
  status: ScheduledDeploymentStatus;
  approved_at: string;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}/approve`,
    { comment },
    { headers }
  );
  return response.data;
}

/**
 * Reject a scheduled deployment
 * POST /explore-design/scheduled-deployments/{schedule_id}/reject
 */
export async function rejectScheduledDeployment(
  scheduleId: string,
  reason: string
): Promise<{
  success: boolean;
  status: ScheduledDeploymentStatus;
  rejected_at: string;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}/reject`,
    { reason },
    { headers }
  );
  return response.data;
}

/**
 * Cancel a scheduled deployment
 * POST /explore-design/scheduled-deployments/{schedule_id}/cancel
 */
export async function cancelScheduledDeployment(
  scheduleId: string,
  reason?: string
): Promise<{
  success: boolean;
  status: ScheduledDeploymentStatus;
  cancelled_at: string;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}/cancel`,
    { reason },
    { headers }
  );
  return response.data;
}

/**
 * Reschedule a deployment to a new date
 * POST /explore-design/scheduled-deployments/{schedule_id}/reschedule
 */
export async function rescheduleDeployment(
  scheduleId: string,
  newScheduledDate: string,
  reason?: string
): Promise<{
  success: boolean;
  new_scheduled_date: string;
  requires_reapproval: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}/reschedule`,
    {
      scheduled_date: newScheduledDate,
      reason,
    },
    { headers }
  );
  return response.data;
}

/**
 * Execute a scheduled deployment immediately (admin override)
 * POST /explore-design/scheduled-deployments/{schedule_id}/execute-now
 */
export async function executeScheduledDeploymentNow(
  scheduleId: string,
  reason?: string
): Promise<{
  success: boolean;
  deployment_id: string;
  status: ScheduledDeploymentStatus;
  started_at: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}/execute-now`,
    { reason },
    { headers }
  );
  return response.data;
}

/**
 * Get execution log for a scheduled deployment
 * GET /explore-design/scheduled-deployments/{schedule_id}/logs
 */
export async function getScheduledDeploymentLogs(
  scheduleId: string
): Promise<{
  schedule_id: string;
  logs: Array<{
    timestamp: string;
    message: string;
    level: 'info' | 'warning' | 'error';
    event_id?: string;
    sql_executed?: string;
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/scheduled-deployments/${scheduleId}/logs`,
    { headers }
  );
  return response.data;
}

// ============================================
// WORKFLOW & DAG APIs
// ============================================

export type WorkflowStatus = 'draft' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export type TaskType =
  | 'CREATE_SCHEMA'
  | 'CLONE_TABLE'
  | 'CREATE_STREAM'
  | 'CREATE_TASK'
  | 'CREATE_PIPE'
  | 'ALTER_TABLE'
  | 'APPLY_POLICY'
  | 'CREATE_VIEW'
  | 'VALIDATE'
  | 'ROLLBACK';

export interface WorkflowTask {
  task_id: string;
  type: TaskType;
  name: string;
  config: Record<string, any>;
  dependencies: string[];
  status: TaskStatus;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  progress_percent?: number;
  error_message?: string;
  retry_count?: number;
  position?: { x: number; y: number };
}

export interface Workflow {
  workflow_id: string;
  name: string;
  description?: string;
  project_id: string;
  status: WorkflowStatus;
  tasks: WorkflowTask[];
  on_failure: 'ROLLBACK_ALL' | 'STOP' | 'CONTINUE';
  notification_channels: string[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface WorkflowDAG {
  workflow_id: string;
  name: string;
  status: WorkflowStatus;
  progress: {
    total_tasks: number;
    completed: number;
    running: number;
    pending: number;
    failed: number;
  };
  nodes: Array<WorkflowTask & { position: { x: number; y: number } }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'dependency';
  }>;
}

/**
 * Create a new workflow
 * POST /explore-design/workflows
 */
export async function createWorkflow(
  projectId: string,
  name: string,
  tasks: Array<Omit<WorkflowTask, 'task_id' | 'status'>>,
  options?: {
    description?: string;
    on_failure?: 'ROLLBACK_ALL' | 'STOP' | 'CONTINUE';
    notification_channels?: string[];
  }
): Promise<{ workflow_id: string; status: WorkflowStatus }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/workflows`,
    {
      project_id: projectId,
      name,
      tasks,
      ...options,
    },
    { headers }
  );
  return response.data;
}

/**
 * Get workflow DAG
 * GET /explore-design/workflows/{workflow_id}/dag
 */
export async function getWorkflowDAG(workflowId: string): Promise<WorkflowDAG> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/workflows/${workflowId}/dag`,
    { headers }
  );
  return response.data;
}

/**
 * Execute workflow
 * POST /explore-design/workflows/{workflow_id}/execute
 */
export async function executeWorkflow(
  workflowId: string,
  options?: {
    execution_mode?: 'sequential' | 'parallel';
    max_parallel_tasks?: number;
    timeout_minutes?: number;
  }
): Promise<{
  workflow_id: string;
  status: WorkflowStatus;
  execution_started: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/workflows/${workflowId}/execute`,
    options || {},
    { headers }
  );
  return response.data;
}

/**
 * Get task logs
 * GET /explore-design/workflows/{workflow_id}/tasks/{task_id}/logs
 */
export async function getTaskLogs(
  workflowId: string,
  taskId: string
): Promise<{
  task_id: string;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    sql_executed?: string;
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/workflows/${workflowId}/tasks/${taskId}/logs`,
    { headers }
  );
  return response.data;
}

/**
 * Cancel workflow
 * POST /explore-design/workflows/{workflow_id}/cancel
 */
export async function cancelWorkflow(
  workflowId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/workflows/${workflowId}/cancel`,
    { reason },
    { headers }
  );
  return response.data;
}

/**
 * Retry failed task
 * POST /explore-design/workflows/{workflow_id}/tasks/{task_id}/retry
 */
export async function retryTask(
  workflowId: string,
  taskId: string
): Promise<{ success: boolean; new_status: TaskStatus }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/workflows/${workflowId}/tasks/${taskId}/retry`,
    {},
    { headers }
  );
  return response.data;
}

// ============================================
// POLICY APIs
// ============================================

export type PolicyType = 'masking' | 'rls' | 'aggregation' | 'tag';
export type MaskType =
  | 'FULL_MASK'
  | 'EMAIL_MASK'
  | 'SSN_MASK'
  | 'PHONE_MASK'
  | 'CREDIT_CARD_MASK'
  | 'PARTIAL_MASK'
  | 'NULL_MASK'
  | 'HASH_MASK'
  | 'DATE_YEAR_MASK'
  | 'CUSTOM';

export interface MaskingPolicy {
  name: string;
  description?: string;
  mask_type: MaskType;
  column_data_types: string[];
  conditions?: Array<{
    when: string;
    then: 'MASKED_VALUE' | 'ORIGINAL_VALUE';
    mask_type?: MaskType;
  }>;
  default_action: 'MASKED_VALUE' | 'ORIGINAL_VALUE' | 'NULL';
  exemptions?: {
    roles?: string[];
    users?: string[];
  };
}

export interface RLSPolicy {
  name: string;
  description?: string;
  target_table: string;
  filter_column: string;
  conditions: Array<{
    role: string;
    expression: string;
  }>;
  default_expression: string;
  audit_queries?: boolean;
}

/**
 * Get available policies
 * GET /explore-design/policies
 */
export async function getPolicies(filters?: {
  type?: PolicyType;
  database?: string;
  schema?: string;
}): Promise<{
  policies: {
    masking: Array<{ name: string; description: string; applied_to: number; data_types: string[] }>;
    rls: Array<{ name: string; description: string; applied_to: number }>;
    aggregation: Array<{ name: string; description: string; applied_to: number }>;
    tags: Array<{ name: string; columns_tagged: number }>;
  };
}> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (filters?.type) params.append('type', filters.type);
  if (filters?.database) params.append('database', filters.database);
  if (filters?.schema) params.append('schema', filters.schema);

  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/policies?${params.toString()}`,
    { headers }
  );
  return response.data;
}

/**
 * Apply masking policy to column
 * POST /explore-design/policies/masking/apply
 */
export async function applyMaskingPolicy(
  projectId: string,
  policyName: string,
  target: {
    database: string;
    schema: string;
    table: string;
    column: string;
  },
  createEvent?: boolean
): Promise<{ success: boolean; event_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/masking/apply`,
    {
      project_id: projectId,
      policy_name: policyName,
      target,
      create_event: createEvent ?? true,
    },
    { headers }
  );
  return response.data;
}

/**
 * Remove masking policy from column
 * POST /explore-design/policies/masking/remove
 */
export async function removeMaskingPolicy(
  projectId: string,
  target: {
    database: string;
    schema: string;
    table: string;
    column: string;
  },
  createEvent?: boolean
): Promise<{ success: boolean; event_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/masking/remove`,
    {
      project_id: projectId,
      target,
      create_event: createEvent ?? true,
    },
    { headers }
  );
  return response.data;
}

/**
 * Apply RLS policy to table
 * POST /explore-design/policies/rls/apply
 */
export async function applyRLSPolicy(
  projectId: string,
  policyName: string,
  target: {
    database: string;
    schema: string;
    table: string;
  },
  filterColumn: string,
  createEvent?: boolean
): Promise<{ success: boolean; event_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/rls/apply`,
    {
      project_id: projectId,
      policy_name: policyName,
      target,
      filter_column: filterColumn,
      create_event: createEvent ?? true,
    },
    { headers }
  );
  return response.data;
}

/**
 * Detect sensitive columns
 * POST /explore-design/policies/detect-sensitive
 */
export async function detectSensitiveColumnsInTables(
  tables: Array<{ database: string; schema: string; table: string }>,
  options?: {
    patterns?: string[];
    sample_data?: boolean;
    sample_size?: number;
  }
): Promise<{
  detections: SensitiveColumnDetection[];
  summary: {
    tables_scanned: number;
    columns_scanned: number;
    sensitive_found: number;
  };
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/detect-sensitive`,
    {
      tables,
      patterns: options?.patterns ?? ['email', 'ssn', 'phone', 'address', 'credit_card', 'dob'],
      sample_data: options?.sample_data ?? true,
      sample_size: options?.sample_size ?? 100,
    },
    { headers }
  );
  return response.data;
}

/**
 * Bulk apply tags
 * POST /explore-design/policies/tags/bulk-apply
 */
export async function bulkApplyTags(
  projectId: string,
  applications: Array<{
    database: string;
    schema: string;
    table: string;
    column: string;
    tags: string[];
  }>,
  createEvents?: boolean
): Promise<{
  success: boolean;
  applied_count: number;
  event_ids?: string[];
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/tags/bulk-apply`,
    {
      project_id: projectId,
      applications,
      create_events: createEvents ?? true,
    },
    { headers }
  );
  return response.data;
}

/**
 * Create masking policy
 * POST /explore-design/policies/masking/create
 */
export async function createMaskingPolicy(policy: MaskingPolicy): Promise<{
  success: boolean;
  policy_name: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/masking/create`,
    policy,
    { headers }
  );
  return response.data;
}

/**
 * Create RLS policy
 * POST /explore-design/policies/rls/create
 */
export async function createRLSPolicy(policy: RLSPolicy): Promise<{
  success: boolean;
  policy_name: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/policies/rls/create`,
    policy,
    { headers }
  );
  return response.data;
}

// ============================================
// ERD & DATA MODELING APIs
// ============================================

export interface ERDTable {
  id: string;
  name: string;
  database: string;
  schema: string;
  position: { x: number; y: number };
  columns: Array<{
    name: string;
    data_type: string;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    is_nullable: boolean;
    masking_policy?: string;
    tags?: string[];
    description?: string;
  }>;
  row_count?: number;
  size_bytes?: number;
}

export interface ERDRelationship {
  id: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  constraint_name?: string;
  on_delete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  on_update?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface ERDLayout {
  project_id: string;
  canvas: {
    width: number;
    height: number;
    zoom: number;
    offset: { x: number; y: number };
  };
  tables: ERDTable[];
  relationships: ERDRelationship[];
}

/**
 * Get ERD layout
 * GET /explore-design/projects/{project_id}/erd
 */
export async function getERDLayout(projectId: string): Promise<ERDLayout> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/projects/${projectId}/erd`,
    { headers }
  );
  return response.data;
}

/**
 * Save ERD layout
 * PUT /explore-design/projects/{project_id}/erd
 */
export async function saveERDLayout(
  projectId: string,
  layout: {
    tables?: Array<{ id: string; position: { x: number; y: number } }>;
    canvas?: {
      zoom?: number;
      offset?: { x: number; y: number };
    };
  }
): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders();
  const response = await axios.put(
    `${EXPLORE_DESIGN_BASE}/projects/${projectId}/erd`,
    layout,
    { headers }
  );
  return response.data;
}

/**
 * Auto-layout ERD
 * POST /explore-design/projects/{project_id}/erd/auto-layout
 */
export async function autoLayoutERD(
  projectId: string,
  options?: {
    algorithm?: 'dagre' | 'elk' | 'force';
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    node_spacing?: number;
    rank_spacing?: number;
  }
): Promise<{
  tables: Array<{ id: string; position: { x: number; y: number } }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/projects/${projectId}/erd/auto-layout`,
    {
      algorithm: options?.algorithm ?? 'dagre',
      direction: options?.direction ?? 'TB',
      node_spacing: options?.node_spacing ?? 100,
      rank_spacing: options?.rank_spacing ?? 150,
    },
    { headers }
  );
  return response.data;
}

/**
 * Create relationship
 * POST /explore-design/projects/{project_id}/relationships
 */
export async function createRelationship(
  projectId: string,
  relationship: {
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
    cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
    constraint_name?: string;
    on_delete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    on_update?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  },
  createEvent?: boolean
): Promise<{
  relationship_id: string;
  event_id?: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/projects/${projectId}/relationships`,
    {
      ...relationship,
      create_event: createEvent ?? true,
    },
    { headers }
  );
  return response.data;
}

/**
 * Delete relationship
 * DELETE /explore-design/projects/{project_id}/relationships/{relationship_id}
 */
export async function deleteRelationship(
  projectId: string,
  relationshipId: string,
  createEvent?: boolean
): Promise<{ success: boolean; event_id?: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.delete(
    `${EXPLORE_DESIGN_BASE}/projects/${projectId}/relationships/${relationshipId}`,
    {
      headers,
      data: { create_event: createEvent ?? true },
    }
  );
  return response.data;
}

// ============================================
// LINEAGE & IMPACT APIs
// ============================================

export interface LineageNode {
  database: string;
  schema: string;
  table: string;
  column?: string;
  transformation?: string;
}

/**
 * Get column lineage
 * GET /explore-design/lineage/column
 */
export async function getColumnLineage(
  target: {
    database: string;
    schema: string;
    table: string;
    column: string;
  },
  options?: {
    direction?: 'upstream' | 'downstream' | 'both';
    depth?: number;
  }
): Promise<{
  target: LineageNode;
  upstream: LineageNode[];
  downstream: LineageNode[];
}> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  params.append('database', target.database);
  params.append('schema', target.schema);
  params.append('table', target.table);
  params.append('column', target.column);
  if (options?.direction) params.append('direction', options.direction);
  if (options?.depth) params.append('depth', String(options.depth));

  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/lineage/column?${params.toString()}`,
    { headers }
  );
  return response.data;
}

/**
 * Get impact analysis
 * POST /explore-design/impact-analysis
 */
export async function getImpactAnalysis(
  changes: Array<{
    type: 'COLUMN_TYPE_CHANGE' | 'COLUMN_REMOVED' | 'COLUMN_RENAMED' | 'TABLE_REMOVED' | 'TABLE_RENAMED';
    database: string;
    schema: string;
    table: string;
    column?: string;
    from_type?: string;
    to_type?: string;
    new_name?: string;
  }>
): Promise<{
  impact_summary: {
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    total_affected_objects: number;
  };
  affected_objects: Array<{
    type: 'VIEW' | 'TABLE' | 'REPORT' | 'DASHBOARD' | 'TASK' | 'PIPE';
    database?: string;
    schema?: string;
    name: string;
    risk_level: 'high' | 'medium' | 'low';
    reason: string;
    recommendation: string;
  }>;
  breaking_changes: Array<{
    change: string;
    affected_count: number;
    objects: string[];
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/impact-analysis`,
    { changes },
    { headers }
  );
  return response.data;
}


// ============= PRIMARY KEY SERVICES =============

export interface AddPrimaryKeyRequest {
  project_id: string;
  database: string;
  schema: string;
  table: string;
  columns: string[];
}

/**
 * Add a primary key (simple or composite) to a table
 * @param data - Request payload with database, schema, table, and columns
 * @returns Response from the backend API
 */
export async function addPrimaryKey(data: AddPrimaryKeyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  const url = `${EXPLORE_DESIGN_BASE}/primary-key/add`;

  const payload = {
    project_id: data.project_id,
    database: data.database,
    schema: data.schema,
    table: data.table,
    columns: data.columns,
  };

  console.log('🔑 ADD Primary Key API Call:', {
    url,
    payload,
  });

  try {
    const response = await axios.post(url, payload, { headers });

    console.log('✅ ADD Primary Key Response:', {
      status: response.status,
      data: response.data,
    });

    return response.data.data || response.data;
  } catch (error: any) {
    console.error('❌ ADD Primary Key Error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: payload,
      fullError: error.response?.data,
    });
    throw error;
  }
}

// ============= TABLE SCHEMA MANAGEMENT SERVICES =============

export type ConstraintType =
  | 'RENAME_TAB'
  | 'RENAME_COL'
  | 'ADD_COLUMN'
  | 'DROP_COLUMN'
  | 'CHANGE_TYPE'
  | 'ADD_PK'
  | 'DROP_PK'
  | 'ADD_FK'
  | 'DROP_FK'
  | 'ADD_UNIQUE'
  | 'DROP_UNIQUE'
  | 'SET_DEFAULT'
  | 'SET_NULL'
  | 'SET_NOT_NULL'
  | 'SWAP'
  | 'ADD_CHECK_CONSTRAINT'
  | 'DROP_CHECK_CONSTRAINT'
  | 'COMMENT_ON_COLUMN'
  | 'AUTO_INCREMENT';

export interface ManageTableRequest {
  SOURCE_TABLE: string; // Format: DATABASE.SCHEMA.TABLE
  CONSTRAINT_TYPE: ConstraintType;
  COLUMN_NAME?: string;
  COLUMN_TYPE?: string;
  NEW_NAME?: string;
  TABLE_REF?: string;
  COLUMN_REF?: string;
  DEFAULT_VALUE?: string;
  TARGET_TABLE?: string;
  COLUMN_COMMENT?: string;
}

/**
 * Manage table schema - rename tables/columns, add/drop constraints, etc.
 * Uses POST /mapping/manage_table endpoint
 */
export async function manageTable(request: ManageTableRequest): Promise<any> {
  const headers = await getAuthHeaders();
  const url = `${API_URL}/mapping/manage_table`;

  // Build query params
  const params = new URLSearchParams();
  params.append('SOURCE_TABLE', request.SOURCE_TABLE);
  params.append('CONSTRAINT_TYPE', request.CONSTRAINT_TYPE);

  if (request.COLUMN_NAME) params.append('COLUMN_NAME', request.COLUMN_NAME);
  if (request.COLUMN_TYPE) params.append('COLUMN_TYPE', request.COLUMN_TYPE);
  if (request.NEW_NAME) params.append('NEW_NAME', request.NEW_NAME);
  if (request.TABLE_REF) params.append('TABLE_REF', request.TABLE_REF);
  if (request.COLUMN_REF) params.append('COLUMN_REF', request.COLUMN_REF);
  if (request.DEFAULT_VALUE) params.append('DEFAULT_VALUE', request.DEFAULT_VALUE);
  if (request.TARGET_TABLE) params.append('TARGET_TABLE', request.TARGET_TABLE);
  if (request.COLUMN_COMMENT) params.append('COLUMN_COMMENT', request.COLUMN_COMMENT);

  console.log('🔧 Manage Table API Call:', {
    url: `${url}?${params.toString()}`,
    request,
  });

  try {
    const response = await axios.post(`${url}?${params.toString()}`, null, { headers });

    console.log('✅ Manage Table Response:', {
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error: any) {
    console.error('❌ Manage Table Error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      request,
      fullError: error.response?.data,
    });
    throw error;
  }
}

/**
 * Rename a table
 */
export async function renameTable(
  database: string,
  schema: string,
  tableName: string,
  newName: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'RENAME_TAB',
    NEW_NAME: newName,
  });
}

/**
 * Rename a column
 */
export async function renameColumn(
  database: string,
  schema: string,
  tableName: string,
  columnName: string,
  newName: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'RENAME_COL',
    COLUMN_NAME: columnName,
    NEW_NAME: newName,
  });
}

/**
 * Add a column to a table
 */
export async function addColumn(
  database: string,
  schema: string,
  tableName: string,
  columnName: string,
  columnType: string,
  defaultValue?: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'ADD_COLUMN',
    COLUMN_NAME: columnName,
    COLUMN_TYPE: columnType,
    DEFAULT_VALUE: defaultValue,
  });
}

/**
 * Drop a column from a table
 */
export async function dropColumn(
  database: string,
  schema: string,
  tableName: string,
  columnName: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'DROP_COLUMN',
    COLUMN_NAME: columnName,
  });
}

/**
 * Change column type
 */
export async function changeColumnType(
  database: string,
  schema: string,
  tableName: string,
  columnName: string,
  newType: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'CHANGE_TYPE',
    COLUMN_NAME: columnName,
    COLUMN_TYPE: newType,
  });
}

/**
 * Add foreign key constraint
 */
export async function addForeignKey(
  database: string,
  schema: string,
  tableName: string,
  columnName: string,
  refTable: string,
  refColumn: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'ADD_FK',
    COLUMN_NAME: columnName,
    TABLE_REF: refTable,
    COLUMN_REF: refColumn,
  });
}

/**
 * Add comment to a column
 */
export async function addColumnComment(
  database: string,
  schema: string,
  tableName: string,
  columnName: string,
  comment: string
): Promise<any> {
  return manageTable({
    SOURCE_TABLE: `${database}.${schema}.${tableName}`,
    CONSTRAINT_TYPE: 'COMMENT_ON_COLUMN',
    COLUMN_NAME: columnName,
    COLUMN_COMMENT: comment,
  });
}

// ============= EVENT EXECUTION SERVICE =============

// Local event format (from frontend event store)
export interface LocalDesignEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  status: 'pending' | 'validated' | 'failed' | 'applied';
  projectId?: string;
  target: {
    database: string;
    schema: string;
    table: string;
    column?: string;
  };
  payload: Record<string, any>;
  backendId?: string;
  synced?: boolean;
  userId?: string;
  error?: string;
}

/**
 * Execute a single event action based on event type
 * This is called during validation/deployment to actually apply the changes
 */
export async function executeEventAction(event: LocalDesignEvent, projectId?: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const { type, target, payload } = event;
  const { database, schema, table, column } = target;

  console.log('🚀 Executing event action:', { type, target, payload });

  try {
    switch (type) {
      case 'TABLE_RENAMED':
        await renameTable(database, schema, table, payload.newName);
        return { success: true, message: `Table renamed to ${payload.newName}` };

      case 'COLUMN_RENAMED':
        await renameColumn(database, schema, table, payload.oldName || column!, payload.newName);
        return { success: true, message: `Column renamed to ${payload.newName}` };

      case 'COLUMN_TYPE_CHANGED':
        await changeColumnType(database, schema, table, column!, payload.newType);
        return { success: true, message: `Column type changed to ${payload.newType}` };

      case 'ADD_COLUMN':
        await addColumn(database, schema, table, payload.columnName, payload.columnType, payload.defaultValue);
        return { success: true, message: `Column ${payload.columnName} added` };

      case 'REMOVE_COLUMN':
        await dropColumn(database, schema, table, payload.columnName || column!);
        return { success: true, message: `Column ${payload.columnName || column} dropped` };

      case 'PRIMARY_KEY_SET':
        await addPrimaryKey({
          project_id: event.projectId || projectId || '',
          database,
          schema,
          table,
          columns: payload.columns || [column!],
        });
        return { success: true, message: `Primary key set on ${payload.columns?.join(', ')}` };

      case 'FOREIGN_KEY_ADDED':
        await addForeignKey(
          database,
          schema,
          table,
          payload.columnName || column!,
          payload.refTable,
          payload.refColumn
        );
        return { success: true, message: `Foreign key added` };

      // Events that don't require direct SQL execution (handled by other services)
      case 'MASKING_POLICY_APPLIED':
      case 'MASKING_POLICY_REMOVED':
      case 'RLS_POLICY_APPLIED':
      case 'RLS_POLICY_REMOVED':
      case 'AGGREGATION_POLICY_APPLIED':
      case 'AGGREGATION_POLICY_REMOVED':
      case 'TAG_APPLIED':
      case 'TAG_REMOVED':
      case 'INGESTION_MODE_SET':
      case 'SCD_CONFIGURED':
        return { success: true, message: `${type} - handled by policy service` };

      // Metadata-only events (no SQL execution needed)
      case 'TABLE_SELECTED':
      case 'TABLE_EXCLUDED':
      case 'TABLE_INCLUDED':
      case 'COLUMN_EXCLUDED':
      case 'COLUMN_INCLUDED':
      case 'RELATION_CREATED':
      case 'RELATION_REMOVED':
      case 'BATCH_OPERATION':
        return { success: true, message: `${type} - metadata only` };

      default:
        console.warn(`Unknown event type: ${type}`);
        return { success: true, message: `Unknown event type: ${type}` };
    }
  } catch (error: any) {
    console.error(`❌ Failed to execute ${type}:`, error);
    return {
      success: false,
      message: `Failed to execute ${type}`,
      error: error.response?.data?.detail || error.message,
    };
  }
}

/**
 * Execute all pending events for a project
 * Returns summary of executed/failed events
 */
export async function executePendingEvents(
  projectId: string,
  events: LocalDesignEvent[]
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{
    eventId: string;
    type: string;
    success: boolean;
    message: string;
    error?: string;
  }>;
}> {
  const results: Array<{
    eventId: string;
    type: string;
    success: boolean;
    message: string;
    error?: string;
  }> = [];

  let successCount = 0;
  let failedCount = 0;

  for (const event of events) {
    const result = await executeEventAction(event, projectId);
    results.push({
      eventId: event.id || event.backendId || 'unknown',
      type: event.type,
      ...result,
    });

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    total: events.length,
    success: successCount,
    failed: failedCount,
    results,
  };
}

// ============================================
// TABLE RELATIONSHIPS APIs
// ============================================

export interface ColumnMapping {
  source_column: string;
  target_column: string;
}

export interface TableRelationship {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_column: string;
  parent_schema: string;
  parent_table: string;
  parent_column: string;
}

export interface FetchRelationshipsResponse {
  database: string;
  schema: string;
  relationships: TableRelationship[];
}

/**
 * Fetch table relationships (foreign keys) for a Snowflake schema
 *
 * @param database - Database name (e.g., 'DATA360')
 * @param schema - Schema name (e.g., 'RETAIL_DWH')
 * @returns Promise with relationships data
 */
export async function fetchRelationships(
  database: string,
  schema: string
): Promise<FetchRelationshipsResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/fetch_relationships`,
    { database, schema },
    { headers }
  );
  return response.data;
}
