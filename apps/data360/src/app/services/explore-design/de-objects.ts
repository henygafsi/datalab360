/**
 * Explore & Design — typed, in-scope companion to the canonical exploreDesignApi.
 *
 * This module hosts the explore-design endpoints that are NOT (yet) present on
 * the canonical typed client (`services/api/exploreDesignApi.ts`):
 *   - Data-Engineering object lifecycle (dynamic tables / streams / alerts)
 *   - Project-scoped AI helpers used by the modeler page (schema health,
 *     relationship discovery, column classification)
 *   - Recent deployment errors feed
 *   - Project lock / unlock (presence) — delegated to the unified projectsApi
 *   - Version compare / promote / restore
 *
 * Every call uses the shared `apiClient` (auth + account context auto-injected)
 * and degrades gracefully when the backend route is not deployed yet: reads
 * return an empty/typed shape, mutations re-throw so the caller can surface an
 * inline error (no fake data, no silent success).
 *
 * Consumers should import from here instead of the legacy raw
 * `services/explore-design/index.ts`.
 */
import apiClient from '@/lib/api-client';
import { lockProject as unifiedLockProject, unlockProject as unifiedUnlockProject } from '@/app/services/api/projectsApi';
import type {
  DiscoverRelationshipsResult,
  SchemaHealthResult,
  ClassifyColumnsResult,
  Project,
} from '@/app/services/api/types';

const PREFIX = '/explore-design';

// ============================================================================
// Shared relationship type (re-homed from the legacy service surface)
// ============================================================================

export interface TableRelationship {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_column: string;
  parent_schema: string;
  parent_table: string;
  parent_column: string;
}

// ============================================================================
// Data-Engineering object reads
// ============================================================================

export interface DynamicTableInfo {
  name: string;
  database?: string;
  schema?: string;
  target_lag?: string;
  warehouse?: string;
  scheduling_state?: string;
  [key: string]: unknown;
}

export interface DynamicTableListResponse {
  dynamic_tables?: DynamicTableInfo[];
  data?: DynamicTableInfo[];
  items?: DynamicTableInfo[];
}

export interface StreamInfo {
  name: string;
  database?: string;
  schema?: string;
  source_type?: string;
  stale?: boolean;
  [key: string]: unknown;
}

export interface StreamListResponse {
  streams?: StreamInfo[];
  data?: StreamInfo[];
  items?: StreamInfo[];
}

export interface StreamDataResponse {
  rows?: Array<Record<string, unknown>>;
  columns?: string[];
}

export interface AlertInfo {
  name: string;
  database?: string;
  schema?: string;
  state?: string;
  schedule?: string;
  [key: string]: unknown;
}

export interface AlertListResponse {
  alerts?: AlertInfo[];
  data?: AlertInfo[];
  items?: AlertInfo[];
}

export async function listDynamicTables(database: string, schema: string) {
  const { data } = await apiClient.get<DynamicTableListResponse>(`${PREFIX}/dynamic-tables`, {
    params: { database, schema },
  });
  return data;
}

export async function listStreams(database: string, schema: string) {
  const { data } = await apiClient.get<StreamListResponse>(`${PREFIX}/streams`, {
    params: { database, schema },
  });
  return data;
}

export async function getStreamData(name: string, database: string, schema: string) {
  const { data } = await apiClient.get<StreamDataResponse>(`${PREFIX}/streams/${name}/data`, {
    params: { database, schema },
  });
  return data;
}

export async function listAlerts(database: string, schema: string) {
  const { data } = await apiClient.get<AlertListResponse>(`${PREFIX}/alerts`, {
    params: { database, schema },
  });
  return data;
}

// ============================================================================
// Data-Engineering object lifecycle (mutations)
// ============================================================================

export interface DeObjectActionResponse {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export async function suspendDynamicTable(name: string, database: string, schema: string) {
  const { data } = await apiClient.post<DeObjectActionResponse>(
    `${PREFIX}/dynamic-tables/${name}/suspend`,
    { database, schema },
  );
  return data;
}

export async function resumeDynamicTable(name: string, database: string, schema: string) {
  const { data } = await apiClient.post<DeObjectActionResponse>(
    `${PREFIX}/dynamic-tables/${name}/resume`,
    { database, schema },
  );
  return data;
}

export async function refreshDynamicTable(name: string, database: string, schema: string) {
  const { data } = await apiClient.post<DeObjectActionResponse>(
    `${PREFIX}/dynamic-tables/${name}/refresh`,
    { database, schema },
  );
  return data;
}

export async function dropDynamicTable(name: string, database: string, schema: string) {
  const { data } = await apiClient.delete<DeObjectActionResponse>(
    `${PREFIX}/dynamic-tables/${name}`,
    { params: { database, schema } },
  );
  return data;
}

export async function dropStream(name: string, database: string, schema: string) {
  const { data } = await apiClient.delete<DeObjectActionResponse>(`${PREFIX}/streams/${name}`, {
    params: { database, schema },
  });
  return data;
}

export async function dropAlert(name: string, database: string, schema: string) {
  const { data } = await apiClient.delete<DeObjectActionResponse>(`${PREFIX}/alerts/${name}`, {
    params: { database, schema },
  });
  return data;
}

// ============================================================================
// Project-scoped AI helpers used by the modeler page
// (project-scoped GET/POST variants — distinct from the schema-scoped
//  POST endpoints on the canonical exploreDesignApi.)
// ============================================================================

export interface ColumnClassificationEntry {
  column?: string;
  category?: string;
  tags?: string[];
  semantic_tags?: string[];
  confidence?: number;
  score?: number;
  description?: string;
  explanation?: string;
  pii_risk?: string;
  pii_type?: string;
  suggestion?: string;
  recommended_action?: string;
}

export interface ColumnClassificationResponse {
  classifications?: ColumnClassificationEntry[];
  data?: { classifications?: ColumnClassificationEntry[] };
}

export async function getColumnClassification(
  projectId: string,
  database: string,
  schema: string,
  table: string,
) {
  const { data } = await apiClient.get<ColumnClassificationResponse>(
    `${PREFIX}/${projectId}/tables/${database}/${schema}/${table}/ai/column-classification`,
  );
  return data;
}

export interface DiscoverRelationshipsBody {
  tables: Array<{ database?: string; schema?: string; table_name?: string; [key: string]: unknown }>;
  existing_relations?: unknown[];
}

export async function discoverRelationships(
  projectId: string,
  body: DiscoverRelationshipsBody,
): Promise<DiscoverRelationshipsResult> {
  const { data } = await apiClient.post<DiscoverRelationshipsResult>(
    `${PREFIX}/${projectId}/ai/discover-relationships`,
    body,
  );
  return data;
}

export async function getSchemaHealth(projectId: string): Promise<SchemaHealthResult> {
  const { data } = await apiClient.get<SchemaHealthResult>(
    `${PREFIX}/${projectId}/ai/schema-health`,
  );
  return data;
}

// Re-export the canonical typed result aliases for downstream consumers.
export type { DiscoverRelationshipsResult, SchemaHealthResult, ClassifyColumnsResult };

// ============================================================================
// Table profiling (non project-scoped POST variant used by the right-bar)
// ============================================================================

export interface TableProfileColumn {
  name?: string;
  data_type?: string;
  null_count?: number;
  distinct_count?: number;
  quality_score?: number;
  [key: string]: unknown;
}

export interface TableProfileSummary {
  table: string;
  row_count: number;
  column_count: number;
  columns: TableProfileColumn[];
  overall_quality_score: number;
}

/**
 * POST /explore-design/table/profile
 */
export async function getTableProfile(
  database: string,
  schema: string,
  table: string,
): Promise<TableProfileSummary> {
  const { data } = await apiClient.post<TableProfileSummary>(`${PREFIX}/table/profile`, {
    database,
    schema,
    table,
  });
  return data;
}

// ============================================================================
// Recent deployment errors
// ============================================================================

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

export interface RecentDeploymentErrorsResponse {
  errors: RecentDeploymentError[];
  total: number;
}

/**
 * GET /explore-design/recent-deployment-errors
 * Read endpoint — degrades to an empty list when the route is unavailable so
 * the Deployment Plans panel renders an empty state rather than crashing.
 */
export async function getRecentDeploymentErrors(
  limit = 20,
): Promise<RecentDeploymentErrorsResponse> {
  try {
    const { data } = await apiClient.get<RecentDeploymentErrorsResponse>(
      `${PREFIX}/recent-deployment-errors`,
      { params: { limit } },
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[getRecentDeploymentErrors] route unavailable; returning empty list.', error);
    }
    return { errors: [], total: 0 };
  }
}

// ============================================================================
// Project lock / unlock (presence) — delegated to the unified projects router
// ============================================================================

export async function lockProject(projectId: string): Promise<Project | null> {
  return unifiedLockProject(projectId);
}

export async function unlockProject(projectId: string): Promise<Project | null> {
  return unifiedUnlockProject(projectId);
}

// ============================================================================
// Version compare / promote / restore
// ============================================================================

export interface VersionDiff {
  from_version: string;
  to_version: string;
  tables_added: string[];
  tables_removed: string[];
  tables_modified: Array<{
    table: string;
    changes: Array<{ type: string; column?: string; from?: string; to?: string }>;
  }>;
  policies_added: string[];
  policies_removed: string[];
}

export interface PromoteVersionResponse {
  status: string;
  version_id: string;
  deployment_id?: string;
  message?: string;
}

export interface RestoreVersionResponse {
  status: string;
  version_id: string;
  restored_at?: string;
  message?: string;
}

/**
 * POST /explore-design/{projectId}/versions/compare
 * Re-throws on failure so the caller can surface an inline error.
 */
export async function compareVersions(
  projectId: string,
  fromVersionId: string,
  toVersionId: string,
): Promise<VersionDiff> {
  const { data } = await apiClient.post<VersionDiff>(
    `${PREFIX}/${projectId}/versions/compare`,
    { from_version_id: fromVersionId, to_version_id: toVersionId },
  );
  return data;
}

/**
 * POST /explore-design/{projectId}/versions/{versionId}/promote
 */
export async function promoteVersion(
  projectId: string,
  versionId: string,
): Promise<PromoteVersionResponse> {
  const { data } = await apiClient.post<PromoteVersionResponse>(
    `${PREFIX}/${projectId}/versions/${versionId}/promote`,
  );
  return data;
}

/**
 * POST /explore-design/{projectId}/versions/{versionId}/restore
 */
export async function restoreVersion(
  projectId: string,
  versionId: string,
): Promise<RestoreVersionResponse> {
  const { data } = await apiClient.post<RestoreVersionResponse>(
    `${PREFIX}/${projectId}/versions/${versionId}/restore`,
  );
  return data;
}
