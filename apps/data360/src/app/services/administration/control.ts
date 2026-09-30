'use client';

/**
 * administration/control — the ONE data service behind the accountadmin
 * control page (/administration). Inter-agent contract (A1).
 *
 * Panels import ONLY from this module — no direct apiClient/fetch/paths in
 * components. Every read resolves to either the typed payload or an
 * `AdminEnvelope` (`state: 'preparing' | 'unavailable'`) that the UI renders
 * with PreparingState / "dependency unavailable" — NEVER a fabricated 0.
 *
 * Error policy (verified live against :8078, 2026-09-06):
 *  - HTTP 503 with `detail.error_code === 'DEPENDENCY_UNAVAILABLE'` (backend
 *    `dependency_unavailable()`, structured + retryable) → converted to
 *    `{ state:'unavailable', reason }` — no throw.
 *  - HTTP 404 with `detail.error_code === 'TRACE_NOT_FOUND'` on the trace
 *    lookup → `{ error_code:'TRACE_NOT_FOUND', hint }` — no throw (successful
 *    display GETs are simply not persisted; that is coverage, not an error).
 *  - In-payload envelopes (`state:'preparing' | 'generating' | 'failed' |
 *    'unavailable'`) are normalized: generating → preparing, failed →
 *    unavailable with `reason` carrying the backend `error`.
 *  - Everything else throws — the caller's ErrorDisplay owns it.
 *
 * Dedup: 30s TTL on stable reads; the inventory is deduped per-query (60s,
 * `preparing` envelopes are never stored by dedupGet); trace reads are NEVER
 * cached — they are point-in-time investigations.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { dedupGet, invalidateDedup } from '@/app/services/request-dedup';

// ---------------------------------------------------------------------------
// Envelope — the shared "not data yet" shape every panel understands.
// ---------------------------------------------------------------------------

export type AdminEnvelope = {
  state: 'preparing' | 'unavailable';
  domain?: string;
  reason?: string;
  retry_after_seconds?: number;
  source?: string;
};

/** True when a service result is an envelope (preparing OR unavailable) rather than data. */
export function isAdminEnvelope(x: unknown): x is AdminEnvelope {
  const s = (x as { state?: unknown } | null | undefined)?.state;
  return s === 'preparing' || s === 'unavailable';
}

// ---------------------------------------------------------------------------
// Types — endpoint inventory (generated artefact; shapes verified against
// backend docs/integration/ENDPOINT_INVENTORY.json + routers/admin.py).
// ---------------------------------------------------------------------------

export interface InventoryQuery {
  /** Substring match on path / operation_id / summary. */
  q?: string;
  module?: string;
  status?: 'KEEP' | 'UNKNOWN' | 'DEPRECATED';
  /** cache_read | compute | mutation | export | job | stream | docs */
  exec_class?: string;
  method?: string;
  page?: number;
  /** Backend default 50, max 200. */
  page_size?: number;
}

export interface InventoryCacheInfo {
  decorator: string;
  ttl?: number | null;
  serve?: string | null;
  domain?: string | null;
}

export interface InventoryItem {
  operation_id: string;
  method: string;
  normalized_path: string;
  module: string;
  summary: string | null;
  deprecated: boolean;
  in_openapi: boolean;
  auth: string[];
  cache: InventoryCacheInfo | null;
  exec_class: string;
  /** COUNT of frontend call-sites found by static analysis (a number, not a list). */
  frontend_consumers: number;
  other_consumers: string[];
  tests: string[];
  status: 'KEEP' | 'UNKNOWN' | 'DEPRECATED';
  duplicate_name: boolean;
  duplicate_summary?: boolean;
}

export interface InventoryTotals {
  routes_total?: number;
  operations_http?: number;
  websockets?: number;
  mounts?: number;
  framework_routes?: number;
  openapi_operations?: number;
  not_in_openapi?: number;
  by_module?: Record<string, number>;
}

export interface InventoryDuplicate {
  endpoint: string;
  modules: string[];
  paths: string[];
}

export interface InventoryPage {
  generated_at: string | null;
  source: string;
  totals: InventoryTotals | null;
  duplicates: { by_endpoint_name?: InventoryDuplicate[] } | null;
  total: number;
  page: number;
  page_size: number;
  items: InventoryItem[];
}

// ---------------------------------------------------------------------------
// Types — cache observability (/cache/*).
// ---------------------------------------------------------------------------

export interface CacheClassRow {
  class: string;
  prefix: string;
  /** null = count unavailable for this class — render '—', NEVER 0. */
  count: number | null;
  status: 'ok' | 'truncated' | 'unavailable';
  /** /cache/kpis variant. */
  bytes?: number | null;
  bytes_sampled?: number;
  /** /cache/breakdown variant. */
  oldest_ttl?: number | null;
  newest_ttl?: number | null;
  ttl_sampled?: number;
}

export interface CacheKpis {
  hit_rate: number;
  miss_rate: number;
  total_keys: number;
  by_class: CacheClassRow[];
}

export interface CacheBreakdown {
  by_class: CacheClassRow[];
}

export interface CacheKeysStatus {
  keys: string[];
  pattern?: string;
  count: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Types — request traces (EVENT_STORE.USER_REQUESTS; sampled coverage).
// ---------------------------------------------------------------------------

export interface TraceRow {
  request_id: string;
  account_name: string | null;
  username: string | null;
  role: string | null;
  method: string;
  path: string;
  query: string | null;
  status: number;
  duration_ms: number | null;
  cache_hit: boolean | null;
  page: string | null;
  module: string | null;
  tab: string | null;
  action_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  decision: string | null;
  deny_reason: string | null;
  request_timestamp: string;
}

export interface TraceLookup {
  request_id: string;
  traces: TraceRow[];
  source: string;
  /** e.g. "sampled: mutations, first-access, governed actions, denials, errors" */
  coverage: string;
}

/** 404 on a trace lookup: the id was simply not persisted (display GETs are
 *  not sampled) — a coverage fact, not an error. */
export interface TraceNotFound {
  error_code: 'TRACE_NOT_FOUND';
  hint?: string;
  request_id?: string;
}

export function isTraceNotFound(x: unknown): x is TraceNotFound {
  return (x as { error_code?: unknown } | null | undefined)?.error_code === 'TRACE_NOT_FOUND';
}

export interface RecentTracesParams {
  path?: string;
  username?: string;
  status_min?: number;
  since_minutes?: number;
  /** Backend cap: ≤ 500. */
  limit?: number;
}

export interface RecentTraces {
  traces: TraceRow[];
  count: number;
  limit?: number;
  since_minutes?: number;
  source?: string;
  coverage?: string;
}

// ---------------------------------------------------------------------------
// Types — endpoint usage rollups (request log).
// ---------------------------------------------------------------------------

export interface UsageRow {
  method: string;
  path: string;
  module: string | null;
  count: number;
  errors: number;
  distinct_users: number;
  last_seen: string | null;
}

export interface UsageMeta {
  computed_at?: string;
  cached_at?: string;
  cache_age_seconds?: number;
  served_from?: string;
}

export interface EndpointUsage {
  endpoints: UsageRow[];
  total_requests?: number;
  window_days?: number;
  meta?: UsageMeta;
}

export interface UsageByRow {
  key: string;
  requests: number;
  errors: number;
  distinct_endpoints: number;
}

export interface UsageBy {
  dimension: string;
  rows: UsageByRow[];
  meta?: UsageMeta;
}

// ---------------------------------------------------------------------------
// Types — test campaign, readiness, server metrics.
// ---------------------------------------------------------------------------

/** Last test-matrix campaign artefact — render what comes, never guess a shape.
 *  When no artefact exists the backend answers an `unavailable` envelope
 *  (reason: "no campaign artefact — run scripts/test_matrix.py (never run from
 *  the UI)"). */
export type TestCampaign = Record<string, unknown>;

export interface ReadyStatus {
  status: string;
  checks?: Record<string, string>;
}

export interface ServerMetricsScope {
  /** 'per-worker' — these numbers are for ONE worker process only. */
  kind: string;
  worker_pid?: number;
  since?: string;
  latency_samples?: number;
  latency_sample_capacity?: number;
  note?: string;
}

/** PER-WORKER runtime metrics — `scope.kind === 'per-worker'`. Panels must
 *  label them as such and never present them as account-global. */
export interface ServerMetrics {
  scope?: ServerMetricsScope;
  requests_per_min?: number;
  requests_per_5min?: number;
  total_requests?: number;
  error_count?: number;
  error_rate?: number;
  uptime_seconds?: number;
  memory_rss_mb?: number;
  cpu_count?: number;
  cpu_load?: number;
  latency?: { avg_ms?: number; p50_ms?: number; p90_ms?: number; p99_ms?: number };
  top_endpoints?: Array<Record<string, unknown>>;
  slowest_endpoints?: Array<Record<string, unknown>>;
  recent_errors?: Array<Record<string, unknown>>;
  active_users?: unknown;
  generated_at?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------

const TTL_MS = 30_000;
const INVENTORY_TTL_MS = 60_000;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

async function rawGet<T>(path: string): Promise<T> {
  const res = await apiClient.get<T>(path);
  return res.data;
}

/** In-payload envelope → AdminEnvelope (generating→preparing, failed→unavailable). */
function normalizeEnvelope(x: unknown): AdminEnvelope | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const s = o.state;
  if (s !== 'preparing' && s !== 'generating' && s !== 'failed' && s !== 'unavailable') return null;
  return {
    state: s === 'preparing' || s === 'generating' ? 'preparing' : 'unavailable',
    domain: str(o.domain),
    reason: str(o.reason) ?? str(o.error),
    retry_after_seconds: num(o.retry_after_seconds),
    source: str(o.source),
  };
}

function normalizePayload<T>(data: unknown): T | AdminEnvelope {
  return normalizeEnvelope(data) ?? (data as T);
}

type ErrorResponse = { status?: number; data?: unknown } | undefined;

/** Works for both raw AxiosError and apiClient's ServerError wrapper — both
 *  keep `{ response: { status, data } }`. */
function errResponse(err: unknown): ErrorResponse {
  return (err as { response?: { status?: number; data?: unknown } } | null | undefined)?.response;
}

/** FastAPI nests structured errors under `detail`; read both shapes. */
function errDetail(resp: ErrorResponse): Record<string, unknown> {
  const raw = (resp?.data ?? {}) as Record<string, unknown>;
  return raw.detail && typeof raw.detail === 'object' ? (raw.detail as Record<string, unknown>) : raw;
}

/** 503 DEPENDENCY_UNAVAILABLE → unavailable envelope; anything else → null. */
function to503Envelope(err: unknown): AdminEnvelope | null {
  const resp = errResponse(err);
  if (resp?.status !== 503) return null;
  const d = errDetail(resp);
  if (d.error_code !== 'DEPENDENCY_UNAVAILABLE') return null;
  return {
    state: 'unavailable',
    domain: str(d.dependency) ?? str(d.domain),
    reason: str(d.hint) ?? str(d.message) ?? str((resp.data as Record<string, unknown> | undefined)?.detail) ?? 'Dependency unavailable',
    source: str(d.source),
  };
}

/** 404 TRACE_NOT_FOUND → typed miss; anything else → null. */
function toTraceNotFound(err: unknown): TraceNotFound | null {
  const resp = errResponse(err);
  if (resp?.status !== 404) return null;
  const d = errDetail(resp);
  if (d.error_code !== 'TRACE_NOT_FOUND') return null;
  return { error_code: 'TRACE_NOT_FOUND', hint: str(d.hint), request_id: str(d.request_id) };
}

/** Shared catch: convert the structured 503 into an envelope, rethrow the rest. */
async function withUnavailable<T>(run: () => Promise<T | AdminEnvelope>): Promise<T | AdminEnvelope> {
  try {
    return await run();
  } catch (err) {
    const env = to503Envelope(err);
    if (env) return env;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

/** Endpoint inventory (generated artefact, paginated + filterable). Deduped
 *  per exact query (60s); the `preparing` envelope is never stored. */
export async function getEndpointInventory(q: InventoryQuery): Promise<InventoryPage | AdminEnvelope> {
  const key = `adminctl:inventory:${JSON.stringify([
    q.q ?? '', q.module ?? '', q.status ?? '', q.exec_class ?? '', q.method ?? '',
    q.page ?? 1, q.page_size ?? 50,
  ])}`;
  return withUnavailable(() =>
    dedupGet(key, INVENTORY_TTL_MS, async () =>
      normalizePayload<InventoryPage>(await rawGet(API.adminControl.endpointsInventory(q)))
    )
  );
}

/** Rebuild the inventory artefact in the background (accountadmin only).
 *  Answers `{ state, retry_after_seconds }` — poll getEndpointInventory after. */
export async function regenerateInventory(): Promise<{ state: string; domain?: string; retry_after_seconds?: number }> {
  const res = await apiClient.post<{ state: string; domain?: string; retry_after_seconds?: number }>(
    API.adminControl.endpointsInventoryRegenerate()
  );
  // The stored pages are stale the moment a regeneration starts.
  invalidateDedup('adminctl:inventory:');
  return res.data;
}

/** Cache hit/miss rate + per-class key counts. `count: null` = unavailable — render '—'. */
export async function getCacheKpis(): Promise<CacheKpis | AdminEnvelope> {
  return withUnavailable(() =>
    dedupGet('adminctl:cache-kpis', TTL_MS, async () =>
      normalizePayload<CacheKpis>(await rawGet(API.adminControl.cacheKpis()))
    )
  );
}

/** Per-class key counts + TTL spread. */
export async function getCacheBreakdown(): Promise<CacheBreakdown | AdminEnvelope> {
  return withUnavailable(() =>
    dedupGet('adminctl:cache-breakdown', TTL_MS, async () =>
      normalizePayload<CacheBreakdown>(await rawGet(API.adminControl.cacheBreakdown()))
    )
  );
}

/** Key listing with `{ status }` (default pattern '*'). */
export async function getCacheKeysStatus(): Promise<CacheKeysStatus | AdminEnvelope> {
  return withUnavailable(() =>
    dedupGet('adminctl:cache-keys', TTL_MS, async () =>
      normalizePayload<CacheKeysStatus>(await rawGet(API.adminControl.cacheKeys()))
    )
  );
}

/** Full trace for one X-Request-ID. NEVER cached — a point-in-time lookup.
 *  A miss is `{ error_code:'TRACE_NOT_FOUND' }` (display GETs are not persisted). */
export async function getTraceByRequestId(rid: string): Promise<TraceLookup | TraceNotFound | AdminEnvelope> {
  try {
    return await rawGet<TraceLookup>(API.adminControl.traces(rid));
  } catch (err) {
    const miss = toTraceNotFound(err);
    if (miss) return miss;
    const env = to503Envelope(err);
    if (env) return env;
    throw err;
  }
}

/** Bounded recent-trace listing (limit ≤ 500). NEVER cached. */
export async function getRecentTraces(params: RecentTracesParams = {}): Promise<RecentTraces | AdminEnvelope> {
  return withUnavailable(() =>
    rawGet<RecentTraces>(API.adminControl.tracesRecent(params))
  );
}

/** Most-called endpoints from the request log (default window 7 days). */
export async function getEndpointUsage(limit?: number): Promise<EndpointUsage | AdminEnvelope> {
  return withUnavailable(() =>
    dedupGet(`adminctl:endpoint-usage:${limit ?? 'default'}`, TTL_MS, async () =>
      normalizePayload<EndpointUsage>(await rawGet(API.adminControl.endpointUsage(limit)))
    )
  );
}

/** Usage rollup by dimension. Real backend params (probed via openapi + live):
 *  `dimension` = module | user | role (default 'module'), `days` (default 7). */
export async function getUsageBy(params: Record<string, string | number>): Promise<UsageBy | AdminEnvelope> {
  const key = `adminctl:usage-by:${JSON.stringify(Object.entries(params).sort())}`;
  return withUnavailable(() =>
    dedupGet(key, TTL_MS, async () =>
      normalizePayload<UsageBy>(await rawGet(API.adminControl.usageBy(params)))
    )
  );
}

/** Last test-matrix campaign artefact — an `unavailable` envelope until
 *  scripts/test_matrix.py has produced one (never runnable from the UI). */
export async function getLastTestCampaign(): Promise<TestCampaign | AdminEnvelope> {
  return withUnavailable(() =>
    dedupGet('adminctl:tests-last-campaign', TTL_MS, async () =>
      normalizePayload<TestCampaign>(await rawGet(API.adminControl.testsLastCampaign()))
    )
  );
}

/** Readiness + dependency checks. A 503 "not ready" body IS the answer —
 *  returned as data, not thrown. */
export async function getReady(): Promise<ReadyStatus> {
  return dedupGet('adminctl:ready', TTL_MS, async () => {
    try {
      return await rawGet<ReadyStatus>(API.adminControl.ready());
    } catch (err) {
      const resp = errResponse(err);
      if (resp?.status === 503) {
        const body = errDetail(resp);
        if (typeof body.status === 'string' || (body.checks && typeof body.checks === 'object')) {
          return body as unknown as ReadyStatus;
        }
      }
      throw err;
    }
  });
}

/** PER-WORKER runtime metrics (scope.kind='per-worker') — label as such,
 *  never present as account-global. */
export async function getServerMetrics(): Promise<ServerMetrics | AdminEnvelope> {
  return withUnavailable(() =>
    dedupGet('adminctl:server-metrics', TTL_MS, async () =>
      normalizePayload<ServerMetrics>(await rawGet(API.adminControl.serverMetrics()))
    )
  );
}

// ── Per-user usage/cost attribution ─────────────────────────────────────────
// GET /administration/performance/{account}/by-user — today returns query
// telemetry rows (often empty: account-key mismatch reported as contract C2);
// contract C1 will extend it with per-user credit attribution. The panel
// renders whatever columns arrive and states the gap when rows are empty.

export interface ByUserRow {
  [key: string]: unknown;
}

export interface ByUserResponse {
  account: string;
  hours: number;
  rows: ByUserRow[];
  meta?: Record<string, unknown>;
}

export async function getPerformanceByUser(
  account: string,
  hours: number,
): Promise<ByUserResponse | AdminEnvelope> {
  return withUnavailable(async () =>
    normalizePayload<ByUserResponse>(
      await rawGet(
        `/administration/performance/${encodeURIComponent(account)}/by-user?hours=${hours}`,
      ),
    ),
  );
}

// ── C1 — per-user cost attribution (contract 2026-09-06) ───────────────────
// GET /api/administration/costs/by-user?days= — serve="prepare". Display
// rules from the contract: credits_attributed null ≠ 0 (queries without an
// attribution row); money.amount null ⇒ "valuation not configured", never 0;
// unattributed_compute_credits = idle share no user can claim — shown apart.

export interface CostsByUserMoney {
  amount: number | null;
  currency: string | null;
  policy_version: string | null;
  estimated: boolean;
  state?: string;
}

export interface CostsByUserRow {
  username: string;
  roles?: string[];
  credits_attributed: number | null;
  money?: CostsByUserMoney;
  attributed_queries?: number | null;
  query_count?: number | null;
  elapsed_ms?: number | null;
  failed_count?: number | null;
  distinct_roles?: number | null;
  last_query_at?: string | null;
}

export interface CostsByUserResponse {
  days: number;
  state: 'ready';
  attribution_method: string;
  users: CostsByUserRow[];
  user_count: number;
  totals?: {
    attributed_compute_credits?: number | null;
    warehouse_compute_credits?: number | null;
    unattributed_compute_credits?: number | null;
    cloud_services_credits?: number | null;
    money_attributed?: CostsByUserMoney;
  };
  policy?: { state?: string; credit_rate?: number | null; hint?: string };
  sources?: string[];
  meta?: Record<string, unknown>;
}

export async function getCostsByUser(
  days: number,
): Promise<CostsByUserResponse | AdminEnvelope> {
  return withUnavailable(async () =>
    normalizePayload<CostsByUserResponse>(
      await rawGet(`/api/administration/costs/by-user?days=${days}`),
    ),
  );
}

export interface PricingPolicy {
  policy: {
    policy_version?: string | null;
    effective_from?: string | null;
    credit_rate?: number | null;
    currency?: string | null;
    source?: string;
    state?: 'configured' | 'unconfigured';
  };
  literal_rates_removed?: string[];
}

export async function getPricingPolicy(): Promise<PricingPolicy | AdminEnvelope> {
  return withUnavailable(async () =>
    normalizePayload<PricingPolicy>(await rawGet('/api/administration/pricing-policy')),
  );
}
