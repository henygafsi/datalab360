/** Explore & Design API: metadata, events, deployments. Data journey: UI → service → /explore-design/guided/*. */
// ////dependency//// service → lib.api-client (centralized auth+interceptors)
import apiClient from '@/lib/api-client';

/** Explore-design prefix — unified to match backend router at /api/v1/explore-design */
const ED = '/api/v1/explore-design';
/** Alias for V1 explore-design prefix (same as ED) */
const V1_EXPLORE = '/api/v1/explore-design';

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
// METADATA APIS
// ============================================


// ============================================
// INGESTION CONFIGURATION APIS
// ============================================

/**
 * Set ingestion mode for a table
 */


/**
 * Bulk set ingestion mode for multiple tables
 */


// ============================================
// DETECTION APIS
// ============================================

/**
 * Detect sensitive columns in tables
 */

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
  const response = await apiClient.post(
    `${ED}/detect/relations`,
    {
      source_tables: sourceTables,
      target_tables: targetTables,
      detection_methods: options?.detection_methods ?? ['naming_convention', 'data_type_match', 'value_overlap'],
      sample_size: options?.sample_size ?? 1000,
    },
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
  const response = await apiClient.post(
    `${ED}/detect/primary-keys`,
    {
      tables,
      patterns: options?.patterns ?? ['*_ID', 'ID_*', '*_PK', '*_KEY'],
      check_uniqueness: options?.check_uniqueness ?? true,
      check_nullability: options?.check_nullability ?? true,
    },
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
  const response = await apiClient.post(
    `${ED}/events`,
    {
      project_id: projectId,
      event_type: eventType,
      target,
      payload,
    },
  );
  return response.data;
}

/**
 * Get all events for a project
 * Tries v1 API first (GET /explore-design/{projectId}/events), falls back to legacy
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
  // Try v1 endpoint first
  try {
    const { data } = await apiClient.get(`${V1_EXPLORE}/${projectId}/events`, {
      params: {
        ...(filters?.event_type ? { event_type: filters.event_type } : {}),
      },
    });
    const events = data.events || [];
    return {
      project_id: data.project_id || projectId,
      events,
      summary: {
        total: events.length,
        pending: events.filter((e: any) => e.status === 'pending').length,
        validated: events.filter((e: any) => e.status === 'validated').length,
        failed: events.filter((e: any) => e.status === 'failed').length,
      },
    };
  } catch {
    // Fallback to legacy endpoint
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.event_type) params.event_type = filters.event_type;

    const response = await apiClient.get(
      `${ED}/projects/${projectId}/events`,
      { params },
    );
    return response.data;
  }
}

/**
 * Get a single event by project and event id (from project events list).
 */
export async function getEvent(
  projectId: string,
  eventId: string
): Promise<DesignEvent | null> {
  const { events } = await getProjectEvents(projectId);
  return events?.find((e: DesignEvent) => (e as any).event_id === eventId || (e as any).id === eventId) ?? null;
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
  const response = await apiClient.post(
    `${ED}/validate-events`,
    {
      project_id: projectId,
      event_ids: eventIds,
      dry_run: dryRun,
    },
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
  const response = await apiClient.post(
    `${ED}/events/deploy`,
    {
      project_id: projectId,
      event_ids: eventIds,
      rollback_on_error: options?.rollback_on_error ?? true,
    },
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
 * Tries v1 API first (GET /projects?project_type=explore_design), falls back to legacy
 */
export async function getExploreProjects(): Promise<ExploreProjectsResponse> {
  // Try v1 endpoint first
  try {
    const { data } = await apiClient.get('/api/v1/projects', {
      params: { project_type: 'explore_design' },
    });
    // Map v1 response shape to legacy shape
    const projects = (data.projects || []).map((p: any) => ({
      project_id: p.project_id,
      project_name: p.project_name,
      created_by: p.created_by,
      created_at: p.created_at,
      status: p.status,
      metadata: p.metadata,
    }));
    return { projects, total: data.total ?? projects.length };
  } catch {
    // Fallback to legacy endpoint
    const response = await apiClient.get(`${ED}/projects`);
    return response.data;
  }
}

/**
 * Create a new explore project
 * Tries v1 API first (POST /explore-design), falls back to legacy
 */
export async function createExploreProject(
  projectName: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; project_id: string; project_name: string; message: string }> {
  // Try v1 endpoint first
  try {
    const { data } = await apiClient.post(V1_EXPLORE, {
      project_name: projectName,
      project_type: 'explore_design',
      metadata: metadata || {},
    });
    return {
      success: true,
      project_id: data.project_id,
      project_name: data.project_name || projectName,
      message: 'Project created successfully',
    };
  } catch {
    // Fallback to legacy endpoint
    const response = await apiClient.post(
      `${ED}/projects`,
      {
        project_name: projectName,
        metadata: metadata || {},
      },
    );
    return response.data;
  }
}

/**
 * Get project state
 */
export async function getProjectState(projectId: string): Promise<ProjectState> {
  const response = await apiClient.get(`${ED}/project/${projectId}`);
  return response.data;
}

/**
 * Save project state
 */
export async function saveProjectState(
  projectId: string,
  state: Partial<ProjectState>
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.put(`${ED}/project/${projectId}`, state);
  return response.data;
}

/**
 * Create a new project
 */
export async function createProject(
  name: string,
  tables?: TableReference[]
): Promise<{ project_id: string; name: string }> {
  const response = await apiClient.post(
    `${ED}/projects`,
    { project_name: name, metadata: tables ? { tables } : undefined },
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
  const response = await apiClient.get(`${ED}/templates`);
  return response.data;
}

/**
 * Save a configuration template
 */
export async function saveTemplate(
  template: Omit<ConfigTemplate, 'id'>
): Promise<{ template_id: string; message: string }> {
  const response = await apiClient.post(`${ED}/templates`, template);
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
  const response = await apiClient.post(
    `${ED}/templates/${templateId}/apply`,
    { project_id: projectId, tables },
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
  const response = await apiClient.get(`${ED}/schema-changes/${projectId}`);
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
  const response = await apiClient.post(
    `${ED}/compliance/validate`,
    { project_id: projectId, compliance_rules: rules },
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
  const response = await apiClient.post(
    `${ED}/deployments`,
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
  const response = await apiClient.get(`${ED}/deployments/${deploymentId}`);
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
  const response = await apiClient.post(
    `${ED}/deployments/${deploymentId}/execute`,
    {
      execution_mode: options?.execution_mode ?? 'immediate',
      dry_run: options?.dry_run ?? false,
    },
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
  const response = await apiClient.post(
    `${ED}/deployments/${deploymentId}/rollback`,
    {
      target_version: targetVersion,
      reason,
    },
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
  const params: Record<string, string> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.limit) params.limit = String(filters.limit);

  const response = await apiClient.get(
    `${ED}/deployments/project/${projectId}`,
    { params },
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
  const response = await apiClient.post(
    `${ED}/versions`,
    {
      project_id: projectId,
      version_type: versionType,
      changelog: changelogSummary,
      snapshot_events: snapshotEvents ?? true,
    },
  );
  return response.data;
}

/**
 * List versions for a project
 */
export async function listVersions(projectId: string): Promise<{ versions: Version[] }> {
  const response = await apiClient.get(`${ED}/versions/${projectId}`);
  return response.data;
}

/**
 * Get version details
 */
export async function getVersion(versionId: string): Promise<Version & { snapshot: any }> {
  const response = await apiClient.get(`${ED}/versions/detail/${versionId}`);
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
  const response = await apiClient.get(
    `${ED}/versions/${fromVersionId}/compare/${toVersionId}`,
  );
  return response.data;
}

/**
 * Publish a version
 */
export async function publishVersion(versionId: string): Promise<{ success: boolean; published_at: string }> {
  const response = await apiClient.post(`${ED}/versions/${versionId}/publish`, {});
  return response.data;
}

/**
 * Archive a version
 */
export async function archiveVersion(versionId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`${ED}/versions/${versionId}/archive`, {});
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
  const response = await apiClient.get(`${ED}/approvals/pending`);
  return response.data;
}

/**
 * Get approval details
 */
export async function getApprovalDetails(approvalId: string): Promise<ApprovalRequest> {
  const response = await apiClient.get(`${ED}/approvals/${approvalId}`);
  return response.data;
}

/**
 * Approve a request
 */
export async function approveRequest(
  approvalId: string,
  comment?: string
): Promise<{ success: boolean; deployment_status: string }> {
  const response = await apiClient.post(
    `${ED}/approvals/${approvalId}/approve`,
    { comment },
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
  const response = await apiClient.post(
    `${ED}/approvals/${approvalId}/reject`,
    {
      comment,
      required_changes: requiredChanges,
    },
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
  const response = await apiClient.post(
    `${ED}/approvals/${approvalId}/comment`,
    { comment },
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
  const response = await apiClient.post(
    `${ED}/ingestion/snowpipe`,
    {
      project_id: projectId,
      table_id: tableId,
      config,
    },
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
  const response = await apiClient.post(
    `${ED}/ingestion/batch-task`,
    {
      project_id: projectId,
      table_id: tableId,
      config,
    },
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
  const response = await apiClient.post(
    `${ED}/ingestion/stream`,
    {
      project_id: projectId,
      stream_name: streamName,
      source_table: sourceTable,
      append_only: options?.append_only ?? false,
      show_initial_rows: options?.show_initial_rows ?? false,
    },
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
  const response = await apiClient.post(
    `${ED}/ingestion/${ingestionId}/pause`,
    { type },
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
  const response = await apiClient.post(
    `${ED}/ingestion/${ingestionId}/resume`,
    { type },
  );
  return response.data;
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
  // Try v1 ingestion endpoint first
  try {
    const { data } = await apiClient.post<IngestionExecutionResponse>(
      `${V1_EXPLORE}/${request.project_id}/ingestion/execute`,
      {
        tables: request.tables,
        warehouse: request.warehouse || 'COMPUTE_WH',
        schema_version_id: request.schema_version_id,
        triggered_by: request.triggered_by,
      },
    );
    return { ...data, project_id: request.project_id };
  } catch {
    // Fallback to legacy endpoint
    try {
      const response = await apiClient.post<IngestionExecutionResponse>(
        `${ED}/execute_ingestion`,
        {
          project_id: request.project_id,
          schema_version_id: request.schema_version_id,
          tables: request.tables,
          warehouse: request.warehouse || 'COMPUTE_WH',
          triggered_by: request.triggered_by,
        },
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
          target: table.target_table,
          ingestion_mode: table.ingestion_mode,
          success: false,
          rows_affected: 0,
          message: 'Failed to execute ingestion',
          error: typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
        })),
      };
    }
  }
}

// ============================================
// INGESTION OPERATIONS (versioned, approvable, rollback-enabled)
// ============================================

export interface IngestionOperation {
  operation_id: string;
  project_id: string;
  version_id?: string;
  deployment_id?: string;
  source: { database: string; schema: string; table: string };
  target: { database: string; schema: string; table: string };
  ingestion_mode: string;
  status: 'PENDING' | 'APPROVED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  rows_affected: number;
  created_by: string;
  created_at: string;
  executed_at?: string;
  rolled_back_at?: string;
  error_message?: string;
}

export interface IngestionOperationsResponse {
  operations: IngestionOperation[];
  total: number;
}

/**
 * Create an ingestion operation for approval workflow
 * Registers the operation without executing — goes through approve → execute flow
 */
export async function createIngestionOperation(
  projectId: string,
  config: IngestionTableConfig
): Promise<{ operation_id: string; status: string; ingestion_mode: string }> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/ingestion/operations`,
    {
      source_database: config.source_database,
      source_schema: config.source_schema,
      source_table: config.source_table,
      target_database: config.target_database,
      target_schema: config.target_schema,
      target_table: config.target_table,
      ingestion_mode: config.ingestion_mode,
      mappings: config.column_mappings,
      config: config.config,
    },
  );
  return data;
}

/**
 * List ingestion operations for a project
 */
export async function listIngestionOperations(
  projectId: string,
  status?: string
): Promise<IngestionOperationsResponse> {
  const { data } = await apiClient.get<IngestionOperationsResponse>(
    `${V1_EXPLORE}/${projectId}/ingestion/operations`,
    { params: status ? { status } : undefined },
  );
  return data;
}

/**
 * Execute a pending/approved ingestion operation with rollback tracking
 */
export async function executeIngestionOperation(
  projectId: string,
  operationId: string
): Promise<{ operation_id: string; status: string; rows_affected: number }> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/ingestion/operations/${operationId}/execute`,
  );
  return data;
}

/**
 * Rollback a completed ingestion operation using Time Travel or stored rollback SQL
 */
export async function rollbackIngestionOperation(
  projectId: string,
  operationId: string
): Promise<{ operation_id: string; status: string; rows_restored: number }> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/ingestion/operations/${operationId}/rollback`,
  );
  return data;
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
  try {
    const response = await apiClient.post<SchemaDeploymentResponse>(
      `${ED}/deploy_schema`,
      {
        project_id: request.project_id,
        version_name: request.version_name,
        description: request.description,
        sql_queries: request.sql_queries,
        events: request.events,
        options: request.options || { rollback_on_error: true },
      },
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
  // Try v1 versions endpoint first
  try {
    const { data } = await apiClient.get(`${V1_EXPLORE}/${projectId}/versions`, {
      params: options?.limit ? { limit: options.limit } : undefined,
    });
    // Map v1 response to legacy shape
    const versions = (data.versions || []).map((v: any) => ({
      version_id: v.version_id,
      version_name: v.version_name || `v${v.version_number}`,
      version_number: v.version_number,
      versioned_schema_name: v.versioned_schema_name,
      created_at: v.created_at,
      created_by: v.created_by,
      status: v.status,
      description: v.description,
      changes_summary: v.changes_summary || {},
      can_rollback: v.can_rollback ?? false,
    }));
    return {
      project_id: projectId,
      current_version: versions.find((v: any) => v.status === 'active') || versions[0],
      versions,
      total_versions: versions.length,
    };
  } catch {
    // Fallback to legacy endpoint
    try {
      const params: Record<string, string> = {};
      if (options?.limit) params.limit = options.limit.toString();
      if (options?.include_rolled_back) params.include_rolled_back = 'true';

      const response = await apiClient.get<SchemaVersionsResponse>(
        `${ED}/schema_versions/${projectId}`,
        { params },
      );

      return response.data;
    } catch (error: any) {
      console.error('[getSchemaVersions] Error:', error);
      return {
        project_id: projectId,
        versions: [],
        total_versions: 0,
      };
    }
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
  try {
    const { data } = await apiClient.get<{ errors: RecentDeploymentError[]; total: number }>(
      `${V1_EXPLORE}/recent-deployment-errors`,
      { params: { limit } }
    );
    return data;
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
  try {
    const response = await apiClient.post<RollbackResponse>(
      `${ED}/rollback_schema/${versionId}`,
      options || {},
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
 * List deployments for a project via v1 API
 * GET /explore-design/{projectId}/deployments
 */
export async function listProjectDeploymentsV1(
  projectId: string,
  params?: { status?: string }
): Promise<{ deployments: any[]; total: number }> {
  try {
    const { data } = await apiClient.get(`${V1_EXPLORE}/${projectId}/deployments`, { params });
    return { deployments: data.deployments || [], total: data.total ?? 0 };
  } catch {
    return { deployments: [], total: 0 };
  }
}

/**
 * Approve a deployment via v1 API
 * POST /explore-design/{projectId}/deployments/{deploymentId}/approve
 */
export async function approveDeploymentV1(
  projectId: string,
  deploymentId: string
): Promise<any> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/deployments/${deploymentId}/approve`,
  );
  return data;
}

/**
 * Reject a deployment via v1 API
 * POST /explore-design/{projectId}/deployments/{deploymentId}/reject
 */
export async function rejectDeploymentV1(
  projectId: string,
  deploymentId: string,
  reason?: string
): Promise<any> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/deployments/${deploymentId}/reject`,
    reason ? { reason } : undefined,
  );
  return data;
}

/**
 * Execute a deployment via v1 API
 * POST /explore-design/{projectId}/deployments/{deploymentId}/execute
 */
export async function executeDeploymentV1(
  projectId: string,
  deploymentId: string
): Promise<any> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/deployments/${deploymentId}/execute`,
  );
  return data;
}

/**
 * Cancel a deployment via v1 API
 * POST /explore-design/{projectId}/deployments/{deploymentId}/cancel
 */
export async function cancelDeploymentV1(
  projectId: string,
  deploymentId: string
): Promise<any> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/deployments/${deploymentId}/cancel`,
  );
  return data;
}

/**
 * Quick deploy via v1 API
 * POST /explore-design/{projectId}/deploy?version_id=...
 */
export async function quickDeployV1(
  projectId: string,
  versionId: string
): Promise<any> {
  const { data } = await apiClient.post(
    `${V1_EXPLORE}/${projectId}/deploy`,
    undefined,
    { params: { version_id: versionId } },
  );
  return data;
}

/**
 * Create a schedule via v1 API
 * POST /explore-design/{projectId}/schedule
 */
export async function createScheduleV1(
  projectId: string,
  body: {
    cron_expression: string;
    warehouse?: string;
    version_id?: string;
    description?: string;
  }
): Promise<any> {
  const { data } = await apiClient.post(`${V1_EXPLORE}/${projectId}/schedule`, body);
  return data;
}

/**
 * List schedules via v1 API
 * GET /explore-design/{projectId}/schedules
 */
export async function listSchedulesV1(
  projectId: string,
  params?: { status?: string }
): Promise<{ schedules: any[] }> {
  try {
    const { data } = await apiClient.get(`${V1_EXPLORE}/${projectId}/schedules`, { params });
    return data;
  } catch {
    return { schedules: [] };
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
  try {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.schema_version_id) params.schema_version_id = options.schema_version_id;

    const response = await apiClient.get<IngestionHistoryResponse>(
      `${ED}/ingestion_history/${projectId}`,
      { params },
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

/**
 * Add conditions to an event
 */
export async function addEventConditions(
  eventId: string,
  conditions: Omit<EventCondition, 'id'>[]
): Promise<{ success: boolean; condition_ids: string[] }> {
  const response = await apiClient.post(
    `${ED}/events/${eventId}/conditions`,
    { conditions },
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
  const response = await apiClient.post(
    `${ED}/events/${eventId}/conditions/evaluate`,
    {},
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
  const response = await apiClient.get(
    `${ED}/export/${projectId}`,
    { responseType: 'blob' },
  );
  return response.data;
}

/**
 * Import project configuration
 */
export async function importProject(
  file: File
): Promise<{ project_id: string; imported_tables: number; imported_events: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post(
    `${ED}/import`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
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
  const response = await apiClient.post<SchemaCloneResponse>(`${ED}/schema-clone`, request);
  return response.data;
}

/**
 * Get schema clone status
 * GET /explore-design/schema-clone/{clone_id}/status
 */
export async function getSchemaCloneStatus(clone_id: string): Promise<SchemaCloneResponse> {
  const response = await apiClient.get<SchemaCloneResponse>(`${ED}/schema-clone/${clone_id}/status`);
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
  const response = await apiClient.post(
    `${ED}/schema-clone/${clone_id}/execute`,
    { warehouse },
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
  const response = await apiClient.post(`${ED}/schema-clone/${clone_id}/rollback`, {});
  return response.data;
}

/**
 * List all schema clones
 * GET /explore-design/schema-clone/list
 */
export async function listSchemaClones(project_id?: string): Promise<SchemaCloneResponse[]> {
  const params = project_id ? { project_id } : {};
  const response = await apiClient.get<SchemaCloneResponse[]>(
    `${ED}/schema-clone/list`,
    { params },
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
  const response = await apiClient.post(`${ED}/schema-clone/preview`, request);
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
  const response = await apiClient.post(
    `${ED}/ingestion/adapt`,
    { version_id, source_schema, target_schema },
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
  const response = await apiClient.post(
    `${ED}/ingestion/pause`,
    { database, schema, table },
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
  const response = await apiClient.post(
    `${ED}/ingestion/resume`,
    { database, schema, table, target_schema },
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
  const response = await apiClient.post(
    `${ED}/ingestion/create-versioned`,
    { version_id, database, source_schema, target_schema, tables },
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
  const response = await apiClient.get(
    `${ED}/versions/${from_version_id}/compare/${to_version_id}`,
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
  const response = await apiClient.post(
    `${ED}/versions/${version_id}/promote`,
    { target_environment, target_database },
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
  const response = await apiClient.get(
    `${ED}/versions/${from_version_id}/migration/${to_version_id}`,
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
      // ETL column mapping: source → target
      const srcRef = payload.source
        ? `${payload.source.database}.${payload.source.schema}.${payload.source.table}`
        : tableRef;
      const tgtRef = payload.target
        ? `${payload.target.database}.${payload.target.schema}.${payload.target.table}`
        : 'UNKNOWN_TARGET';
      const srcCols = payload.source?.columns?.join(', ') || '';
      const transformExpr = payload.transformation
        ? `${payload.transformation}(${srcCols})`
        : srcCols;
      return `-- ETL Mapping: ${srcRef}.(${srcCols}) -> ${tgtRef}.${payload.target?.column}\n-- Transform: ${transformExpr}`;
    case 'COLUMN_MAPPING_REMOVED':
      const removedSrcRef = payload.source
        ? `${payload.source.database}.${payload.source.schema}.${payload.source.table}`
        : tableRef;
      const removedTgtRef = payload.target
        ? `${payload.target.database}.${payload.target.schema}.${payload.target.table}`
        : 'UNKNOWN_TARGET';
      return `-- ETL Mapping Removed: ${removedSrcRef}.(${payload.source?.columns?.[0]}) -> ${removedTgtRef}.${payload.target?.column}`;
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
  try {
    // Try to create the project - if it already exists, backend may return it
    const response = await apiClient.post(
      `${ED}/projects`,
      { name: projectName },
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
 * Schedule a deployment
 * Tries v1 API first (POST /explore-design/{projectId}/deployments), falls back to legacy
 *
 * Backend endpoint (v1): POST /explore-design/{project_id}/deployments
 * Backend endpoint (legacy): POST /explore-design/deployments
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
  // Try v1 endpoint first: POST /explore-design/{projectId}/deployments
  try {
    const v1Body = {
      deployment_type: config.requires_approval ? 'with_approval' : 'scheduled',
      version_id: null,
      description: config.description || `${config.workflow_name} deployment`,
      scheduled_at: config.scheduled_date,
      config: {
        sql_queries: config.sql_queries || [],
        events: config.events.map(e => ({
          event_id: e.event_id,
          event_type: e.event_type,
          sql: generateEventSQL(e),
          target: e.target,
          payload: e.payload,
        })),
        deployment_method: config.deployment_method,
        created_by: config.created_by,
        approvers: config.requires_approval ? ['DATA_MODELER', 'DATA_ADMIN'] : [],
      },
    };

    const { data } = await apiClient.post(
      `${V1_EXPLORE}/${config.project_id}/deployments`,
      v1Body,
    );

    const deploymentId = data.deployment_id || data.id;
    return {
      schedule_id: deploymentId,
      status: config.requires_approval ? 'PENDING_APPROVAL' : 'SCHEDULED',
      scheduled_date: config.scheduled_date,
      message: data.message || 'Deployment created successfully',
      workflow_name: config.workflow_name,
      event_id: deploymentId,
      deployment_id: deploymentId,
    };
  } catch (v1Error: any) {
    console.warn('[scheduleDeploymentUnified] v1 API failed, falling back to legacy:', v1Error.message);
  }

  // Fallback to legacy endpoint

  // First, record all events to the backend using POST /explore-design/add-event
  const eventIds: string[] = [];
  for (const event of config.events) {
    try {
      const eventPayload = {
        project_id: config.project_id,
        event_type: event.event_type,
        event_details: {
          database: event.target?.database,
          schema: event.target?.schema,
          table: event.target?.table,
          column: event.target?.column,
          ...event.payload,
          sql: generateEventSQL(event),
        },
        module_type: config.module_type || 'explore-design',
      };

      const response = await apiClient.post(`${ED}/add-event`, eventPayload);
      eventIds.push(response.data.event_id || response.data.project_id || event.event_id);
    } catch (e: any) {
      const errorDetail = e.response?.data?.detail || e.message;
      console.warn(`Failed to record event ${event.event_id}:`, errorDetail);
      eventIds.push(event.event_id);
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

  // console.log('[scheduleDeploymentUnified] Creating scheduled deployment:', JSON.stringify(deploymentPayload, null, 2));

  const response = await apiClient.post(`${ED}/deployments`, deploymentPayload);

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

      const response = await apiClient.post(`${ED}/add-event`, eventPayload);

      recordedIds.push(response.data?.event_id || response.data?.project_id || event.event_id);
    } catch (error: any) {
      // Enhanced error logging
      console.error('[recordDesignEvents] Failed to record event:', {
        event_id: event.event_id,
        event_type: event.event_type,
        url: `${ED}/add-event`,
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
  try {
    const response = await apiClient.post(`${ED}/execute_queries`, queries);

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
 * Deploy events immediately
 * Tries v1 API first (POST /explore-design/{projectId}/deployments), falls back to legacy
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
  // Try v1 endpoint first: create + execute deployment
  try {
    const { data: createData } = await apiClient.post(
      `${V1_EXPLORE}/${projectId}/deployments`,
      {
        deployment_type: 'immediate',
        version_id: null,
        description: `Immediate deployment with ${events.length} events`,
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
      },
    );

    const deploymentId = createData.deployment_id || createData.id;

    // Execute the deployment via v1
    const { data: execData } = await apiClient.post(
      `${V1_EXPLORE}/${projectId}/deployments/${deploymentId}/execute`,
    );

    return {
      deployment_id: deploymentId,
      status: execData.status || 'success',
      results: execData.results || events.map(e => ({
        event_id: e.event_id,
        status: 'applied' as const,
        sql_executed: generateEventSQL(e),
      })),
      summary: execData.summary || {
        total: events.length,
        applied: events.length,
        failed: 0,
        skipped: 0,
      },
    };
  } catch (v1Error: any) {
    console.warn('[deployEventsImmediate] v1 API failed, falling back to legacy:', v1Error.message);
  }

  // Fallback to legacy endpoint
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

  try {
    const createResponse = await apiClient.post(`${ED}/deployments`, createPayload);

    const deploymentId = createResponse.data.deployment_id || createResponse.data.id;

    const executeResponse = await apiClient.post(
      `${ED}/deployments/${deploymentId}/execute`,
      { rollback_on_error: options?.rollback_on_error ?? true },
    );

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
  try {
    const params: Record<string, string> = {};
    if (projectId) params.project_id = projectId;
    const response = await apiClient.get(
      `${ED}/scheduled-deployments`,
      { params },
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
  const response = await apiClient.get(`${ED}/scheduled-deployments/${scheduleId}`);
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
  const response = await apiClient.post(
    `${ED}/scheduled-deployments/${scheduleId}/approve`,
    { comment },
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
  const response = await apiClient.post(
    `${ED}/scheduled-deployments/${scheduleId}/reject`,
    { reason },
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
  const response = await apiClient.post(
    `${ED}/scheduled-deployments/${scheduleId}/cancel`,
    { reason },
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
  const response = await apiClient.post(
    `${ED}/scheduled-deployments/${scheduleId}/reschedule`,
    {
      scheduled_date: newScheduledDate,
      reason,
    },
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
  const response = await apiClient.post(
    `${ED}/scheduled-deployments/${scheduleId}/execute-now`,
    { reason },
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
  const response = await apiClient.get(`${ED}/scheduled-deployments/${scheduleId}/logs`);
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
  const response = await apiClient.post(
    `${ED}/workflows`,
    {
      project_id: projectId,
      name,
      tasks,
      ...options,
    },
  );
  return response.data;
}

/**
 * Get workflow DAG
 * GET /explore-design/workflows/{workflow_id}/dag
 */
export async function getWorkflowDAG(workflowId: string): Promise<WorkflowDAG> {
  const response = await apiClient.get(`${ED}/workflows/${workflowId}/dag`);
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
  const response = await apiClient.post(
    `${ED}/workflows/${workflowId}/execute`,
    options || {},
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
  const response = await apiClient.get(
    `${ED}/workflows/${workflowId}/tasks/${taskId}/logs`,
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
  const response = await apiClient.post(
    `${ED}/workflows/${workflowId}/cancel`,
    { reason },
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
  const response = await apiClient.post(
    `${ED}/workflows/${workflowId}/tasks/${taskId}/retry`,
    {},
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
  const params: Record<string, string> = {};
  if (filters?.type) params.type = filters.type;
  if (filters?.database) params.database = filters.database;
  if (filters?.schema) params.schema = filters.schema;

  const response = await apiClient.get(`${ED}/policies`, { params });
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
  const response = await apiClient.post(
    `${ED}/policies/masking/apply`,
    {
      project_id: projectId,
      policy_name: policyName,
      target,
      create_event: createEvent ?? true,
    },
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
  const response = await apiClient.post(
    `${ED}/policies/masking/remove`,
    {
      project_id: projectId,
      target,
      create_event: createEvent ?? true,
    },
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
  const response = await apiClient.post(
    `${ED}/policies/rls/apply`,
    {
      project_id: projectId,
      policy_name: policyName,
      target,
      filter_column: filterColumn,
      create_event: createEvent ?? true,
    },
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
  const response = await apiClient.post(
    `${ED}/policies/detect-sensitive`,
    {
      tables,
      patterns: options?.patterns ?? ['email', 'ssn', 'phone', 'address', 'credit_card', 'dob'],
      sample_data: options?.sample_data ?? true,
      sample_size: options?.sample_size ?? 100,
    },
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
  const response = await apiClient.post(
    `${ED}/policies/tags/bulk-apply`,
    {
      project_id: projectId,
      applications,
      create_events: createEvents ?? true,
    },
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
  const response = await apiClient.post(`${ED}/policies/masking/create`, policy);
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
  const response = await apiClient.post(`${ED}/policies/rls/create`, policy);
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
  const response = await apiClient.get(`${ED}/projects/${projectId}/erd`);
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
  const response = await apiClient.put(`${ED}/projects/${projectId}/erd`, layout);
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
  const response = await apiClient.post(
    `${ED}/projects/${projectId}/erd/auto-layout`,
    {
      algorithm: options?.algorithm ?? 'dagre',
      direction: options?.direction ?? 'TB',
      node_spacing: options?.node_spacing ?? 100,
      rank_spacing: options?.rank_spacing ?? 150,
    },
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
  const response = await apiClient.post(
    `${ED}/projects/${projectId}/relationships`,
    {
      ...relationship,
      create_event: createEvent ?? true,
    },
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
  const response = await apiClient.delete(
    `${ED}/projects/${projectId}/relationships/${relationshipId}`,
    {
      data: { create_event: createEvent ?? true },
    },
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
  const params: Record<string, string> = {
    database: target.database,
    schema: target.schema,
    table: target.table,
    column: target.column,
  };
  if (options?.direction) params.direction = options.direction;
  if (options?.depth) params.depth = String(options.depth);

  const response = await apiClient.get(`${ED}/lineage/column`, { params });
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
  const response = await apiClient.post(`${ED}/impact-analysis`, { changes });
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
  const payload = {
    project_id: data.project_id,
    database: data.database,
    schema: data.schema,
    table: data.table,
    columns: data.columns,
  };

  try {
    const response = await apiClient.post(`${ED}/primary-key/add`, payload);
    return response.data.data || response.data;
  } catch (error: any) {
    console.error('ADD Primary Key Error:', {
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
 * Generic table management helper (rename, add/drop column, change type, FK, etc.)
 */
async function manageTable(payload: ManageTableRequest): Promise<any> {
  const response = await apiClient.get(`${ED}/guided/manage_table`, { params: payload });
  return response.data;
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

  // console.log('🚀 Executing event action:', { type, target, payload });

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
  const response = await apiClient.post(
    `${ED}/column/preview`,
    {
      database,
      schema,
      table,
      column,
      sample_size: sampleSize,
    },
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
  const response = await apiClient.post(
    `${ED}/table/preview`,
    {
      database,
      schema,
      table,
      limit,
      offset,
    },
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
  const response = await apiClient.post(
    `${ED}/column/profile`,
    {
      database,
      schema,
      table,
      column,
    },
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
  const response = await apiClient.post(
    `${ED}/table/profile`,
    {
      database,
      schema,
      table,
    },
  );
  return response.data;
}

/**
 * Mark column as sensitive and optionally create event
 * POST /explore-design/column/mark-sensitive
 */
export async function markColumnSensitive(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  column: string,
  sensitiveType: string,
  createEvent: boolean = true
): Promise<{ success: boolean; event_id?: string }> {
  const response = await apiClient.post(
    `${ED}/column/mark-sensitive`,
    {
      project_id: projectId,
      database,
      schema,
      table,
      column,
      sensitive_type: sensitiveType,
      create_event: createEvent,
    },
  );
  return response.data;
}

/**
 * Exclude/include column from modeling
 * POST /explore-design/column/exclude
 */
export async function setColumnExclusion(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  column: string,
  excluded: boolean,
  reason?: string
): Promise<{ success: boolean; event_id?: string }> {
  const response = await apiClient.post(
    `${ED}/column/exclude`,
    {
      project_id: projectId,
      database,
      schema,
      table,
      column,
      excluded,
      reason,
    },
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
  const response = await apiClient.post(`${ED}/fetch_relationships`, { database, schema });
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
  const response = await apiClient.post(
    `${ED}/add-event`,
    {
      project_id: projectId,
      event_id: eventId,
      event_type: eventType,
      target,
      payload,
      module_type: moduleType,
    },
  );
  return response.data;
}

/**
 * Get all events for a project
 *
 * @param projectId - Project ID
 * @param status - Optional filter by status (pending, validated, applied, failed)
 * @param eventType - Optional filter by event type
 * @returns Promise with events list and summary
 */
export async function getDesignEvents(
  projectId: string,
  status?: string,
  eventType?: string
): Promise<{
  project_id: string;
  events: Array<{
    event_id: string;
    event_type: string;
    target: {
      database: string;
      schema: string;
      table: string;
      column?: string;
    };
    payload: Record<string, any>;
    status: string;
    created_at: string;
  }>;
  summary: {
    total: number;
    pending: number;
    validated: number;
    failed: number;
    applied: number;
  };
}> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (eventType) params.event_type = eventType;

  const response = await apiClient.get(
    `${ED}/projects/${projectId}/events`,
    { params },
  );
  return response.data;
}

/**
 * Validate events before deployment
 *
 * @param projectId - Project ID
 * @param eventIds - List of event IDs to validate
 * @param dryRun - If true, only validate without marking as validated
 * @returns Promise with validation results
 */
export async function validateDesignEvents(
  projectId: string,
  eventIds: string[],
  dryRun: boolean = true
): Promise<{
  results: Array<{
    event_id: string;
    valid: boolean;
    sql?: string;
    error?: string;
    warnings?: string[];
  }>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
}> {
  const response = await apiClient.post(
    `${ED}/validate-events`,
    {
      project_id: projectId,
      event_ids: eventIds,
      dry_run: dryRun,
    },
  );
  return response.data;
}

/**
 * Create a deployment record
 *
 * @param projectId - Project ID
 * @param version - Version string
 * @param deploymentType - Type (immediate, scheduled, conditional)
 * @param events - List of event items to deploy
 * @param rollbackOnError - Whether to rollback all if any fails
 * @param createdBy - User who created deployment
 * @returns Promise with deployment info
 */
export async function createDesignDeployment(
  projectId: string,
  version: string,
  deploymentType: string,
  events: Array<{
    event_id: string;
    event_type: string;
    sql: string;
    target: {
      database: string;
      schema: string;
      table: string;
      column?: string;
    };
    payload: Record<string, any>;
  }>,
  rollbackOnError: boolean = true,
  createdBy?: string
): Promise<{
  deployment_id: string;
  status: string;
  created_at: string;
}> {
  const response = await apiClient.post(
    `${ED}/deployments`,
    {
      project_id: projectId,
      version,
      deployment_type: deploymentType,
      events,
      rollback_on_error: rollbackOnError,
      created_by: createdBy,
    },
  );
  return response.data;
}

/**
 * Execute a deployment
 *
 * @param deploymentId - Deployment ID to execute
 * @param executionMode - Mode (immediate, dry_run)
 * @param dryRun - If true, don't actually execute SQL
 * @returns Promise with execution results
 */
export async function executeDesignDeployment(
  deploymentId: string,
  executionMode: string = 'immediate',
  dryRun: boolean = false
): Promise<{
  deployment_id: string;
  status: string;
  results: Array<{
    event_id: string;
    status: string;
    sql_executed?: string;
    execution_time_ms?: number;
    error?: string;
  }>;
  summary: {
    applied: number;
    failed: number;
    skipped: number;
  };
}> {
  const response = await apiClient.post(
    `${ED}/deployments/${deploymentId}/execute`,
    {
      execution_mode: executionMode,
      dry_run: dryRun,
    },
  );
  return response.data;
}

/**
 * Create and immediately execute a deployment
 *
 * @param projectId - Project ID
 * @param events - List of event items to deploy
 * @param rollbackOnError - Whether to rollback all if any fails
 * @param createdBy - User who created deployment
 * @returns Promise with deployment results
 */
export async function immediateDesignDeploy(
  projectId: string,
  events: Array<{
    event_id: string;
    event_type: string;
    sql: string;
    target: {
      database: string;
      schema: string;
      table: string;
      column?: string;
    };
    payload: Record<string, any>;
  }>,
  rollbackOnError: boolean = true,
  createdBy?: string
): Promise<{
  deployment_id: string;
  status: string;
  results: Array<{
    event_id: string;
    status: string;
    sql_executed?: string;
    execution_time_ms?: number;
    error?: string;
  }>;
  summary: {
    applied: number;
    failed: number;
    skipped: number;
  };
}> {
  const response = await apiClient.post(
    `${ED}/deploy/immediate`,
    {
      project_id: projectId,
      events,
      rollback_on_error: rollbackOnError,
      created_by: createdBy,
    },
  );
  return response.data;
}

/**
 * Schedule a deployment for future execution
 *
 * @param workflowName - Name of the workflow/deployment
 * @param scheduledDate - ISO format datetime for scheduled execution
 * @param deploymentMethod - Method (REPLACE_EXISTING, NEW_RELEASE, TEST)
 * @param projectId - Project ID
 * @param events - List of event items to deploy
 * @param createdBy - User who created the schedule
 * @param description - Optional description
 * @param moduleType - Module type (default: explore-design)
 * @param requiresApproval - Whether approval is required
 * @returns Promise with schedule info
 */
export async function scheduleDesignDeployment(
  workflowName: string,
  scheduledDate: string,
  deploymentMethod: string,
  projectId: string,
  events: Array<{
    event_id: string;
    event_type: string;
    sql: string;
    target: {
      database: string;
      schema: string;
      table: string;
      column?: string;
    };
    payload: Record<string, any>;
  }>,
  createdBy: string,
  description?: string,
  moduleType: string = 'explore-design',
  requiresApproval: boolean = false
): Promise<{
  schedule_id: string;
  status: string;
  workflow_name: string;
  scheduled_date: string;
  created_at: string;
}> {
  const response = await apiClient.post(
    `${ED}/schedule-deployment`,
    {
      workflow_name: workflowName,
      scheduled_date: scheduledDate,
      deployment_method: deploymentMethod,
      project_id: projectId,
      events,
      created_by: createdBy,
      description,
      module_type: moduleType,
      requires_approval: requiresApproval,
    },
  );
  return response.data;
}

/**
 * List scheduled deployments
 *
 * @param projectId - Optional filter by project
 * @param status - Optional filter by status
 * @param limit - Maximum number of results
 * @returns Promise with list of scheduled deployments
 */
export async function listScheduledDesignDeployments(
  projectId?: string,
  status?: string,
  limit: number = 50
): Promise<{
  deployments: Array<{
    schedule_id: string;
    workflow_name: string;
    scheduled_date: string;
    status: string;
    project_id: string;
    created_by: string;
    created_at: string;
  }>;
  total: number;
}> {
  const params: Record<string, string> = { limit: limit.toString() };
  if (projectId) params.project_id = projectId;
  if (status) params.status = status;

  const response = await apiClient.get(`${ED}/scheduled-deployments`, { params });
  return response.data;
}

/**
 * Execute a scheduled deployment
 *
 * @param scheduleId - Schedule ID to execute
 * @returns Promise with execution results
 */
export async function executeScheduledDesignDeployment(
  scheduleId: string
): Promise<{
  success: boolean;
  schedule_id: string;
  status: string;
  summary: {
    applied: number;
    failed: number;
  };
  results: Array<{
    event_id: string;
    status: string;
    error?: string;
  }>;
}> {
  const response = await apiClient.post(
    `${ED}/scheduled-deployments/${scheduleId}/execute`,
    {},
  );
  return response.data;
}

/**
 * Rollback a deployment
 *
 * @param deploymentId - Deployment ID to rollback
 * @param reason - Reason for rollback
 * @returns Promise with rollback status
 */
export async function rollbackDesignDeployment(
  deploymentId: string,
  reason: string
): Promise<{
  success: boolean;
  rollback_deployment_id?: string;
  message: string;
}> {
  const response = await apiClient.post(
    `${ED}/deployments/${deploymentId}/rollback`,
    {
      deployment_id: deploymentId,
      reason,
    },
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

/**
 * Deploy events to a version-specific schema
 *
 * This is the main deployment function that:
 * 1. Creates the target schema (cp_data360.<version_name>) if it doesn't exist
 * 2. Executes all event SQL statements in order
 * 3. Stores rollback SQL for potential future rollback
 * 4. Handles errors with optional rollback of applied changes
 *
 * @param request - Deployment request with version name and events
 * @returns Promise with deployment results
 */
export async function deployWithVersion(
  request: DeployWithVersionRequest
): Promise<DeployWithVersionResponse> {
  const response = await apiClient.post(
    `${ED}/deploy/version`,
    {
      project_id: request.project_id,
      version_name: request.version_name,
      events: request.events.map(e => ({
        event_id: e.event_id,
        event_type: e.event_type,
        sql: e.sql,
        rollback_sql: e.rollback_sql,
        target: {
          database: e.target.database,
          schema: e.target.schema,
          table: e.target.table,
          column: e.target.column,
        },
        payload: e.payload,
      })),
      rollback_on_error: request.rollback_on_error ?? true,
      created_by: request.created_by,
      dry_run: request.dry_run ?? false,
    },
  );
  return response.data;
}

/**
 * Rollback a version deployment using stored rollback SQLs
 *
 * @param deploymentId - Deployment ID to rollback
 * @param reason - Reason for rollback
 * @returns Promise with rollback status
 */
export async function rollbackVersionDeployment(
  deploymentId: string,
  reason: string
): Promise<{
  success: boolean;
  rollback_deployment_id?: string;
  message: string;
  results?: Array<{
    sql: string;
    status: 'success' | 'failed';
    error?: string;
  }>;
  target_database?: string;
  target_schema?: string;
}> {
  const response = await apiClient.post(
    `${ED}/deployments/${deploymentId}/rollback-version`,
    {
      deployment_id: deploymentId,
      reason,
    },
  );
  return response.data;
}

// ============================================================================
// NEW API v1 — Re-export from services/api/
// These use /projects/* and /explore-design/* endpoints
// ============================================================================

export * as projectsApi from '@/app/services/api/projectsApi';
export * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
export type {
  // Unified Project types
  ProjectType as V1ProjectType,
  ProjectStatus as V1ProjectStatus,
  Project as V1Project,
  ProjectListResponse as V1ProjectListResponse,
  CreateProjectRequest as V1CreateProjectRequest,
  CreateProjectResponse as V1CreateProjectResponse,
  UpdateProjectRequest as V1UpdateProjectRequest,
  ListProjectsParams as V1ListProjectsParams,
  ProjectVersion as V1ProjectVersion,
  CreateVersionRequest as V1CreateVersionRequest,
  VersionListResponse as V1VersionListResponse,
  ProjectDeployment as V1ProjectDeployment,
  CreateDeploymentRequest as V1CreateDeploymentRequest,
  ListDeploymentsParams as V1ListDeploymentsParams,
  RejectDeploymentRequest as V1RejectDeploymentRequest,
  ExecuteDeploymentRequest as V1ExecuteDeploymentRequest,
  ProjectRun as V1ProjectRun,
  StartRunRequest as V1StartRunRequest,
  Contributor as V1Contributor,
  AddContributorRequest as V1AddContributorRequest,
  // Explore Design v1 types
  UnifiedDeploymentType as V1DeploymentType,
  ExploreDeployment as V1ExploreDeployment,
  CreateExploreDeploymentRequest as V1CreateExploreDeploymentRequest,
  ExploreDeploymentListResponse as V1ExploreDeploymentListResponse,
  QuickDeployResponse as V1QuickDeployResponse,
  CreateScheduleRequest as V1CreateScheduleRequest,
  Schedule as V1Schedule,
  ScheduleListResponse as V1ScheduleListResponse,
  SaveModelRequest as V1SaveModelRequest,
  SaveModelResponse as V1SaveModelResponse,
  ModelVersionListResponse as V1ModelVersionListResponse,
  DDLAction as V1DDLAction,
  CreateDDLActionRequest as V1CreateDDLActionRequest,
  DDLActionListResponse as V1DDLActionListResponse,
  SchemaClone as V1SchemaClone,
  SchemaCloneRequest as V1SchemaCloneRequest,
  WizardState as V1WizardState,
  SaveStateRequest as V1SaveStateRequest,
  ConfigTemplate as V1ConfigTemplate,
} from '@/app/services/api/types';

// === Deployment Pipeline (14 endpoints) ===

export async function dryRunDDL(projectId: string, data: { database: string; schema: string; actions: any[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ddl-actions/dry-run`, data);
  return res.data;
}

export async function batchAddDDLActions(projectId: string, data: { actions: Array<{ ddl_sql: string; ddl_type?: string; priority?: number; target_table?: string; description?: string }> }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ddl-actions/batch`, data);
  return res.data;
}

export async function preCheckDeployment(projectId: string, data: { database: string; schema: string; warehouse?: string }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ddl-actions/pre-check`, data);
  return res.data;
}

export async function verifyDeployment(projectId: string, deploymentId: string, data: { database: string; schema: string; expected_tables?: string[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/deployments/${deploymentId}/verify`, data);
  return res.data;
}

export async function checkTypeCompatibility(projectId: string, params: { database: string; schema: string; source_table: string; source_column: string; target_table: string; target_column: string }) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/validate/type-compatibility`, { params });
  return res.data;
}

export async function analyzeImpact(projectId: string, data: { database: string; schema: string; targets: string[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/validate/impact-analysis`, data);
  return res.data;
}

export async function runQualityCheck(projectId: string, data: { source_table: string; gates: any[]; where_clause?: string }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ingestion/quality-check`, data);
  return res.data;
}

export async function previewIngestionSQL(projectId: string, data: { source_table: string; target_table: string; mode: string; column_mappings?: any[]; where_clause?: string; scd_config?: any }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ingestion/preview-sql`, data);
  return res.data;
}

export async function dryRunIngestion(projectId: string, data: { source_table: string; target_table: string; mode: string; column_mappings?: any[]; where_clause?: string }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ingestion/dry-run`, data);
  return res.data;
}

export async function getWatermark(projectId: string, table: string, column: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/ingestion/watermark`, { params: { table, column } });
  return res.data;
}

export async function resetWatermark(projectId: string, data: { table: string; column: string; reset_to?: string }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ingestion/watermark/reset`, data);
  return res.data;
}

export async function getEventConflicts(projectId: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/events/conflicts`);
  return res.data;
}

export async function saveEventTemplate(projectId: string, data: { name: string; description: string; events: any[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/event-templates`, data);
  return res.data;
}

export async function listEventTemplates(projectId: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/event-templates`);
  return res.data;
}

export async function applyEventTemplate(projectId: string, templateId: string) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/event-templates/${templateId}/apply`);
  return res.data;
}

// === AI Intelligence (15 endpoints) ===

export async function getColumnClassification(projectId: string, database: string, schema: string, table: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/tables/${database}/${schema}/${table}/ai/column-classification`);
  return res.data;
}

export async function discoverRelationships(projectId: string, data: { tables: any[]; existing_relations?: any[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/discover-relationships`, data);
  return res.data;
}

export async function getSchemaHealth(projectId: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/ai/schema-health`);
  return res.data;
}

export async function suggestColumns(projectId: string, data: { table_name: string; existing_tables?: string[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/suggest-columns`, data);
  return res.data;
}

export async function checkNaming(projectId: string, data: { names: string[]; object_type?: string }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/check-naming`, data);
  return res.data;
}

export async function getTypeOptimization(projectId: string, database: string, schema: string, table: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/tables/${database}/${schema}/${table}/ai/type-optimization`);
  return res.data;
}

export async function getSCDRecommendation(projectId: string, database: string, schema: string, table: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/tables/${database}/${schema}/${table}/ai/scd-recommendation`);
  return res.data;
}

export async function getWarehouseSizing(warehouse?: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/ai/warehouse-sizing`, { params: warehouse ? { warehouse } : {} });
  return res.data;
}

export async function getClusteringSuggestion(projectId: string, database: string, schema: string, table: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/tables/${database}/${schema}/${table}/ai/clustering-suggestion`);
  return res.data;
}

export async function getMaterializationStrategy(projectId: string, database: string, schema: string, table: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/tables/${database}/${schema}/${table}/ai/materialization-strategy`);
  return res.data;
}

export async function getIngestionRecommendation(projectId: string, database: string, schema: string, table: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/tables/${database}/${schema}/${table}/ai/ingestion-recommendation`);
  return res.data;
}

export async function scoreDeploymentRisk(projectId: string, data: { pending_events: any[] }) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/deployment-risk`, data);
  return res.data;
}

export async function getOptimalSchedule(warehouse?: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/ai/optimal-schedule`, { params: warehouse ? { warehouse } : {} });
  return res.data;
}

export async function submitAIFeedback(data: { suggestion_id: string; suggestion_type: string; accepted: boolean }) {
  const res = await apiClient.post(`${V1_EXPLORE}/ai/feedback`, data);
  return res.data;
}

export async function getAISavingsSummary() {
  const res = await apiClient.get(`${V1_EXPLORE}/ai/savings-summary`);
  return res.data;
}

// === Data Engineering Actions ===

// Dynamic Tables
export async function listDynamicTables(database: string, schema: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/dynamic-tables`, { params: { database, schema } });
  return res.data;
}

export async function suspendDynamicTable(name: string, database: string, schema: string) {
  const res = await apiClient.post(`${V1_EXPLORE}/dynamic-tables/${name}/suspend`, { database, schema });
  return res.data;
}

export async function resumeDynamicTable(name: string, database: string, schema: string) {
  const res = await apiClient.post(`${V1_EXPLORE}/dynamic-tables/${name}/resume`, { database, schema });
  return res.data;
}

export async function refreshDynamicTable(name: string, database: string, schema: string) {
  const res = await apiClient.post(`${V1_EXPLORE}/dynamic-tables/${name}/refresh`, { database, schema });
  return res.data;
}

export async function dropDynamicTable(name: string, database: string, schema: string) {
  const res = await apiClient.delete(`${V1_EXPLORE}/dynamic-tables/${name}`, { params: { database, schema } });
  return res.data;
}

// Streams
export async function listStreams(database: string, schema: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/streams`, { params: { database, schema } });
  return res.data;
}

export async function getStreamData(name: string, database: string, schema: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/streams/${name}/data`, { params: { database, schema } });
  return res.data;
}

export async function dropStream(name: string, database: string, schema: string) {
  const res = await apiClient.delete(`${V1_EXPLORE}/streams/${name}`, { params: { database, schema } });
  return res.data;
}

// Alerts
export async function listAlerts(database: string, schema: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/alerts`, { params: { database, schema } });
  return res.data;
}

export async function dropAlert(name: string, database: string, schema: string) {
  const res = await apiClient.delete(`${V1_EXPLORE}/alerts/${name}`, { params: { database, schema } });
  return res.data;
}

// =====================================
// Smart Key & Embedding Intelligence
// =====================================

// Smart Key & Embedding functions: detectPrimaryKeys, detectForeignKeys, suggestClusteringKeys
// are defined earlier in this file (lines 208, 229, 249) — no duplicates needed here.

/** Semantic search across table data using vector similarity */
export async function semanticSearch(
  query: string,
  table: string,
  textColumn: string,
  embeddingColumn?: string,
  limit?: number
) {
  const res = await apiClient.post(`${V1_EXPLORE}/smart/semantic-search`, {
    query,
    table,
    text_column: textColumn,
    embedding_column: embeddingColumn,
    limit: limit ?? 10,
  });
  return res.data;
}

/** Generate embedding vector for text */
export async function embedText(text: string, model?: string) {
  const res = await apiClient.post(`${V1_EXPLORE}/smart/embed`, {
    text,
    model: model ?? 'e5-base-v2',
  });
  return res.data;
}
