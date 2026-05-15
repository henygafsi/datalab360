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
