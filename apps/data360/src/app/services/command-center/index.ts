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
export async function getSummary(params?: FilterParams): Promise<SummaryResponse> {
  const { data } = await apiClient.get<SummaryResponse>(`${PREFIX}/summary`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Per-module health status */
export async function getModuleHealth(params?: { days?: number; module?: string }): Promise<ModuleHealthResponse> {
  const { data } = await apiClient.get<ModuleHealthResponse>(`${PREFIX}/module-health`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Unified activity feed across all modules */
export async function getActivityFeed(limit = 50, params?: { days?: number; module_name?: string; username?: string }): Promise<ActivityFeedResponse> {
  const { data } = await apiClient.get<ActivityFeedResponse>(`${PREFIX}/activity-feed`, {
    params: buildParams({ limit, ...params }),
  });
  return data;
}

/** Snowflake infrastructure snapshot */
export async function getInfrastructure(params?: { days?: number }): Promise<InfrastructureResponse> {
  const { data } = await apiClient.get<InfrastructureResponse>(`${PREFIX}/infrastructure`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Pipeline & ingestion health */
export async function getPipelines(params?: { days?: number }): Promise<PipelinesResponse> {
  const { data } = await apiClient.get<PipelinesResponse>(`${PREFIX}/pipelines`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Comprehensive cost intelligence */
export async function getCostBreakdown(days = 30, params?: { start_date?: string; end_date?: string; warehouse?: string; user?: string }): Promise<CostBreakdownResponse> {
  const { data } = await apiClient.get<CostBreakdownResponse>(`${PREFIX}/cost-breakdown`, {
    params: buildParams({ days, ...params }),
  });
  return data;
}

// =============================================================================
// NEW: Filter Intelligence & Cross-Module endpoints
// =============================================================================

/** Smart filter options with activity counts for dropdowns */
export async function getFilterOptions(days?: number): Promise<FilterOptionsResponse> {
  const { data } = await apiClient.get<FilterOptionsResponse>(`${PREFIX}/filter-options`, {
    params: buildParams({ days: days ?? 30 }),
  });
  return data;
}

/** Cross-module intelligence — joins Snowflake + Data360 metadata */
export async function getCrossModuleIntelligence(filters?: FilterParams): Promise<CrossModuleResponse> {
  const { data } = await apiClient.get<CrossModuleResponse>(`${PREFIX}/cross-module`, {
    params: buildParams(filters || {}),
  });
  return data;
}

/** Security & audit intelligence — logins, grants, policies, PII */
export async function getSecurityAudit(filters?: FilterParams): Promise<SecurityAuditResponse> {
  const { data } = await apiClient.get<SecurityAuditResponse>(`${PREFIX}/security-audit`, {
    params: buildParams({ days: filters?.days ?? 7, user: filters?.user }),
  });
  return data;
}

/** Warehouse utilization & performance metrics */
export async function getWarehousePerformance(filters?: FilterParams): Promise<WarehousePerformanceResponse> {
  const { data } = await apiClient.get<WarehousePerformanceResponse>(`${PREFIX}/warehouse-performance`, {
    params: buildParams({ days: filters?.days ?? 7, warehouse: filters?.warehouse }),
  });
  return data;
}

/** Top queries, slow queries, errors, volume trends */
export async function getQueryIntelligence(filters?: FilterParams): Promise<QueryIntelligenceResponse> {
  const { data } = await apiClient.get<QueryIntelligenceResponse>(`${PREFIX}/query-intelligence`, {
    params: buildParams({ days: filters?.days ?? 7, user: filters?.user, warehouse: filters?.warehouse }),
  });
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
  endDate?: string,
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
