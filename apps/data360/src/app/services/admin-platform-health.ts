'use client';

/**
 * admin-platform-health — audit-backed platform health monitoring service.
 *
 * Wraps `GET /administration/platform-health` via {@link API.administration.platformHealth}.
 * The endpoint reads usage telemetry on the *caller's own connection* (no service
 * account), so it works both locally and in production.
 *
 * Every call goes through {@link apiClient}. A 404 or 501 (backend not deployed
 * yet) is surfaced as {@link NotDeployedError} — reusing the SAME class the perf
 * service exports so {@link usePerfFetch}'s `instanceof` check keeps working — so
 * the UI can degrade to a quiet "not deployed yet" state instead of a hard error.
 */
import axios from 'axios';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { NotDeployedError } from '@/app/services/admin-performance';

// ── Types ───────────────────────────────────────────────────────────────────

/** Top-line health KPIs. Any field may be null (no data for it in the window). */
export interface HealthKpis {
  calls: number | null;
  error_rate: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  distinct_users: number | null;
  distinct_objects: number | null;
  logins: number | null;
  failed_logins: number | null;
}

export interface TopQueryRow {
  query_type: string;
  calls: number | null;
  error_count: number | null;
  avg_latency: number | null;
  p95_latency: number | null;
  // Additive efficiency signals — flag expensive/inefficient query classes.
  bytes_scanned: number | null;
  avg_bytes_scanned: number | null;
  partitions_scanned: number | null;
  avg_partitions_scanned: number | null;
  spill_to_local: number | null;
  queued_overload_ms: number | null;
  avg_queued_overload_ms: number | null;
}

/**
 * One brute-force / credential-stuffing signal: a (user, IP, error) tuple seen
 * failing to authenticate, with an attempt count. `attempts` is always present.
 */
export interface FailedLoginDetailRow {
  user_name: string;
  client_ip: string;
  error_message: string;
  reported_client_type: string;
  attempts: number;
  last_seen: string;
}

/** User-grain access record — which user touched which object, how often. */
export interface AccessByUserRow {
  object_name: string;
  object_type: string;
  user_name: string;
  access_count: number | null;
  last_seen: string;
}

export interface ByUserRow {
  user_name: string;
  calls: number | null;
  error_count: number | null;
  error_rate: number | null;
  avg_latency: number | null;
  p95_latency: number | null;
}

export interface ByWarehouseRow {
  warehouse_name: string;
  calls: number | null;
  error_count: number | null;
  error_rate: number | null;
  avg_latency: number | null;
  p95_latency: number | null;
}

export interface TopObjectRow {
  object_name: string;
  object_type: string;
  access_count: number | null;
  distinct_users: number | null;
}

export interface PlatformHealth {
  hours: number;
  source: string;
  kpis: HealthKpis;
  top_queries: TopQueryRow[];
  by_user: ByUserRow[];
  by_warehouse: ByWarehouseRow[];
  top_objects: TopObjectRow[];
  failed_login_detail: FailedLoginDetailRow[];
  access_by_user: AccessByUserRow[];
}

export interface PlatformHealthOpts {
  hours?: number;
  user?: string;
  module?: string;
  limit?: number;
}

// ── Degradation ─────────────────────────────────────────────────────────────

function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

// Re-export so consumers can import the not-deployed marker from one place.
export { NotDeployedError };

// ── Call ────────────────────────────────────────────────────────────────────

export async function getPlatformHealth(opts?: PlatformHealthOpts): Promise<PlatformHealth> {
  try {
    const { data } = await apiClient.get<PlatformHealth>(API.administration.platformHealth(opts));
    return data;
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}
