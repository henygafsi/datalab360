'use client';

/**
 * admin-performance — per-account, multi-axis Performance admin service.
 *
 * Wraps the (parallel-built) backend contract under
 * `/administration/performance/{account}/...` via {@link API.administration.performance}.
 *
 * Every call goes through {@link apiClient}. The backend may not be deployed
 * yet — a 404 or 501 is surfaced as {@link NotDeployedError} so the UI can show
 * a quiet "not deployed yet" state instead of a hard error.
 */
import axios from 'axios';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PerfKpis {
  requests: number | null;
  requests_per_min: number | null;
  requests_per_5min: number | null;
  avg_ms: number | null;
  p50_ms: number | null;
  p90_ms: number | null;
  p99_ms: number | null;
  error_rate: number | null;
  error_count: number | null;
  cache_hit_rate: number | null;
  /** Process-truth counters from the cache layer itself (since boot) —
      honest where the trace-derived rate is structurally sparse. */
  cache_layer?: { hits: number; misses: number; hit_rate: number | null; scope: string } | null;
  deny_rate: number | null;
  distinct_users: number | null;
  distinct_paths: number | null;
}

export interface PerfOverview {
  account: string;
  hours: number;
  kpis: PerfKpis;
}

export interface EndpointRow {
  method: string;
  path: string;
  requests: number | null;
  errors: number | null;
  error_rate: number | null;
  avg_ms: number | null;
  max_ms: number | null;
  p95_ms: number | null;
  cache_hit_rate: number | null;
}

export interface UserRow {
  username: string;
  role: string | null;
  requests: number | null;
  distinct_paths: number | null;
  errors: number | null;
  error_rate: number | null;
  cache_hit_rate: number | null;
  avg_ms: number | null;
  last_seen: string | null;
}

export interface CacheRow {
  key: string;
  requests: number | null;
  cache_hits: number | null;
  cache_misses: number | null;
  cache_hit_rate: number | null;
}

export interface ModuleRow {
  module: string;
  requests: number | null;
  errors: number | null;
  error_rate: number | null;
  avg_ms: number | null;
  cache_hit_rate: number | null;
  distinct_users: number | null;
}

export interface ErrorRow {
  ts: string | null;
  method: string;
  path: string;
  status: number;
  username: string | null;
  role: string | null;
  decision: string | null;
  deny_reason: string | null;
  duration_ms: number | null;
  query: string | null;
}

export type CacheAxis = 'page' | 'tab' | 'module' | 'project';

export interface RowsResponse<T> {
  rows: T[];
}

export interface CacheResponse {
  axis: CacheAxis;
  rows: CacheRow[];
}

export interface UserDetail {
  kpis: PerfKpis;
  top_endpoints: EndpointRow[];
  recent_errors: ErrorRow[];
  cache_by_module: CacheRow[];
}

// ── Degradation ─────────────────────────────────────────────────────────────

/** Raised when the backend route is not deployed yet (404 / 501). */
export class NotDeployedError extends Error {
  constructor(message = 'not deployed yet') {
    super(message);
    this.name = 'NotDeployedError';
  }
}

function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

async function get<T>(url: string): Promise<T> {
  try {
    const { data } = await apiClient.get<T>(url);
    return data;
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}

// ── Calls ───────────────────────────────────────────────────────────────────

const P = API.administration.performance;

export const getPerfOverview = (account: string, hours?: number) =>
  get<PerfOverview>(P.overview(account, hours));

export const getPerfByEndpoint = (account: string, opts?: { hours?: number; limit?: number }) =>
  get<RowsResponse<EndpointRow>>(P.byEndpoint(account, opts));

export const getPerfByUser = (account: string, opts?: { hours?: number; limit?: number }) =>
  get<RowsResponse<UserRow>>(P.byUser(account, opts));

export const getPerfByCache = (account: string, axis: CacheAxis, hours?: number) =>
  get<CacheResponse>(P.byCache(account, axis, hours));

export const getPerfByModule = (account: string, hours?: number) =>
  get<RowsResponse<ModuleRow>>(P.byModule(account, hours));

export const getPerfErrors = (account: string, opts?: { hours?: number; limit?: number }) =>
  get<RowsResponse<ErrorRow>>(P.errors(account, opts));

export const getPerfUserDetail = (account: string, username: string, hours?: number) =>
  get<UserDetail>(P.userDetail(account, username, hours));
