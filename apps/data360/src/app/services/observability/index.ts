/**
 * Observability API Services
 * Real-time monitoring, compliance, and intelligent KPIs
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import type {
  IntelligentKpis,
  GdprReport,
  Soc2Report,
  LineageResponse,
  AccessPatternsResponse,
  UserActivitySummary,
  SecurityPosture,
  WarehouseUsageSummary,
  DailyCreditsResponse,
  StorageMetrics,
  PerformanceMetrics,
  SlowQueriesResponse,
  HealthStatus,
  ObservabilityRecord,
  AlertsResponse,
  SloTrackingResponse,
  PlatformConfigResponse,
  PlatformConfigEntry,
  CostMonitor,
  CostMonitorsResponse,
  CreateCostMonitorRequest,
  UpdateCostMonitorRequest,
  SpendBudgetsResponse,
  CreateSpendBudgetRequest,
} from './types';

/**
 * Returned by graceful service wrappers so a UI can tell an *undeployed* route
 * (404 / 501) apart from a genuine failure and degrade to an inline
 * "not available yet" state instead of crashing or faking data.
 */
export class RouteNotDeployedError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? 'This capability is not available on the connected backend yet.');
    this.name = 'RouteNotDeployedError';
    this.status = status;
  }
}

/** True when the backend route is missing (404) or not implemented (501). */
export function isRouteNotDeployed(error: unknown): error is RouteNotDeployedError {
  if (error instanceof RouteNotDeployedError) return true;
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return status === 404 || status === 501;
}

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
  return apiCallWithTransform<IntelligentKpis>(API.observability.kpis());
}
// =============================================================================
// COMPLIANCE ENDPOINTS - GDPR & SOC 2
// =============================================================================

/**
 * Generate GDPR compliance assessment report
 * GET /observability/compliance/gdpr
 */
export async function getGdprComplianceReport(): Promise<GdprReport> {
  return apiCallWithTransform<GdprReport>(API.observability.complianceGdpr());
}

/**
 * Generate SOC 2 Type II compliance assessment
 * GET /observability/compliance/soc2
 */
export async function getSoc2ComplianceReport(): Promise<Soc2Report> {
  return apiCallWithTransform<Soc2Report>(API.observability.complianceSoc2());
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
  return apiCall<LineageResponse>(API.observability.lineage(params));
}

/**
 * Get table access patterns
 * GET /observability/lineage/access-patterns
 */
export async function getAccessPatterns(days: number = 30): Promise<AccessPatternsResponse> {
  return apiCall<AccessPatternsResponse>(API.observability.lineageAccessPatterns(days));
}

/**
 * Get cross-module lineage: objects → roles → policies
 * GET /observability/lineage/cross-module
 */
export async function getCrossModuleLineage(params?: {
  days?: number;
  database?: string;
}): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.lineageCrossModule(params));
}

// =============================================================================
// USER ACTIVITY ENDPOINTS
// =============================================================================

/**
 * Get summary of user activity from QUERY_HISTORY
 * GET /observability/activity/summary
 */
export async function getActivitySummary(days: number = 7): Promise<UserActivitySummary> {
  return apiCallWithTransform<UserActivitySummary>(API.observability.activitySummary(days));
}
// =============================================================================
// SECURITY ENDPOINTS
// =============================================================================

/**
 * Get security assessment metrics
 * GET /observability/security/posture
 */
export async function getSecurityPosture(): Promise<SecurityPosture> {
  return apiCallWithTransform<SecurityPosture>(API.observability.securityPosture());
}
// =============================================================================
// COST & WAREHOUSE ENDPOINTS
// =============================================================================

/**
 * Get warehouse credit usage from WAREHOUSE_METERING_HISTORY
 * GET /observability/cost/warehouse-usage
 */
export async function getWarehouseUsage(days: number = 30): Promise<WarehouseUsageSummary> {
  return apiCallWithTransform<WarehouseUsageSummary>(API.observability.warehouseUsage(days));
}

/**
 * Get daily credit usage trend
 * GET /observability/cost/daily-credits
 */
export async function getDailyCredits(days: number = 30): Promise<DailyCreditsResponse> {
  return apiCallWithTransform<DailyCreditsResponse>(API.observability.dailyCredits(days));
}

/**
 * Get storage usage metrics
 * GET /observability/cost/storage
 */
export async function getStorageMetrics(): Promise<StorageMetrics> {
  return apiCallWithTransform<StorageMetrics>(API.observability.storage());
}

// =============================================================================
// PERFORMANCE ENDPOINTS
// =============================================================================

/**
 * Get query performance statistics
 * GET /observability/performance/metrics
 */
export async function getPerformanceMetrics(days: number = 7): Promise<PerformanceMetrics> {
  return apiCallWithTransform<PerformanceMetrics>(API.observability.performanceMetrics(days));
}

/**
 * Get slow queries (execution time > threshold)
 * GET /observability/performance/slow-queries
 */
export async function getSlowQueries(params?: {
  days?: number;
  threshold_seconds?: number;
}): Promise<SlowQueriesResponse> {
  return apiCallWithTransform<SlowQueriesResponse>(API.observability.slowQueries(params));
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Simple health check endpoint
 * GET /observability/health
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  return apiCall<HealthStatus>(API.observability.health());
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
}): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.dependencies(params));
}

/**
 * Get full dependency graph for a database/schema
 * GET /observability/dependencies/graph
 */
export async function getDependencyGraph(params?: {
  database?: string;
  schema?: string;
}): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.dependenciesGraph(params));
}

// =============================================================================
// TRUST CENTER
// =============================================================================

/**
 * Get Trust Center security findings
 * GET /observability/trust-center/findings
 */
export async function getTrustCenterFindings(): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.trustCenterFindings());
}

/**
 * Get Trust Center summary overview
 * GET /observability/trust-center/summary
 */
export async function getTrustCenterSummary(): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.trustCenterSummary());
}

// =============================================================================
// TASK-ENRICHED LINEAGE
// =============================================================================

/**
 * Get intelligent lineage with tasks merged into graph
 * GET /observability/lineage/with-tasks
 */
export async function getLineageWithTasks(params?: {
  database?: string;
  days?: number;
}): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.lineageWithTasks(params));
}

/**
 * Get importable tasks (for workflow import)
 * GET /observability/tasks/importable
 */
export async function getImportableTasks(state: string = 'suspended'): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.tasksImportable(state));
}

// =============================================================================
// REFRESH PROBES — Row Timestamps (METADATA$ROW_LAST_MODIFIED_AT)
// =============================================================================

/**
 * Probe table freshness using Snowflake row timestamps
 * GET /observability/probes/table
 */
export async function probeTableFreshness(table: string): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.probesTable(table));
}

/**
 * Probe all tables in a schema for freshness
 * GET /observability/probes/schema
 */
export async function probeSchemaFreshness(database: string, schema: string): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.probesSchema(database, schema));
}

/**
 * Detect rows changed since a specific timestamp
 * GET /observability/probes/changes
 */
export async function probeChanges(table: string, since: string): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.probesChanges(table, since));
}

/**
 * Probe all Data360 metadata tables for freshness
 * GET /observability/probes/platform
 */
export async function probePlatformFreshness(): Promise<ObservabilityRecord> {
  return apiCall<ObservabilityRecord>(API.observability.probesPlatform());
}

// =============================================================================
// ALERTS
// =============================================================================

/**
 * Get observability alerts (cost spikes, failed tasks, security findings…).
 * GET /observability/alerts
 */
export async function getObservabilityAlerts(days: number = 7): Promise<AlertsResponse> {
  return apiCallWithTransform<AlertsResponse>(API.observability.alerts(days));
}

/**
 * Get cross-module correlated alerts.
 * GET /observability/alerts/cross-module
 */
export async function getCrossModuleAlerts(days: number = 7): Promise<AlertsResponse> {
  return apiCallWithTransform<AlertsResponse>(API.observability.alertsCrossModule(days));
}

/**
 * Acknowledge an alert. `acknowledgedBy` must be the REAL session username —
 * the backend records who took ownership (never send a placeholder string).
 * POST /observability/alerts/{alertId}/ack
 */
export async function acknowledgeObservabilityAlert(
  alertId: string,
  acknowledgedBy: string,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>(
    API.observability.acknowledgeAlert(alertId),
    { acknowledged_by: acknowledgedBy },
  );
  return data;
}

// =============================================================================
// SLO TRACKING
// =============================================================================

/**
 * Get service-level objective tracking (targets vs. actuals, error budgets).
 * GET /observability/slo-tracking
 */
export async function getSloTracking(days: number = 30): Promise<SloTrackingResponse> {
  return apiCallWithTransform<SloTrackingResponse>(API.observability.sloTracking(days));
}

// =============================================================================
// CONSOLIDATED DASHBOARD
// =============================================================================

/**
 * Consolidated observability dashboard payload (KPIs + activity + cost + storage).
 * GET /observability/dashboard
 */
export async function getObservabilityDashboard(): Promise<ObservabilityRecord> {
  return apiCallWithTransform<ObservabilityRecord>(API.observability.dashboard());
}

// =============================================================================
// PLATFORM CONFIG — CRUD (/api/data360/platform-config*)
// =============================================================================

/**
 * List all platform configuration entries.
 * GET /api/data360/platform-config
 */
export async function getPlatformConfig(): Promise<PlatformConfigResponse> {
  return apiCall<PlatformConfigResponse>('/api/data360/platform-config');
}

/**
 * Read a single platform config entry by key.
 * GET /api/data360/platform-config/{key}
 */
export async function getPlatformConfigEntry(key: string): Promise<PlatformConfigEntry> {
  return apiCall<PlatformConfigEntry>(`/api/data360/platform-config/${encodeURIComponent(key)}`);
}

/**
 * Create or update a platform config entry.
 * PUT /api/data360/platform-config/{key}
 */
export async function updatePlatformConfigEntry(
  key: string,
  value: unknown,
  meta?: { description?: string; category?: string },
): Promise<PlatformConfigEntry> {
  const { data } = await apiClient.put<PlatformConfigEntry>(
    `/api/data360/platform-config/${encodeURIComponent(key)}`,
    { value, ...meta },
  );
  return data;
}

/**
 * Reset platform config to defaults.
 * POST /api/data360/platform-config/reset
 */
export async function resetPlatformConfig(): Promise<PlatformConfigResponse> {
  return apiCall<PlatformConfigResponse>('/api/data360/platform-config/reset', 'POST');
}

// =============================================================================
// FINOPS — RESOURCE MONITORS (cost-control write surface)
// -----------------------------------------------------------------------------
// Reads/writes Snowflake RESOURCE MONITORs via /observability/cost/monitors.
// Writes require ACCOUNTADMIN + the configure-budget action server-side, so a
// gated-but-denied click can still 403/422 — callers surface getApiErrorMessage
// inline. Routes may 404 until deployed → callers use isRouteNotDeployed().
// =============================================================================

/**
 * List all resource monitors with quota / used / remaining credits.
 * GET /observability/cost/monitors
 */
export async function getCostMonitors(): Promise<CostMonitorsResponse> {
  return apiCall<CostMonitorsResponse>(API.observability.costMonitors());
}

/**
 * Read a single resource monitor by name (404 if absent).
 * GET /observability/cost/monitors/{name}
 */
export async function getCostMonitor(name: string): Promise<{ monitor: CostMonitor }> {
  return apiCall<{ monitor: CostMonitor }>(API.observability.costMonitor(name));
}

/**
 * Create a resource monitor (CREATE RESOURCE MONITOR ... WITH CREDIT_QUOTA ...).
 * POST /observability/cost/monitors
 */
export async function createCostMonitor(body: CreateCostMonitorRequest): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>(API.observability.costMonitors(), body);
  return data;
}

/**
 * Update a resource monitor (ALTER — quota / frequency / triggers / notify / assign).
 * Only supplied fields change; at least one is required (422 otherwise).
 * PUT /observability/cost/monitors/{name}
 */
export async function updateCostMonitor(
  name: string,
  body: UpdateCostMonitorRequest,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.put<Record<string, unknown>>(
    API.observability.costMonitor(name),
    body,
  );
  return data;
}

/**
 * Attach a warehouse to a resource monitor.
 * POST /observability/cost/monitors/{name}/assign
 */
export async function assignCostMonitorWarehouse(
  name: string,
  warehouse: string,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>(
    API.observability.costMonitorAssign(name),
    { warehouse },
  );
  return data;
}

/**
 * Drop a resource monitor (destructive — requires confirm).
 * DELETE /observability/cost/monitors/{name}?confirm=true
 */
export async function deleteCostMonitor(name: string): Promise<Record<string, unknown>> {
  const { data } = await apiClient.delete<Record<string, unknown>>(
    API.observability.costMonitor(name),
    { params: { confirm: true } },
  );
  return data;
}

// =============================================================================
// FINOPS — SPEND BUDGETS
// =============================================================================

/**
 * List user-defined spend budgets (event-log snapshot, RESOURCE MONITOR-backed).
 * GET /observability/budgets
 */
export async function listSpendBudgets(): Promise<SpendBudgetsResponse> {
  return apiCall<SpendBudgetsResponse>(API.observability.budgets());
}

/**
 * Create a spend budget (persisted + best-effort RESOURCE MONITOR backing).
 * POST /observability/budgets
 */
export async function createSpendBudget(body: CreateSpendBudgetRequest): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>(API.observability.budgets(), body);
  return data;
}

/**
 * Update a spend budget (latest-wins re-snapshot + re-apply backing monitor).
 * PUT /observability/budgets/{name}
 */
export async function updateSpendBudget(
  name: string,
  body: CreateSpendBudgetRequest,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.put<Record<string, unknown>>(
    API.observability.budget(name),
    body,
  );
  return data;
}

/**
 * Delete a spend budget (drops backing monitor — requires confirm).
 * DELETE /observability/budgets/{name}?confirm=true
 */
export async function deleteSpendBudget(name: string): Promise<Record<string, unknown>> {
  const { data } = await apiClient.delete<Record<string, unknown>>(
    API.observability.budget(name),
    { params: { confirm: true } },
  );
  return data;
}

// Re-export types for convenience
export * from './types';
