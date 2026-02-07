/**
 * Data360 Config API – config metadata, table/column refresh mapping, cache config.
 * GET /api/data360/config, table-refresh-mapping, cache-config
 */

import apiClient from '@/lib/api-client';

export interface MetadataSchema {
  name: string;
  description: string;
}

export interface MetadataTableRef {
  database: string;
  schema: string;
  table: string;
}

export interface Data360ConfigResponse {
  metadata_database: string;
  metadata_schemas: MetadataSchema[];
  metadata_tables: MetadataTableRef[];
  cache_config: Record<string, number>;
  zones: string[];
}

export interface DateColumnRefresh {
  name: string;
  last_refresh: string | null;
}

export interface TableRefreshMappingItem {
  table: string;
  database: string;
  schema: string;
  table_name: string;
  date_columns: DateColumnRefresh[];
  table_last_refresh: string | null;
}

export interface TableRefreshMappingResponse {
  tables: TableRefreshMappingItem[];
}

export interface RefreshTriggerRequest {
  table?: string;
  zone?: string;
}

export interface CacheConfigOverrideRequest {
  key: string;
  value_seconds: number;
}

async function apiCall<T>(endpoint: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown): Promise<T> {
  const { data } = await apiClient.request<T>({
    url: endpoint,
    method,
    data: body,
  });
  return data;
}

export async function getData360Config(): Promise<Data360ConfigResponse> {
  return apiCall<Data360ConfigResponse>('/api/data360/config');
}

export async function getTableRefreshMapping(params?: { discover?: boolean; discover_all?: boolean }): Promise<TableRefreshMappingResponse> {
  const qs = new URLSearchParams();
  if (params?.discover !== undefined) qs.set('discover', String(params.discover));
  if (params?.discover_all !== undefined) qs.set('discover_all', String(params.discover_all));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiCall<TableRefreshMappingResponse>(`/api/data360/table-refresh-mapping${suffix}`);
}

export async function triggerRefresh(body: RefreshTriggerRequest): Promise<{ status: string; refreshed_zone?: string; refreshed_table?: string }> {
  return apiCall('/api/data360/table-refresh-mapping/refresh', 'POST', body);
}

export async function getCacheConfig(): Promise<Record<string, number>> {
  return apiCall<Record<string, number>>('/api/data360/cache-config');
}

export async function patchCacheConfig(body: CacheConfigOverrideRequest): Promise<{ status: string; key: string; value_seconds: number }> {
  return apiCall('/api/data360/cache-config', 'PATCH', body);
}
