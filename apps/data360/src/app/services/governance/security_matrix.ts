/**
 * Gouvernance Service - Security Matrix & Enterprise Users
 * Unified service for security matrix entries, axes, enterprise user directory, and sync.
 */
import apiClient from '@/lib/api-client';

// ============= TYPES =============

export type SecurityMatrixEntryRow = {
  id: number;
  role_name: string;
  region_id?: string | null;
  store_id?: string | null;
  department_id?: string | null;
  product_category?: string | null;
  customer_segment?: string | null;
  access_level: string;
  created_at?: string;
  updated_at?: string;
};

export type SecurityAxes = {
  regions: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  product_categories?: string[];
  customer_segments?: string[];
  access_levels?: string[];
};

export type SecurityMatrixResponse = {
  entries: SecurityMatrixEntryRow[];
  total_entries: number;
  available_axes: SecurityAxes;
};

export type CreateMatrixEntryPayload = {
  role_name: string;
  axes: {
    region_id?: string | null;
    store_id?: string | null;
    department_id?: string | null;
    product_category?: string | null;
    customer_segment?: string | null;
  };
  access_level: string;
};

export type UpdateMatrixEntryPayload = {
  axes?: {
    region_id?: string | null;
    store_id?: string | null;
    department_id?: string | null;
    product_category?: string | null;
    customer_segment?: string | null;
  };
  access_level?: string;
};

export type BatchUpdatePayload = {
  updates: Array<{
    id: number;
    axes?: Record<string, string | null>;
    access_level?: string;
  }>;
};

export interface SecurityAxis {
  id: number;
  name: string;
  type: 'region' | 'store' | 'department' | 'custom';
  values: string[];
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EnterpriseUser {
  USERNAME: string;
  EMAIL?: string | null;
  DISPLAY_NAME?: string | null;
  FIRST_NAME?: string | null;
  LAST_NAME?: string | null;
  LOGIN_NAME?: string | null;
  DEFAULT_ROLE?: string | null;
  DEFAULT_WAREHOUSE?: string | null;
  DEFAULT_NAMESPACE?: string | null;
  IDENTITY_PROVIDER?: string | null;
  SAML_IDENTITY?: string | null;
  SCIM_EXTERNAL_ID?: string | null;
  STATUS?: string;
  HAS_MFA?: boolean;
  LAST_LOGIN?: string | null;
  CREATED_AT?: string | null;
  UPDATED_AT?: string | null;
  SYNCED_AT?: string | null;
}

export interface EnterpriseUserUpdate {
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  default_role?: string;
  default_warehouse?: string;
  identity_provider?: string;
  status?: string;
}

export interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  total_in_directory?: number;
  message: string;
}

// ============= SECURITY MATRIX =============

export async function initializeSecurityMatrix(): Promise<{ message: string }> {
  const response = await apiClient.post('/gouvernance/security-matrix/init');
  return response.data;
}

export async function getSecurityMatrix(bustCache = false): Promise<SecurityMatrixResponse> {
  const params = bustCache ? { _t: Date.now() } : {};
  const response = await apiClient.get('/gouvernance/security-matrix', { params });
  return response.data;
}

export async function createSecurityMatrixEntry(
  entry: CreateMatrixEntryPayload
): Promise<{ message: string; role_name: string; axes: Record<string, unknown>; access_level: string }> {
  const response = await apiClient.post('/gouvernance/security-matrix', entry);
  return response.data;
}

export async function bulkCreateSecurityMatrixEntries(payload: {
  role_name: string;
  entries: Array<Record<string, string | null>>;
  access_level: string;
}): Promise<{ created: number }> {
  const response = await apiClient.post('/gouvernance/security-matrix/bulk', payload);
  return response.data;
}

export async function updateSecurityMatrixEntry(
  id: number,
  entry: UpdateMatrixEntryPayload
): Promise<{ message: string }> {
  const response = await apiClient.put(`/gouvernance/security-matrix/${id}`, entry);
  return response.data;
}

export async function deleteSecurityMatrixEntry(id: number): Promise<{ message: string }> {
  const response = await apiClient.delete(`/gouvernance/security-matrix/${id}`);
  return response.data;
}

export async function deleteSecurityMatrixByRole(
  roleName: string
): Promise<{ message: string; deleted: number }> {
  const response = await apiClient.delete(`/gouvernance/security-matrix/role/${roleName}`);
  return response.data;
}

export async function batchUpdateSecurityMatrix(
  payload: BatchUpdatePayload
): Promise<{ updated: number; message: string }> {
  const response = await apiClient.put('/gouvernance/security-matrix/batch', payload);
  return response.data;
}

// ============= SECURITY AXES =============

export async function getSecurityAxes(bustCache = false): Promise<SecurityAxis[]> {
  const params = bustCache ? { _t: Date.now() } : {};
  const response = await apiClient.get('/gouvernance/security-axes', { params });
  return response.data;
}

export async function createSecurityAxis(axis: Omit<SecurityAxis, 'id'>): Promise<SecurityAxis> {
  const response = await apiClient.post('/gouvernance/security-axes', axis);
  return response.data;
}

export async function updateSecurityAxis(id: number, updates: Partial<SecurityAxis>): Promise<SecurityAxis> {
  const response = await apiClient.put(`/gouvernance/security-axes/${id}`, updates);
  return response.data;
}

export async function deleteSecurityAxis(id: number): Promise<void> {
  await apiClient.delete(`/gouvernance/security-axes/${id}`);
}

// ============= ENTERPRISE USERS =============

export async function getEnterpriseUsers(): Promise<EnterpriseUser[]> {
  const response = await apiClient.get('/gouvernance/enterprise-users');
  const data = response.data;
  // Handle pagination response { data: { items: [...] } } or direct array [...]
  const items = data?.data?.items ?? data?.data ?? data;
  return Array.isArray(items) ? (items as EnterpriseUser[]) : [];
}

export async function updateEnterpriseUser(
  username: string,
  updates: EnterpriseUserUpdate
): Promise<{ message: string; updated_fields: string[] }> {
  const response = await apiClient.put(`/gouvernance/enterprise-users/${username}`, updates);
  return response.data;
}

export async function deleteEnterpriseUser(username: string): Promise<{ message: string }> {
  const response = await apiClient.delete(`/gouvernance/enterprise-users/${username}`);
  return response.data;
}

export async function syncEnterpriseUsers(): Promise<SyncResult> {
  const response = await apiClient.post('/gouvernance/enterprise-users/sync');
  return response.data;
}

// ============= RLS POLICIES (migrated from security-matrix.ts) =============

export interface RLSPolicy {
  policy_name: string;
  table_name: string;
  database: string;
  schema: string;
  filter_expression: string;
  description?: string;
  active: boolean;
}

/**
 * GET /gouvernance/rls-policies exists in backend.
 * NOTE: createRLSPolicy, applyRLSPolicy, removeRLSPolicy below use
 * endpoints that do NOT exist in the backend. The canonical RLS service
 * is in policies.ts (/gouvernance/policies/row-access/*).
 * These are kept for backward compatibility and wrapped in try/catch.
 */
export async function getRLSPolicies(): Promise<RLSPolicy[]> {
  try {
    const response = await apiClient.get('/gouvernance/rls-policies');
    return response.data;
  } catch (error) {
    console.warn('getRLSPolicies: endpoint unavailable, returning []', error);
    return [];
  }
}

export async function createRLSPolicy(policy: Omit<RLSPolicy, 'active'>): Promise<RLSPolicy> {
  try {
    const response = await apiClient.post('/gouvernance/rls-policies', policy);
    return response.data;
  } catch (error: any) {
    console.error('createRLSPolicy: POST /gouvernance/rls-policies not available — use policies.ts createRLSPolicy instead', error);
    throw error;
  }
}

export async function applyRLSPolicy(policyName: string, tableName: string, database: string, schema: string): Promise<void> {
  try {
    await apiClient.post('/gouvernance/rls-policies/apply', {
      policy_name: policyName,
      table_name: tableName,
      database,
      schema,
    });
  } catch (error: any) {
    console.error('applyRLSPolicy: POST /gouvernance/rls-policies/apply not available — use policies.ts applyRLSPolicy instead', error);
    throw error;
  }
}

export async function removeRLSPolicy(tableName: string, database: string, schema: string): Promise<void> {
  try {
    await apiClient.post('/gouvernance/rls-policies/remove', {
      table_name: tableName,
      database,
      schema,
    });
  } catch (error: any) {
    console.error('removeRLSPolicy: POST /gouvernance/rls-policies/remove not available — use policies.ts removeRLSPolicy instead', error);
    throw error;
  }
}
