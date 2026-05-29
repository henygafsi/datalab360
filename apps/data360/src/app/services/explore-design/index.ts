/** Explore & Design API: metadata, events, deployments. Data journey: UI → service → /explore-design/guided/*. */
// ////dependency//// service → lib.auth, lib.api-contracts, config.database.config, axios
import axios from 'axios';
import { getAuthHeaders } from '@/lib/auth';
import { API_CONTRACTS } from '@/lib/api-contracts';
import { API_CONFIG } from '@/config/database.config';

const API_URL = API_CONFIG.BASE_URL;
const EXPLORE_DESIGN_BASE = `${API_URL}/explore-design`;
/** Explore & Design guided data flow: /explore-design/guided/* */
const GUIDED_BASE = `${API_URL}/explore-design/guided`;

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
  | 'COLUMN_MAPPING_CREATED'
  | 'COLUMN_MAPPING_REMOVED'
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
    `${EXPLORE_DESIGN_BASE}/projects/${projectId}/events?${params.toString()}`,
    { headers }
  );
  return response.data;
}
/**
 * Delete an event (backend may not implement; prefer filtering in UI).
 */
export async function deleteEvent(
  _projectId: string,
  _eventId: string
): Promise<{ success: boolean; message: string }> {
  return { success: false, message: 'Delete event not implemented on backend; use list and filter in UI.' };
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
    `${EXPLORE_DESIGN_BASE}/validate-events`,
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

// ============================================================================
// EXPLORE PROJECTS - Project management for Explore & Design
// ============================================================================

export interface ExploreProject {
  project_id: string;
  project_name: string;
  created_by: string;
  created_at: string | null;
  status: string;
  metadata: Record<string, any> | null;
}

export interface ExploreProjectsResponse {
  projects: ExploreProject[];
  total: number;
}

/**
 * Get all explore projects for the current user
 * Backend endpoint: GET /explore-design/projects
 */
export async function getExploreProjects(): Promise<ExploreProjectsResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.get(
    `${EXPLORE_DESIGN_BASE}/projects`,
    { headers }
  );
  return response.data;
}

/**
 * Create a new explore project
 * Backend endpoint: POST /explore-design/projects or POST /explore-design/create_project
 */
export async function createExploreProject(
  projectName: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; project_id: string; project_name: string; message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/projects`,
    {
      project_name: projectName,
      metadata: metadata || {},
    },
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
  const url = API_CONTRACTS.exploreDesign.createProject.getUrl();
  const response = await axios.post(
    url,
    { project_name: name, metadata: tables ? { tables } : undefined },
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
  const url = API_CONTRACTS.exploreDesign.createDeployment.getUrl();
  const response = await axios.post(
    url,
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
// ============================================
// INGESTION EXECUTION API
// Backend: POST /execute_ingestion
// ============================================

/**
 * Supported transformation functions for column mappings
 * - null/undefined: Direct 1:1 mapping (e.g., ID -> CUSTOMER_ID)
 * - CONCAT: Concatenate columns (e.g., ["A", "B"] -> "AB")
 * - CONCAT_WS: Concatenate with space (e.g., ["FIRST", "LAST"] -> "John Doe")
 * - COALESCE: First non-null value (e.g., ["PHONE1", "PHONE2"])
 * - UPPER: Uppercase (e.g., ["name"] -> "NAME")
 * - LOWER: Lowercase (e.g., ["EMAIL"] -> "email")
 * - TRIM: Remove whitespace (e.g., ["text"] -> trimmed)
 * - SUM: Add numeric columns (e.g., ["QTY1", "QTY2"] -> total)
 */
export type ColumnTransformation =
  | null
  | 'CONCAT'
  | 'CONCAT_WS'
  | 'COALESCE'
  | 'UPPER'
  | 'LOWER'
  | 'TRIM'
  | 'SUM';

export interface ColumnMapping {
  /** Source column(s) - array to support multi-column transformations */
  source_columns: string[];
  /** Target column name */
  target_column: string;
  /** Optional transformation function */
  transformation?: ColumnTransformation;
}

export interface IngestionTableConfig {
  source_database: string;
  source_schema: string;
  source_table: string;
  // NOTE: target_database and target_schema are IGNORED by backend
  // Backend automatically uses versioned schema (e.g., CP_DATA360.retail_dwh_V1)
  target_database?: string;  // Optional - IGNORED, kept for backward compatibility
  target_schema?: string;    // Optional - IGNORED, kept for backward compatibility
  target_table: string;      // Required - only table name needed
  ingestion_mode: IngestionMode;
  /** Column mappings with optional transformations */
  column_mappings?: ColumnMapping[];
  config?: {
    pk_columns?: string[];
    incremental_column?: string;
    tracking_columns?: string[];
    effective_date_column?: string;
    expiration_date_column?: string;
    current_flag_column?: string;
    snapshot_column?: string;
  };
}

export interface IngestionExecutionRequest {
  project_id: string;
  schema_version_id?: string; // Links ingestion to a specific schema version
  tables: IngestionTableConfig[];
  warehouse?: string;
  triggered_by?: string;
}

export interface IngestionTableResult {
  source: string;
  target: string;
  ingestion_mode: string;
  success: boolean;
  rows_affected: number;
  rows_inserted?: number;
  rows_updated?: number;
  rows_deleted?: number;
  message: string;
  error?: string;
  sql_executed?: string[];
}

export interface IngestionExecutionResponse {
  status: 'success' | 'partial' | 'failed';
  ingestion_run_id?: string;
  schema_version_id?: string;        // The version used for ingestion
  versioned_schema_name?: string;    // e.g., "retail_dwh_V1"
  target_database?: string;          // e.g., "CP_DATA360"
  message: string;
  project_id: string;
  total_tables: number;
  successful: number;
  failed: number;
  total_rows_affected: number;
  started_at?: string;
  completed_at?: string;
  results: IngestionTableResult[];
}

// ============================================
// SCHEMA VERSIONING TYPES
// ============================================

export type SchemaVersionStatus = 'active' | 'superseded' | 'rolled_back';

export interface ChangesSummary {
  schemas_created?: number;  // Number of versioned schemas created (e.g., project_id_V1)
  tables_cloned?: number;    // Tables cloned from template schema
  tables_created: number;
  tables_modified: number;
  tables_dropped: number;
  columns_added: number;
  columns_modified: number;
  columns_dropped: number;
  constraints_added: number;
  constraints_dropped: number;
}

export interface SQLStatement {
  sql: string;
  rollback_sql?: string;
  object_type?: string; // TABLE, COLUMN, CONSTRAINT, INDEX
  object_name?: string;
}

export interface DeploymentEvent {
  event_type: string;
  target: { database: string; schema: string; table: string; column?: string };
  payload: Record<string, any>;
}

export interface DeploymentOptions {
  rollback_on_error?: boolean;
  dry_run?: boolean;
  created_by?: string;
}

export interface SchemaDeploymentRequest {
  project_id: string;           // Required - Used for schema naming: {project_id}_V1, V2, V3
  version_name?: string;        // Optional - Auto-generated if empty
  description?: string;         // Optional
  sql_queries: SQLStatement[];  // Required
  events?: DeploymentEvent[];   // Optional
  options?: DeploymentOptions;  // Optional (defaults: rollback_on_error=true, dry_run=false)
  warehouse?: string;           // Optional - defaults to "COMPUTE_WH"
}

export interface SchemaDeploymentResponse {
  status: 'success' | 'failed' | 'dry_run';
  schema_version_id?: string;
  version_name: string;
  version_number: number;
  versioned_schema_name?: string;  // e.g., "retail_dwh_V1" - the actual schema name in Snowflake
  target_database?: string;         // Always "CP_DATA360"
  executed_statements: number;
  failed_statements: number;
  changes_summary: ChangesSummary;
  rollback_available: boolean;
  errors: string[];
  warnings: string[];
}

export interface SchemaVersion {
  version_id: string;
  version_name: string;
  version_number: number;
  versioned_schema_name?: string;  // e.g., "retail_dwh_V1"
  created_at: string;
  created_by?: string;
  status: SchemaVersionStatus;
  description?: string;
  changes_summary: ChangesSummary;
  can_rollback: boolean;
}

export interface SchemaVersionsResponse {
  project_id: string;
  current_version?: SchemaVersion;
  versions: SchemaVersion[];
  total_versions: number;
}

export interface RollbackOptions {
  dry_run?: boolean;
  reason?: string;
}

export interface RollbackResponse {
  status: 'success' | 'failed' | 'dry_run';
  rolled_back_from: string;
  rolled_back_to: string;
  versions_rolled_back: number;
  statements_executed: number;
  new_version_id?: string;
  message: string;
  errors: string[];
}

export interface IngestionRunSummary {
  run_id: string;
  schema_version_id?: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'success' | 'partial' | 'failed';
  total_tables: number;
  successful_tables: number;
  failed_tables: number;
  total_rows_affected: number;
  triggered_by?: string;
}

export interface IngestionHistoryResponse {
  project_id: string;
  runs: IngestionRunSummary[];
  total_runs: number;
}

/**
 * Execute data ingestion for multiple tables
 * Supports various ingestion modes: full_refresh, incremental, snapshot, scd_type1, scd_type2, scd_type3
 *
 * Backend: POST /explore-design/execute_ingestion
 *
 * @param request - Ingestion configuration with tables and their modes
 * @returns Execution results for each table
 *
 * @example
 * // Full refresh ingestion
 * await executeIngestion({
 *   project_id: 'proj_123',
 *   tables: [{
 *     source_database: 'RAW_DB',
 *     source_schema: 'PUBLIC',
 *     source_table: 'CUSTOMERS',
 *     target_database: 'DWH_DB',
 *     target_schema: 'RETAIL_DWH',
 *     target_table: 'DIM_CUSTOMERS',
 *     ingestion_mode: 'full_refresh'
 *   }]
 * });
 *
 * @example
 * // SCD Type 2 ingestion with tracking columns
 * await executeIngestion({
 *   project_id: 'proj_123',
 *   tables: [{
 *     source_database: 'RAW_DB',
 *     source_schema: 'PUBLIC',
 *     source_table: 'PRODUCTS',
 *     target_database: 'DWH_DB',
 *     target_schema: 'RETAIL_DWH',
 *     target_table: 'DIM_PRODUCTS',
 *     ingestion_mode: 'scd_type2',
 *     config: {
 *       pk_columns: ['PRODUCT_ID'],
 *       tracking_columns: ['PRICE', 'CATEGORY', 'STATUS'],
 *       effective_date_column: 'VALID_FROM',
 *       expiration_date_column: 'VALID_TO',
 *       current_flag_column: 'IS_CURRENT'
 *     }
 *   }],
 *   warehouse: 'TRANSFORM_WH'
 * });
 */
export async function executeIngestion(
  request: IngestionExecutionRequest
): Promise<IngestionExecutionResponse> {
  const headers = await getAuthHeaders();

  try {
    const response = await axios.post<IngestionExecutionResponse>(
      `${EXPLORE_DESIGN_BASE}/execute_ingestion`,
      {
        project_id: request.project_id,
        schema_version_id: request.schema_version_id, // Link to schema version
        tables: request.tables,
        warehouse: request.warehouse || 'COMPUTE_WH',
        triggered_by: request.triggered_by,
      },
      { headers }
    );

    return response.data;
  } catch (error: any) {
    console.error('[executeIngestion] Error:', error);
    const errorDetail = error.response?.data?.detail || error.message;

    return {
      status: 'failed',
      message: typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
      project_id: request.project_id,
      total_tables: request.tables.length,
      successful: 0,
      failed: request.tables.length,
      total_rows_affected: 0,
      results: request.tables.map((table) => ({
        source: `${table.source_database}.${table.source_schema}.${table.source_table}`,
        target: table.target_table, // Only table name - schema is determined by version
        ingestion_mode: table.ingestion_mode,
        success: false,
        rows_affected: 0,
        message: 'Failed to execute ingestion',
        error: typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
      })),
    };
  }
}

// ============================================
// SCHEMA VERSIONING APIs
// ============================================

/**
 * Deploy schema changes (DDL) as a versioned release
 *
 * Backend: POST /explore-design/deploy_schema
 *
 * @param request - Schema deployment configuration with SQL queries and events
 * @returns Deployment result with version ID
 *
 * @example
 * await deploySchema({
 *   project_id: 'proj_123',
 *   version_name: 'Add customer dimensions',
 *   sql_queries: [
 *     { sql: 'CREATE TABLE DWH.SALES.DIM_CUSTOMER (...)', rollback_sql: 'DROP TABLE DWH.SALES.DIM_CUSTOMER' }
 *   ],
 *   options: { rollback_on_error: true }
 * });
 */
export async function deploySchema(
  request: SchemaDeploymentRequest
): Promise<SchemaDeploymentResponse> {
  const headers = await getAuthHeaders();

  try {
    const response = await axios.post<SchemaDeploymentResponse>(
      `${EXPLORE_DESIGN_BASE}/deploy_schema`,
      {
        project_id: request.project_id,
        version_name: request.version_name,
        description: request.description,
        sql_queries: request.sql_queries,
        events: request.events,
        options: request.options || { rollback_on_error: true },
      },
      { headers }
    );

    return response.data;
  } catch (error: any) {
    console.error('[deploySchema] Error:', error);
    const errorDetail = error.response?.data?.detail || error.message;

    return {
      status: 'failed',
      version_name: request.version_name || 'Unknown',
      version_number: 0,
      executed_statements: 0,
      failed_statements: request.sql_queries.length,
      changes_summary: {
        tables_created: 0,
        tables_modified: 0,
        tables_dropped: 0,
        columns_added: 0,
        columns_modified: 0,
        columns_dropped: 0,
        constraints_added: 0,
        constraints_dropped: 0,
      },
      rollback_available: false,
      errors: [typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail)],
      warnings: [],
    };
  }
}

/**
 * Get schema version history for a project
 *
 * Backend: GET /explore-design/schema_versions/{project_id}
 *
 * @param projectId - Project ID
 * @param options - Query options
 * @returns List of schema versions
 */
export async function getSchemaVersions(
  projectId: string,
  options?: {
    limit?: number;
    include_rolled_back?: boolean;
  }
): Promise<SchemaVersionsResponse> {
  const headers = await getAuthHeaders();

  try {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.include_rolled_back) params.append('include_rolled_back', 'true');

    const response = await axios.get<SchemaVersionsResponse>(
      `${EXPLORE_DESIGN_BASE}/schema_versions/${projectId}?${params.toString()}`,
      { headers }
    );

    return response.data;
  } catch (error: any) {
    console.error('[getSchemaVersions] Error:', error);

    // Return empty response on error
    return {
      project_id: projectId,
      versions: [],
      total_versions: 0,
    };
  }
}

/** Recent deployment error (schema deploy, etc.) for dashboard and Cortex recommendations */
export interface RecentDeploymentError {
  id: string;
  module: string;
  project_id: string | null;
  deployment_id: string | null;
  error_message: string;
  source: string;
  created_by: string | null;
  created_at: string | null;
}

/**
 * Fetch recent deployment errors for Deployment Plans UI and Cortex recommendations.
 * Backend: GET /explore-design/recent-deployment-errors
 */
export async function getRecentDeploymentErrors(
  limit: number = 20
): Promise<{ errors: RecentDeploymentError[]; total: number }> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.get<{ errors: RecentDeploymentError[]; total: number }>(
      `${EXPLORE_DESIGN_BASE}/recent-deployment-errors?limit=${limit}`,
      { headers }
    );
    return response.data;
  } catch (error: any) {
    console.error('[getRecentDeploymentErrors] Error:', error);
    return { errors: [], total: 0 };
  }
}

/**
 * Rollback schema to a specific version
 *
 * Backend: POST /explore-design/rollback_schema/{version_id}
 *
 * @param versionId - Target version ID to rollback to
 * @param options - Rollback options
 * @returns Rollback result
 */
export async function rollbackSchema(
  versionId: string,
  options?: RollbackOptions
): Promise<RollbackResponse> {
  const headers = await getAuthHeaders();

  try {
    const response = await axios.post<RollbackResponse>(
      `${EXPLORE_DESIGN_BASE}/rollback_schema/${versionId}`,
      options || {},
      { headers }
    );

    return response.data;
  } catch (error: any) {
    console.error('[rollbackSchema] Error:', error);
    const errorDetail = error.response?.data?.detail || error.message;

    return {
      status: 'failed',
      rolled_back_from: '',
      rolled_back_to: versionId,
      versions_rolled_back: 0,
      statements_executed: 0,
      message: typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
      errors: [typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail)],
    };
  }
}

/**
 * Get ingestion run history for a project
 *
 * Backend: GET /explore-design/ingestion_history/{project_id}
 *
 * @param projectId - Project ID
 * @param options - Query options
 * @returns List of ingestion runs
 */
export async function getIngestionHistory(
  projectId: string,
  options?: {
    limit?: number;
    schema_version_id?: string;
  }
): Promise<IngestionHistoryResponse> {
  const headers = await getAuthHeaders();

  try {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.schema_version_id) params.append('schema_version_id', options.schema_version_id);

    const response = await axios.get<IngestionHistoryResponse>(
      `${EXPLORE_DESIGN_BASE}/ingestion_history/${projectId}?${params.toString()}`,
      { headers }
    );

    return response.data;
  } catch (error: any) {
    console.error('[getIngestionHistory] Error:', error);

    // Return empty response on error
    return {
      project_id: projectId,
      runs: [],
      total_runs: 0,
    };
  }
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
    case 'COLUMN_MAPPING_CREATED':
      // ETL column mapping: source column → target column
      const targetTableRef = payload.targetTable
        ? `${payload.targetTable.database}.${payload.targetTable.schema}.${payload.targetTable.table}`
        : 'UNKNOWN_TARGET';
      const transformExpr = payload.transformation
        ? `${payload.transformation}(${target.table}.${payload.sourceColumn})`
        : `${target.table}.${payload.sourceColumn}`;
      return `-- ETL Mapping: ${tableRef}.${payload.sourceColumn} -> ${targetTableRef}.${payload.targetColumn}\n-- Transform: ${transformExpr}`;
    case 'COLUMN_MAPPING_REMOVED':
      const removedTargetRef = payload.targetTable
        ? `${payload.targetTable.database}.${payload.targetTable.schema}.${payload.targetTable.table}`
        : 'UNKNOWN_TARGET';
      return `-- ETL Mapping Removed: ${tableRef}.${payload.sourceColumn} -> ${removedTargetRef}.${payload.targetColumn}`;
    case 'TAG_APPLIED':
      return `ALTER TABLE ${tableRef} SET TAG ${payload.tag_name} = '${payload.tag_value}';`;
    default:
      return `-- ${event_type}: ${JSON.stringify(payload)}`;
  }
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
      `${EXPLORE_DESIGN_BASE}/projects`,
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
    sql_queries?: string[]; // Pre-ordered SQL queries for execution
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
    type: config.requires_approval ? 'with_approval' : 'scheduled',
    event_ids: eventIds,
    scheduled_at: config.scheduled_date,
    // Pre-ordered SQL queries for execution (passed from frontend after sorting by dependency)
    sql_queries: config.sql_queries || [],
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

// ============================================
// QUERY EXECUTION API
// ============================================

/**
 * Execute SQL queries directly on Snowflake
 * Uses /explore-design/execute_queries endpoint
 *
 * @param queries - Array of SQL statements to execute in order
 * @returns Execution results for each query
 */
export async function executeQueries(
  queries: string[]
): Promise<{
  status: 'success' | 'failed';
  executed_queries: number;
  results: Array<{
    query: string;
    rows?: any[];
    rows_affected?: number;
    error?: string;
  }>;
}> {
  const headers = await getAuthHeaders();

  try {
    const response = await axios.post(
      `${EXPLORE_DESIGN_BASE}/execute_queries`,
      queries,
      { headers }
    );

    return {
      status: 'success',
      executed_queries: response.data.executed_queries || queries.length,
      results: response.data.results || [],
    };
  } catch (error: any) {
    console.error('[executeQueries] Error:', error);
    const errorDetail = error.response?.data?.detail || error.message;

    return {
      status: 'failed',
      executed_queries: 0,
      results: [{
        query: queries[0] || '',
        error: typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
      }],
    };
  }
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
    const createUrl = API_CONTRACTS.exploreDesign.createDeployment.getUrl();
    const createResponse = await axios.post(
      createUrl,
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
      `${GUIDED_BASE}/schedule_deployment/`,
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
    const params = new URLSearchParams();
    if (projectId) params.append('project_id', projectId);
    const response = await axios.get(
      `${EXPLORE_DESIGN_BASE}/scheduled-deployments${params.toString() ? `?${params.toString()}` : ''}`,
      { headers }
    );

    let deployments = response.data?.deployments ?? response.data?.scheduled_deployments ?? [];
    if (!Array.isArray(deployments)) deployments = [];

    // Client-side filter by project if not already filtered by backend
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
  const url = `${GUIDED_BASE}/manage_table`;

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
// ============================================
// TABLE RELATIONSHIPS APIs
// ============================================

export interface RelationshipColumnMapping {
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

// ============================================
// COLUMN PREVIEW & PROFILING APIs
// ============================================

export interface ColumnPreviewData {
  column: string;
  sample_values: any[];
  total_rows: number;
  sample_size: number;
}

export interface TablePreviewData {
  table: string;
  columns: string[];
  rows: Record<string, any>[];
  total_rows: number;
  sample_size: number;
  offset: number;
}

export interface ColumnProfile {
  column: string;
  data_type: string;
  total_rows: number;
  null_count: number;
  null_percentage: number;
  distinct_count: number;
  distinct_percentage: number;
  min_value?: any;
  max_value?: any;
  avg_value?: number;
  min_length?: number;
  max_length?: number;
  avg_length?: number;
  most_frequent?: Array<{ value: any; count: number; percentage: number }>;
  data_quality_score: number;
  is_unique: boolean;
  has_nulls: boolean;
}

/**
 * Fetch sample data preview for a column
 * POST /explore-design/column/preview
 */
export async function getColumnPreview(
  database: string,
  schema: string,
  table: string,
  column: string,
  sampleSize: number = 100
): Promise<ColumnPreviewData> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/column/preview`,
    {
      database,
      schema,
      table,
      column,
      sample_size: sampleSize,
    },
    { headers }
  );
  return response.data;
}

/**
 * Fetch sample data preview for an entire table
 * POST /explore-design/table/preview
 */
export async function getTablePreview(
  database: string,
  schema: string,
  table: string,
  limit: number = 50,
  offset: number = 0
): Promise<TablePreviewData> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/table/preview`,
    {
      database,
      schema,
      table,
      limit,
      offset,
    },
    { headers }
  );
  return response.data;
}

/**
 * Fetch column profiling statistics
 * POST /explore-design/column/profile
 */
export async function getColumnProfile(
  database: string,
  schema: string,
  table: string,
  column: string
): Promise<ColumnProfile> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/column/profile`,
    {
      database,
      schema,
      table,
      column,
    },
    { headers }
  );
  return response.data;
}

/**
 * Fetch profiling for all columns in a table
 * POST /explore-design/table/profile
 */
export async function getTableProfile(
  database: string,
  schema: string,
  table: string
): Promise<{
  table: string;
  row_count: number;
  column_count: number;
  columns: ColumnProfile[];
  overall_quality_score: number;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/table/profile`,
    {
      database,
      schema,
      table,
    },
    { headers }
  );
  return response.data;
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

// ============================================
// Event Management & Deployment Services
// ============================================

/**
 * Add a design event to the events queue
 *
 * @param projectId - Project ID
 * @param eventId - Unique event ID
 * @param eventType - Type of event (TABLE_CREATED, FOREIGN_KEY_ADDED, etc.)
 * @param target - Target table/column reference
 * @param payload - Event payload data
 * @param moduleType - Module type (default: explore-design)
 * @returns Promise with event response
 */
export async function addDesignEvent(
  projectId: string,
  eventId: string,
  eventType: string,
  target: {
    database: string;
    schema: string;
    table: string;
    column?: string;
  },
  payload: Record<string, any>,
  moduleType: string = 'explore-design'
): Promise<{
  success: boolean;
  event_id: string;
  project_id: string;
  status: string;
  created_at: string;
}> {
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${EXPLORE_DESIGN_BASE}/add-event`,
    {
      project_id: projectId,
      event_id: eventId,
      event_type: eventType,
      target,
      payload,
      module_type: moduleType,
    },
    { headers }
  );
  return response.data;
}

// ============================================
// VERSION-BASED DEPLOYMENT (Deploy to cp_data360.<version_schema>)
// ============================================

export interface DeploymentEventWithRollback {
  event_id: string;
  event_type: string;
  sql: string;
  rollback_sql?: string;
  target: {
    database: string;
    schema: string;
    table: string;
    column?: string;
  };
  payload: Record<string, any>;
}

export interface DeployWithVersionRequest {
  project_id: string;
  version_name: string;
  events: DeploymentEventWithRollback[];
  rollback_on_error?: boolean;
  created_by?: string;
  dry_run?: boolean;
}

export interface DeployWithVersionResponse {
  deployment_id: string;
  status: 'success' | 'partial' | 'failed';
  version_name: string;
  target_database: string;
  target_schema: string;
  schema_created: boolean;
  results: Array<{
    event_id: string;
    status: 'applied' | 'failed' | 'skipped' | 'validated' | 'validation_failed';
    sql_executed?: string;
    execution_time_ms?: number;
    error?: string;
  }>;
  summary: {
    applied: number;
    failed: number;
    skipped: number;
  };
  executed_at: string;
  rollback_available: boolean;
}