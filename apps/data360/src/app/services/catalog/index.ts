import apiClient from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function objectIdFromTable(
  database: string, schema: string, name: string, type = 'TABLE',
): string {
  return `${type}:${database}.${schema}.${name}`;
}

// ---------------------------------------------------------------------------
// Types — /catalog/* contract (see FRONTEND_INTEGRATION.md §11)
// ---------------------------------------------------------------------------

export interface CatalogOverviewResponse {
  account: string;
  scoring: Record<string, any>;
  recommendations: Record<string, any>;
  recent_events: Array<{
    event_ts: string;
    event_type: string;
    scope: Record<string, any>;
    reference_id?: string;
    reference_type?: string;
    payload?: Record<string, any>;
  }>;
  [key: string]: any;
}

export interface ObjectIdentity {
  object_id: string;
  fully_qualified_name: string;
  database: string;
  schema: string;
  name: string;
  type: string;
  family: string | null;
  owner_role: string | null;
  created_at: string | null;
  last_altered_at: string | null;
  is_transient: boolean | null;
  is_secure: boolean | null;
}

export interface ObjectProfiling {
  available: boolean;
  sample_size: number;
  rows: number | null;
  bytes: number | null;
  columns: number;
  nulls_total: number;
  distinct_total: number;
  columns_with_nulls: number;
  columns_all_null: number;
  columns_distinct_eq_rows: number;
  per_column: Array<{
    column: string;
    data_type: string;
    sample_total: number;
    null_count: number;
    distinct_count: number;
    error?: string;
  }>;
}

export interface ObjectGovernance {
  score: number;
  sensitive_columns: number;
  masked_sensitive_columns: number;
  unprotected_sensitive_columns: number;
  has_row_access_policy: boolean;
  tag_count: number;
  policy_count: number;
  tags: Array<{ tag_name: string; tag_value: string; level: string; column_name: string | null }>;
  policies: Array<{ policy_type: string; policy_name: string; applied_on: string; column_name: string | null; status: string }>;
}

export interface ProductTier {
  matched: boolean;
  source: 'tag' | 'name_heuristic' | 'schema_hint' | null;
  product_id: string | null;
  label: string | null;
  category: string | null;
  industry_agnostic: boolean;
  catalog_hit: boolean;
  tag_name?: string;
  hint?: string;
}

export interface ProjectTier {
  count: number;
  deployment_count: number;
  last_shipped_at: string | null;
  projects: Array<{
    project_id: string;
    project_name: string | null;
    environment: string | null;
    deployment_count: number;
    last_shipped_at: string | null;
    last_operation: string | null;
  }>;
}

export interface DependenciesTier {
  upstream_count: number;
  downstream_count: number;
  neighbours_sampled: number;
  neighbours: Array<{ fqn: string; governance_score?: number; error?: string }>;
  rollup: {
    governance_score_avg: number | null;
    governance_score_min: number | null;
    governance_score_max: number | null;
    scored_neighbours: number;
  };
}

export interface PersistedScores {
  scores: {
    quality_score: number | null;
    governance_score: number | null;
    modeling_score: number | null;
    finops_score: number | null;
    ml_ready_score: number | null;
    trust_score: number | null;
  };
  inputs: Record<string, any>;
  top_issues: Array<{ severity: 'high' | 'medium' | 'low'; title: string }>;
  recommended_actions: Array<{ action_id: string; label: string; method: string; path: string }>;
  computed_at: string;
  computed_by: string;
}

export interface Recommendation {
  reco_id: string;
  rule_id: string;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  expected_gain: string;
  status: string;
}

export interface ObjectAction {
  action_id: string;
  label: string;
  group: 'navigate' | 'inspect' | 'analyze' | 'govern' | 'danger';
  http: { method: 'GET' | 'POST'; path: string };
  body_hint?: Record<string, unknown>;
  requires_confirm: boolean;
  destructive: boolean;
  enabled: boolean;
  disabled_reason?: string;
}

export interface Object360Response {
  object_id: string;
  tiers: {
    object: {
      identity: ObjectIdentity;
      profiling: ObjectProfiling;
      governance: ObjectGovernance;
    };
    product: ProductTier;
    project: ProjectTier;
    dependencies: DependenciesTier;
  };
  scores: {
    governance_object: number | null;
    governance_dependencies_avg: number | null;
    profiling_columns: number | null;
    profiling_columns_with_nulls: number | null;
  };
  persisted_scores: PersistedScores | null;
  usage: any | null;
  finops: {
    queries_last_30d: number;
    bytes_scanned_total: number;
    elapsed_ms_total: number;
    errored_queries: number;
    distinct_users: number;
    credits_cloud_services: number;
    source: string;
  } | null;
  recommendations: Recommendation[];
  available_actions: { actions: ObjectAction[] };
  _contract: any;
}

export interface ActionsResponse {
  object_id: string;
  object_fqn: string;
  object_type: string;
  actions: ObjectAction[];
  groups: string[];
  _contract: any;
}

export interface CatalogProduct {
  product_id: string;
  name: string;
  domain: string;
  owner: string;
  status: string;
  source_count: number;
  model_count: number;
  kpi_count: number;
  dashboard_count: number;
  quality_score: number | null;
  governance_score: number | null;
  finops_score: number | null;
  roi_score: number | null;
  trust_score: number | null;
}

export interface CatalogScoresResponse {
  averages: {
    quality_avg: number | null;
    governance_avg: number | null;
    modeling_avg: number | null;
    finops_avg: number | null;
    ml_ready_avg: number | null;
    trust_avg: number | null;
  };
  scored_objects: number;
  trust_distribution: Record<string, number>;
  [key: string]: any;
}

export interface ApplyRecoResponse {
  reco_id: string;
  status: string;
  suggested_call: {
    method: 'GET' | 'POST' | 'DELETE';
    path: string;
    body?: Record<string, unknown>;
  } | null;
}

export interface RefreshResponse {
  run_id: string;
  status: 'running' | 'succeeded' | 'failed';
  scope_type?: string;
  scope_value?: string;
  objects_discovered?: number;
  objects_scored?: number;
  started_at?: string;
  completed_at?: string;
}

// ---------------------------------------------------------------------------
// API calls — /catalog/*
// ---------------------------------------------------------------------------

const CATALOG = '/catalog';
const EXPLORER = '/api/snowflake/explorer';

export async function getCatalogOverview(): Promise<CatalogOverviewResponse> {
  const { data } = await apiClient.get<CatalogOverviewResponse>(`${CATALOG}/overview`);
  return data;
}

export interface CatalogSourcesResponse {
  sources: Array<{
    name: string;
    type: string;
    database?: string;
    schema_count?: number;
    table_count?: number;
  }>;
  by_type: Record<string, number>;
  count: number;
}

export async function getCatalogSources(): Promise<CatalogSourcesResponse> {
  const { data } = await apiClient.get<CatalogSourcesResponse>(`${CATALOG}/sources`);
  return data;
}

export async function getObject360(
  objectId: string,
  opts?: { include_profile?: boolean; sample_size?: number; include_dependencies?: boolean },
): Promise<Object360Response> {
  const { data } = await apiClient.get<Object360Response>(
    `${CATALOG}/objects/${encodeURIComponent(objectId)}/360`,
    { params: opts },
  );
  return data;
}

export async function getObjectScores(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    `${CATALOG}/objects/${encodeURIComponent(objectId)}/scores`,
  );
  return data;
}

export async function recomputeObjectScores(objectId: string): Promise<any> {
  const { data } = await apiClient.post(
    `${CATALOG}/objects/${encodeURIComponent(objectId)}/scores/recompute`,
  );
  return data;
}

export interface ObjectHistoryEntry {
  ts: string;
  source: string;
  kind: string;
  actor: string;
  status: string;
  details: Record<string, any>;
}

export interface ObjectHistoryResponse {
  object_fqn: string;
  entries: ObjectHistoryEntry[];
  count: number;
  since_hours: number;
  sources_queried: string[];
}

export async function getObjectHistory(
  objectFqn: string,
  opts?: { since_hours?: number; limit?: number; include_data_access?: boolean },
): Promise<ObjectHistoryResponse> {
  // The backend uses {object_fqn:path} — FQN contains dots/slashes that must
  // pass through literally (no encodeURIComponent which would escape dots).
  const { data } = await apiClient.get<ObjectHistoryResponse>(
    `${CATALOG}/objects/${objectFqn}/history`,
    { params: opts },
  );
  return data;
}

export async function getCatalogScores(): Promise<CatalogScoresResponse> {
  const { data } = await apiClient.get<CatalogScoresResponse>(`${CATALOG}/scores`);
  return data;
}

export async function getCatalogRecommendations(
  params?: {
    product_id?: string;
    object_fqn?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
    limit?: number;
  },
): Promise<{ items: Recommendation[]; count: number; filters: Record<string, any> }> {
  const { data } = await apiClient.get(`${CATALOG}/recommendations`, { params });
  return data;
}

export async function applyRecommendation(
  recoId: string,
  body?: { note?: string },
): Promise<ApplyRecoResponse> {
  const { data } = await apiClient.post<ApplyRecoResponse>(
    `${CATALOG}/recommendations/${recoId}/apply`,
    body,
  );
  return data;
}

export interface CatalogEvent {
  event_ts: string;
  event_type: string;
  scope: {
    account?: string;
    user?: string;
    role?: string;
    object_fqn?: string;
    product_id?: string;
  };
  reference_id?: string;
  reference_type?: string;
  payload?: Record<string, any>;
}

export interface CatalogEventsResponse {
  events: CatalogEvent[];
  total: number;
  limit: number;
  offset: number;
  filters: Record<string, any>;
}

export async function getCatalogEvents(
  params?: {
    product_id?: string;
    object_fqn?: string;
    event_type?: string;
    since_iso?: string;
    limit?: number;
    offset?: number;
  },
): Promise<CatalogEventsResponse> {
  const { data } = await apiClient.get<CatalogEventsResponse>(`${CATALOG}/events`, { params });
  return data;
}

export async function getCatalogProducts(): Promise<{ products: CatalogProduct[]; count: number }> {
  const { data } = await apiClient.get(`${CATALOG}/products`);
  return data;
}

export async function getCatalogProductOverview(productId: string): Promise<any> {
  const { data } = await apiClient.get(`${CATALOG}/products/${productId}/overview`);
  return data;
}

export async function getCatalogProductLineage(productId: string): Promise<any> {
  const { data } = await apiClient.get(`${CATALOG}/products/${productId}/lineage`);
  return data;
}

export async function getCatalogProductAssets(productId: string): Promise<any> {
  const { data } = await apiClient.get(`${CATALOG}/products/${productId}/assets`);
  return data;
}

export async function getCatalogProductKpis(productId: string): Promise<any> {
  const { data } = await apiClient.get(`${CATALOG}/products/${productId}/kpis`);
  return data;
}

export async function recommendProductModel(productId: string): Promise<any> {
  const { data } = await apiClient.post(`${CATALOG}/products/${productId}/recommend-model`);
  return data;
}

export async function generateProductKpis(productId: string): Promise<any> {
  const { data } = await apiClient.post(`${CATALOG}/products/${productId}/generate-kpis`);
  return data;
}

export async function publishProduct(productId: string): Promise<any> {
  const { data } = await apiClient.post(`${CATALOG}/products/${productId}/publish`);
  return data;
}

export interface CatalogKpi {
  kpi_id: string;
  kpi_name: string;
  product_id: string | null;
  status: 'DRAFT' | 'VALIDATED' | 'PUBLISHED';
  business_definition?: string;
  sql_definition?: string;
  grain?: string;
  dimensions?: string[];
  source_objects?: string[];
  freshness_sla?: string;
  owner?: string;
}

export async function getCatalogKpis(): Promise<{ items: CatalogKpi[]; count: number }> {
  const { data } = await apiClient.get(`${CATALOG}/kpis`);
  return data;
}

export async function createCatalogKpi(body: {
  kpi_name: string;
  product_id: string;
  business_definition?: string;
  sql_definition?: string;
  grain?: string;
  dimensions?: string[];
  source_objects?: string[];
  freshness_sla_hours?: number;
  owner?: string;
}): Promise<CatalogKpi> {
  const { data } = await apiClient.post<CatalogKpi>(`${CATALOG}/kpis`, body);
  return data;
}

export async function getCatalogKpi(kpiId: string): Promise<CatalogKpi> {
  const { data } = await apiClient.get<CatalogKpi>(`${CATALOG}/kpis/${kpiId}`);
  return data;
}

export async function validateCatalogKpi(kpiId: string): Promise<{ kpi_id: string; status: string }> {
  const { data } = await apiClient.post(`${CATALOG}/kpis/${kpiId}/validate`);
  return data;
}

export async function refreshCatalog(
  body: { scope_type: string; scope_value: string },
): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>(`${CATALOG}/refresh`, body);
  return data;
}

export async function getRefreshStatus(runId: string): Promise<RefreshResponse> {
  const { data } = await apiClient.get<RefreshResponse>(`${CATALOG}/refresh/${runId}`);
  return data;
}

// ---------------------------------------------------------------------------
// Explorer endpoints (§9)
// ---------------------------------------------------------------------------

export async function getObjectDeepDive(
  objectId: string,
  opts?: { include_profile?: boolean; sample_size?: number; include_dependencies?: boolean },
): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/deep-dive`,
    { params: opts },
  );
  return data;
}

export async function getObjectActions(objectId: string): Promise<ActionsResponse> {
  const { data } = await apiClient.get<ActionsResponse>(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/actions`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Explorer per-object drilldown tabs — Object-360 UI.
// One service fn per `/api/snowflake/explorer/objects/{id}/<tab>` route.
// Responses are intentionally loose (`any`) — the FE renders raw counts/items
// and tolerates partial shapes. Each call degrades to an inline error/empty
// state at the call site (no fake data, no silent empties).
//
// NOTE: there is no dedicated "cost" route. Cost/FinOps lives in the `usage`
// response (finops fields) and the deep-dive `finops` tier — the Object-360
// Cost tab reads from `getObjectUsage` / the deep-dive finops tier.
// ---------------------------------------------------------------------------

/** Envelope returned by list-style explorer routes (columns / audit). */
export interface ExplorerEnvelope<T = any> {
  items: T[];
  total: number;
  filters?: Record<string, unknown>;
  account_id?: string | null;
  [key: string]: any;
}

export async function getObjectColumns(objectId: string): Promise<ExplorerEnvelope> {
  const { data } = await apiClient.get<ExplorerEnvelope>(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/columns`,
  );
  return data;
}

export async function getObjectLineage(
  objectId: string,
  opts?: { direction?: 'upstream' | 'downstream' | 'both'; depth?: number },
): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/lineage`,
    { params: opts },
  );
  return data;
}

export async function getObjectImpact(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/impact`,
  );
  return data;
}

export async function getObjectGovernanceTab(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/governance`,
  );
  return data;
}

export async function getObjectUsage(
  objectId: string,
  opts?: {
    period?: '1d' | '7d' | '30d' | '90d' | '365d';
    group_by?: 'day' | 'user' | 'role' | 'warehouse' | 'query_type';
  },
): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/usage`,
    { params: opts },
  );
  return data;
}

export async function getObjectAudit(objectId: string): Promise<ExplorerEnvelope> {
  const { data } = await apiClient.get<ExplorerEnvelope>(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/audit`,
  );
  return data;
}

export async function getObjectDdl(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/ddl`,
  );
  return data;
}

export async function getObjectHealth(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/health`,
  );
  return data;
}

export async function getObjectQuality(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/quality`,
  );
  return data;
}

export async function getObjectTimeline(
  objectId: string,
  opts?: { limit?: number },
): Promise<any> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/timeline`,
    { params: opts },
  );
  return data;
}

export async function getObjectOpenInSnowflake(
  objectId: string,
  accountUrl?: string,
): Promise<{ url?: string; [key: string]: any }> {
  const { data } = await apiClient.get(
    `${EXPLORER}/objects/${encodeURIComponent(objectId)}/open-in-snowflake`,
    { params: accountUrl ? { account_url: accountUrl } : undefined },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Re-exports from mapping (for SourceTree which still uses metadata APIs)
// ---------------------------------------------------------------------------

export { getDatabases, getSchemas, getTables, getTableColumns } from '../mapping';
export type { TableColumn } from '../mapping';
