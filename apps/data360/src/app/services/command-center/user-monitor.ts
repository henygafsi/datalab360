/**
 * Per-USER activity & error monitoring service.
 *
 * Backs the Administration → Usage&Audit + Platform-activity MonitoringPanel.
 * Source spine: EVENT_STORE.USER_REQUESTS (the server-side request-trace log
 * written by the require_module / UserTracingMiddleware). The backend rolls it
 * up per user — total requests, success/failed/denied, error_count, last error,
 * top modules/actions, last active.
 *
 * Honesty contract: ACCOUNT_USAGE / EVENT_STORE may lag and the spine may be
 * unprovisioned on a given environment. On ANY failure (404 = route not live
 * yet, 5xx, network) we return an explicitly `degraded` empty payload instead
 * of throwing, so the panel can render an honest "non provisionné" state rather
 * than fabricating zeros. Mirrors the `_kpiTableMeta` tolerance style in
 * `services/command-center/index.ts`.
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/command-center';

/**
 * One row of per-user activity. Typed loosely (`Record<string, any>`, NOT an
 * interface) so the array drops straight into <AuditTable rows={...}> whose
 * `Row = Record<string, unknown>` requires an implicit index signature.
 *
 * Expected columns (subset rendered by the panel):
 *   username/user, role, requests, success, failed, denied, error_count,
 *   last_active, last_error
 */
export type UserActivityRow = Record<string, any>;

/** One row of a recent per-user error (path/method/status/error/timestamp). */
export type UserErrorRow = Record<string, any>;

export interface UserMonitorResponse<T = Record<string, any>> {
  /** Aggregated rows from the spine. Empty when degraded or genuinely empty. */
  data: T[];
  count: number;
  /**
   * true → the request failed (404/5xx/network) OR the backend returned a
   * degraded payload (spine unprovisioned / source lagging). Lets the UI tell
   * "non provisionné" apart from "genuinely no activity in this window".
   */
  degraded: boolean;
  reason?: string;
  /** Optional server-computed summary (preferred over client aggregation). */
  summary?: UserMonitorSummary | null;
  meta?: Record<string, unknown>;
}

/** Optional summary block the backend MAY return; the panel falls back to
 * client-side aggregation of `data` when absent. */
export interface UserMonitorSummary {
  users_active?: number | null;
  total_actions?: number | null;
  error_count?: number | null;
  denied?: number | null;
  error_rate?: number | null;
}

async function _fetch<T = Record<string, any>>(
  path: string,
  days: number
): Promise<UserMonitorResponse<T>> {
  try {
    const { data } = await apiClient.get<UserMonitorResponse<T>>(`${PREFIX}${path}`, {
      params: { days },
    });
    if (data && Array.isArray(data.data)) {
      return {
        data: data.data,
        count: typeof data.count === 'number' ? data.count : data.data.length,
        degraded: Boolean(data.degraded),
        reason: data.reason,
        summary: data.summary ?? null,
        meta: data.meta,
      };
    }
    // 200 but malformed/empty body → treat as degraded so we don't paint zeros.
    return { data: [], count: 0, degraded: true, reason: 'empty_payload' };
  } catch {
    return { data: [], count: 0, degraded: true, reason: 'request_failed' };
  }
}

/**
 * Per-user activity rollup over the last `days` (default 30, to match the
 * org-summary window). Hits GET /command-center/user-activity-monitor.
 */
export function getUserActivityMonitor(
  days: number = 30
): Promise<UserMonitorResponse<UserActivityRow>> {
  return _fetch<UserActivityRow>('/user-activity-monitor', days);
}

/**
 * Recent per-user errors over the last `days` (default 30). Hits
 * GET /command-center/user-activity-monitor/errors.
 */
export function getUserActivityErrors(
  days: number = 30
): Promise<UserMonitorResponse<UserErrorRow>> {
  return _fetch<UserErrorRow>('/user-activity-monitor/errors', days);
}
