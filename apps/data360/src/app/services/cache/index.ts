/**
 * Cache admin service — list cached keys/queries + stats.
 * Backed by the live cache module (GET /cache/keys, /cache/stats).
 */
import apiClient from '@/lib/api-client';

export interface CacheKeysResponse {
  keys: string[];
  pattern: string;
  count: number;
}

/** List cache keys matching a pattern (e.g. `sf:query:*` for cached query results). */
export async function getCacheKeys(pattern = '*'): Promise<CacheKeysResponse> {
  const { data } = await apiClient.get<CacheKeysResponse>('/cache/keys', { params: { pattern } });
  return data;
}

export interface CacheStats {
  /** Live hit/miss counters as reported by the backend cache layer. */
  cache_stats?: {
    hits?: number | null;
    misses?: number | null;
    sets?: number | null;
    deletes?: number | null;
    errors?: number | null;
    /** Percentage 0–100 (backend-computed). */
    hit_rate?: number | null;
    total_requests?: number | null;
  } | null;
  redis_info?: Record<string, unknown> | null;
  cache_keys?: { total_keys?: number | null } | null;
  [k: string]: unknown;
}

export async function getCacheStats(): Promise<CacheStats> {
  const { data } = await apiClient.get<CacheStats>('/cache/stats');
  return data;
}

export interface CacheBreakdown {
  by_class: {
    class: string;
    prefix: string;
    count: number;
    oldest_ttl?: number | null;
    newest_ttl?: number | null;
    ttl_sampled?: number | null;
  }[];
  total: number;
  cached_queries: { fqdn: string; db: string; schema: string; table: string }[];
  cached_queries_truncated?: boolean;
  generated_at?: string;
}

/** Cached-key counts per class + the cached-query list (GET /cache/breakdown). */
export async function getCacheBreakdown(): Promise<CacheBreakdown> {
  const { data } = await apiClient.get<CacheBreakdown>('/cache/breakdown');
  return data;
}

export interface CacheInvalidation {
  table: string;
  module?: string | null;
  triggered_by?: string | null;
  ts?: string | null;
}

export interface CacheInvalidationsResponse {
  events: CacheInvalidation[];
  total: number;
  by_table: Record<string, number>;
  source: string;
  note?: string;
}

/** Recent cache invalidations (GET /cache/invalidations). */
export async function getCacheInvalidations(limit = 100): Promise<CacheInvalidationsResponse> {
  const { data } = await apiClient.get<CacheInvalidationsResponse>('/cache/invalidations', {
    params: { limit },
  });
  return data;
}
