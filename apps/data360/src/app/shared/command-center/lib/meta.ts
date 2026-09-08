/**
 * Shared read-contract types for the Account Overview data spine.
 *
 * Mirrors the backend contracts negotiated in
 * backend/docs/integration/JOURNAL_FRONT_BACK.md:
 *  - AO-001: per-response freshness meta (served_from / computed_at /
 *    cache_age_seconds) in every payload's `meta`.
 *  - AO-014: scope honesty (`scope` org|account + reason) on org-labelled
 *    reads served from account-level data.
 *  - AO-018: request correlation (`request_id` echoes X-Request-ID).
 *  - B1: `availability` block on GET /command-center/overview-kpis — one
 *    entry per reporting domain with an explicit readiness state.
 *  - B2: heavy reads return HTTP 200 `{ state: 'preparing', ... }` on a
 *    cache miss instead of computing inline; the SSE cache_invalidation
 *    event later carries the same `cache_key`.
 */

export interface AoMeta {
  served_from?: 'cache' | 'live' | 'rollup' | 'none';
  computed_at?: string | null;
  cached_at?: string | null;
  cache_age_seconds?: number | null;
  /** Source-data lag (e.g. warehouse usage views), distinct from cache age. */
  as_of?: string | null;
  lag_seconds?: number | null;
  stale?: boolean;
  refresh_endpoint?: string | null;
  request_id?: string;
  /** AO-014 scope honesty */
  scope?: 'org' | 'account';
  scope_source?: string;
  scope_reason?: string;
  /** B2 */
  state?: 'preparing';
  cache_key?: string;
  domain?: string;
}

/** B2 — what a heavy read returns on a cache miss (HTTP 200). */
export interface PreparingEnvelope {
  state: 'preparing';
  domain: string;
  cache_key: string;
  started_at?: string;
  retry_after_seconds?: number;
  meta?: AoMeta;
}

/**
 * Discriminator agreed with the backend: a top-level `state` field exists
 * ONLY on preparing envelopes, never on full payloads.
 */
export function isPreparing(body: unknown): body is PreparingEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { state?: unknown }).state === 'preparing'
  );
}

/**
 * Bounded wait for services consumed by SELF-FETCHING components (Quality,
 * Data Objects, Organization, client-accounts…): when the first read answers
 * `preparing`, re-read after the server's own retry_after (capped) up to
 * `tries` times, then return whatever came last — the caller still guards
 * with isPreparing for the never-ready case. The shell's own fetchers do NOT
 * use this (they render an explicit PreparingState and wake on SSE instead).
 */
export async function resolveWhenReady<T>(
  fetchOnce: () => Promise<T>,
  opts: { tries?: number } = {},
): Promise<T> {
  const tries = opts.tries ?? 3;
  let result = await fetchOnce();
  for (let i = 0; i < tries && isPreparing(result); i++) {
    const delayS = Math.min(
      Math.max((result as PreparingEnvelope).retry_after_seconds ?? 5, 2),
      10,
    );
    await new Promise((r) => setTimeout(r, delayS * 1000));
    result = await fetchOnce();
  }
  return result;
}

export type DomainState = 'ready' | 'cold' | 'preparing' | 'unconfigured' | 'failed' | 'unknown';

export interface DomainAvailability {
  state: DomainState;
  computed_at?: string | null;
  age_seconds?: number | null;
  ttl_seconds?: number | null;
  started_at?: string | null;
  source?: string;
  cache_key?: string;
  refresh_endpoint?: string | null;
  install_endpoint?: string | null;
  refreshing?: boolean;
  stale?: boolean;
  reason?: string;
}

/** B1 — availability block on /command-center/overview-kpis. */
export interface AvailabilityBlock {
  snapshot_id: string;
  generated_at?: string;
  cache_backend?: 'memory' | 'redis';
  domains: Record<string, DomainAvailability>;
}

/** Human labels for the availability matrix — user language, no internals. */
export const DOMAIN_LABELS: Record<string, string> = {
  overview_kpis: 'Account KPIs',
  summary: 'Cross-module summary',
  module_health: 'Module health',
  cost_breakdown: 'Cost breakdown',
  security_audit: 'Security audit',
  kpis: 'Detail KPIs',
  recommendations: 'Recommendations',
  explorer: 'Data objects catalog',
  performance_overview: 'Query performance',
  data_operations: 'Data operations',
  security_overview: 'Security overview',
  governance_grants: 'Governance grants',
  projects_overview: 'Projects',
  platform_activity: 'Platform activity',
  // Vendor-neutral by brand rule (never "Cortex" in customer-facing copy).
  cortex_costs: 'AI spend',
  org_accounts: 'Organization accounts',
};

/** Short human age: 42s, 7m, 3h, 2d. Returns null when unknown. */
export function formatAge(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/** Real data timestamp for display — prefers source as_of, else computed_at. */
export function dataTimestamp(meta: AoMeta | null | undefined): string | null {
  return meta?.as_of ?? meta?.computed_at ?? null;
}
