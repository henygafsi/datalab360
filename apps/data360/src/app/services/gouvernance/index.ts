/**
 * Gouvernance/Dashboard API Services
 * Frontend services for all gouvernance-related APIs
 */

import apiClient from '@/lib/api-client';
import type {
  QueryAccessHistory,
  StageSize,
  DwhStorageSummary,
  StagedTableStorage,
  DwhHealthInfo,
  ClientDashboardInfo,
  ConnectorsResponse,
  UserActivityWithQuery,
  ActivityFilterParams,
  MfaStatus,
  DashboardErrorsResponse,
} from './types';
import { DATABASE_CONFIG } from '@/config/database.config';

/**
 * Secure API call wrapper with authentication error handling
 * Uses the centralized apiClient which automatically:
 * - Adds authentication headers from NextAuth session
 * - Provides consistent error handling
 * - Lets components handle errors (no auto-redirect)
 */
async function apiCall<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
  const { data } = await apiClient.request<T>({
    url: endpoint,
    method,
    data: body,
  });
  return data;
}

/**
 * Fetch query access history with joined metadata
 * GET /gouvernance/get_user_info
 */
export async function getQueryAccessHistory(): Promise<QueryAccessHistory[]> {
  return apiCall<QueryAccessHistory[]>('/gouvernance/get_user_info');
}

/**
 * Get stage storage sizes
 * GET /gouvernance/get_stage_storage_info
 * Backend returns { count, stages }; we return stages array for hooks.
 */
export async function getStageStorageInfo(): Promise<StageSize[]> {
  const res = await apiCall<{ count?: number; stages?: StageSize[] }>('/gouvernance/get_stage_storage_info');
  return Array.isArray(res?.stages) ? res.stages : [];
}

/**
 * Get DWH storage usage by table
 * GET /gouvernance/get_dwh_storage_info
 */
export async function getDwhStorageInfo(
  databaseName: string = DATABASE_CONFIG.PRIMARY_DATABASE,
  schemaName: string = DATABASE_CONFIG.SCHEMAS.RETAIL
): Promise<DwhStorageSummary> {
  const params = new URLSearchParams({
    database_name: databaseName,
    schema_name: schemaName,
  });
  return apiCall<DwhStorageSummary>(`/gouvernance/get_dwh_storage_info?${params}`);
}
/**
 * Get DWH health info (freshness, row counts, storage)
 * GET /gouvernance/get_dwh_health_info
 */
export async function getDwhHealthInfo(schemaName: string): Promise<DwhHealthInfo> {
  const params = new URLSearchParams({ schema_name: schemaName });
  return apiCall<DwhHealthInfo>(`/gouvernance/get_dwh_health_info?${params}`);
}

/**
 * Get client dashboard summary metrics
 * GET /gouvernance/client/dashboard
 */
export async function getClientDashboardInfo(): Promise<ClientDashboardInfo> {
  return apiCall<ClientDashboardInfo>('/gouvernance/client/dashboard');
}

/**
 * Get Snowflake connectors/integrations info
 * GET /gouvernance/info
 */
export async function getConnectorsInfo(): Promise<ConnectorsResponse> {
  return apiCall<ConnectorsResponse>('/gouvernance/info');
}

/**
 * Get all users activity with query history (with optional filters)
 * GET /gouvernance/dashboard/activity
 */
export async function getAllUsersActivity(
  filters: ActivityFilterParams = {}
): Promise<UserActivityWithQuery[]> {
  const params = new URLSearchParams();

  if (filters.username) params.append('username', filters.username);
  if (filters.module_name) params.append('module_name', filters.module_name);
  if (filters.event_type) params.append('event_type', filters.event_type);
  if (filters.status) params.append('status', filters.status);
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);
  if (filters.query_status) params.append('query_status', filters.query_status);

  const queryString = params.toString();
  const endpoint = queryString
    ? `/gouvernance/dashboard/activity?${queryString}`
    : '/gouvernance/dashboard/activity';

  // API returns array directly
  return apiCall<UserActivityWithQuery[]>(endpoint);
}
/**
 * Get recent ERROR events for audit and AI recommendations
 * GET /gouvernance/dashboard/errors
 */
export async function getDashboardErrors(params?: {
  limit?: number;
  module_name?: string;
  start_date?: string;
  end_date?: string;
}): Promise<DashboardErrorsResponse> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set('limit', String(params.limit));
  if (params?.module_name) search.set('module_name', params.module_name);
  if (params?.start_date) search.set('start_date', params.start_date);
  if (params?.end_date) search.set('end_date', params.end_date);
  const qs = search.toString();
  return apiCall(qs ? `/gouvernance/dashboard/errors?${qs}` : '/gouvernance/dashboard/errors');
}
// Re-export types for convenience
export * from './types';
