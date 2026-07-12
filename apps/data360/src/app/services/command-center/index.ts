/**
 * Command Center API Services
 * Aggregated KPIs and monitoring across all Data360 modules
 */

import apiClient from '@/lib/api-client';
import type {
  SummaryResponse,
  ModuleHealthResponse,
  ActivityFeedResponse,
  InfrastructureResponse,
  PipelinesResponse,
  CostBreakdownResponse,
  FilterOptionsResponse,
  CrossModuleResponse,
  SecurityAuditResponse,
  WarehousePerformanceResponse,
  QueryIntelligenceResponse,
} from './types';

const PREFIX = '/command-center';

// =============================================================================
// Overview KPIs — consolidated single-call payload for Account-overview → Overview
// =============================================================================

export type OverviewRange = '24h' | '7d' | '30d' | '90d';

export interface OverviewKpiPayload {
  range: OverviewRange;
  account_locator: string | null;
  data360_users: number;
  connected_accounts: number;
  modules_active: number;
  modules_total: number;
  edition: string | null;
  region: string | null;
  current_role: string | null;
  account_name: string | null;
  subscription_end: string | null;
  workspace_health_pct: number;
  snowflake_health_pct: number;
  credits_used: number;
  active_projects: number;
  open_alerts: number;
  optimization_score_pct: number;
  projects_by_type: Record<string, number> | null;
  module_usage_7d: Record<string, number> | null;
  deployments_30d: number;
  deployments_30d_failed: number;
  workflow_runs_24h: number;
  workflow_runs_24h_failed: number;
  daily_snapshot: Array<{
    date: string;
    service_type: string;
    credits: number;
  }> | null;
  storage_bytes: number;
  stage_bytes: number;
  failsafe_bytes: number;
  cortex_credits: number;
  computed_at: string | null;
  cache_age_seconds: number | null;
  /**
   * False ONLY for the synthetic empty payload returned when the
   * OVERVIEW_KPIS cache table is unprovisioned (404/400). Lets the Overview
   * tab tell "genuinely zero" apart from "cache missing" so it can fall the
   * cards back to /command-center/summary (or "—") instead of rendering fake
   * zeros, and surface the admin "Provision KPIs" affordance. Undefined/true
   * on a real payload.
   */
  _provisioned?: boolean;
}

/**
 * Single call backing the entire Account-overview → Overview tab.
 * Replaces 4-6 live ACCOUNT_USAGE round-trips (8-28s) with one cached
 * payload (~50ms). Cache: CP_DATA360.DATA360_CACHE.OVERVIEW_KPIS
 * refreshed every 5 min by Snowflake task.
 */
function emptyOverviewKpiPayload(range: OverviewRange): OverviewKpiPayload {
  return {
    range,
    account_locator: null,
    data360_users: 0,
    connected_accounts: 0,
    modules_active: 0,
    modules_total: 0,
    edition: null,
    region: null,
    current_role: null,
    account_name: null,
    subscription_end: null,
    workspace_health_pct: 0,
    snowflake_health_pct: 0,
    credits_used: 0,
    active_projects: 0,
    open_alerts: 0,
    optimization_score_pct: 0,
    projects_by_type: null,
    module_usage_7d: null,
    deployments_30d: 0,
    deployments_30d_failed: 0,
    workflow_runs_24h: 0,
    workflow_runs_24h_failed: 0,
    daily_snapshot: null,
    storage_bytes: 0,
    stage_bytes: 0,
    failsafe_bytes: 0,
    cortex_credits: 0,
    computed_at: null,
    cache_age_seconds: null,
    _provisioned: false,
  };
}

export async function getOverviewKpis(
  range: OverviewRange = '30d'
): Promise<OverviewKpiPayload> {
  try {
    const res = await apiClient.get(`${PREFIX}/overview-kpis`, {
      params: { range },
    });
    return (res.data?.data ?? res.data) as OverviewKpiPayload;
  } catch (err: any) {
    // Backend route's intended contract is to return a structurally-empty
    // payload (HTTP 200) when the OVERVIEW_KPIS Snowflake cache schema isn't
    // provisioned. Some deployments still raise 404/400 because they predate
    // that fallback — degrade gracefully so the Overview tab keeps rendering
    // from /command-center/summary instead of throwing a toast.
    const status = err?.response?.status;
    if (status === 404 || status === 400) {
      return emptyOverviewKpiPayload(range);
    }
    throw err;
  }
}

// =============================================================================
// DWH Action Plan (/command-center/dwh-proposal) — "the platform tells you what
// to fix": cross-pillar pain points + duplicate-table detail, each carrying CTAs.
// =============================================================================

export type DwhSeverity = 'critical' | 'high' | 'medium' | 'low' | string;

export interface DwhProposalCta {
  type: string;
  label: string;
  action: string;
  target?: string;
  template?: string;
  safe?: boolean;
}

export interface DwhProposalItem {
  id: string;
  severity: DwhSeverity;
  title: string;
  detail: string;
  evidence?: number | string | null;
  remediation?: string;
  safe_reversible?: boolean;
  ctas?: DwhProposalCta[];
  example?: string;
}

export interface DwhProposalPillar {
  count: number;
  worst_severity?: DwhSeverity;
  items: DwhProposalItem[];
}

export interface DwhProposalDuplicate {
  table_name: string;
  copies: number;
  total_rows?: number;
  total_gb?: number;
  // NOTE: the backend serialises this as a JSON-encoded *string* (an array of
  // fully-qualified table paths), not a JSON array. Parse defensively.
  locations?: string;
}

export interface DwhProposalResponse {
  days: number;
  dwh_confidence: number;
  pain_points_total: number;
  pain_points_critical: number;
  headline: string;
  // Pillar keys are: governance | duplicates | performance | cost | data_quality
  pillars: Record<string, DwhProposalPillar>;
  duplicates_detail: DwhProposalDuplicate[];
  execution_time_ms?: number;
  computed_at?: string | null;
  meta?: {
    domain?: string;
    as_of?: string;
    lag_seconds?: number | null;
    cache_age_seconds?: number | null;
    refresh_endpoint?: string | null;
    stale?: boolean;
  };
}

/** DWH Action Plan — surfaced error (consumer owns the try/catch + retry). */
export async function getDwhProposal(days = 30): Promise<DwhProposalResponse> {
  const { data } = await apiClient.get<DwhProposalResponse>(
    `${PREFIX}/dwh-proposal`,
    { params: { days }, timeout: 120000 },
  );
  return data;
}

/** User-triggered cache refresh (Refresh button on the Overview header). */
export async function refreshOverviewKpis(
  range: OverviewRange = '30d'
): Promise<void> {
  try {
    await apiClient.post(`${PREFIX}/overview-kpis/refresh`, null, {
      params: { range },
    });
  } catch (err: any) {
    const status = err?.response?.status;
    // Same fallback as the GET: the cache proc may not be deployed.
    if (status === 404 || status === 400) return;
    throw err;
  }
}

/**
 * Result of a Provision-KPIs attempt. Distinguishes the three states the
 * admin CTA must report honestly:
 *   ok            — install proc ran (or the cache was already provisioned)
 *   not-deployed  — POST .../install returns 404 (endpoint not on this backend yet)
 *   forbidden     — 403 (caller's role can't create Snowflake objects)
 *   error         — any other failure; `message` carries the backend detail
 */
export type InstallKpisResult =
  | { status: 'ok' }
  | { status: 'not-deployed' }
  | { status: 'forbidden'; message: string }
  | { status: 'error'; message: string };

/**
 * Provision the OVERVIEW_KPIS Snowflake cache (table + proc + tasks).
 * Backs the admin-only "Provision KPIs" button on the Overview tab.
 * Creates Snowflake objects server-side — gate behind a confirm + admin role.
 */
export async function installOverviewKpis(): Promise<InstallKpisResult> {
  try {
    await apiClient.post(`${PREFIX}/overview-kpis/install`);
    return { status: 'ok' };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404) return { status: 'not-deployed' };
    const detail = err?.response?.data?.detail;
    const message =
      (typeof detail === 'string' ? detail : detail?.message) ??
      err?.message ??
      'Provisioning failed.';
    if (status === 403) return { status: 'forbidden', message: String(message) };
    return { status: 'error', message: String(message) };
  }
}

/** Build filter params — strips undefined values */
function buildParams(params: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      clean[k] = v;
    }
  }
  return clean;
}

// =============================================================================
// CONSOLIDATED TAB ENDPOINTS — one GET per Account-overview tab.
// Each takes a mandatory `days` window (1-365) and returns:
//   { kpis, charts, tables, days, execution_time_ms, computed_at, _fallback }
// `tables` carries drill-down rows for KPI auditing (50-200 rows per noun).
// =============================================================================

export type TabId =
  | 'overview'
  | 'snowflake-objects'
  | 'finops'
  | 'modules'
  | 'org-accounts'
  | 'platform-activity'
  | 'projects'
  | 'security'
  | 'snowflake-accounts';

export interface TabEnvelope<K = Record<string, unknown>,
                             C = Record<string, unknown>,
                             T = Record<string, unknown[]>> {
  kpis: K;
  charts: C;
  tables: T;
  days: number;
  execution_time_ms: number;
  computed_at: string;
  _fallback?: boolean;
  _errors?: Record<string, string>;
}

const TABS_PREFIX = '/command-center/tabs';

async function getTab<E extends TabEnvelope = TabEnvelope>(
  tab: TabId,
  days = 30,
  extra?: Record<string, string | number | undefined>
): Promise<E> {
  const params = buildParams({ days, ...extra });
  const { data } = await apiClient.get<E>(`${TABS_PREFIX}/${tab}`, { params });
  return data;
}

export const getOverviewTab = (days?: number) => getTab('overview', days);
export const getSnowflakeObjectsTab = (days?: number) => getTab('snowflake-objects', days);
export const getFinopsTab = (days?: number) => getTab('finops', days);
export const getModulesTab = (days?: number) => getTab('modules', days);
export const getOrgAccountsTab = (days?: number) => getTab('org-accounts', days);
export const getPlatformActivityTab = (days?: number) => getTab('platform-activity', days);
export const getProjectsTab = (days?: number) => getTab('projects', days);
export const getSecurityTab = (days?: number) => getTab('security', days);
export const getSnowflakeAccountsTab = (days?: number, accountName?: string) =>
  getTab('snowflake-accounts', days, { account_name: accountName });

/** Common filter params for cross-module filtering */
export interface FilterParams {
  days?: number;
  user?: string;
  warehouse?: string;
  database?: string;
  role?: string;
  module?: string;
  start_date?: string;
  end_date?: string;
}

/** Executive summary — top KPIs from all modules */
export async function getSummary(
  params?: FilterParams
): Promise<SummaryResponse> {
  const { data } = await apiClient.get<SummaryResponse>(`${PREFIX}/summary`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Per-module health status */
export async function getModuleHealth(params?: {
  days?: number;
  module?: string;
}): Promise<ModuleHealthResponse> {
  const { data } = await apiClient.get<ModuleHealthResponse>(
    `${PREFIX}/module-health`,
    {
      params: buildParams(params || {}),
    }
  );
  return data;
}

/** Unified activity feed across all modules */
export async function getActivityFeed(
  limit = 50,
  params?: { days?: number; module_name?: string; username?: string }
): Promise<ActivityFeedResponse> {
  const { data } = await apiClient.get<ActivityFeedResponse>(
    `${PREFIX}/activity-feed`,
    {
      params: buildParams({ limit, ...params }),
    }
  );
  return data;
}

/** Snowflake infrastructure snapshot */
export async function getInfrastructure(params?: {
  days?: number;
}): Promise<InfrastructureResponse> {
  const { data } = await apiClient.get<InfrastructureResponse>(
    `${PREFIX}/infrastructure`,
    {
      params: buildParams(params || {}),
    }
  );
  return data;
}

/** Pipeline & ingestion health */
export async function getPipelines(params?: {
  days?: number;
}): Promise<PipelinesResponse> {
  const { data } = await apiClient.get<PipelinesResponse>(
    `${PREFIX}/pipelines`,
    {
      params: buildParams(params || {}),
    }
  );
  return data;
}

/** Comprehensive cost intelligence */
export async function getCostBreakdown(
  days = 30,
  params?: {
    start_date?: string;
    end_date?: string;
    warehouse?: string;
    user?: string;
  }
): Promise<CostBreakdownResponse> {
  const { data } = await apiClient.get<CostBreakdownResponse>(
    `${PREFIX}/cost-breakdown`,
    {
      params: buildParams({ days, ...params }),
    }
  );
  return data;
}

// =============================================================================
// NEW: Filter Intelligence & Cross-Module endpoints
// =============================================================================

/** Smart filter options with activity counts for dropdowns */
export async function getFilterOptions(
  days?: number
): Promise<FilterOptionsResponse> {
  const { data } = await apiClient.get<FilterOptionsResponse>(
    `${PREFIX}/filter-options`,
    {
      params: buildParams({ days: days ?? 30 }),
    }
  );
  return data;
}

/** Cross-module intelligence — joins Snowflake + Data360 metadata */
export async function getCrossModuleIntelligence(
  filters?: FilterParams
): Promise<CrossModuleResponse> {
  const { data } = await apiClient.get<CrossModuleResponse>(
    `${PREFIX}/cross-module`,
    {
      params: buildParams(filters || {}),
    }
  );
  return data;
}

/** Security & audit intelligence — logins, grants, policies, PII */
export async function getSecurityAudit(
  filters?: FilterParams
): Promise<SecurityAuditResponse> {
  const { data } = await apiClient.get<SecurityAuditResponse>(
    `${PREFIX}/security-audit`,
    {
      params: buildParams({ days: filters?.days ?? 7, user: filters?.user }),
    }
  );
  return data;
}

/** Warehouse utilization & performance metrics */
export async function getWarehousePerformance(
  filters?: FilterParams
): Promise<WarehousePerformanceResponse> {
  const { data } = await apiClient.get<WarehousePerformanceResponse>(
    `${PREFIX}/warehouse-performance`,
    {
      params: buildParams({
        days: filters?.days ?? 7,
        warehouse: filters?.warehouse,
      }),
    }
  );
  return data;
}

/** Top queries, slow queries, errors, volume trends */
export async function getQueryIntelligence(
  filters?: FilterParams
): Promise<QueryIntelligenceResponse> {
  const { data } = await apiClient.get<QueryIntelligenceResponse>(
    `${PREFIX}/query-intelligence`,
    {
      params: buildParams({
        days: filters?.days ?? 7,
        user: filters?.user,
        warehouse: filters?.warehouse,
      }),
    }
  );
  return data;
}

// =============================================================================
// Sensors & Time Intelligence
// =============================================================================

/** Batch sensor check — per-module change status in one call */
export async function getSensors(): Promise<Record<string, any>> {
  const { data } = await apiClient.get(`/observability/sensors/all`);
  return data;
}

/** Parse time range preset into start/end/previous period for trend comparison */
export async function getTimeContext(
  preset?: string,
  startDate?: string,
  endDate?: string
) {
  const params: Record<string, string> = {};
  if (preset) params.preset = preset;
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  const { data } = await apiClient.get(`${PREFIX}/time-context`, { params });
  return data;
}

// =============================================================================
// Data Freshness — avoid unnecessary re-renders
// =============================================================================

/**
 * Check if data has changed since last fetch — avoids unnecessary re-renders.
 * Compares current row timestamps against cached baselines in Redis.
 *
 * @param tables - Array of fully-qualified table names (e.g. "DB.SCHEMA.TABLE")
 * @returns Map of table_fqn -> has_changed (boolean)
 */
export async function checkDataFreshness(
  tables: string[]
): Promise<Record<string, boolean>> {
  const { data } = await apiClient.post<Record<string, boolean>>(
    '/observability/probes/batch-check',
    { tables }
  );
  return data;
}

// =============================================================================
// Generic KPI tables — command_center endpoints that compute rich FinOps /
// governance data.
// All return { data: Array<Record<string, any>>, count, days } with UPPERCASE keys.
// =============================================================================

export interface KpiTableResponse {
  data: Array<Record<string, any>>;
  count: number;
  days?: number;
}

async function _kpiTable(path: string, days?: number): Promise<KpiTableResponse> {
  try {
    const params = days != null ? { days } : undefined;
    const { data } = await apiClient.get<KpiTableResponse>(`${PREFIX}${path}`, { params });
    return data && Array.isArray(data.data) ? data : { data: [], count: 0, days };
  } catch {
    return { data: [], count: 0, days };
  }
}

export const getCostByWarehouse = (days = 30) => _kpiTable('/cost-by-warehouse', days);
export const getCostByService = (days = 30) => _kpiTable('/cost-by-service', days);
export const getClusteringCosts = (days = 30) => _kpiTable('/clustering-costs', days);
export const getPipeUsage = (days = 30) => _kpiTable('/pipe-usage', days);
export const getMvRefreshCosts = (days = 30) => _kpiTable('/mv-refresh-costs', days);
export const getTaskHistory = (days = 30) => _kpiTable('/task-history', days);
export const getTableStorage = (days = 30) => _kpiTable('/table-storage', days);
export const getRoleHierarchy = () => _kpiTable('/role-hierarchy');

// ── Real object lineage graph (OBJECT_DEPENDENCIES + ACCESS_HISTORY) ──────────
export interface LineageNode {
  id: string;
  label: string;
  kind: string; // 'object' | 'view' | 'source'
  depth: number; // -1 upstream · 0 self · 1 downstream
  order?: number;
  hits?: number | null;
  domain?: string;
}
export interface LineageEdge {
  source: string;
  target: string;
  kind: string; // 'structural' | 'query'
}
export interface ObjectLineageResponse {
  data: { nodes: LineageNode[]; edges: LineageEdge[] };
  count?: number;
  meta?: { access_history?: boolean; fqn?: string; days?: number; hops?: number };
}
export async function getObjectLineage(p: {
  database: string;
  schema: string;
  object: string;
  days?: number;
}): Promise<ObjectLineageResponse | null> {
  try {
    const { data } = await apiClient.get<ObjectLineageResponse>(`${PREFIX}/object-lineage`, {
      params: { database: p.database, schema: p.schema, object: p.object, days: p.days ?? 30 },
    });
    return data;
  } catch {
    return null;
  }
}

// ── Per-object USAGE + COST enrichment (ACCESS_HISTORY + QUERY_ATTRIBUTION) ────
// One FULL-OUTER payload merged onto the table-storage Explorer rows. Unlike
// `_kpiTable`, this PRESERVES `meta`/`degraded` so the Explorer can tell
// "usage/cost unavailable on this edition" apart from "genuinely zero": the
// backend returns 200 + `degraded:true` when ACCESS_HISTORY /
// QUERY_ATTRIBUTION_HISTORY are missing (non-Enterprise edition or no IMPORTED
// PRIVILEGES). `attributed_usd` is attributed COMPUTE (strictly ≤ total), never
// total object cost. Keys arrive lowercase ({k.lower(): v} on the backend).
export interface ObjectEnrichmentRow {
  database_name: string;
  schema_name: string;
  table_name: string;
  access_count: number | null;
  distinct_users: number | null;
  distinct_roles: number | null;
  roles: string[] | null;          // up to 8 accessing-role names (sample)
  projects: number | null;         // distinct DATA360_PROJECT tag values
  products: number | null;         // distinct DATA360_PRODUCT tag values
  last_accessed: string | null;
  attributed_credits: number | null;
  attributed_usd: number | null;   // attributed compute (≤ total), not total cost
  billable_queries: number | null;
}

export interface KpiMetaResponse<T = Record<string, any>> {
  data: T[];
  count: number;
  columns?: string[];
  degraded?: boolean;              // true → unavailable (edition/privilege) OR request failed
  reason?: string;
  meta?: Record<string, unknown>;
}

// Meta-preserving sibling of `_kpiTable` — do NOT fold the two together: the
// existing `_kpiTable` callers rely on the `{data,count,days}` shape and would
// silently drop the `degraded`/`meta` flags these enrichment endpoints emit.
async function _kpiTableMeta<T = Record<string, any>>(
  path: string,
  params?: Record<string, unknown>
): Promise<KpiMetaResponse<T>> {
  try {
    const { data } = await apiClient.get<KpiMetaResponse<T>>(`${PREFIX}${path}`, { params });
    return data && Array.isArray(data.data)
      ? data
      : { data: [], count: 0, degraded: false };
  } catch {
    return { data: [], count: 0, degraded: true, reason: 'request_failed' };
  }
}

/**
 * Per-object usage + attributed compute, single FULL-OUTER payload over one
 * ACCESS_HISTORY window. `days` is capped ≤ 90 backend-side (heavy scan);
 * `creditRate` = $/credit. Returns `{ data, count, degraded?, reason?, meta? }`
 * — keep the `degraded` flag to distinguish "unavailable" from "genuinely zero".
 */
export const getObjectEnrichment = (days = 90, creditRate = 3.0) =>
  _kpiTableMeta<ObjectEnrichmentRow>('/object-enrichment', { days, credit_rate: creditRate });

// =============================================================================
// Snowflake-features AI Advisor — single guarded payload of actionable insights.
// Backed by GET /command-center/snowflake-insights (snowflake_insights.py).
// Each insight already carries its COHERENT action route (security/users/network/
// governance → governance, cost → finops tab, storage → explore-design, dq →
// data-quality), so the panel just renders + router.push(action.route).
// =============================================================================

export type InsightCategory =
  | 'cost' | 'security' | 'users' | 'network' | 'performance'
  | 'storage' | 'governance' | 'sharing' | 'reliability';

export type InsightSeverity = 'critical' | 'high' | 'warning' | 'info';

export type InsightActionModule =
  | 'governance' | 'explore-design' | 'data-quality' | 'workflow'
  | 'bi-dashboard' | 'connect' | 'finops-tab' | 'security-tab';

export interface InsightAction {
  label: string;
  module: InsightActionModule;
  route: string;   // REAL app route, e.g. /governance/users or /account-overview?tab=finops
  intent: string;  // slug the target page can prefill on
}

export interface SnowflakeInsight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  detail: string;
  metric: number | string | null;
  unit?: string | null;
  feature: string; // analysed Snowflake feature, e.g. "USERS", "NETWORK_POLICIES"
  action: InsightAction;
}

export interface SnowflakeInsightsPayload {
  insights: SnowflakeInsight[];
  generated_at: string;
  /** Feature keys whose whole analysis class failed (edition/privilege/error). */
  degraded?: string[];
}

/**
 * Fetch the Snowflake-features AI analysis. Tolerates failure `_kpiTableMeta`-style:
 * on any error returns an empty, explicitly-degraded payload instead of throwing, so
 * the advisor panel renders an honest "analysis unavailable" state rather than a toast.
 */
export async function getSnowflakeInsights(): Promise<SnowflakeInsightsPayload> {
  try {
    const { data } = await apiClient.get<SnowflakeInsightsPayload>(
      `${PREFIX}/snowflake-insights`
    );
    if (data && Array.isArray(data.insights)) {
      return {
        insights: data.insights,
        generated_at: data.generated_at ?? new Date().toISOString(),
        degraded: Array.isArray(data.degraded) ? data.degraded : undefined,
      };
    }
    return { insights: [], generated_at: new Date().toISOString(), degraded: ['request_failed'] };
  } catch {
    return { insights: [], generated_at: new Date().toISOString(), degraded: ['request_failed'] };
  }
}

// ── Governance Intelligence — the one aggregate the Governance cockpit consumes ──
// GET /account-overview/governance/intelligence (backend governance_intelligence.py).
// Reuse-first: composes compliance score + gov KPI detail + the /api/recommendations
// lifecycle store + activity feed into score summary + compact KPI cards (no-dash) +
// server-paginated/filterable findings + timeline + facets, with per-section degrade.

export interface GovIntelKpiCard {
  id: string; label: string; value: number | string | null;
  unit?: string; tone?: 'red' | 'amber' | 'green' | null; group?: string;
}
export interface GovIntelFinding {
  finding_id: string; kind: 'identity' | 'policy' | 'recommendation'; severity: string;
  finding: string; user: string | null; role: string | null; object: string | null;
  recommendation: string | null; status: string; evidence: Record<string, unknown>;
  window_days: number | null;
}
export interface GovIntelTimelineEvent {
  ts: string; module: string | null; event_type: string | null;
  status: string | null; actor: string | null; severity: string | null;
}
export interface GovIntelResponse {
  generated_at: string; account: string; window_days: number;
  score_summary: { score: number | null; scope: string; breakdown: Record<string, unknown>;
    critical_findings: number; open_recommendations: number };
  kpi_cards: GovIntelKpiCard[];
  more_metrics: GovIntelKpiCard[];
  timeline: GovIntelTimelineEvent[];
  recommendations: Array<Record<string, unknown>>;
  allowed_actions: Record<string, string[]>;
  sources: string[];
  degraded_sources: Record<string, string>;
  audit: {
    rows: GovIntelFinding[]; page: number; page_size: number;
    total_rows: number; filtered_rows: number; has_next: boolean;
    sort_by: string; sort_order: string; applied_filters: Record<string, string>;
  };
  facets: { severity: string[]; kind: string[]; status: string[]; users: string[]; date_presets_days: number[] };
  cache: { ttl_seconds: number; generated_at: string };
}

export interface GovIntelParams {
  days?: number; severity?: string; kind?: string; user?: string; status?: string;
  q?: string; page?: number; page_size?: number; sort_by?: string; sort_order?: string;
}

/** Fetch the governance cockpit payload. Never throws — degraded payload on error. */
export async function getGovernanceIntelligence(params: GovIntelParams = {}): Promise<GovIntelResponse | null> {
  try {
    const { data } = await apiClient.get<GovIntelResponse>(
      '/account-overview/governance/intelligence', { params });
    return data;
  } catch {
    return null;
  }
}
