/**
 * Recommendations Service — client for the cross-product AI Recommendations
 * engine. Powers the "AI Advisor" surface in the Intelligent Analytics module.
 *
 * Backend module: app/modules/recommendations (mounted at /api/recommendations).
 * Unlike /chat and /notifications, this router carries the literal `/api`
 * prefix, so the paths below are kept verbatim (the axios baseURL adds no /api).
 *
 * Routes covered:
 *   POST   /api/recommendations/analyze            — recompute + upsert + return
 *   GET    /api/recommendations/                   — list stored active recos
 *   GET    /api/recommendations/{id}               — single reco detail
 *   POST   /api/recommendations/{id}/acknowledge
 *   POST   /api/recommendations/{id}/snooze
 *   POST   /api/recommendations/{id}/resolve
 *   POST   /api/recommendations/{id}/dismiss
 *   POST   /api/recommendations/{id}/reopen
 *
 * Response shape: backend returns the engine dict directly (no ApiResponse
 * wrapper on these routes), so we unwrap defensively with
 * `res.data?.data ?? res.data`.
 *
 * Graceful degradation: GET / and POST /analyze depend on the
 * EVENT_STORE.AI_RECOMMENDATIONS table. If it has not been installed yet the
 * backend raises — callers must surface that as an inline error/empty state
 * (the AI Advisor tab does), never crash or fake data.
 */
import apiClient from '@/lib/api-client';

const PREFIX = '/api/recommendations';

// ── Types — mirror app/modules/recommendations models + storage columns ──

export type RecoScope = 'TAB' | 'OBJECT' | 'SCHEMA' | 'DATABASE' | 'ACCOUNT' | 'ORG';
export type RecoSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RecoStatus =
  | 'open'
  | 'acknowledged'
  | 'snoozed'
  | 'resolved'
  | 'dismissed'
  | 'expired';

/** One stored recommendation row (columns from storage.list_active). */
export interface Recommendation {
  reco_id: string;
  account_name?: string | null;
  page?: string | null;
  module?: string | null;
  feature?: string | null;
  scope?: RecoScope | string | null;
  target?: string | null;
  target_type?: string | null;
  error_code?: string | null;
  severity: RecoSeverity | string;
  score?: number | null;
  title: string;
  rationale?: string | null;
  proposed_action?: string | null;
  proposed_sql?: string | null;
  drilldown_url?: string | null;
  estimated_savings_usd?: number | null;
  evidence?: Record<string, unknown> | null;
  source_endpoints?: unknown;
  ai_narrative?: string | null;
  status: RecoStatus | string;
  detected_by_role?: string | null;
  detected_by_user?: string | null;
  first_detected_at?: string | null;
  last_seen_at?: string | null;
  detection_count?: number | null;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  status_reason?: string | null;
  snooze_until?: string | null;
  resolved_at?: string | null;
}

export interface ListRecommendationsResponse {
  account_id: string;
  page: string | null;
  module: string | null;
  scope: string | null;
  target: string | null;
  items: Recommendation[];
  count: number;
}

export interface AnalyzeResponse {
  scope: string;
  page: string | null;
  module: string | null;
  target: string | null;
  account_id: string;
  summary: string;
  items: Recommendation[];
  ai_narrative: string | null;
  metadata: {
    consulted_entries?: number;
    raw_findings?: number;
    upsert?: Record<string, number>;
    duration_ms?: number;
    generated_at?: string;
    used_cortex?: boolean;
  };
}

export interface ListRecommendationsParams {
  page?: string;
  module?: string;
  scope?: RecoScope;
  target?: string;
  /** CSV is built internally from this array. */
  statuses?: RecoStatus[];
  severities?: RecoSeverity[];
  account_id?: string;
  limit?: number;
  offset?: number;
}

export interface AnalyzeRequest {
  scope: RecoScope;
  page?: string;
  module?: string;
  target?: string;
  top_n?: number;
  /** Opt-in Cortex narrative generation (slower, costs credits). */
  enable_cortex?: boolean;
  account_id?: string;
}

function unwrap<T>(res: { data: any }): T {
  return (res.data?.data ?? res.data) as T;
}

// ── API calls ───────────────────────────────────────────────────────────

/** List stored active recommendations (pure read, no recompute). */
export async function listRecommendations(
  params: ListRecommendationsParams = {},
): Promise<ListRecommendationsResponse> {
  const query: Record<string, unknown> = {
    page: params.page,
    module: params.module,
    scope: params.scope,
    target: params.target,
    account_id: params.account_id,
    limit: params.limit,
    offset: params.offset,
  };
  if (params.statuses?.length) query.statuses = params.statuses.join(',');
  if (params.severities?.length) query.severities = params.severities.join(',');
  const res = await apiClient.get(`${PREFIX}/`, { params: query });
  return unwrap<ListRecommendationsResponse>(res);
}

/**
 * Recompute recommendations for a scope (recompute + upsert + return).
 * Long-running Snowflake operation — callers should show an elapsed timer.
 */
export async function analyzeRecommendations(
  body: AnalyzeRequest,
): Promise<AnalyzeResponse> {
  const res = await apiClient.post(`${PREFIX}/analyze`, body);
  return unwrap<AnalyzeResponse>(res);
}

/** Get a single recommendation by id. */
export async function getRecommendation(recoId: string): Promise<Recommendation> {
  const res = await apiClient.get(`${PREFIX}/${encodeURIComponent(recoId)}`);
  return unwrap<Recommendation>(res);
}

/** Acknowledge a recommendation (seen, not yet actioned). */
export async function acknowledgeRecommendation(
  recoId: string,
  note?: string,
): Promise<Recommendation> {
  const res = await apiClient.post(
    `${PREFIX}/${encodeURIComponent(recoId)}/acknowledge`,
    { note },
  );
  return unwrap<Recommendation>(res);
}

/** Snooze a recommendation until a future ISO datetime. */
export async function snoozeRecommendation(
  recoId: string,
  snoozeUntil: string,
  note?: string,
): Promise<Recommendation> {
  const res = await apiClient.post(`${PREFIX}/${encodeURIComponent(recoId)}/snooze`, {
    snooze_until: snoozeUntil,
    note,
  });
  return unwrap<Recommendation>(res);
}

/** Mark a recommendation as resolved. */
export async function resolveRecommendation(
  recoId: string,
  note?: string,
): Promise<Recommendation> {
  const res = await apiClient.post(`${PREFIX}/${encodeURIComponent(recoId)}/resolve`, {
    note,
  });
  return unwrap<Recommendation>(res);
}

/** Dismiss a recommendation as a false-positive / not applicable. */
export async function dismissRecommendation(
  recoId: string,
  reason: string,
): Promise<Recommendation> {
  const res = await apiClient.post(`${PREFIX}/${encodeURIComponent(recoId)}/dismiss`, {
    reason,
  });
  return unwrap<Recommendation>(res);
}

/** Reopen a resolved/dismissed recommendation. */
export async function reopenRecommendation(
  recoId: string,
  reason?: string,
): Promise<Recommendation> {
  const res = await apiClient.post(`${PREFIX}/${encodeURIComponent(recoId)}/reopen`, {
    reason,
  });
  return unwrap<Recommendation>(res);
}
