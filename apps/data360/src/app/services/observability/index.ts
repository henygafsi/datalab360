/**
 * Observability API Services
 * Real-time monitoring, compliance, and intelligent KPIs
 */

import apiClient from '@/lib/api-client';
import type {
  IntelligentKpis,
  DashboardSummary,
  GdprReport,
  Soc2Report,
  LineageResponse,
  AccessPatternsResponse,
  UserActivitySummary,
  HeatmapResponse,
  LoginsResponse,
  SecurityPosture,
  SensitiveDataSummary,
  UnusedTablesResponse,
  DormantUsersResponse,
  WarehouseUsageSummary,
  DailyCreditsResponse,
  StorageMetrics,
  PerformanceMetrics,
  SlowQueriesResponse,
  HealthStatus,
} from './types';

/**
 * Secure API call wrapper with authentication error handling
 */
async function apiCall<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const { data } = await apiClient.request<T>({
    url: endpoint,
    method,
    data: body,
  });
  return data;
}

/**
 * Transform object keys from UPPERCASE to lowercase recursively
 * Handles Snowflake-style uppercase field names
 */
function transformKeys<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformKeys(item)) as T;
  }

  if (typeof obj === 'object') {
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Convert UPPERCASE_SNAKE_CASE to lowercase_snake_case
      const newKey = key.toLowerCase();
      transformed[newKey] = transformKeys(value);
    }
    return transformed as T;
  }

  return obj as T;
}

/**
 * API call with response transformation for Snowflake-style uppercase keys
 */
async function apiCallWithTransform<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const { data } = await apiClient.request({
    url: endpoint,
    method,
    data: body,
  });
  return transformKeys<T>(data);
}

// =============================================================================
// INTELLIGENT KPIs - MAIN DASHBOARD ENDPOINT
// =============================================================================

/**
 * Get intelligent KPIs with health scores and recommendations
 * GET /observability/kpis
 */
export async function getIntelligentKpis(): Promise<IntelligentKpis> {
  return apiCallWithTransform<IntelligentKpis>('/observability/kpis');
}
// =============================================================================
// COMPLIANCE ENDPOINTS - GDPR & SOC 2
// =============================================================================

/**
 * Generate GDPR compliance assessment report
 * GET /observability/compliance/gdpr
 */
export async function getGdprComplianceReport(): Promise<GdprReport> {
  return apiCallWithTransform<GdprReport>('/observability/compliance/gdpr');
}

/**
 * Generate SOC 2 Type II compliance assessment
 * GET /observability/compliance/soc2
 */
export async function getSoc2ComplianceReport(): Promise<Soc2Report> {
  return apiCallWithTransform<Soc2Report>('/observability/compliance/soc2');
}
// =============================================================================
// USER ACTIVITY ENDPOINTS
// =============================================================================

/**
 * Get summary of user activity from QUERY_HISTORY
 * GET /observability/activity/summary
 */
export async function getActivitySummary(days: number = 7): Promise<UserActivitySummary> {
  return apiCallWithTransform<UserActivitySummary>(`/observability/activity/summary?days=${days}`);
}
// =============================================================================
// SECURITY ENDPOINTS
// =============================================================================

/**
 * Get security assessment metrics
 * GET /observability/security/posture
 */
export async function getSecurityPosture(): Promise<SecurityPosture> {
  return apiCallWithTransform<SecurityPosture>('/observability/security/posture');
}
// =============================================================================
// COST & WAREHOUSE ENDPOINTS
// =============================================================================

/**
 * Get warehouse credit usage from WAREHOUSE_METERING_HISTORY
 * GET /observability/cost/warehouse-usage
 */
export async function getWarehouseUsage(days: number = 30): Promise<WarehouseUsageSummary> {
  return apiCallWithTransform<WarehouseUsageSummary>(`/observability/cost/warehouse-usage?days=${days}`);
}

/**
 * Get daily credit usage trend
 * GET /observability/cost/daily-credits
 */
export async function getDailyCredits(days: number = 30): Promise<DailyCreditsResponse> {
  return apiCallWithTransform<DailyCreditsResponse>(`/observability/cost/daily-credits?days=${days}`);
}

/**
 * Get storage usage metrics
 * GET /observability/cost/storage
 */
export async function getStorageMetrics(): Promise<StorageMetrics> {
  return apiCallWithTransform<StorageMetrics>('/observability/cost/storage');
}

// =============================================================================
// PERFORMANCE ENDPOINTS
// =============================================================================

/**
 * Get query performance statistics
 * GET /observability/performance/metrics
 */
export async function getPerformanceMetrics(days: number = 7): Promise<PerformanceMetrics> {
  return apiCallWithTransform<PerformanceMetrics>(`/observability/performance/metrics?days=${days}`);
}

/**
 * Get slow queries (execution time > threshold)
 * GET /observability/performance/slow-queries
 */
export async function getSlowQueries(params?: {
  days?: number;
  threshold_seconds?: number;
}): Promise<SlowQueriesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.days) searchParams.append('days', params.days.toString());
  if (params?.threshold_seconds) searchParams.append('threshold_seconds', params.threshold_seconds.toString());

  const queryString = searchParams.toString();
  return apiCallWithTransform<SlowQueriesResponse>(queryString ? `/observability/performance/slow-queries?${queryString}` : '/observability/performance/slow-queries');
}
// Re-export types for convenience
export * from './types';
