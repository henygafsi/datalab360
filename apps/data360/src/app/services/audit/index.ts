/**
 * Audit & Profiling API Services
 * Endpoints for query history, access history, login history, and column profiling.
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/command-center';

/** Strip undefined/null values from params */
function clean(params: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

// ── Types ──

export interface AuditQueryRow {
  query_id: string;
  query_text: string;
  user_name: string;
  role_name: string;
  warehouse_name: string;
  execution_status: string;
  error_code: string | null;
  error_message: string | null;
  total_elapsed_time: number;
  rows_produced: number;
  bytes_scanned: number;
  credits_used_cloud_services: number;
  start_time: string;
  end_time: string;
}

export interface AuditAccessRow {
  user_name: string;
  role_name: string;
  object_type: string;
  object_name: string;
  columns_accessed: string;
  query_id: string;
  access_time: string;
}

export interface AuditLoginRow {
  event_timestamp: string;
  user_name: string;
  client_ip: string;
  reported_client_type: string;
  first_authentication_factor: string;
  second_authentication_factor: string;
  is_success: string;
  error_code: string | null;
  error_message: string | null;
}

export interface ColumnProfileStats {
  total_rows: number;
  non_null: number;
  null_count: number;
  null_pct: number;
  distinct_count: number;
  min_val: string | null;
  max_val: string | null;
}

export interface ColumnProfileResponse {
  table: string;
  column: string;
  stats: ColumnProfileStats;
  top_values: { value: string; count: number }[];
}

export interface AuditResponse<T> {
  data: T[];
  count: number;
  columns: string[];
}

// ── API Functions ──

/** Fetch query history audit data */
export async function getQueryHistory(params?: {
  days?: number; user?: string; warehouse?: string; status?: string; limit?: number;
}): Promise<AuditResponse<AuditQueryRow>> {
  const { data } = await apiClient.get<AuditResponse<AuditQueryRow>>(
    `${PREFIX}/audit/query-history`,
    { params: clean(params || {}) },
  );
  return data;
}

/** Fetch data access history audit data */
export async function getAccessHistory(params?: {
  days?: number; user?: string; object_type?: string; limit?: number;
}): Promise<AuditResponse<AuditAccessRow>> {
  const { data } = await apiClient.get<AuditResponse<AuditAccessRow>>(
    `${PREFIX}/audit/access-history`,
    { params: clean(params || {}) },
  );
  return data;
}

/** Fetch login history audit data */
export async function getLoginHistory(params?: {
  days?: number; user?: string; status?: string; limit?: number;
}): Promise<AuditResponse<AuditLoginRow>> {
  const { data } = await apiClient.get<AuditResponse<AuditLoginRow>>(
    `${PREFIX}/audit/login-history`,
    { params: clean(params || {}) },
  );
  return data;
}

/** Profile a single column: distinct values, nulls, distribution */
export async function getColumnProfile(table: string, column: string): Promise<ColumnProfileResponse> {
  const { data } = await apiClient.get<ColumnProfileResponse>(
    `${PREFIX}/profiling/column`,
    { params: { table, column } },
  );
  return data;
}
