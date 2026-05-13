/**
 * Gouvernance/Dashboard API Services
 * Frontend services for all governance-related APIs
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
async function apiCall<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<T> {
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
  return apiCall<QueryAccessHistory[]>('/governance/get_user_info');
}

/**
 * Get stage storage sizes
 * GET /gouvernance/get_stage_storage_info
 * Backend returns { count, stages }; we return stages array for hooks.
 */
export async function getStageStorageInfo(): Promise<StageSize[]> {
  const res = await apiCall<{ count?: number; stages?: StageSize[] }>('/governance/get_stage_storage_info');
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
  return apiCall<DwhStorageSummary>(`/governance/get_dwh_storage_info?${params}`);
}

/**
 * Get storage for tables loaded from stages
 * GET /gouvernance/get_src_table_storage_info
 */
export async function getSrcTableStorageInfo(): Promise<StagedTableStorage> {
  return apiCall<StagedTableStorage>('/governance/get_src_table_storage_info');
}

/**
 * Get list of DWH schemas
 * GET /gouvernance/get_dwh_schemas
 */
export async function getDwhSchemas(): Promise<string[]> {
  return apiCall<string[]>('/governance/get_dwh_schemas');
}

/**
 * Get DWH health info (freshness, row counts, storage)
 * GET /gouvernance/get_dwh_health_info
 */
export async function getDwhHealthInfo(schemaName: string): Promise<DwhHealthInfo> {
  const params = new URLSearchParams({ schema_name: schemaName });
  return apiCall<DwhHealthInfo>(`/governance/get_dwh_health_info?${params}`);
}

/**
 * Get client dashboard summary metrics
 * GET /gouvernance/client/dashboard
 */
export async function getClientDashboardInfo(): Promise<ClientDashboardInfo> {
  return apiCall<ClientDashboardInfo>('/governance/client/dashboard');
}

/**
 * Get Snowflake connectors/integrations info
 * GET /gouvernance/info
 */
export async function getConnectorsInfo(): Promise<ConnectorsResponse> {
  return apiCall<ConnectorsResponse>('/governance/info');
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
    ? `/governance/dashboard/activity?${queryString}`
    : '/governance/dashboard/activity';

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
  return apiCall(qs ? `/governance/dashboard/errors?${qs}` : '/governance/dashboard/errors');
}

/**
 * Set user MFA status
 * POST /gouvernance/user/mfa/set
 */
export async function setUserMfa(username: string, enable: boolean): Promise<MfaStatus> {
  return apiCall<MfaStatus>('/governance/user/mfa/set', 'POST', { username, enable });
}

/**
 * Get user MFA status
 * GET /gouvernance/user/mfa/status
 */
export async function getUserMfaStatus(username: string): Promise<MfaStatus> {
  const params = new URLSearchParams({ username });
  return apiCall<MfaStatus>(`/governance/user/mfa/status?${params}`);
}

// ---------------------------------------------------------------------------
// GUI Permissions — role-based page access control
// ---------------------------------------------------------------------------

export interface GuiPermission {
  permission_id: string;
  role_name: string;
  page_path: string;
  access_level: 'READ' | 'WRITE' | 'NONE';
  created_by: string | null;
  created_at: string | null;
}

export interface GuiPermissionCreate {
  role_name: string;
  page_path: string;
  access_level: 'READ' | 'WRITE' | 'NONE';
}

/**
 * List all GUI permission rules
 * GET /gouvernance/gui-permissions
 */
export async function listGuiPermissions(): Promise<{ data: GuiPermission[]; count: number }> {
  return apiCall<{ data: GuiPermission[]; count: number }>('/governance/gui-permissions');
}

/**
 * Create or update a GUI permission rule (upsert by role + page_path)
 * POST /gouvernance/gui-permissions
 */
export async function upsertGuiPermission(
  payload: GuiPermissionCreate
): Promise<{ success: boolean; message: string }> {
  return apiCall<{ success: boolean; message: string }>(
    '/governance/gui-permissions',
    'POST',
    payload
  );
}

/**
 * Get the page access map for the currently logged-in user's roles.
 * Keys are page paths (e.g. "connect", "workflow"), values are access levels.
 * GET /gouvernance/gui-permissions/my-access
 */
export async function getMyPageAccess(): Promise<{
  data: Record<string, 'READ' | 'WRITE' | 'NONE'>;
  roles: string[];
}> {
  return apiCall<{ data: Record<string, 'READ' | 'WRITE' | 'NONE'>; roles: string[] }>(
    '/governance/gui-permissions/my-access'
  );
}

/**
 * Delete a GUI permission rule by ID
 * DELETE /gouvernance/gui-permissions/{permission_id}
 */
export async function deleteGuiPermission(
  permissionId: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await apiClient.delete<{ success: boolean; message: string }>(
    `/governance/gui-permissions/${permissionId}`
  );
  return data;
}

// ---------------------------------------------------------------------------
// OAuth / External Auth Management
// ---------------------------------------------------------------------------

export interface OAuthIntegration {
  name: string;
  type: string;
  category: string;
  enabled: string;
  created_on: string;
  [key: string]: unknown;
}

export interface NetworkPolicy {
  name: string;
  created_on: string;
  allowed_ip_list: string;
  blocked_ip_list: string;
  [key: string]: unknown;
}

export interface ApiKeyUser {
  user_name: string;
  created_on: string;
  last_success_login: string | null;
  has_rsa_public_key: string;
  disabled: string;
  default_role: string | null;
}

/**
 * List all security integrations (OAuth, SAML, SCIM)
 * GET /gouvernance/oauth/integrations
 */
export async function listOAuthIntegrations(): Promise<{
  integrations: OAuthIntegration[];
  count: number;
}> {
  return apiCall('/governance/oauth/integrations');
}

/**
 * List all network policies with IP rules
 * GET /gouvernance/oauth/network-policies
 */
export async function listNetworkPolicies(): Promise<{
  policies: NetworkPolicy[];
  count: number;
}> {
  return apiCall('/governance/oauth/network-policies');
}

/**
 * List service accounts with RSA key pair authentication
 * GET /gouvernance/oauth/api-keys
 */
export async function listApiKeys(): Promise<{
  api_keys: ApiKeyUser[];
  count: number;
}> {
  return apiCall('/governance/oauth/api-keys');
}

// =====================================
// CREATE SECURITY INTEGRATIONS (OAuth / SAML)
// =====================================

export interface CreateOAuthIntegrationBody {
  name: string;
  oauth_provider: 'AZURE' | 'OKTA' | 'CUSTOM';
  oauth_client_id: string;
  oauth_client_secret?: string;
  oauth_token_endpoint?: string;
  oauth_authorization_endpoint?: string;
  oauth_allowed_scopes?: string[];
  azure_tenant_id?: string;
  enabled?: boolean;
}

export interface CreateSAMLIntegrationBody {
  name: string;
  saml2_issuer: string;
  saml2_sso_url: string;
  saml2_x509_cert: string;
  saml2_provider?: string;
  saml2_sp_initiated_login_page_label?: string;
  enabled?: boolean;
}

export async function createOAuthIntegration(body: CreateOAuthIntegrationBody): Promise<{
  message: string;
  name: string;
  provider: string;
  enabled: boolean;
}> {
  return apiCall('/governance/oauth/integrations', 'POST', body);
}

export async function createSAMLIntegration(body: CreateSAMLIntegrationBody): Promise<{
  message: string;
  name: string;
  provider: string;
  sso_url: string;
  enabled: boolean;
}> {
  return apiCall('/governance/oauth/saml-integrations', 'POST', body);
}

// =====================================
// SERVICE USER & KEY MANAGEMENT
// =====================================

export async function createServiceUser(body: {
  username: string;
  default_role?: string;
  comment?: string;
}): Promise<{ message: string; username: string }> {
  return apiCall('/governance/oauth/service-users', 'POST', body);
}

export async function assignRSAKey(body: {
  username: string;
  rsa_public_key: string;
}): Promise<{ message: string; username: string }> {
  return apiCall('/governance/oauth/assign-rsa-key', 'POST', body);
}

export async function revokeRSAKey(username: string): Promise<{ message: string }> {
  return apiCall(`/governance/oauth/revoke-rsa-key/${encodeURIComponent(username)}`, 'DELETE');
}

// Re-export types for convenience
export * from './types';
