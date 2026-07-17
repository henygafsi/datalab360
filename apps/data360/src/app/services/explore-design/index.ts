/** Explore & Design API: metadata, events, deployments. Data journey: UI → service → /explore-design/guided/*. */
import apiClient from '@/lib/api-client';
import { toMessage } from '@/lib/error-messages';

/** Explore-design prefix — unified to match backend router at /explore-design */
const ED = '/explore-design';
/** Alias for V1 explore-design prefix (same as ED) */
const V1_EXPLORE = '/explore-design';

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

export type EventStatus = 'pending' | 'validated' | 'failed' | 'applied' | 'approved' | 'rejected';

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
  try {
    const response = await apiClient.get(
      `${ED}/smart/detect-fk`,
      {
        params: {
          source_tables: sourceTables.map(t => `${t.database}.${t.schema}.${t.table}`).join(','),
          target_tables: targetTables.map(t => `${t.database}.${t.schema}.${t.table}`).join(','),
          sample_size: options?.sample_size ?? 1000,
        },
      },
    );
    return response.data;
  } catch (error: any) {
    console.error('[detectRelations] Error:', error?.response?.status, error?.message);
    return { detected_relations: [], suggestions: [] };
  }
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
  try {
    const response = await apiClient.get(
      `${ED}/smart/detect-pk`,
      {
        params: {
          tables: tables.map(t => `${t.database}.${t.schema}.${t.table}`).join(','),
        },
      },
    );
    return response.data;
  } catch (error: any) {
    console.error('[detectPrimaryKeys] Error:', error?.response?.status, error?.message);
    return { detections: [] };
  }
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
    `/projects/${projectId}/events`,
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
    // Normalize backend PROJECT_EVENTS rows into the DesignEvent shape the UI
    // renders. The backend stores STATUS uppercased ('PENDING'/'SUCCESS'/…) and
    // nests target/payload inside DETAILS — without this mapping every
    // consumer's `status === 'pending'` filter matched nothing and targets
    // rendered blank ("no changes" in the Release tab despite traced events).
    const STATUS_MAP: Record<string, EventStatus> = {
      PENDING: 'pending',
      VALIDATED: 'validated',
      SUCCESS: 'applied',
      APPLIED: 'applied',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      FAILED: 'failed',
      ERROR: 'failed',
    };
    const events: DesignEvent[] = (data.events || []).map((raw: any) => {
      const details = raw.details && typeof raw.details === 'object' ? raw.details : {};
      const target = details.target && typeof details.target === 'object'
        ? details.target
        : {
            database: details.database ?? raw.target?.database ?? '',
            schema: details.schema ?? details.schema_name ?? raw.target?.schema ?? '',
            table: details.table ?? raw.target?.table ?? '',
            ...(details.column ? { column: details.column } : {}),
          };
      const upper = String(raw.status ?? '').toUpperCase();
      return {
        event_id: raw.event_id,
        event_type: raw.event_type,
        target,
        payload: details.payload && typeof details.payload === 'object' ? details.payload : details,
        status: STATUS_MAP[upper] ?? (String(raw.status ?? '').toLowerCase() as EventStatus),
        created_at: raw.timestamp ?? raw.created_at ?? '',
        user_id: raw.username ?? raw.user_id,
        error: raw.error_message ?? raw.error,
      };
    });
    return {
      project_id: data.project_id || projectId,
      events,
      summary: {
        total: events.length,
        pending: events.filter((e) => e.status === 'pending').length,
        validated: events.filter((e) => e.status === 'validated').length,
        failed: events.filter((e) => e.status === 'failed').length,
      },
    };
  } catch {
    // Fallback to cross-module endpoint
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.event_type) params.event_type = filters.event_type;

    const response = await apiClient.get(
      `/projects/${projectId}/events`,
      { params },
    );
    return response.data;
  }
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
    `${ED}/${projectId}/validate-events`,
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
 * Deploy validated events.
 *
 * Wired to the live 2-step deployment pipeline (there is no single deploy-events
 * route): create a deployment carrying the event_ids, then execute it.
 *   1) POST /explore-design/{projectId}/deployments           (createDeployment)
 *   2) POST /explore-design/{projectId}/deployments/{id}/execute (executeDeploymentV1)
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
  // Step 1 — create the deployment with 'immediate' type so the backend sets
  // status=APPROVED; step 2 (executeDeploymentV1) is still the explicit trigger.
  // 'staged' is NOT a valid DeploymentType enum value on the backend — it 422s.
  const created = await createDeployment(projectId, '1.0', 'immediate', eventIds, {
    rollback_on_error: options?.rollback_on_error ?? true,
  });
  // Step 2 — execute it through the registered v1 route.
  const execResult: any = await executeDeploymentV1(projectId, created.deployment_id);
  // Normalize the execute envelope back into this function's return shape so
  // existing callers keep working.
  return {
    deployment_id: created.deployment_id,
    status: execResult?.status ?? 'completed',
    results: execResult?.results ?? [],
    summary: execResult?.summary ?? { applied: 0, failed: 0, skipped: 0 },
  };
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
 *
 * @deprecated Superseded by api/exploreDesignApi.ts equivalents; only referenced by
 * the api-health diagnostic harness. The primary path
 * (GET /projects) is valid, but the catch-fallback `/explore-design/projects` has
 * no backend route. Do not add new callers.
 */
export async function getExploreProjects(): Promise<ExploreProjectsResponse> {
  // Try v1 endpoint first
  try {
    const { data } = await apiClient.get('/projects', {
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
    // Fallback: same unified list without the project_type filter. (Was the
    // non-existent `${ED}/projects` — that path collides with GET /explore-design/{id}.)
    const response = await apiClient.get('/projects');
    return response.data;
  }
}

/**
 * Create a new explore project
 * Tries v1 API first (POST /explore-design), falls back to legacy
 *
 * @deprecated Superseded by api/exploreDesignApi.ts equivalents; only referenced by
 * the api-health diagnostic harness. The primary path
 * (POST /explore-design) is valid, but the catch-fallback `/explore-design/projects`
 * has no backend route. Do not add new callers.
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
    // Fallback: the create route IS POST /explore-design (empty path on the
    // prefixed router). The old `${ED}/projects` had no backend route.
    const response = await apiClient.post(
      ED,
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
  const response = await apiClient.get(`${ED}/${projectId}/state`);
  return response.data;
}

/**
 * Save project state
 */
export async function saveProjectState(
  projectId: string,
  state: Partial<ProjectState>
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.put(`${ED}/${projectId}/state`, state);
  return response.data;
}

/**
 * Create a new project
 *
 * @deprecated no caller + no backend route: the sole path
 * `/explore-design/projects` is absent from the backend, and the only
 * reference is the api-health diagnostic harness. The live project-creation flow
 * uses api/exploreDesignApi.ts (POST /explore-design) and mapping/createProject.ts.
 */
export async function createProject(
  name: string,
  tables?: TableReference[]
): Promise<{ project_id: string; name: string }> {
  const response = await apiClient.post(
    ED,
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
// TODO: backend endpoint not implemented — event-templates exist separately per project
export async function getTemplates(): Promise<ConfigTemplate[]> {
  // No backend route — config-templates are not a backend concept (event-templates
  // exist separately, per-project). Throw rather than returning an empty array that
  // is indistinguishable from a genuinely-empty list. Gate the UI with useActionGate.
  throw new Error('[getTemplates] not implemented — no backend route');
}

/**
 * Save a configuration template
 */
// TODO: backend endpoint not implemented
export async function saveTemplate(
  template: Omit<ConfigTemplate, 'id'>
): Promise<{ template_id: string; message: string }> {
  // No backend route. Don't fabricate a success envelope.
  throw new Error('[saveTemplate] not implemented — no backend route');
}

/**
 * Apply template to tables
 */
// TODO: backend endpoint not implemented
export async function applyTemplate(
  templateId: string,
  projectId: string,
  tables: TableReference[]
): Promise<{ success: boolean; applied_to: number; events_created: number }> {
  // No backend route. Don't fabricate a success envelope.
  throw new Error('[applyTemplate] not implemented — no backend route');
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
// TODO: backend endpoint not implemented
export async function detectSchemaChanges(
  projectId: string
): Promise<{ last_sync: string; changes: SchemaChange }> {
  // No backend route. Don't return a fabricated "no changes" payload — that reads
  // as a successful "schema is in sync" result when nothing was actually checked.
  throw new Error('[detectSchemaChanges] not implemented — no backend route');
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
    `${ED}/${projectId}/deployments`,
    {
      project_id: projectId,
      version,
      // Backend (FastAPI) requires `deployment_type`; sending only `type` 400s
      // with "deployment_type: Field required" → the create step (and thus the
      // whole deploy) silently failed. Send both for compatibility.
      deployment_type: type,
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
// TODO: backend endpoint not implemented — no single-deployment GET route exists
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
  // No single-deployment GET route exists. Don't return a fabricated draft
  // deployment — list deployments via listProjectDeploymentsV1 instead.
  throw new Error(
    '[getDeployment] not implemented — no single-deployment GET route; use listProjectDeploymentsV1(projectId)'
  );
}

/**
 * Execute a deployment.
 *
 * @deprecated DIVERGENT URL SHAPE — do not use in the explore-design deployment
 * UI. Use `executeDeploymentV1(projectId, deploymentId)` instead which hits
 * `POST /explore-design/{projectId}/deployments/{deploymentId}/execute`.
 * This stub returns a no-op response; signature kept for backward-compat.
 */
// TODO: backend endpoint requires projectId — use executeDeploymentV1 instead
export async function executeDeployment(
  deploymentId: string,
  options?: { execution_mode?: 'immediate' | 'dry_run'; dry_run?: boolean }
): Promise<{
  deployment_id: string;
  status: DeploymentStatus;
  execution_started: string;
}> {
  // This signature lacks projectId, which the registered route requires
  // (POST /explore-design/{projectId}/deployments/{deploymentId}/execute).
  // It cannot be wired in place. Throw instead of returning a fake "failed"
  // envelope; callers must move to executeDeploymentV1(projectId, deploymentId).
  throw new Error(
    '[executeDeployment] not implemented at this signature — use executeDeploymentV1(projectId, deploymentId)'
  );
}

/**
 * Rollback a deployment
 */
// TODO: backend endpoint not implemented — use POST /projects/{projectId}/rollback via projectsApi
export async function rollbackDeployment(
  deploymentId: string,
  targetVersion: string,
  reason: string
): Promise<{ success: boolean; message: string; rollback_deployment_id?: string }> {
  // No deployment-scoped rollback route. The supported path is project-scoped
  // (projectsApi.rollbackProject(projectId, { target_version_id })), which this
  // deployment-id-only signature can't reach. Throw rather than report a fake
  // failure so callers don't believe a rollback was attempted.
  throw new Error(
    '[rollbackDeployment] not implemented — use projectsApi.rollbackProject(projectId, { target_version_id })'
  );
}

/**
 * List deployments for a project.
 *
 * @deprecated Use `listProjectDeploymentsV1` instead. Path corrected to
 * `GET /explore-design/{projectId}/deployments`.
 */
export async function listDeployments(
  projectId: string,
  filters?: { status?: DeploymentStatus; limit?: number }
): Promise<{ deployments: Deployment[]; total: number }> {
  const params: Record<string, string> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.limit) params.limit = String(filters.limit);

  const response = await apiClient.get(
    `${ED}/${projectId}/deployments`,
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
// TODO: backend endpoint not implemented — versions are created via the deployment flow in the projects module
export async function createVersion(
  projectId: string,
  versionType: VersionType,
  changelogSummary: string,
  snapshotEvents?: boolean
): Promise<{ version_id: string; version: string; previous_version?: string }> {
  // No backend route — versions are created as a side effect of the deployment
  // flow. Throw rather than return an empty version_id that callers would treat
  // as a successfully-created version.
  throw new Error('[createVersion] not implemented — versions are created via the deployment flow');
}

/**
 * List versions for a project
 */
export async function listVersions(projectId: string): Promise<{ versions: Version[] }> {
  const response = await apiClient.get(`${ED}/${projectId}/versions`);
  return response.data;
}

/**
 * Get version details
 */
// TODO: backend endpoint not implemented — no single-version detail route
export async function getVersion(versionId: string): Promise<Version & { snapshot: any }> {
  // No single-version detail route. Don't fabricate an empty draft version.
  throw new Error('[getVersion] not implemented — no version-detail route; list via listVersions(projectId)');
}

/**
 * Compare two versions.
 * Wired to the live route: GET /explore-design/versions/{from_version_id}/compare/{to_version_id}
 * (lifecycle_router api_compare_versions). The earlier "no comparison route"
 * comment was stale — the route exists with this exact signature.
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
// TODO: backend endpoint not implemented
export async function publishVersion(versionId: string): Promise<{ success: boolean; published_at: string }> {
  // No backend route. Don't fabricate a result envelope.
  throw new Error('[publishVersion] not implemented — no backend route');
}

/**
 * Archive a version
 */
// TODO: backend endpoint not implemented
export async function archiveVersion(versionId: string): Promise<{ success: boolean; message: string }> {
  // No backend route. Don't fabricate a result envelope.
  throw new Error('[archiveVersion] not implemented — no backend route');
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
// TODO: backend endpoint not implemented — approval workflow uses deployment approve/reject routes
export async function getPendingApprovals(): Promise<{
  pending: ApprovalRequest[];
  total: number;
}> {
  // No backend route — the approval workflow is deployment-scoped
  // (approve/rejectDeploymentV1). Throw rather than return an empty list that
  // looks like "no pending approvals".
  throw new Error('[getPendingApprovals] not implemented — approvals are deployment-scoped (approveDeploymentV1)');
}

/**
 * Get approval details
 */
// TODO: backend endpoint not implemented
export async function getApprovalDetails(approvalId: string): Promise<ApprovalRequest> {
  // No backend route. Don't fabricate an empty approval-request object.
  throw new Error('[getApprovalDetails] not implemented — no backend route');
}

/**
 * Approve a request
 */
// TODO: backend endpoint not implemented — use approveDeploymentV1(projectId, deploymentId) instead
export async function approveRequest(
  approvalId: string,
  comment?: string
): Promise<{ success: boolean; deployment_status: string }> {
  // This approval-id-only signature can't reach the registered project+deployment
  // scoped route. Throw rather than report a fake failure; callers must use
  // approveDeploymentV1(projectId, deploymentId).
  throw new Error('[approveRequest] not implemented at this signature — use approveDeploymentV1(projectId, deploymentId)');
}

/**
 * Reject a request
 */
// TODO: backend endpoint not implemented — use rejectDeploymentV1(projectId, deploymentId, reason) instead
export async function rejectRequest(
  approvalId: string,
  comment: string,
  requiredChanges?: Array<{ type: string; table?: string; column?: string }>
): Promise<{ success: boolean; message: string }> {
  // This approval-id-only signature can't reach the registered project+deployment
  // scoped route. Throw rather than report a fake failure; callers must use
  // rejectDeploymentV1(projectId, deploymentId, reason).
  throw new Error('[rejectRequest] not implemented at this signature — use rejectDeploymentV1(projectId, deploymentId, reason)');
}

/**
 * Add comment to approval request
 */
// TODO: backend endpoint not implemented
export async function addApprovalComment(
  approvalId: string,
  comment: string
): Promise<{ success: boolean; comment_id: string }> {
  // No backend route. Don't fabricate a result envelope.
  throw new Error('[addApprovalComment] not implemented — no backend route');
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
// TODO: backend endpoint not implemented — Snowpipe config lives in the connect module
export async function createSnowpipe(
  projectId: string,
  tableId: string,
  config: SnowpipeConfig
): Promise<{ pipe_id: string; pipe_name: string; status: string }> {
  console.warn('[createSnowpipe] no backend route in explore-design — use connect module');
  return { pipe_id: '', pipe_name: '', status: 'not_implemented' };
}

/**
 * Create batch task
 */
// TODO: backend endpoint not implemented
export async function createBatchTask(
  projectId: string,
  tableId: string,
  config: BatchTaskConfig
): Promise<{ task_id: string; task_name: string; status: string }> {
  console.warn('[createBatchTask] no backend route');
  return { task_id: '', task_name: '', status: 'not_implemented' };
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
    `${ED}/streams`,
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
// TODO: backend endpoint not implemented
export async function pauseIngestion(
  ingestionId: string,
  type: 'snowpipe' | 'task'
): Promise<{ success: boolean; message: string }> {
  console.warn('[pauseIngestion] no backend route');
  return { success: false, message: 'Backend endpoint not implemented' };
}

/**
 * Resume ingestion (pipe or task)
 */
// TODO: backend endpoint not implemented
export async function resumeIngestion(
  ingestionId: string,
  type: 'snowpipe' | 'task'
): Promise<{ success: boolean; message: string }> {
  console.warn('[resumeIngestion] no backend route');
  return { success: false, message: 'Backend endpoint not implemented' };
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
  /**
   * Honest fetch outcome so the UI can distinguish three states:
   *  - 'ok'          → endpoint responded with one or more versions
   *  - 'empty'       → endpoint responded successfully with zero versions
   *  - 'unavailable' → endpoint returned an error (400/404/500) — versions
   *                    may still exist; do NOT render this as "no versions".
   * Optional for backward-compatibility with older callers.
   */
  availability?: 'ok' | 'empty' | 'unavailable';
  /** Populated when availability === 'unavailable' — the upstream error message. */
  error?: string;
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
      const errorDetail = toMessage(error);

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
// TODO: backend endpoint not implemented — use the deployment pipeline (createDeployment + executeDeploymentV1) instead
export async function deploySchema(
  request: SchemaDeploymentRequest
): Promise<SchemaDeploymentResponse> {
  // NOTE: there is no backend route for this stub — real callers use the
  // deployment pipeline. Guard against a missing/undefined sql_queries so the
  // health probe doesn't crash with "Cannot read properties of undefined (reading 'length')".
  // DOCUMENTED DEAD STUB — there is no `/explore-design/deploy_schema` backend
  // route. The real path is the deployment pipeline
  // (createDeployment + executeDeploymentV1). Throw an explicit not-implemented
  // error so this never appears to succeed; any UI surface must gate/label it.
  throw new Error(
    '[deploySchema] not implemented — no /explore-design/deploy_schema route; use the deployment pipeline (createDeployment + executeDeploymentV1)'
  );
}

/**
 * Get schema version history for a project.
 *
 * Endpoint: GET /explore-design/{project_id}/versions
 *
 * @param projectId - Project ID
 * @param options - Query options. Pass `signal` to abort on unmount.
 * @returns List of schema versions with an `availability` outcome flag.
 */
export async function getSchemaVersions(
  projectId: string,
  options?: {
    limit?: number;
    include_rolled_back?: boolean;
    signal?: AbortSignal;
  }
): Promise<SchemaVersionsResponse> {
  try {
    const { data } = await apiClient.get(`${V1_EXPLORE}/${projectId}/versions`, {
      params: options?.limit ? { limit: options.limit } : undefined,
      signal: options?.signal,
    });
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
      availability: versions.length > 0 ? 'ok' : 'empty',
    };
  } catch (error: any) {
    console.error('[getSchemaVersions] Version endpoint failed:', error);
    const detail = toMessage(error, 'Version endpoint is unavailable');
    return {
      project_id: projectId,
      versions: [],
      total_versions: 0,
      availability: 'unavailable',
      error: typeof detail === 'string' ? detail : JSON.stringify(detail),
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
 * @param versionId - Target version ID to rollback to
 * @param options - Rollback options
 * @returns Rollback result
 */
// TODO: backend endpoint not implemented — use POST /projects/{projectId}/rollback via projectsApi
export async function rollbackSchema(
  versionId: string,
  options?: RollbackOptions
): Promise<RollbackResponse> {
  console.warn('[rollbackSchema] no backend route — use projectsApi.rollbackProject(projectId, { target_version_id: versionId })');
  return {
    status: 'failed',
    rolled_back_from: '',
    rolled_back_to: versionId,
    versions_rolled_back: 0,
    statements_executed: 0,
    message: 'Backend endpoint /explore-design/rollback_schema not implemented. Use POST /projects/{projectId}/rollback instead.',
    errors: ['Backend endpoint not implemented'],
  };
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
    /** ISO datetime — backend CreateScheduleRequest.scheduled_date (one-shot). */
    scheduled_date?: string;
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
 * Backend: GET /explore-design/{project_id}/ingestion/runs
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
      `${ED}/${projectId}/ingestion/runs`,
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
// ============================================
// PROJECT MANAGEMENT HELPERS
// ============================================

/**
 * Ensure project exists before adding events
 * Creates the project if it doesn't exist, otherwise returns existing project_id
 *
 * @deprecated no caller + no backend route: the sole path
 * `/explore-design/projects` is absent from the backend, and the only
 * reference is the api-health diagnostic harness. The mapping flow uses its own
 * local ensureProjectExists in services/mapping/saveGroups.ts.
 */
export async function ensureProjectExists(
  projectName: string
): Promise<{ project_id: string; created: boolean }> {
  try {
    // Try to create the project - if it already exists, backend may return it.
    // Create route is POST /explore-design (empty path); `${ED}/projects` had no route.
    const response = await apiClient.post(
      ED,
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
// QUERY EXECUTION API
// ============================================




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

/**
 * Create a new workflow.
 *
 * Retargeted to the real route POST /workflow (workflow/router.py:594) — the old
 * `/explore-design/workflow` had no backend route. The backend WorkflowCreate body
 * is {project_name, steps[], description?, tags?}, so this legacy {name, tasks}
 * shape is mapped on the way out. NOTE: the canonical, fully-typed workflow create
 * lives in services/api/workflowApi.ts (used by the live ETL builder); this helper
 * is retained only for the api-health harness. The sibling ED workflow helpers
 * (getWorkflowDAG etc.) that hit the never-registered /explore-design/workflow/*
 * routes were removed in the dead-endpoint cleanup.
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
    '/workflow',
    {
      project_name: name,
      project_id: projectId,
      steps: tasks,
      description: options?.description,
    },
  );
  return response.data;
}

// ============================================
// POLICY APIs
// ============================================

// ── Masking configs — the WORKING modeling→policies bridge ──────────────────
// (backend explore_design/router.py; replaces the never-implemented — and now
// removed — /explore-design/policies/* family). NB the declare body wants
// `schema_name`, not `schema` — the one route in the module without the alias.

export interface MaskingConfig {
  config_id: string;
  database_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  masking_policy: string;
  masking_type: string;
  created_by: string;
  created_at: string;
  applied_at: string | null;
  applied_policy_fqn: string | null;
}

/** Declare column masking from the model. POST /explore-design/{id}/masking-configs */
export async function declareMaskingConfig(projectId: string, body: {
  database: string; schema_name: string; table: string; column: string;
  masking_type?: string; policy_name?: string; preserve_format?: boolean; pattern?: string;
}): Promise<{ config_id: string; status: string }> {
  const { data } = await apiClient.post(`${ED}/${projectId}/masking-configs`, body);
  return data;
}

/** List the project's masking declarations. GET /explore-design/{id}/masking-configs */
export async function listMaskingConfigs(projectId: string):
  Promise<{ project_id: string; configs: MaskingConfig[]; count: number }> {
  const { data } = await apiClient.get(`${ED}/${projectId}/masking-configs`);
  return data;
}

// ── Action catalog — the standard JSON registry of every E&D UI action ──────
// (backend action_catalog.py, seeded to EVENT_STORE.EXPLORE_ACTION_CATALOG,
// served from the TABLE; verified stamps come from POST /actions/verify).

export interface ExploreAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: string;
  path: string;
  params: Array<{ name: string; in: string; required?: boolean; enum?: string[]; note?: string }>;
  rbac: string;
  probe: string;
  seed_version: number;
  verified_at: string | null;
  verified_status: string | null;
}

/** The registry of every E&D action (label/why/contract/gating/verified). */
export async function getExploreActions(): Promise<{
  seed_version: number; fingerprint: string; count: number;
  areas: Record<string, ExploreAction[]>; actions: ExploreAction[];
}> {
  const { data } = await apiClient.get(`${ED}/actions`);
  return data;
}

// ── Guided policy builder (full Snowflake policy family) ────────────────────
export interface PolicyTypeInput {
  name: string;
  kind: 'roles' | 'role' | 'int' | 'enum' | 'columns' | 'column' | 'text' | 'bool';
  required: boolean;
  label: string;
  options?: string[];
  help?: string;
}

export interface PolicyTypeSpec {
  policy_type: string;
  label: string;
  level: 'column' | 'object' | 'tag';
  why: string;
  status: 'ga' | 'preview' | 'planned';
  edition: string;
  attach_verb: string;
  one_per: string;
  doc_url: string;
  inputs: PolicyTypeInput[];
  examples: Array<{ title: string; sql: string }>;
  gotchas: string[];
}

/** Registry of every Snowflake policy type the guided builder supports. */
export async function getPolicyTypes(): Promise<{
  seed_version: number; fingerprint: string; count: number; policy_types: PolicyTypeSpec[];
}> {
  const { data } = await apiClient.get(`${ED}/policy-types`);
  return data;
}

/** Draft a policy: generates doc-grounded DDL and queues it as a traced
 *  release change (pending DDL_ACTION — visible in the Release tab). */
export async function draftPolicy(
  projectId: string,
  body: {
    policy_type: string;
    target: { database: string; schema_name: string; table: string; column?: string | null };
    params: Record<string, any>;
    column_data_type?: string | null;
  }
): Promise<{
  project_id: string; policy_name: string; policy_type: string;
  statements: string[]; ddl_sql: string; event_id: string; status: string;
}> {
  const { data } = await apiClient.post(`${ED}/${projectId}/policies/draft`, body);
  return data;
}

// ── Ingestion task monitor (state · last run · next run · pause/resume/run-now) ──
export interface IngestionTask {
  name: string;
  fqn: string;
  kind: 'ingestion' | 'deployment';
  state: string;                 // 'started' | 'suspended' | ''
  schedule: string | null;
  warehouse: string | null;
  owner: string | null;
  last_suspended_reason: string | null;
  last_run: {
    state: string;
    scheduled_time: string | null;
    completed_time: string | null;
    error_code: string | null;
    error_message: string | null;
  } | null;
  next_run: string | null;
}

export interface IngestionTaskMonitor {
  project_id: string;
  tasks: IngestionTask[];
  count: number;
  operate_gate: string;
}

export async function getIngestionTaskMonitor(projectId: string): Promise<IngestionTaskMonitor> {
  const { data } = await apiClient.get(`${ED}/${projectId}/ingestion/tasks`);
  return data;
}

/** Pause the project's scheduled ingestion task (rights-gated). */
export async function suspendIngestionTask(projectId: string) {
  const { data } = await apiClient.post(`${ED}/${projectId}/ingestion/tasks/suspend`, {});
  return data;
}
/** Resume the project's scheduled ingestion task (rights-gated). */
export async function resumeIngestionTask(projectId: string) {
  const { data } = await apiClient.post(`${ED}/${projectId}/ingestion/tasks/resume`, {});
  return data;
}
/** Run the project's ingestion task immediately (EXECUTE TASK). */
export async function runIngestionTaskNow(projectId: string) {
  const { data } = await apiClient.post(`${ED}/${projectId}/ingestion/tasks/run-now`, {});
  return data;
}

/** Apply pending declarations as real Snowflake policies. POST …/masking-configs/apply */
export async function applyMaskingConfigs(projectId: string):
  Promise<{ project_id: string; pending: number; applied: number; failed: number;
            results: Array<{ config_id: string; target: string; status: string; policy?: string; error?: string }> }> {
  const { data } = await apiClient.post(`${ED}/${projectId}/masking-configs/apply`, {});
  return data;
}

/** Retract a declaration (detaches + drops the applied policy). DELETE …/masking-configs/{configId} */
export async function deleteMaskingConfig(projectId: string, configId: string):
  Promise<{ config_id: string; status: string; policy_dropped: boolean }> {
  const { data } = await apiClient.delete(`${ED}/${projectId}/masking-configs/${configId}`);
  return data;
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
      error: toMessage(error),
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
  // POST /projects/{projectId}/events — the sole live route (the old
  // `${ED}/add-event` first attempt was a live-404 and has been removed).
  try {
    const response = await apiClient.post(
      `/projects/${projectId}/events`,
      {
        event_id: eventId,
        event_type: eventType,
        target,
        payload,
        module_type: moduleType,
      },
    );
    return response.data;
  } catch (error: any) {
    console.error('[addDesignEvent] Failed to record event:', error?.message);
    return { success: false, event_id: eventId, project_id: projectId, status: 'failed', created_at: '' };
  }
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
    `${ED}/${projectId}/events`,
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
    `${ED}/${projectId}/validate-events`,
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
    `${ED}/${projectId}/deployments`,
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
// TODO: backend endpoint requires projectId — use executeDeploymentV1(projectId, deploymentId) instead
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
  console.warn('[executeDesignDeployment] deprecated — use executeDeploymentV1(projectId, deploymentId)');
  return {
    deployment_id: deploymentId,
    status: 'failed',
    results: [],
    summary: { applied: 0, failed: 0, skipped: 0 },
  };
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
  // TODO: backend endpoint not implemented — use createDeployment + executeDeploymentV1 instead
  console.warn('[immediateDesignDeploy] no backend route — use createDeployment + executeDeploymentV1');
  return {
    deployment_id: '',
    status: 'failed',
    results: [],
    summary: { applied: 0, failed: 0, skipped: 0 },
  };
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
// TODO: backend endpoint not implemented — use POST /projects/{projectId}/rollback via projectsApi
export async function rollbackDesignDeployment(
  deploymentId: string,
  reason: string
): Promise<{
  success: boolean;
  rollback_deployment_id?: string;
  message: string;
}> {
  console.warn('[rollbackDesignDeployment] no backend route — use projectsApi.rollbackProject');
  return { success: false, message: 'Backend endpoint not implemented. Use projectsApi.rollbackProject instead.' };
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

export interface DdlRemediation {
  category: string;
  title: string;
  rationale: string;
  diagnostic_sql?: string | null;
  corrective_sql?: string | null;
  can_retry?: boolean;
}
export interface DdlFailureRemediation {
  event_id: string;
  ddl_type?: string;
  ddl_sql?: string;
  target_table?: string;
  error_message?: string;
  remediation: DdlRemediation;
}
export interface DdlRemediationResult {
  project_id: string;
  failed_count: number;
  remediations: DdlFailureRemediation[];
}

/** Proposed remediation for every FAILED DDL action (deploy error → fix action).
 *  Read-only on the backend; safe to call after a deploy abort. */
export async function getDdlRemediation(projectId: string): Promise<DdlRemediationResult> {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/ddl-actions/remediation`);
  return (res.data?.data ?? res.data) as DdlRemediationResult;
}

export interface DeployBlocker {
  event_id: string; ddl_type?: string; ddl_sql?: string;
  reason: string; message: string; suggested_fix?: string;
}
export interface DeployCoherence {
  project_id: string; ok: boolean; pending_actions: number; fks_checked: number;
  blockers: DeployBlocker[];
}

/** Static coherence pre-check over PENDING DDL actions — blockers that must be
 *  resolved before deploy (e.g. an FK referencing a non-key column). Read-only. */
export async function getDeployCoherence(projectId: string): Promise<DeployCoherence> {
  const res = await apiClient.get(`${V1_EXPLORE}/${projectId}/ddl-actions/coherence`);
  return (res.data?.data ?? res.data) as DeployCoherence;
}

/** GOVERNED apply: queue the server-derived corrective DDL for a failed action as
 *  an audited DDL action (flows through the normal dry-run → deploy/approval
 *  pipeline). Deploy-gated — a 403 means the caller should request approval. */
export async function applyDdlRemediation(projectId: string, eventId: string): Promise<{
  applied_for: string; corrective_sql: string; message: string; action?: Record<string, unknown>;
}> {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ddl-actions/remediation/${eventId}/apply`, {});
  return (res.data?.data ?? res.data);
}

export async function batchAddDDLActions(projectId: string, data: { actions: Array<{ ddl_sql: string; ddl_type?: string; priority?: number; target_table?: string; description?: string }> }) {
  // No backend batch route exists — only POST /{project_id}/ddl-actions (single action;
  // the `/batch` path collided with DELETE /ddl-actions/{event_id}). Submit per-action
  // against the real single-submit route so the public signature is preserved.
  const results = [];
  for (const action of data.actions) {
    const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ddl-actions`, action);
    results.push(res.data);
  }
  return { results, count: results.length };
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

/**
 * Discover FK relationships via AI for a single database+schema scope.
 *
 * Backend AIRelationshipDiscoverRequest requires top-level `database` and
 * `schema` (required); `tables` is an optional List[str] of table-name
 * filters. Sending objects or omitting database/schema caused a 422.
 * NOTE: backend processes one db/schema pair per call — multi-schema
 * projects are under-scoped; the sibling caller in services/api/exploreDesignApi.ts
 * has the same shape mismatch (out of this file's scope).
 */
export async function discoverRelationships(
  projectId: string,
  data: { database: string; schema: string; tables?: string[] },
) {
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/discover-relationships`, {
    database: data.database,
    schema: data.schema,
    tables: data.tables,
  });
  return res.data;
}

export async function getSchemaHealth(
  projectId: string,
  body: { database: string; schema: string },
) {
  // Backend only registers POST /{project_id}/ai/schema-health (requires {database, schema});
  // a GET 405s. The score scans {database}.{schema} server-side, so the real project
  // db/schema must be supplied (no governance default — that would score wrong tables).
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/schema-health`, {
    database: body.database,
    schema: body.schema,
  });
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
  // Wired to the live route: POST /explore-design/{projectId}/ai/optimize-types.
  // (The old GET /tables/.../ai/type-optimization path was never registered → 404.)
  // Body model AITypeOptimizeRequest reads { database, schema_name (alias "schema"), table };
  // populate_by_name=True so the field name `schema_name` is accepted.
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/optimize-types`, {
    database,
    schema_name: schema,
    table,
  });
  return res.data;
}

export async function getSCDRecommendation(projectId: string, database: string, schema: string, table: string) {
  // Wired to the live route: POST /explore-design/{projectId}/ai/recommend-scd.
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/recommend-scd`, {
    database,
    schema_name: schema,
    table,
  });
  return res.data;
}

export async function getWarehouseSizing(warehouse?: string) {
  const res = await apiClient.get(`${V1_EXPLORE}/ai/warehouse-sizing`, { params: warehouse ? { warehouse } : {} });
  return res.data;
}

export async function getClusteringSuggestion(projectId: string, database: string, schema: string, table: string) {
  // Wired to the live route: POST /explore-design/{projectId}/ai/clustering-keys.
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/clustering-keys`, {
    database,
    schema_name: schema,
    table,
  });
  return res.data;
}

export async function getMaterializationStrategy(projectId: string, database: string, schema: string, table: string) {
  // Wired to the live route: POST /explore-design/{projectId}/ai/materialization.
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/materialization`, {
    database,
    schema_name: schema,
    table,
  });
  return res.data;
}

export async function getIngestionRecommendation(projectId: string, database: string, schema: string, table: string) {
  // Wired to the live route: POST /explore-design/{projectId}/ai/ingestion-mode.
  const res = await apiClient.post(`${V1_EXPLORE}/${projectId}/ai/ingestion-mode`, {
    database,
    schema_name: schema,
    table,
  });
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

export async function getAISavingsSummary(projectId: string) {
  // Backend route is project-scoped: /explore-design/{project_id}/ai/savings
  // (the old unscoped /ai/savings-summary path never existed backend-side -> 404).
  const res = await apiClient.get(`${V1_EXPLORE}/${encodeURIComponent(projectId)}/ai/savings`);
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
