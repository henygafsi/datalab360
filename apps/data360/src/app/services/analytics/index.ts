/**
 * Analytics & KPIs Service
 * Provides user activity, query performance, warehouse usage, and cost attribution data
 *
 * Backend prefix: /analytics
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/analytics';

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

export async function getUserActivityDetails(params?: {
  days?: number;
  user_name?: string;
}): Promise<UserActivityDetail[]> {
  const { data } = await apiClient.get(`${PREFIX}/user-activity/details`, { params });
  return data?.data || data || [];
}

export async function getUserActivityTrends(days?: number): Promise<Array<{
  day: string;
  active_users: number;
  total_queries: number;
}>> {
  const { data } = await apiClient.get(`${PREFIX}/user-activity/trends`, {
    params: { days: days || 30 },
  });
  return data?.data || data || [];
}

// =============================================================================
// QUERY PERFORMANCE
// =============================================================================

export async function getQueryPerformance(days?: number): Promise<QueryPerformanceMetrics> {
  const { data } = await apiClient.get(`${PREFIX}/query-performance`, {
    params: { days: days || 7 },
  });
  return data?.data || data;
}

export async function getSlowQueries(params?: {
  days?: number;
  limit?: number;
  min_execution_time_ms?: number;
}): Promise<SlowQuery[]> {
  const { data } = await apiClient.get(`${PREFIX}/query-performance/slow`, { params });
  return data?.data || data || [];
}

export async function getQueryPerformanceByWarehouse(days?: number): Promise<Array<{
  warehouse_name: string;
  query_count: number;
  avg_execution_time_ms: number;
  total_credits: number;
}>> {
  const { data } = await apiClient.get(`${PREFIX}/query-performance/by-warehouse`, {
    params: { days: days || 7 },
  });
  return data?.data || data || [];
}

export async function getQueryPerformanceByUser(days?: number): Promise<Array<{
  user_name: string;
  query_count: number;
  avg_execution_time_ms: number;
  total_bytes_scanned: number;
}>> {
  const { data } = await apiClient.get(`${PREFIX}/query-performance/by-user`, {
    params: { days: days || 7 },
  });
  return data?.data || data || [];
}

// =============================================================================
// WAREHOUSE USAGE
// =============================================================================

export async function getWarehouseUsage(days?: number): Promise<WarehouseUsageMetrics[]> {
  const { data } = await apiClient.get(`${PREFIX}/warehouse-usage`, {
    params: { days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getWarehouseUsageTrends(params?: {
  days?: number;
  warehouse?: string;
}): Promise<Array<{
  day: string;
  warehouse_name: string;
  credits_used: number;
}>> {
  const { data } = await apiClient.get(`${PREFIX}/warehouse-usage/trends`, { params });
  return data?.data || data || [];
}

export async function getIdleWarehouses(days?: number): Promise<Array<{
  warehouse_name: string;
  last_query_time: string;
  idle_hours: number;
  estimated_wasted_credits: number;
}>> {
  const { data } = await apiClient.get(`${PREFIX}/warehouse-usage/idle`, {
    params: { days: days || 7 },
  });
  return data?.data || data || [];
}

// =============================================================================
// COST ATTRIBUTION
// =============================================================================

export async function getCostAttribution(params?: {
  days?: number;
  group_by?: 'warehouse' | 'user' | 'role' | 'database';
}): Promise<CostAttribution[]> {
  const { data } = await apiClient.get(`${PREFIX}/cost-attribution`, { params });
  return data?.data || data || [];
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
