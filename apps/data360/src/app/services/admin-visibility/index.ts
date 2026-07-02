/**
 * Admin visibility service — request/activity usage analytics.
 * Backed by EVENT_STORE.AUDIT_LOG + USER_ACTIVITY (GET /admin/*).
 */
import apiClient from '@/lib/api-client';

export interface EndpointUsageRow {
  method: string;
  path: string;
  module: string;
  count: number;
  errors: number;
  distinct_users: number;
  last_seen: string | null;
}

export interface EndpointUsageResponse {
  endpoints: EndpointUsageRow[];
  total_requests: number;
  window_days: number;
}

/** Top requested endpoints by count (from AUDIT_LOG). */
export async function getEndpointUsage(days = 7, limit = 50): Promise<EndpointUsageResponse> {
  const { data } = await apiClient.get<EndpointUsageResponse>('/admin/endpoint-usage', {
    params: { days, limit },
  });
  return data;
}

export type UsageDimension = 'module' | 'role' | 'user';

export interface UsageByRow {
  key: string;
  requests: number;
  errors: number;
  distinct_endpoints: number;
}

export interface UsageByResponse {
  dimension: string;
  rows: UsageByRow[];
}

/** Request counts grouped by module / role / user. */
export async function getUsageBy(dimension: UsageDimension, days = 7): Promise<UsageByResponse> {
  const { data } = await apiClient.get<UsageByResponse>('/admin/usage-by', {
    params: { dimension, days },
  });
  return data;
}

export interface ActivityStatsResponse {
  by_module: { module: string; events: number; failures: number }[];
  by_project: { project_id: string; events: number }[];
  by_user: { username: string; events: number }[];
  total: number;
}

/** USER_ACTIVITY event stats grouped by module / project / user. */
export async function getActivityStats(days = 7): Promise<ActivityStatsResponse> {
  const { data } = await apiClient.get<ActivityStatsResponse>('/admin/activity-stats', {
    params: { days },
  });
  return data;
}

export interface ServerEndpoint {
  method: string;
  path: string;
  requests: number;
  errors: number;
  avg_ms: number;
  max_ms: number;
  distinct_users: number;
}

export interface ServerRecentError {
  status: number;
  method: string;
  path: string;
  username: string;
  ts: string;
  ms: number;
}

export interface ServerMetrics {
  requests_per_min: number;
  requests_per_5min: number;
  total_requests: number;
  error_count: number;
  error_rate: number;
  uptime_seconds: number;
  memory_rss_mb: number;
  cpu_count: number;
  cpu_load: number;
  latency: { avg_ms: number; p50_ms: number; p90_ms: number; p99_ms: number };
  top_endpoints: ServerEndpoint[];
  slowest_endpoints: { method: string; path: string; requests: number; avg_ms: number }[];
  recent_errors: ServerRecentError[];
  active_users: { username: string; requests: number }[];
  generated_at: string;
}

/** Live in-process server metrics (top endpoints, latency, errors, active users). */
export async function getServerMetrics(): Promise<ServerMetrics> {
  const { data } = await apiClient.get<ServerMetrics>('/admin/server-metrics');
  return data;
}

// ── Cache freshness & warm scheduler (Administration → Performance) ─────────

/**
 * Zone → ISO timestamp of the last cache refresh for that zone, or null when
 * no refresh has been recorded yet (or the cache layer is unreachable — the
 * backend still answers 200 with all-null zones).
 */
export type RefreshStateMap = Record<string, string | null>;

/** Last-refresh timestamp per cache zone (GET /api/refresh-state — always 200). */
export async function getRefreshState(): Promise<RefreshStateMap> {
  const { data } = await apiClient.get<RefreshStateMap>('/api/refresh-state');
  return data;
}

export interface CacheRefreshJob {
  id: string;
  name: string;
  /** ISO timestamp of the next scheduled run, null when the job is paused. */
  next_run: string | null;
  trigger: string;
}

export interface CacheRefreshStatus {
  status: 'running' | 'stopped';
  jobs: CacheRefreshJob[];
  total_jobs: number;
}

/** Background cache warm-scheduler status (GET /cache/refresh/status). */
export async function getCacheRefreshStatus(): Promise<CacheRefreshStatus> {
  const { data } = await apiClient.get<CacheRefreshStatus>('/cache/refresh/status');
  return data;
}
