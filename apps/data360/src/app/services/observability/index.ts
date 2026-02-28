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

/**
 * Get aggregated observability dashboard data
 * GET /observability/dashboard
 */
export async function getObservabilityDashboard(): Promise<DashboardSummary> {
  return apiCallWithTransform<DashboardSummary>('/observability/dashboard');
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
// DATA LINEAGE ENDPOINTS
// =============================================================================

/**
 * Get data lineage information
 * GET /observability/lineage
 */
export async function getDataLineage(params?: {
  database?: string;
  schema?: string;
  table?: string;
  days?: number;
}): Promise<LineageResponse> {
  const searchParams = new URLSearchParams();
  if (params?.database) searchParams.append('database', params.database);
  if (params?.schema) searchParams.append('schema', params.schema);
  if (params?.table) searchParams.append('table', params.table);
  if (params?.days) searchParams.append('days', params.days.toString());

  const queryString = searchParams.toString();
  return apiCall<LineageResponse>(queryString ? `/observability/lineage?${queryString}` : '/observability/lineage');
}

/**
 * Get table access patterns
 * GET /observability/lineage/access-patterns
 */
export async function getAccessPatterns(days: number = 30): Promise<AccessPatternsResponse> {
  return apiCall<AccessPatternsResponse>(`/observability/lineage/access-patterns?days=${days}`);
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

/**
 * Get activity heatmap data (hour x day of week)
 * GET /observability/activity/heatmap
 */
export async function getActivityHeatmap(days: number = 7): Promise<HeatmapResponse> {
  return apiCall<HeatmapResponse>(`/observability/activity/heatmap?days=${days}`);
}

/**
 * Get login history from LOGIN_HISTORY
 * GET /observability/activity/logins
 */
export async function getLoginHistory(params?: {
  username?: string;
  days?: number;
}): Promise<LoginsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.username) searchParams.append('username', params.username);
  if (params?.days) searchParams.append('days', params.days.toString());

  const queryString = searchParams.toString();
  return apiCall<LoginsResponse>(queryString ? `/observability/activity/logins?${queryString}` : '/observability/activity/logins');
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

/**
 * Get summary of tables potentially containing PII
 * GET /observability/security/sensitive-data
 */
export async function getSensitiveDataSummary(): Promise<SensitiveDataSummary> {
  return apiCall<SensitiveDataSummary>('/observability/security/sensitive-data');
}

// =============================================================================
// UNUSED RESOURCES ENDPOINTS
// =============================================================================

/**
 * Find tables that haven't been accessed in N days
 * GET /observability/resources/unused-tables
 */
export async function getUnusedTables(daysThreshold: number = 30): Promise<UnusedTablesResponse> {
  return apiCall<UnusedTablesResponse>(`/observability/resources/unused-tables?days_threshold=${daysThreshold}`);
}

/**
 * Find users who haven't logged in for N days
 * GET /observability/resources/dormant-users
 */
export async function getDormantUsers(daysThreshold: number = 90): Promise<DormantUsersResponse> {
  return apiCall<DormantUsersResponse>(`/observability/resources/dormant-users?days_threshold=${daysThreshold}`);
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

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Simple health check endpoint
 * GET /observability/health
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  return apiCall<HealthStatus>('/observability/health');
}

// =============================================================================
// OBJECT DEPENDENCIES
// =============================================================================

/**
 * Get object dependencies (upstream/downstream lineage)
 * GET /observability/dependencies
 */
export async function getObjectDependencies(params?: {
  object_name?: string;
  object_domain?: string;
  direction?: 'upstream' | 'downstream';
  days?: number;
}): Promise<any> {
  const searchParams = new URLSearchParams();
  if (params?.object_name) searchParams.append('object_name', params.object_name);
  if (params?.object_domain) searchParams.append('object_domain', params.object_domain);
  if (params?.direction) searchParams.append('direction', params.direction);
  if (params?.days) searchParams.append('days', params.days.toString());
  const qs = searchParams.toString();
  return apiCall<any>(qs ? `/observability/dependencies?${qs}` : '/observability/dependencies');
}

/**
 * Get full dependency graph for a database/schema
 * GET /observability/dependencies/graph
 */
export async function getDependencyGraph(params?: {
  database?: string;
  schema?: string;
}): Promise<any> {
  const searchParams = new URLSearchParams();
  if (params?.database) searchParams.append('database', params.database);
  if (params?.schema) searchParams.append('schema', params.schema);
  const qs = searchParams.toString();
  return apiCall<any>(qs ? `/observability/dependencies/graph?${qs}` : '/observability/dependencies/graph');
}

// =============================================================================
// TRUST CENTER
// =============================================================================

/**
 * Get Trust Center security findings
 * GET /observability/trust-center/findings
 */
export async function getTrustCenterFindings(): Promise<any> {
  return apiCall<any>('/observability/trust-center/findings');
}

/**
 * Get Trust Center summary overview
 * GET /observability/trust-center/summary
 */
export async function getTrustCenterSummary(): Promise<any> {
  return apiCall<any>('/observability/trust-center/summary');
}

// Re-export types for convenience
export * from './types';
