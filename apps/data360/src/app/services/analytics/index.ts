/**
 * Analytics service — user-activity rollups for the admin console.
 * Backed by USER_ACTIVITY aggregations (GET /analytics/user-activity/summary).
 */
import apiClient from '@/lib/api-client';

export interface ModuleActivityStat {
  module_name: string;
  event_count: number;
  unique_users: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
}

export interface ActivityTopUser {
  username: string;
  total_actions: number;
  modules_used: number;
  last_active: string | null;
}

export interface UserActivitySummaryResponse {
  module_stats: ModuleActivityStat[];
  top_users: ActivityTopUser[];
  [k: string]: unknown;
}

/**
 * Per-module and per-user activity rollup over the last `days`.
 * GET /analytics/user-activity/summary?days=N
 * May 404 until deployed; callers should honest-gate (hide the section).
 */
export async function getUserActivitySummary(days = 7): Promise<UserActivitySummaryResponse> {
  const { data } = await apiClient.get<UserActivitySummaryResponse>(
    '/analytics/user-activity/summary',
    { params: { days } },
  );
  return data;
}
