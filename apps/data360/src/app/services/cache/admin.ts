/**
 * Cache governance service — the admin-only real-time-cache control surface.
 *
 * Wires the FORWARD-CONTRACT `/admin/cache/*` routes (vault
 * _TARGET_ARCHITECTURE §4.1): coverage per account/role, SVC health, the
 * background warmer snapshot, and the two mutating ops (manual warm / precise
 * surface invalidation).
 *
 * These routes are NOT yet deployed on every backend → callers must treat a
 * 404/501 as "feature not live" and render an honest "not available" notice
 * (NEVER fabricate coverage / a board of zeros). All response fields are
 * optional/nullable so the UI degrades to "—" for anything the payload omits.
 *
 * Always via `apiClient` (JWT auth + /api-proxy) — never raw axios/fetch.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ── GET /admin/cache/coverage ────────────────────────────────────────────────

export interface CacheCoverageRole {
  role?: string | null;
  /** Warm `@account_role_cache` slots for this (account, role). */
  warm?: number | null;
  /** Cold (missing/expired) role-dependent slots. */
  cold?: number | null;
  total?: number | null;
}

export interface CacheCoverageAccount {
  account?: string | null;
  /** Is a service-account configured for this account (`acct_key in _svc_configs`)? */
  svc_present?: boolean | null;
  active_roles?: number | null;
  /** Account-level (`@shared_cache query_based`) + aggregate role warm/cold. */
  warm?: number | null;
  cold?: number | null;
  roles?: CacheCoverageRole[] | null;
}

export interface UncoveredWarmTarget {
  account?: string | null;
  page?: string | null;
  module?: string | null;
  role?: string | null;
  /** Why it is uncovered (e.g. "no svc", "cold", "never warmed"). */
  reason?: string | null;
}

export interface CacheCoverageResponse {
  accounts?: CacheCoverageAccount[] | null;
  /** Live (account, role, surface) tuples with no warm slot yet. */
  uncovered_targets?: UncoveredWarmTarget[] | null;
  generated_at?: string | null;
}

export async function getCacheCoverage(): Promise<CacheCoverageResponse> {
  const { data } = await apiClient.get<CacheCoverageResponse>(API.admin.cache.coverage());
  return data ?? {};
}

// ── GET /admin/cache/svc-health ──────────────────────────────────────────────

export interface SvcHealthEntry {
  account?: string | null;
  alive?: boolean | null;
  auth_type?: string | null;
  /**
   * Whether `CACHE_READ_ALLOW_USER_FALLBACK` is ON for this box. TRUE on a prod
   * box is a RED flag — reads can silently fall back to a user connection.
   */
  fallback_enabled?: boolean | null;
  error?: string | null;
}

export interface SvcHealthResponse {
  accounts?: SvcHealthEntry[] | null;
}

export async function getCacheSvcHealth(): Promise<SvcHealthResponse> {
  const { data } = await apiClient.get<SvcHealthResponse>(API.admin.cache.svcHealth());
  return data ?? {};
}

// ── GET /admin/cache/warm-status ─────────────────────────────────────────────

export interface WarmTargetStatus {
  account?: string | null;
  page?: string | null;
  module?: string | null;
  role?: string | null;
  state?: string | null; // "warm" | "cold" | "refreshed" | "failed"
  refreshed_at?: string | null;
}

export interface WarmStatusResponse {
  state?: string | null; // "idle" | "running" | "ok" | "failed" | "never"
  last_run_at?: string | null;
  next_run_at?: string | null;
  duration_ms?: number | null;
  warmed?: number | null;
  cold?: number | null;
  refreshed?: number | null;
  failed?: number | null;
  /** Whether the always-on per-role warm (`CACHE_WARM_PER_ROLE`) is enabled. */
  per_role_enabled?: boolean | null;
  targets?: WarmTargetStatus[] | null;
  error?: string | null;
}

export async function getCacheWarmStatus(): Promise<WarmStatusResponse> {
  const { data } = await apiClient.get<WarmStatusResponse>(API.admin.cache.warmStatus());
  return data ?? {};
}

// ── POST /admin/cache/warm ───────────────────────────────────────────────────

export interface WarmRequest {
  account: string;
  page?: string;
  module?: string;
  /** Warm one slot per active role (bypasses the `CACHE_WARM_PER_ROLE` env gate). */
  per_role?: boolean;
}

export interface WarmResult {
  warmed?: number | null;
  roles?: number | null;
  account?: string | null;
  message?: string | null;
}

export async function warmCacheSurface(body: WarmRequest): Promise<WarmResult> {
  const { data } = await apiClient.post<WarmResult>(API.admin.cache.warm(), body);
  return data ?? {};
}

// ── POST /admin/cache/invalidate-surface ─────────────────────────────────────

export interface InvalidateSurfaceRequest {
  account: string;
  /** REQUIRED by the backend — omitting it returns a 400. */
  page: string;
  module?: string;
  shared_fns?: string[];
  /** Preview the patterns that WOULD be evicted without deleting anything. */
  dry_run?: boolean;
}

export interface InvalidateSurfaceResult {
  evicted?: number | null;
  patterns?: string[] | null;
  dry_run?: boolean | null;
  message?: string | null;
}

export async function invalidateCacheSurface(
  body: InvalidateSurfaceRequest,
): Promise<InvalidateSurfaceResult> {
  const { data } = await apiClient.post<InvalidateSurfaceResult>(
    API.admin.cache.invalidateSurface(),
    body,
  );
  return data ?? {};
}

// ── Service & cache health ──────

export interface CacheKpis {
  hit_rate?: number | null;
  miss_rate?: number | null;
  total_keys?: number | null;
  by_class?: Array<{ class: string; prefix?: string; keys?: number | null }> | null;
}
export async function getCacheKpis(): Promise<CacheKpis> {
  const { data } = await apiClient.get<CacheKpis>(API.admin.cache.kpis());
  return data ?? {};
}

export interface CacheStreamStats {
  status?: string;
  data?: { active_subscribers?: number; tracked_cache_keys?: number; [k: string]: unknown } | null;
}
export async function getCacheStreamStats(): Promise<CacheStreamStats> {
  const { data } = await apiClient.get<CacheStreamStats>(API.admin.cache.streamStats());
  return data ?? {};
}

export interface ServiceAccountHealth {
  configured?: boolean;
  connection_alive?: boolean;
  active_queries?: number | null;
  role?: string | null;
  degraded?: boolean;
}
export async function getServiceAccountHealth(): Promise<ServiceAccountHealth> {
  const { data } = await apiClient.get<ServiceAccountHealth>(API.admin.serviceAccountHealth());
  return data ?? {};
}

export interface SvcRegistryRow { account: string; user?: string; alive?: boolean; auth_type?: string }
export interface SvcRegistry { accounts?: SvcRegistryRow[]; total?: number }
export async function getSvcRegistry(): Promise<SvcRegistry> {
  const { data } = await apiClient.get<SvcRegistry>(API.admin.svcRegistry());
  return data ?? {};
}
