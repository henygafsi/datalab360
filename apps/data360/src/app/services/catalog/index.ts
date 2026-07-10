import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

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
  // Actual wire field names. Both /catalog/recommendations
  // (recommendations_facade.list_recommendations_for_scope) and the embedded
  // object_360 recommendations (object_360._open_recommendations_for_object)
  // SELECT the raw AI_RECOMMENDATIONS columns aliased as feature / rationale /
  // estimated_savings_usd — NOT category / explanation / expected_gain. The
  // legacy names above are kept for back-compat with existing consumers but are
  // never populated at runtime; read these and fall back to the legacy names.
  feature?: string;
  rationale?: string;
  estimated_savings_usd?: number | null;
  proposed_action?: string | null;
  proposed_sql?: string | null;
  drilldown_url?: string | null;
  target?: string | null;
  first_detected_at?: string | null;
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
  // Additive per-object Snowflake metadata (catalog/services/snowflake_metrics.
  // object_storage_metadata). Live INFORMATION_SCHEMA (owner/clustering/
  // retention/last DDL) and ACCOUNT_USAGE storage split populate independently
  // and either can be absent — every field is optional; the block is null when
  // both sources are unreachable.
  snowflake_metadata: {
    table_type?: string | null;
    owner?: string | null;
    clustering_key?: string | null;
    retention_time_days?: number | null;
    last_ddl_at?: string | null;
    created_at?: string | null;
    last_altered_at?: string | null;
    comment?: string | null;
    active_bytes?: number | null;
    time_travel_bytes?: number | null;
    failsafe_bytes?: number | null;
    total_storage_bytes?: number | null;
  } | null;
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
  // QA P1-5: GET /catalog/scores returns these bare keys (quality/governance/
  // modeling/finops/ml_ready/trust) — the old *_avg names were all undefined,
  // so the Trust Score KPI always read undefined → rendered '—'. The legacy
  // *_avg fields are kept optional for back-compat with any older callers.
  averages: {
    quality: number | null;
    governance: number | null;
    modeling: number | null;
    finops: number | null;
    ml_ready: number | null;
    trust: number | null;
    quality_avg?: number | null;
    governance_avg?: number | null;
    modeling_avg?: number | null;
    finops_avg?: number | null;
    ml_ready_avg?: number | null;
    trust_avg?: number | null;
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
  // POST /catalog/refresh (start_refresh) returns "queued"; GET /catalog/
  // refresh/{run_id} (get_refresh_status) reconstructs running/partial/
  // succeeded/failed, or "unknown" when the run's events are absent.
  status: 'queued' | 'running' | 'partial' | 'succeeded' | 'failed' | 'unknown';
  scope_type?: string;
  scope_value?: string;
  objects_discovered?: number;
  objects_scored?: number;
  objects_failed?: number;
  error_log?: Array<{ fqn: string; error: string }> | null;
  started_at?: string;
  completed_at?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// API calls — /catalog/*
// ---------------------------------------------------------------------------

export async function getCatalogOverview(): Promise<CatalogOverviewResponse> {
  const { data } = await apiClient.get<CatalogOverviewResponse>(API.catalog.overview());
  return data;
}

export interface CatalogSourcesResponse {
  sources: Array<{
    // Legacy shape — kept REQUIRED for existing consumers (SourceHub,
    // data-source-connection); the live 2026-07 payload may omit them, so
    // catalog readers must fall back to label/source_id (see useExploreCatalog).
    name: string;
    type: string;
    database?: string;
    /** Live shape (GET /catalog/sources 2026-07): label/source_type/source_id. */
    label?: string;
    source_id?: string;
    source_type?: string;
    owner?: string | null;
    schema_count?: number;
    table_count?: number;
    row_count?: number;
    size_bytes?: number;
    last_altered_at?: string | null;
  }>;
  by_type: Record<string, number>;
  count: number;
}

export async function getCatalogSources(): Promise<CatalogSourcesResponse> {
  const { data } = await apiClient.get<CatalogSourcesResponse>(API.catalog.sources());
  return data;
}

export async function getObject360(
  objectId: string,
  opts?: { include_profile?: boolean; sample_size?: number; include_dependencies?: boolean },
): Promise<Object360Response> {
  const { data } = await apiClient.get<Object360Response>(
    API.catalog.object360(objectId),
    { params: opts },
  );
  return data;
}

export async function getObjectScores(objectId: string): Promise<any> {
  const { data } = await apiClient.get(API.catalog.objectScores(objectId));
  return data;
}

export async function recomputeObjectScores(objectId: string): Promise<any> {
  const { data } = await apiClient.post(API.catalog.recomputeScores(objectId));
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
    API.catalog.objectHistory(objectFqn),
    { params: opts },
  );
  return data;
}

export async function getCatalogScores(): Promise<CatalogScoresResponse> {
  const { data } = await apiClient.get<CatalogScoresResponse>(API.catalog.scores());
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
  const { data } = await apiClient.get(API.catalog.recommendations(), { params });
  return data;
}

export async function applyRecommendation(
  recoId: string,
  body?: { note?: string },
): Promise<ApplyRecoResponse> {
  const { data } = await apiClient.post<ApplyRecoResponse>(
    API.catalog.applyRecommendation(recoId),
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
  const { data } = await apiClient.get<CatalogEventsResponse>(API.catalog.events(), { params });
  return data;
}

export async function getCatalogProducts(): Promise<{ products: CatalogProduct[]; count: number }> {
  const { data } = await apiClient.get(API.catalog.products());
  return data;
}

export async function getCatalogProductOverview(productId: string): Promise<any> {
  const { data } = await apiClient.get(API.catalog.productOverview(productId));
  return data;
}

export async function getCatalogProductLineage(productId: string): Promise<any> {
  const { data } = await apiClient.get(API.catalog.productLineage(productId));
  return data;
}

export async function getCatalogProductAssets(productId: string): Promise<any> {
  const { data } = await apiClient.get(API.catalog.productAssets(productId));
  return data;
}

export async function getCatalogProductKpis(productId: string): Promise<any> {
  const { data } = await apiClient.get(API.catalog.productKpis(productId));
  return data;
}

export async function recommendProductModel(productId: string): Promise<any> {
  const { data } = await apiClient.post(API.catalog.recommendProductModel(productId));
  return data;
}

export async function generateProductKpis(productId: string): Promise<any> {
  const { data } = await apiClient.post(API.catalog.generateProductKpis(productId));
  return data;
}

export async function publishProduct(productId: string): Promise<any> {
  const { data } = await apiClient.post(API.catalog.publishProduct(productId));
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
  const { data } = await apiClient.get(API.catalog.kpis());
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
  const { data } = await apiClient.post<CatalogKpi>(API.catalog.kpis(), body);
  return data;
}

export async function getCatalogKpi(kpiId: string): Promise<CatalogKpi> {
  const { data } = await apiClient.get<CatalogKpi>(API.catalog.kpi(kpiId));
  return data;
}

export async function validateCatalogKpi(kpiId: string): Promise<{ kpi_id: string; status: string }> {
  const { data } = await apiClient.post(API.catalog.validateKpi(kpiId));
  return data;
}

export async function refreshCatalog(
  body: { scope_type: string; scope_value: string },
): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>(API.catalog.refreshStart(), body);
  return data;
}

export async function getRefreshStatus(runId: string): Promise<RefreshResponse> {
  const { data } = await apiClient.get<RefreshResponse>(API.catalog.refreshStatus(runId));
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
    API.snowflakeExplorer.objectDeepDive(objectId),
    { params: opts },
  );
  return data;
}

export async function getObjectActions(objectId: string): Promise<ActionsResponse> {
  const { data } = await apiClient.get<ActionsResponse>(
    API.snowflakeExplorer.objectActions(objectId),
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
    API.snowflakeExplorer.objectColumns(objectId),
  );
  return data;
}

export async function getObjectLineage(
  objectId: string,
  opts?: { direction?: 'upstream' | 'downstream' | 'both'; depth?: number },
): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectLineage(objectId),
    { params: opts },
  );
  return data;
}

export async function getObjectImpact(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectImpact(objectId),
  );
  return data;
}

export async function getObjectGovernanceTab(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectGovernance(objectId),
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
    API.snowflakeExplorer.objectUsage(objectId),
    { params: opts },
  );
  return data;
}

export async function getObjectAudit(objectId: string): Promise<ExplorerEnvelope> {
  const { data } = await apiClient.get<ExplorerEnvelope>(
    API.snowflakeExplorer.objectAudit(objectId),
  );
  return data;
}

export async function getObjectDdl(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectDdl(objectId),
  );
  return data;
}

export async function getObjectHealth(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectHealth(objectId),
  );
  return data;
}

export async function getObjectQuality(objectId: string): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectQuality(objectId),
  );
  return data;
}

export async function getObjectTimeline(
  objectId: string,
  opts?: { limit?: number },
): Promise<any> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectTimeline(objectId),
    { params: opts },
  );
  return data;
}

export async function getObjectOpenInSnowflake(
  objectId: string,
  accountUrl?: string,
): Promise<{ url?: string; [key: string]: any }> {
  const { data } = await apiClient.get(
    API.snowflakeExplorer.objectOpenInSnowflake(objectId),
    { params: accountUrl ? { account_url: accountUrl } : undefined },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Re-exports from mapping (for SourceTree which still uses metadata APIs)
// ---------------------------------------------------------------------------

export { getDatabases, getSchemas, getTables, getTableColumns } from '../mapping';
export type { TableColumn } from '../mapping';

// ---------------------------------------------------------------------------
// Re-exports — schema table inventory + non-project preview (catalog cockpit)
// ---------------------------------------------------------------------------

export {
  listCatalogSchemaTables,
  previewCatalogTable,
  probeCatalogSchemaFreshness,
} from './inventory';
export type {
  CatalogSchemaTable,
  CatalogSchemaTablesResult,
  CatalogSchemaProbeEntry,
  CatalogSchemaProbeResult,
  CatalogTablePreview,
} from './inventory';
