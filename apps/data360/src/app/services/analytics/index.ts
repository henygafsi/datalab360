/**
 * Analytics & KPIs Service
 * Provides user activity, query performance, warehouse usage, and cost attribution data
 *
 * Backend prefix: /analytics
 *
 * NOTE: Only 3 backend routes exist today:
 *   GET /analytics/platform-kpis
 *   GET /analytics/report
 *   GET /analytics/user-activity/summary
 *
 * All other endpoints below are speculative / planned and are wrapped in
 * try-catch with graceful empty-data fallbacks so the UI never throws.
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/analytics';

/**
 * Safely call an endpoint that may not exist yet.
 * Returns `fallback` on 404 / 400; re-throws everything else.
 */
async function safeGet<T>(url: string, fallback: T, params?: Record<string, any>): Promise<T> {
  try {
    const { data } = await apiClient.get(url, { params });
    return data?.data ?? data ?? fallback;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 400) return fallback;
    throw err;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface UserActivitySummary {
  total_users: number;
  active_users: number;
  total_queries: number;
  avg_queries_per_user: number;
  top_users: Array<{
    user_name: string;
    query_count: number;
    avg_execution_time_ms: number;
  }>;
}

export interface UserActivityDetail {
  user_name: string;
  query_count: number;
  total_execution_time_ms: number;
  avg_execution_time_ms: number;
  last_active: string;
  roles: string[];
}

export interface QueryPerformanceMetrics {
  total_queries: number;
  avg_execution_time_ms: number;
  p50_execution_time_ms: number;
  p95_execution_time_ms: number;
  p99_execution_time_ms: number;
  queries_by_type: Record<string, number>;
}

export interface SlowQuery {
  query_id: string;
  query_text: string;
  user_name: string;
  warehouse_name: string;
  execution_time_ms: number;
  start_time: string;
  rows_produced: number;
}

export interface WarehouseUsageMetrics {
  warehouse_name: string;
  credits_used: number;
  avg_load_percent: number;
  total_queries: number;
  avg_queue_time_ms: number;
}

export interface CostAttribution {
  entity_name: string;
  entity_type: string;
  credits_used: number;
  percentage_of_total: number;
}

// =============================================================================
// USER ACTIVITY
// =============================================================================

export async function getUserActivitySummary(days?: number): Promise<UserActivitySummary> {
  const { data } = await apiClient.get(`${PREFIX}/user-activity/summary`, {
    params: { days: days || 30 },
  });
  return data?.data || data;
}

/** NOTE: /analytics/user-activity/details does NOT exist in backend — graceful fallback */
export async function getUserActivityDetails(params?: {
  days?: number;
  user_name?: string;
}): Promise<UserActivityDetail[]> {
  return safeGet<UserActivityDetail[]>(`${PREFIX}/user-activity/details`, [], params);
}

/** NOTE: /analytics/user-activity/trends does NOT exist in backend — graceful fallback */
export async function getUserActivityTrends(days?: number): Promise<Array<{
  day: string;
  active_users: number;
  total_queries: number;
}>> {
  return safeGet(`${PREFIX}/user-activity/trends`, [], { days: days || 30 });
}

// =============================================================================
// QUERY PERFORMANCE
// =============================================================================

/** NOTE: /analytics/query-performance does NOT exist in backend — graceful fallback */
export async function getQueryPerformance(days?: number): Promise<QueryPerformanceMetrics> {
  return safeGet<QueryPerformanceMetrics>(`${PREFIX}/query-performance`, {
    total_queries: 0,
    avg_execution_time_ms: 0,
    p50_execution_time_ms: 0,
    p95_execution_time_ms: 0,
    p99_execution_time_ms: 0,
    queries_by_type: {},
  }, { days: days || 7 });
}

/** NOTE: /analytics/query-performance/slow does NOT exist in backend — graceful fallback */
export async function getSlowQueries(params?: {
  days?: number;
  limit?: number;
  min_execution_time_ms?: number;
}): Promise<SlowQuery[]> {
  return safeGet<SlowQuery[]>(`${PREFIX}/query-performance/slow`, [], params);
}

/** NOTE: /analytics/query-performance/by-warehouse does NOT exist in backend — graceful fallback */
export async function getQueryPerformanceByWarehouse(days?: number): Promise<Array<{
  warehouse_name: string;
  query_count: number;
  avg_execution_time_ms: number;
  total_credits: number;
}>> {
  return safeGet(`${PREFIX}/query-performance/by-warehouse`, [], { days: days || 7 });
}

/** NOTE: /analytics/query-performance/by-user does NOT exist in backend — graceful fallback */
export async function getQueryPerformanceByUser(days?: number): Promise<Array<{
  user_name: string;
  query_count: number;
  avg_execution_time_ms: number;
  total_bytes_scanned: number;
}>> {
  return safeGet(`${PREFIX}/query-performance/by-user`, [], { days: days || 7 });
}

// =============================================================================
// WAREHOUSE USAGE
// =============================================================================

/** NOTE: /analytics/warehouse-usage does NOT exist in backend — graceful fallback */
export async function getWarehouseUsage(days?: number): Promise<WarehouseUsageMetrics[]> {
  return safeGet<WarehouseUsageMetrics[]>(`${PREFIX}/warehouse-usage`, [], { days: days || 30 });
}

/** NOTE: /analytics/warehouse-usage/trends does NOT exist in backend — graceful fallback */
export async function getWarehouseUsageTrends(params?: {
  days?: number;
  warehouse?: string;
}): Promise<Array<{
  day: string;
  warehouse_name: string;
  credits_used: number;
}>> {
  return safeGet(`${PREFIX}/warehouse-usage/trends`, [], params);
}

/** NOTE: /analytics/warehouse-usage/idle does NOT exist in backend — graceful fallback */
export async function getIdleWarehouses(days?: number): Promise<Array<{
  warehouse_name: string;
  last_query_time: string;
  idle_hours: number;
  estimated_wasted_credits: number;
}>> {
  return safeGet(`${PREFIX}/warehouse-usage/idle`, [], { days: days || 7 });
}

// =============================================================================
// COST ATTRIBUTION
// =============================================================================

/** NOTE: /analytics/cost-attribution does NOT exist in backend — graceful fallback */
export async function getCostAttribution(params?: {
  days?: number;
  group_by?: 'warehouse' | 'user' | 'role' | 'database';
}): Promise<CostAttribution[]> {
  return safeGet<CostAttribution[]>(`${PREFIX}/cost-attribution`, [], params);
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  getUserActivitySummary,
  getUserActivityDetails,
  getUserActivityTrends,
  getQueryPerformance,
  getSlowQueries,
  getQueryPerformanceByWarehouse,
  getQueryPerformanceByUser,
  getWarehouseUsage,
  getWarehouseUsageTrends,
  getIdleWarehouses,
  getCostAttribution,
};
