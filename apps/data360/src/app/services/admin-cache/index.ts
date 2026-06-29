/**
 * Cache-service client (`/cache/*`) — W6 reintegration of previously-unwired
 * backend endpoints. SVC-first cache observability + control: stats, health,
 * key breakdown, recent invalidations (FinOps/cost signal), and admin control
 * (clear / warmup / refresh). Distinct from admin.cache (`/admin/cache/*`).
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export interface CacheStats {
  total_keys?: number;
  hit_rate?: number | null;
  miss_rate?: number | null;
  memory_mb?: number | null;
  evictions?: number | null;
  [k: string]: unknown;
}
export interface CacheHealth {
  status?: string;
  svc_alive?: boolean;
  redis_connected?: boolean;
  [k: string]: unknown;
}
export interface CacheBreakdownRow {
  key_class?: string;
  count?: number;
  size_mb?: number | null;
  [k: string]: unknown;
}
export interface CacheInvalidation {
  key?: string;
  pattern?: string;
  at?: string;
  source?: string;
  [k: string]: unknown;
}

const get = async <T>(url: string): Promise<T> => (await apiClient.get<T>(url)).data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body)).data;

export const cacheService = {
  // --- observability (read) -------------------------------------------------
  stats: () => get<CacheStats>(API.cacheService.stats()),
  health: () => get<CacheHealth>(API.cacheService.health()),
  svcHealth: () => get<CacheHealth>(API.cacheService.svcHealth()),
  performance: () => get<Record<string, unknown>>(API.cacheService.performance()),
  dashboard: () => get<Record<string, unknown>>(API.cacheService.dashboard()),
  breakdown: () => get<CacheBreakdownRow[]>(API.cacheService.breakdown()),
  invalidations: () => get<CacheInvalidation[]>(API.cacheService.invalidations()),
  keys: () => get<string[]>(API.cacheService.keys()),
  keyValue: (key: string) => get<unknown>(API.cacheService.keyValue(key)),
  testConnection: () => get<{ ok?: boolean }>(API.cacheService.testConnection()),
  refreshStatus: () => get<Record<string, unknown>>(API.cacheService.refreshStatus()),

  // --- control (admin-gated mutations) --------------------------------------
  clearPattern: (pattern: string) => post<{ cleared?: number }>(API.cacheService.clearPattern(), { pattern }),
  clearAll: () => post<{ cleared?: number }>(API.cacheService.clearAll()),
  warmup: (body?: Record<string, unknown>) => post<unknown>(API.cacheService.warmup(), body),
  warmupTrigger: () => post<unknown>(API.cacheService.warmupTrigger()),
  refreshStart: () => post<unknown>(API.cacheService.refreshStart()),
  refreshStop: () => post<unknown>(API.cacheService.refreshStop()),
  refreshTrigger: (job: string) => post<unknown>(API.cacheService.refreshTrigger(job)),
};

export default cacheService;
