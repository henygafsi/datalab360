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
 */
export async function getStageStorageInfo(): Promise<StageSize[]> {
  return apiCall<StageSize[]>('/gouvernance/get_stage_storage_info');
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
 * Get storage for tables loaded from stages
 * GET /gouvernance/get_src_table_storage_info
 */
export async function getSrcTableStorageInfo(): Promise<StagedTableStorage> {
  return apiCall<StagedTableStorage>('/gouvernance/get_src_table_storage_info');
}

/**
 * Get list of DWH schemas
 * GET /gouvernance/get_dwh_schemas
 */
export async function getDwhSchemas(): Promise<string[]> {
  return apiCall<string[]>('/gouvernance/get_dwh_schemas');
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
 * Alias for getAllUsersActivity for backward compatibility
 * @deprecated Use getAllUsersActivity instead
 */
export async function getClientDashboardAll(
  filters: ActivityFilterParams = {}
): Promise<UserActivityWithQuery[]> {
  return getAllUsersActivity(filters);
}

/**
 * Set user MFA status
 * POST /gouvernance/user/mfa/set
 */
export async function setUserMfa(username: string, enable: boolean): Promise<MfaStatus> {
  return apiCall<MfaStatus>('/gouvernance/user/mfa/set', 'POST', { username, enable });
}

/**
 * Get user MFA status
 * GET /gouvernance/user/mfa/status
 */
export async function getUserMfaStatus(username: string): Promise<MfaStatus> {
  const params = new URLSearchParams({ username });
  return apiCall<MfaStatus>(`/gouvernance/user/mfa/status?${params}`);
}

// Re-export types for convenience
export * from './types';
