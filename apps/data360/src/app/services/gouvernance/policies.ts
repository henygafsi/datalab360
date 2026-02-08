/**
 * Frontend Service Layer for Snowflake Governance Policies
 * TypeScript service to interact with backend API endpoints
 *
 * Location: apps/data360/src/app/services/gouvernance/policies.ts
 */

import apiClient from '@/lib/api-client';
import { API_CONFIG, DEFAULTS } from '@/config/database.config';

const POLICIES_API = `${API_CONFIG.ENDPOINTS.GOVERNANCE}/policies`;

// Default governance schema name (just schema, not FQN - backend handles FQN construction)
const DEFAULT_GOVERNANCE_SCHEMA = DEFAULTS.SCHEMA;

// Standard response wrapper from backend (for CREATE, DELETE, UPDATE operations)
interface StandardResponse<T = any> {
  message: string;
  data: T;
  status?: string;
}

// Policy LIST response (no wrapper - direct response)
interface PolicyListResponse {
  policy_type: string;
  total: number;
  policies: BackendPolicy[];
}

// Backend policy structure (same for ALL policy types)
interface BackendPolicy {
  name: string;
  database_name: string;
  schema_name: string;
  created_on: string;
  comment: string;
  granted_roles: string[];
  expiration_date: string | null;
}

// ============= TYPES & INTERFACES =============

export enum MaskingType {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  SSN = 'SSN',
  CREDIT_CARD = 'CC',
  HASH = 'HASH',
  NULL = 'NULL',
  CONDITIONAL = 'CONDITIONAL',
}

// Row Access Policy (RLS) Types
export interface RLSPolicy {
  policy_name: string;
  schema: string;
  signature: string;
  expression: string;
  filter_expression: string;
  active: boolean;
  database?: string;
  table_name?: string;
  description?: string;
  created_at?: string;
  granted_roles?: string[];
  expiration_date?: string;
}

export interface CreateRLSPolicyRequest {
  policy_name: string;
  signature: string;
  expression: string;
  database?: string;
  schema?: string;
  description?: string;
  expiration_date?: string;
}

export interface ApplyRLSPolicyRequest {
  policy_name: string;
  table_name: string;
  database: string;
  schema: string;
  policy_column: string;
  policy_schema?: string;
  /** Database where the policy object lives (defaults to backend metadata DB if omitted) */
  policy_database?: string;
}

// Masking Policy Types
export interface MaskingPolicy {
  policy_name: string;
  schema: string;
  data_type: string;
  masking_type?: string;
  column_type?: string;
  masking_expression?: string;
  created_at?: string;
  granted_roles?: string[];
  expiration_date?: string;
}

export interface CreateMaskingPolicyRequest {
  policy_name: string;
  data_type: string; // STRING, NUMBER, DATE, TIMESTAMP, etc.
  masking_type: MaskingType | string; // FULL, PARTIAL, HASH, CUSTOM - required per backend spec
  custom_expression?: string; // SQL expression for CUSTOM type
  database?: string;
  schema?: string;
  expiration_date?: string;
}

export interface ApplyMaskingPolicyRequest {
  policy_name: string;
  database: string;
  schema: string;
  table: string;
  column: string;
  policy_schema?: string;
}

export interface MaskedColumn {
  database: string;
  schema: string;
  table: string;
  column: string;
  policy_name: string;
}

// Network Policy Types
export interface NetworkPolicy {
  policy_name: string;
  id: string;
  name: string;
  type: 'allow' | 'deny';
  ip_ranges: string[];
  description?: string;
  is_default?: boolean;
  allowed_ip_list?: string;
  blocked_ip_list?: string;
  comment?: string;
  created_at: string;
  updated_at: string;
  granted_roles?: string[];
  expiration_date?: string;
}

export interface CreateNetworkPolicyRequest {
  policy_name: string;
  allowed_ip_list: string;
  blocked_ip_list?: string;
  comment?: string;
  expiration_date?: string;
}

// Tag Types
export interface Tag {
  tag_name: string;
  schema: string;
  allowed_values?: string;
  comment?: string;
  created_at?: string;
}

export interface CreateTagRequest {
  tag_name: string;
  allowed_values?: string;
  comment?: string;
  schema?: string;
}

export interface ApplyTagRequest {
  tag_name: string;
  tag_value: string;
  object_type: string;
  database: string;
  schema: string;
  table?: string;
  column?: string;
  tag_schema?: string;
}

// Password Policy Types
export interface PasswordPolicy {
  policy_name: string;
  schema: string;
  min_length: number;
  max_length: number;
  min_upper_case_chars: number;
  min_lower_case_chars: number;
  min_numeric_chars: number;
  min_special_chars: number;
  max_age_days: number;
  max_retries: number;
  lockout_time_mins: number;
  is_default?: boolean;
  created_at?: string;
  granted_roles?: string[];
  expiration_date?: string;
}

export interface CreatePasswordPolicyRequest {
  policy_name: string;
  min_length?: number;
  max_length?: number;
  min_upper_case_chars?: number;
  min_lower_case_chars?: number;
  min_numeric_chars?: number;
  min_special_chars?: number;
  max_age_days?: number;
  max_retries?: number;
  lockout_time_mins?: number;
  schema?: string;
  expiration_date?: string;
}

// Session Policy Types
export interface SessionPolicy {
  policy_name: string;
  schema: string;
  session_idle_timeout_mins: number;
  session_ui_idle_timeout_mins: number;
  is_default?: boolean;
  created_at?: string;
  granted_roles?: string[];
  expiration_date?: string;
}

export interface CreateSessionPolicyRequest {
  policy_name: string;
  session_idle_timeout_mins?: number;
  session_ui_idle_timeout_mins?: number;
  expiration_date?: string;
}

// ============= ROW ACCESS POLICY (RLS) SERVICES =============

export async function getRLSPolicyDetails(
  policy_name: string,
  database?: string,
  schema?: string,
): Promise<any> {
  const params = new URLSearchParams();
  if (database) params.set('database', database);
  if (schema) params.set('schema', schema);
  const qs = params.toString();
  const url = `${POLICIES_API}/row-access/${encodeURIComponent(policy_name)}/details${qs ? `?${qs}` : ''}`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for policy ${policy_name}:`, error);
    return null;
  }
}

export async function getRLSPolicies(): Promise<RLSPolicy[]> {
  const url = `${POLICIES_API}/ROW_ACCESS`;
  console.log('🔍 GET RLS Policies API Call:', { url });

  // Backend returns direct response (no wrapper)
  const response = await apiClient.get<PolicyListResponse>(url);

  console.log('✅ GET RLS Policies Response:', {
    status: response.status,
    policyType: response.data.policy_type,
    total: response.data.total,
    policiesArray: response.data.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Frontend expects: policy_name, signature, expression, schema, database, granted_roles, expiration_date
  const mappedPolicies: RLSPolicy[] = await Promise.all(
    backendPolicies.map(async (policy: BackendPolicy) => {
      // Try to fetch details for signature and expression
      const details = await getRLSPolicyDetails(policy.name, policy.database_name, policy.schema_name);

      return {
        policy_name: policy.name,
        schema: policy.schema_name,
        database: policy.database_name,
        signature: details?.details?.signature || '(Not available)',
        expression: details?.details?.body || '(Not available)',
        filter_expression: '',
        active: true,
        description: policy.comment || '',
        created_at: policy.created_on,
        table_name: undefined,
        granted_roles: policy.granted_roles || [],
        expiration_date: policy.expiration_date || undefined,
      };
    })
  );

  console.log('🔄 Mapped policies with details:', mappedPolicies);

  return mappedPolicies;
}

export async function createRLSPolicy(data: CreateRLSPolicyRequest): Promise<RLSPolicy> {
  // Backend spec: Use query parameters (not JSON body)
  const params: Record<string, string> = {
    policy_name: data.policy_name,
    signature: data.signature,
    expression: data.expression,
  };

  // Add optional fields if provided
  if (data.database) {
    params.database = data.database;
  }
  if (data.schema) {
    params.schema = data.schema;
  }
  if (data.description) {
    params.description = data.description;
  }
  if (data.expiration_date) {
    params.expiration_date = data.expiration_date;
  }

  const url = `${POLICIES_API}/row-access`;
  console.log('[createRLSPolicy] POST', url, 'params:', params);

  const response = await apiClient.post<StandardResponse<RLSPolicy>>(url, null, { params });

  console.log('[createRLSPolicy] Response:', response.status, response.data);
  return response.data.data;
}

export async function applyRLSPolicy(data: ApplyRLSPolicyRequest): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/row-access/apply`, null, {
      params: {
        policy_name: data.policy_name,
        table_name: data.table_name,
        database: data.database,
        schema: data.schema,
        policy_column: data.policy_column,
        policy_schema: data.policy_schema || DEFAULT_GOVERNANCE_SCHEMA,
        ...(data.policy_database != null && { policy_database: data.policy_database }),
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply RLS policy error:', {
      message: error.response?.data?.message ?? error.response?.data?.error?.message ?? error.message,
      detail: error.response?.data?.detail ?? error.response?.data?.error,
      status: error.response?.status,
      data,
    });
    throw error;
  }
}

export async function removeRLSPolicy(
  table_name: string,
  database: string,
  schema: string
): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/row-access/remove`, null, {
      params: {
        table_name,
        database,
        schema,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Remove RLS policy error:', {
      message: error.response?.data?.message ?? error.response?.data?.error?.message ?? error.message,
      detail: error.response?.data?.detail ?? error.response?.data?.error,
      status: error.response?.status,
      params: { table_name, database, schema },
    });
    throw error;
  }
}

export async function deleteRLSPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/ROW_ACCESS/${policy_name}`;
  console.log('[deleteRLSPolicy] DELETE', url);

  try {
    const response = await apiClient.delete<StandardResponse>(url);
    console.log('[deleteRLSPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete RLS policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

// ============= RLS POLICY HELPERS =============

/**
 * Helper to create an RLS policy that restricts access by role
 * @param policyName - Name of the policy (e.g., "ROLE_ADMIN_ONLY")
 * @param columnName - Column name in the signature (e.g., "user_role")
 * @param allowedRoles - Array of roles that should have access
 * @param schema - Schema where the policy will be created
 */
export async function createRoleBasedRLSPolicy(
  policyName: string,
  columnName: string,
  allowedRoles: string[],
): Promise<RLSPolicy> {
  const rolesCondition = allowedRoles.map(role => `CURRENT_ROLE() = '${role}'`).join(' OR ');
  return createRLSPolicy({
    policy_name: policyName,
    signature: `${columnName} VARCHAR`,
    expression: rolesCondition,
    description: `Restricts access to rows based on user role. Allowed roles: ${allowedRoles.join(', ')}`,
  });
}

/**
 * Helper to create an RLS policy that checks if a role is in session
 * @param policyName - Name of the policy (e.g., "ADMIN_ACCESS")
 * @param columnName - Column name in the signature
 * @param roleName - Role that should have access
 * @param schema - Schema where the policy will be created
 */
export async function createSessionRoleRLSPolicy(
  policyName: string,
  columnName: string,
  roleName: string,
): Promise<RLSPolicy> {
  return createRLSPolicy({
    policy_name: policyName,
    signature: `${columnName} VARCHAR`,
    expression: `IS_ROLE_IN_SESSION('${roleName}')`,
    description: `Restricts access to rows where ${roleName} role is in session`,
  });
}

/**
 * Helper to create an RLS policy that filters by user
 * @param policyName - Name of the policy (e.g., "USER_OWN_DATA")
 * @param columnName - Column name that contains the user identifier
 * @param schema - Schema where the policy will be created
 */
export async function createUserFilterRLSPolicy(
  policyName: string,
  columnName: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<RLSPolicy> {
  return createRLSPolicy({
    policy_name: policyName,
    signature: `${columnName} VARCHAR`,
    expression: `${columnName} = CURRENT_USER()`,
    schema,
    description: `Restricts access to rows where ${columnName} matches current user`,
  });
}

/**
 * Helper to create an RLS policy with a custom expression
 * @param policyName - Name of the policy
 * @param signature - Full signature (e.g., "user_id NUMBER, region VARCHAR")
 * @param expression - Custom SQL expression
 * @param description - Description of the policy
 * @param schema - Schema where the policy will be created
 */
export async function createCustomRLSPolicy(
  policyName: string,
  signature: string,
  expression: string,
  description?: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<RLSPolicy> {
  return createRLSPolicy({
    policy_name: policyName,
    signature,
    expression,
    schema,
    description,
  });
}

// ============= MASKING POLICY SERVICES =============

export async function getMaskingPolicyDetails(
  policy_name: string,
): Promise<any> {
  const url = `${POLICIES_API}/masking/${policy_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    console.log('✅ GET Masking Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for masking policy ${policy_name}:`, error);
    return null;
  }
}

export async function getMaskingPolicies(): Promise<MaskingPolicy[]> {
  const url = `${POLICIES_API}/MASKING`;
  console.log('🔍 GET Masking Policies API Call:', { url });

  // Backend returns direct response (no wrapper)
  const response = await apiClient.get<PolicyListResponse>(url);

  console.log('✅ GET Masking Policies Response:', {
    status: response.status,
    policyType: response.data.policy_type,
    total: response.data.total,
    policiesArray: response.data.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface with details for data_type
  // Backend LIST returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // We need to fetch details for each policy to get data_type (required for matching with columns)
  const mappedPolicies: MaskingPolicy[] = await Promise.all(
    backendPolicies.map(async (policy: BackendPolicy) => {
      // Fetch details to get data_type
      const details = await getMaskingPolicyDetails(policy.name);

      return {
        policy_name: policy.name,
        schema: policy.schema_name,
        data_type: details?.details?.signature?.split(' ')[1] || details?.data_type || 'TEXT', // Extract data type from signature or details
        masking_type: details?.details?.body ? 'CUSTOM' : undefined,
        masking_expression: details?.details?.body || undefined,
        column_type: undefined,
        created_at: policy.created_on,
        granted_roles: policy.granted_roles || [],
        expiration_date: policy.expiration_date || undefined,
      };
    })
  );

  console.log('🔄 Mapped masking policies with details:', mappedPolicies);

  return mappedPolicies;
}

export async function createMaskingPolicy(data: CreateMaskingPolicyRequest): Promise<MaskingPolicy> {
  // Backend spec: Use query parameters (not JSON body)
  // Required: policy_name, data_type, masking_type
  const params: Record<string, any> = {
    policy_name: data.policy_name,
    data_type: data.data_type,
    masking_type: data.masking_type,
  };

  // Add optional fields if provided
  if (data.database) {
    params.database = data.database;
  }
  if (data.schema) {
    params.schema = data.schema;
  }
  if (data.custom_expression) {
    params.custom_expression = data.custom_expression;
  }
  if (data.expiration_date) {
    params.expiration_date = data.expiration_date;
  }

  const url = `${POLICIES_API}/masking`;
  console.log('[createMaskingPolicy] POST', url, 'params:', params);

  const response = await apiClient.post<StandardResponse<MaskingPolicy>>(url, null, { params });

  console.log('[createMaskingPolicy] Response:', response.status, response.data);
  return response.data.data;
}

export async function applyMaskingPolicy(data: ApplyMaskingPolicyRequest): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/masking/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
        column: data.column,
        policy_schema: data.policy_schema || DEFAULT_GOVERNANCE_SCHEMA,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply masking policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      data,
    });
    throw error;
  }
}

export async function removeMaskingPolicy(
  database: string,
  schema: string,
  table: string,
  column: string
): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/masking/remove`, null, {
      params: {
        database,
        schema,
        table,
        column,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Remove masking policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      params: { database, schema, table, column },
    });
    throw error;
  }
}

export async function getMaskedColumns(
  database?: string,
  schema?: string
): Promise<MaskedColumn[]> {
  // Backend spec: GET /gouvernance/policies/masking/columns/list
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;

  const response = await apiClient.get<StandardResponse<{ columns: MaskedColumn[] }>>(
    `${POLICIES_API}/masking/columns/list`,
    { params }
  );
  // Defensive check: ensure we always return an array
  const columns = response.data.data?.columns;
  return Array.isArray(columns) ? columns : [];
}

export async function deleteMaskingPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/MASKING/${policy_name}`;
  console.log('[deleteMaskingPolicy] DELETE', url);

  try {
    const response = await apiClient.delete<StandardResponse>(url);
    console.log('[deleteMaskingPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete masking policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

// ============= NETWORK POLICY SERVICES =============

export async function getNetworkPolicyDetails(policy_name: string): Promise<any> {
  const url = `${POLICIES_API}/network/${policy_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    console.log('✅ GET Network Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for network policy ${policy_name}:`, error);
    return null;
  }
}

export async function getNetworkPolicies(): Promise<NetworkPolicy[]> {
  // Backend spec: Network uses specific endpoint (not generic /NETWORK)
  const url = `${POLICIES_API}/network/list`;
  console.log('🔍 GET Network Policies API Call:', { url });

  // Backend returns direct response (no wrapper)
  const response = await apiClient.get<PolicyListResponse>(url);

  console.log('✅ GET Network Policies Response:', {
    status: response.status,
    policyType: response.data.policy_type,
    total: response.data.total,
    policiesArray: response.data.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Note: allowed_ip_list, blocked_ip_list are NOT in LIST response - need details endpoint
  const mappedPolicies: NetworkPolicy[] = backendPolicies.map((policy: BackendPolicy) => ({
    policy_name: policy.name,
    id: policy.name,
    name: policy.name,
    type: 'allow' as const,
    ip_ranges: [],
    description: policy.comment || undefined,
    is_default: false,
    allowed_ip_list: undefined,
    blocked_ip_list: undefined,
    comment: policy.comment || undefined,
    created_at: policy.created_on,
    updated_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));

  console.log('🔄 Mapped network policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createNetworkPolicy(data: CreateNetworkPolicyRequest): Promise<NetworkPolicy> {
  const params: Record<string, any> = {
    policy_name: data.policy_name,
    allowed_ip_list: data.allowed_ip_list,
  };

  if (data.blocked_ip_list) {
    params.blocked_ip_list = data.blocked_ip_list;
  }
  if (data.comment) {
    params.comment = data.comment;
  }
  if (data.expiration_date) {
    params.expiration_date = data.expiration_date;
  }

  const url = `${POLICIES_API}/network`;
  console.log('[createNetworkPolicy] POST', url, 'params:', params);

  const response = await apiClient.post<StandardResponse<NetworkPolicy>>(url, null, { params });

  console.log('[createNetworkPolicy] Response:', response.status, response.data);
  return response.data.data;
}

export async function deleteNetworkPolicy(policy_name: string): Promise<any> {
  // Backend spec: Network uses specific endpoint (lowercase)
  // DELETE /gouvernance/policies/network/{name}
  const url = `${POLICIES_API}/network/${policy_name}`;
  console.log('[deleteNetworkPolicy] DELETE', url);

  try {
    const response = await apiClient.delete<StandardResponse>(url);
    console.log('[deleteNetworkPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete network policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

export async function setNetworkPolicyAsDefault(policy_name: string): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/network/${policy_name}/set-default`, null);
    return response.data.data;
  } catch (error: any) {
    console.error('Set network policy as default error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

// ============= TAG SERVICES =============

export async function getTagDetails(
  tag_name: string,
): Promise<any> {
  const url = `${POLICIES_API}/tags/${tag_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    console.log('✅ GET Tag Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for tag ${tag_name}:`, error);
    return null;
  }
}

export async function getTags(): Promise<Tag[]> {
  const response = await apiClient.get<StandardResponse<{ tags: any[] }>>(`${POLICIES_API}/tags/list`);

  console.log('✅ GET Tags Response:', {
    status: response.status,
    fullData: response.data,
    tagsArray: response.data.data?.tags
  });

  // Defensive check: ensure we always return an array
  const backendTags = response.data.data?.tags;
  if (!Array.isArray(backendTags)) {
    return [];
  }

  // Map backend response to frontend interface
  // Handle field name variations between backend and frontend
  const mappedTags: Tag[] = backendTags.map((tag: any) => ({
    tag_name: tag.tag_name || tag.name || '',
    schema: tag.schema || tag.schema_name || '',
    allowed_values: tag.allowed_values || tag.allowedValues || undefined,
    comment: tag.comment || tag.description || undefined,
    created_at: tag.created_at || tag.created_on || '',
  }));

  console.log('🔄 Mapped tags:', mappedTags);

  return mappedTags;
}

export async function createTag(data: CreateTagRequest): Promise<Tag> {
  try {
    const response = await apiClient.post<StandardResponse<Tag>>(`${POLICIES_API}/tags`, null, {
      params: {
        tag_name: data.tag_name,
        allowed_values: data.allowed_values,
        comment: data.comment,
        //schema: data.schema || DEFAULT_GOVERNANCE_SCHEMA,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create tag error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function applyTag(data: ApplyTagRequest): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/tags/apply`, null, {
      params: {
        tag_name: data.tag_name,
        tag_value: data.tag_value,
        object_type: data.object_type,
        database: data.database,
        schema: data.schema,
        table: data.table,
        //column: data.column,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply tag error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function removeTag(
  object_type: string,
  object_name: string,
  tag_name: string,
): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/tags/remove`, null, {
      params: {
        object_type,
        object_name,
        tag_name,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Remove tag error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      params: { object_type, object_name, tag_name },
    });
    throw error;
  }
}

export async function deleteTag(tag_name: string): Promise<any> {
  try {
    const response = await apiClient.delete<StandardResponse>(`${POLICIES_API}/tags/${tag_name}`);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete tag error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      tag_name,
    });
    throw error;
  }
}

// ============= PASSWORD POLICY SERVICES =============

export async function getPasswordPolicyDetails(
  policy_name: string,
): Promise<any> {
  const url = `${POLICIES_API}/password/${policy_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    console.log('✅ GET Password Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for password policy ${policy_name}:`, error);
    return null;
  }
}

export async function getPasswordPolicies(): Promise<PasswordPolicy[]> {
  const url = `${POLICIES_API}/PASSWORD`;
  console.log('🔍 GET Password Policies API Call:', { url });

  // Backend returns direct response (no wrapper)
  const response = await apiClient.get<PolicyListResponse>(url);

  console.log('✅ GET Password Policies Response:', {
    status: response.status,
    policyType: response.data.policy_type,
    total: response.data.total,
    policiesArray: response.data.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Note: password settings (min_length, etc.) are NOT in LIST response - need details endpoint
  const mappedPolicies: PasswordPolicy[] = backendPolicies.map((policy: BackendPolicy) => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    min_length: 8, // Default - not in LIST response
    max_length: 256,
    min_upper_case_chars: 0,
    min_lower_case_chars: 0,
    min_numeric_chars: 0,
    min_special_chars: 0,
    max_age_days: 90,
    max_retries: 5,
    lockout_time_mins: 15,
    is_default: false,
    created_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));

  console.log('🔄 Mapped password policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createPasswordPolicy(data: CreatePasswordPolicyRequest): Promise<PasswordPolicy> {
  // Backend spec: Parameters use password_ prefix
  const params: Record<string, any> = {
    policy_name: data.policy_name,
  };

  // Add optional fields with correct backend parameter names
  if (data.min_length !== undefined) {
    params.password_min_length = data.min_length;
  }
  if (data.max_length !== undefined) {
    params.password_max_length = data.max_length;
  }
  if (data.min_upper_case_chars !== undefined) {
    params.password_min_upper_case_chars = data.min_upper_case_chars;
  }
  if (data.min_lower_case_chars !== undefined) {
    params.password_min_lower_case_chars = data.min_lower_case_chars;
  }
  if (data.min_numeric_chars !== undefined) {
    params.password_min_numeric_chars = data.min_numeric_chars;
  }
  if (data.min_special_chars !== undefined) {
    params.password_min_special_chars = data.min_special_chars;
  }
  if (data.max_age_days !== undefined) {
    params.password_max_age_days = data.max_age_days;
  }
  if (data.max_retries !== undefined) {
    params.password_max_retries = data.max_retries;
  }
  if (data.lockout_time_mins !== undefined) {
    params.password_lockout_time_mins = data.lockout_time_mins;
  }
  if (data.expiration_date) {
    params.expiration_date = data.expiration_date;
  }

  const url = `${POLICIES_API}/password`;
  console.log('[createPasswordPolicy] POST', url, 'params:', params);

  const response = await apiClient.post<StandardResponse<PasswordPolicy>>(url, null, { params });

  console.log('[createPasswordPolicy] Response:', response.status, response.data);
  return response.data.data;
}

export async function deletePasswordPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/PASSWORD/${policy_name}`;
  console.log('[deletePasswordPolicy] DELETE', url);

  try {
    const response = await apiClient.delete<StandardResponse>(url);
    console.log('[deletePasswordPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete password policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

export async function setPasswordPolicyAsDefault(
  policy_name: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/password/${policy_name}/set-default`, null, {
      params: { schema },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Set password policy as default error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
      schema,
    });
    throw error;
  }
}

// ============= SESSION POLICY SERVICES =============

export async function getSessionPolicyDetails(
  policy_name: string,
): Promise<any> {
  const url = `${POLICIES_API}/session/${policy_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    console.log('✅ GET Session Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for session policy ${policy_name}:`, error);
    return null;
  }
}

export async function getSessionPolicies(): Promise<SessionPolicy[]> {
  const url = `${POLICIES_API}/SESSION`;
  console.log('🔍 GET Session Policies API Call:', { url });

  // Backend returns direct response (no wrapper)
  const response = await apiClient.get<PolicyListResponse>(url);

  console.log('✅ GET Session Policies Response:', {
    status: response.status,
    policyType: response.data.policy_type,
    total: response.data.total,
    policiesArray: response.data.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Note: session timeout settings are NOT in LIST response - need details endpoint
  const mappedPolicies: SessionPolicy[] = backendPolicies.map((policy: BackendPolicy) => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    session_idle_timeout_mins: 60, // Default - not in LIST response
    session_ui_idle_timeout_mins: 30,
    is_default: false,
    created_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));

  console.log('🔄 Mapped session policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createSessionPolicy(data: CreateSessionPolicyRequest): Promise<SessionPolicy> {
  const params: Record<string, any> = {
    policy_name: data.policy_name,
    session_idle_timeout_mins: data.session_idle_timeout_mins,
    session_ui_idle_timeout_mins: data.session_ui_idle_timeout_mins,
  };

  if (data.expiration_date) {
    params.expiration_date = data.expiration_date;
  }

  const url = `${POLICIES_API}/session`;
  console.log('[createSessionPolicy] POST', url, 'params:', params);

  const response = await apiClient.post<StandardResponse<SessionPolicy>>(url, null, { params });

  console.log('[createSessionPolicy] Response:', response.status, response.data);
  return response.data.data;
}

export async function deleteSessionPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/SESSION/${policy_name}`;
  console.log('[deleteSessionPolicy] DELETE', url);

  try {
    const response = await apiClient.delete<StandardResponse>(url);
    console.log('[deleteSessionPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete session policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

export async function setSessionPolicyAsDefault(
  policy_name: string,
): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/session/${policy_name}/set-default`, null);
    return response.data.data;
  } catch (error: any) {
    console.error('Set session policy as default error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

// ============= AGGREGATION POLICY SERVICES =============

export interface AggregationPolicy {
  policy_name: string;
  schema: string;
  aggregation_constraint: string;
  created_at?: string;
  granted_roles?: string[];
  expiration_date?: string;
}

export interface CreateAggregationPolicyRequest {
  policy_name: string;
  aggregation_constraint: string;
  database?: string;
  schema?: string;
  expiration_date?: string;
}

export interface ApplyAggregationPolicyRequest {
  policy_name: string;
  database: string;
  schema: string;
  table: string;
}

export async function getAggregationPolicyDetails(
  policy_name: string,
): Promise<any> {
  const url = `${POLICIES_API}/aggregation/${policy_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    console.log('✅ GET Aggregation Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for aggregation policy ${policy_name}:`, error);
    return null;
  }
}


export async function getAggregationPolicies(): Promise<AggregationPolicy[]> {
  const url = `${POLICIES_API}/AGGREGATION`;
  console.log('🔍 GET Aggregation Policies API Call:', { url });

  // Backend returns direct response (no wrapper)
  const response = await apiClient.get<PolicyListResponse>(url);

  console.log('✅ GET Aggregation Policies Response:', {
    status: response.status,
    policyType: response.data.policy_type,
    total: response.data.total,
    policiesArray: response.data.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Note: aggregation_constraint is NOT in LIST response - need details endpoint
  const mappedPolicies: AggregationPolicy[] = backendPolicies.map((policy: BackendPolicy) => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    aggregation_constraint: '', // Not in LIST response - would need details endpoint
    created_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));

  console.log('🔄 Mapped aggregation policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createAggregationPolicy(data: CreateAggregationPolicyRequest): Promise<AggregationPolicy> {
  const params: Record<string, any> = {
    policy_name: data.policy_name,
    aggregation_constraint: data.aggregation_constraint,
  };

  if (data.database) {
    params.database = data.database;
  }
  if (data.schema) {
    params.schema = data.schema;
  }
  if (data.expiration_date) {
    params.expiration_date = data.expiration_date;
  }

  const url = `${POLICIES_API}/aggregation`;
  console.log('[createAggregationPolicy] POST', url, 'params:', params);

  const response = await apiClient.post<StandardResponse<AggregationPolicy>>(url, null, { params });

  console.log('[createAggregationPolicy] Response:', response.status, response.data);
  return response.data.data;
}

export async function applyAggregationPolicy(data: ApplyAggregationPolicyRequest): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/aggregation/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
      },
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      data,
    });
    throw error;
  }
}

export async function removeAggregationPolicy(
  database: string,
  schema: string,
  table: string
): Promise<any> {
  try {
    const response = await apiClient.delete<StandardResponse>(
      `${POLICIES_API}/aggregation/${database}/${schema}/${table}`
    );
    return response.data.data;
  } catch (error: any) {
    console.error('Remove aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      params: { database, schema, table },
    });
    throw error;
  }
}

export async function deleteAggregationPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/AGGREGATION/${policy_name}`;
  console.log('[deleteAggregationPolicy] DELETE', url);

  try {
    const response = await apiClient.delete<StandardResponse>(url);
    console.log('[deleteAggregationPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Delete aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
    });
    throw error;
  }
}

// ============= OBJECT SELECTION HELPERS =============

export interface DatabaseObject {
  name: string;
  created_on?: string;
  owner?: string;
}

export interface SchemaObject {
  name: string;
  database: string;
  created_on?: string;
  owner?: string;
}

export interface TableObject {
  name: string;
  database: string;
  schema: string;
  rows?: number;
  owner?: string;
}

export interface ColumnObject {
  column_name: string;
  data_type: string;
  nullable?: boolean;
  primary_key?: boolean;
}

export async function getDatabases(): Promise<DatabaseObject[]> {
  const response = await apiClient.get<StandardResponse<{ databases: DatabaseObject[] }>>(
    `${POLICIES_API}/objects/databases`
  );
  return response.data.data.databases || [];
}

export async function getSchemas(database: string): Promise<SchemaObject[]> {
  const response = await apiClient.get<StandardResponse<{ schemas: SchemaObject[] }>>(
    `${POLICIES_API}/objects/schemas/${database}`
  );
  return response.data.data.schemas || [];
}

export async function getTables(database: string, schema: string): Promise<TableObject[]> {
  const response = await apiClient.get<StandardResponse<{ tables: TableObject[] }>>(
    `${POLICIES_API}/objects/tables/${database}/${schema}`
  );
  return response.data.data.tables || [];
}

export async function getColumns(database: string, schema: string, table: string): Promise<string[]> {
  const response = await apiClient.get<StandardResponse<{ columns: ColumnObject[] }>>(
    `${POLICIES_API}/objects/columns/${database}/${schema}/${table}`
  );
  console.log('✅ GET Columns Response:', {
    status: response.status,
    fullData: response.data,
    columnsArray: response.data.data?.columns
  });
  const columns = response.data.data?.columns || [];

  return columns.map(col => col.column_name);
}


// ============= POLICY-ROLE ASSIGNMENT SERVICES =============

/**
 * Map frontend policy types to backend policy types
 * Based on Snowflake policy types: https://docs.snowflake.com/en/sql-reference/sql/create-policy
 */
const POLICY_TYPE_MAP: Record<string, string> = {
  'rls': 'ROW_ACCESS',
  'masking': 'MASKING',
  'cls': 'MASKING',  // Column-level security is also masking in Snowflake
  'network': 'NETWORK',
  'aggregation': 'AGGREGATION',
  'authentication': 'AUTHENTICATION',
  'join': 'JOIN',
  'packages': 'PACKAGES',
  'password': 'PASSWORD',
  'privacy': 'PRIVACY',
  'projection': 'PROJECTION',
  'session': 'SESSION',
  'storage': 'STORAGE_LIFECYCLE',
};

/**
 * Assign a policy to multiple roles (or update existing assignments)
 * This manages which roles have access to a specific policy
 *
 * Backend expects: PUT /gouvernance/policies/{policy_type}/{policy_name}/roles
 * Where policy_type is one of: MASKING, ROW_ACCESS, NETWORK, etc.
 */
export async function assignPolicyToRoles(
  policyName: string,
  policyType: 'rls' | 'masking' | 'cls' | 'network' | 'aggregation' | 'authentication' | 'join' | 'packages' | 'password' | 'privacy' | 'projection' | 'session' | 'storage',
  roles: string[]
): Promise<{
  message: string;
  policy_name: string;
  added: string[];
  removed: string[];
  verified_roles: string[];
}> {
  // Map frontend policy type to backend policy type
  const backendPolicyType = POLICY_TYPE_MAP[policyType] || policyType.toUpperCase();

  console.log('[assignPolicyToRoles] Assigning policy:', policyName);
  console.log('[assignPolicyToRoles] Policy type:', policyType, '→', backendPolicyType);
  console.log('[assignPolicyToRoles] Roles:', roles);

  try {
    const response = await apiClient.put<StandardResponse<{
      message: string;
      policy_name: string;
      added: string[];
      removed: string[];
      verified_roles: string[];
    }>>(`${POLICIES_API}/${backendPolicyType}/${policyName}/roles`,
      { roles } // Send as body
    );

    console.log('[assignPolicyToRoles] Response:', response.data);

    return response.data.data;
  } catch (error: any) {
    console.error('Assign policy to roles error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policyType: backendPolicyType,
      policyName,
      roles,
    });
    throw error;
  }
}

/**
 * Update policy metadata (e.g., expiration date)
 *
 * Backend endpoint: PUT /gouvernance/policies/{POLICY_TYPE}/{POLICY_NAME}/metadata
 *
 * @param policyName - The policy name (not FQN)
 * @param policyType - Frontend policy type (rls, masking, etc.)
 * @param metadata - Metadata to update (currently only expiration_date)
 */
export async function updatePolicyMetadata(
  policyName: string,
  policyType: 'rls' | 'masking' | 'cls' | 'network' | 'aggregation' | 'authentication' | 'join' | 'packages' | 'password' | 'privacy' | 'projection' | 'session' | 'storage',
  metadata: {
    expiration_date?: string;
  }
): Promise<{
  message: string;
  policy_name: string;
  policy_type: string;
  expiration_date?: string;
}> {
  // Map frontend policy type to backend policy type
  const backendPolicyType = POLICY_TYPE_MAP[policyType] || policyType.toUpperCase();

  console.log('[updatePolicyMetadata] Updating metadata for policy:', policyName);
  console.log('[updatePolicyMetadata] Policy type:', policyType, '→', backendPolicyType);
  console.log('[updatePolicyMetadata] Metadata:', metadata);

  try {
    const response = await apiClient.put<StandardResponse<{
      message: string;
      policy_name: string;
      policy_type: string;
      expiration_date?: string;
    }>>(`${POLICIES_API}/${backendPolicyType}/${policyName}/metadata`,
      metadata
    );

    console.log('[updatePolicyMetadata] Response:', response.data);

    return response.data.data;
  } catch (error: any) {
    console.error('Update policy metadata error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policyType: backendPolicyType,
      policyName,
      metadata,
    });
    throw error;
  }
}

// ============= POLICY REFERENCE MANAGEMENT =============

/**
 * Interface for policy reference (where a policy is applied)
 */
export interface PolicyReference {
  database: string;
  schema: string;
  table: string;
  column?: string;
  entity_type: string;
  policy_status: string;
}

/**
 * Response from getReferences endpoint
 */
export interface PolicyReferencesResponse {
  policy_name: string;
  policy_type: string;
  references: PolicyReference[];
  reference_count: number;
  can_delete: boolean;
}

/**
 * Response from unapplyAll endpoint
 */
export interface UnapplyAllResponse {
  policy_name: string;
  removed: Array<{ table: string; column?: string; status: string }>;
  errors: Array<{ table: string; column?: string; error: string }>;
  can_delete: boolean;
}

/**
 * Get all references (tables/columns) where a policy is applied
 * Use this before deleting a policy to check if it has references
 */
export async function getPolicyReferences(
  policyType: string,
  policyName: string,
  database: string = 'cp_data360',
  schema: string = 'gouvernance'
): Promise<PolicyReferencesResponse> {
  // Use lowercase policy type for this endpoint
  const type = policyType.toLowerCase().replace('_', '-');
  const url = `${POLICIES_API}/${type}/${policyName}/references`;

  console.log('[getPolicyReferences] GET', url);

  try {
    const response = await apiClient.get<StandardResponse<PolicyReferencesResponse>>(url, {
      params: { database, schema }
    });
    console.log('[getPolicyReferences] Response:', response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Get policy references error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    throw error;
  }
}

/**
 * Unapply (remove) a policy from ALL tables/columns at once
 * Use this before deleting a policy that has references
 */
export async function unapplyPolicyFromAll(
  policyType: string,
  policyName: string,
  database: string = 'cp_data360',
  schema: string = 'gouvernance'
): Promise<UnapplyAllResponse> {
  // Use lowercase policy type for this endpoint
  const type = policyType.toLowerCase().replace('_', '-');
  const url = `${POLICIES_API}/${type}/${policyName}/unapply-all`;

  console.log('[unapplyPolicyFromAll] POST', url);

  try {
    const response = await apiClient.post<StandardResponse<UnapplyAllResponse>>(url, null, {
      params: { database, schema }
    });
    console.log('[unapplyPolicyFromAll] Response:', response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Unapply policy from all error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    throw error;
  }
}

/**
 * Safe delete - checks references first, unapplies if needed, then deletes
 * Returns detailed result of the operation
 */
export async function safeDeletePolicy(
  policyType: string,
  policyName: string
): Promise<{
  success: boolean;
  removedRefs?: number;
  error?: string;
}> {
  try {
    // 1. Check references
    const refs = await getPolicyReferences(policyType, policyName);

    if (!refs.can_delete && refs.references.length > 0) {
      // 2. Unapply from all references first
      const unapplyResult = await unapplyPolicyFromAll(policyType, policyName);

      if (unapplyResult.errors.length > 0) {
        return {
          success: false,
          error: `Could not remove policy from: ${unapplyResult.errors.map(e => e.table).join(', ')}`
        };
      }
    }

    // 3. Now delete the policy
    const backendType = policyType.toUpperCase().replace('-', '_');

    // Network uses specific endpoint
    if (backendType === 'NETWORK') {
      await deleteNetworkPolicy(policyName);
    } else {
      // Generic delete for other types
      const url = `${POLICIES_API}/${backendType}/${policyName}`;
      await apiClient.delete(url);
    }

    return {
      success: true,
      removedRefs: refs.references.length
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.detail || error.response?.data?.message || error.message
    };
  }
}

// ============= TABLE/OBJECT POLICIES =============

/**
 * Policy applied to a table/view object
 */
export interface ObjectPolicy {
  policy_name: string;
  policy_type: 'ROW_ACCESS' | 'MASKING' | 'AGGREGATION' | 'TAG';
  column?: string; // Only for masking policies
  applied_on?: string;
}

/**
 * Response from getTablePolicies endpoint
 */
export interface TablePoliciesResponse {
  database: string;
  schema: string;
  table: string;
  has_governance: boolean;
  policies: {
    row_access: ObjectPolicy[];
    masking: ObjectPolicy[];
    aggregation: ObjectPolicy[];
    tags: ObjectPolicy[];
  };
  total_policies: number;
}

/**
 * Get all policies applied to a specific table/view
 * Use this to check what policies exist before applying new ones
 */
export async function getTablePolicies(
  database: string,
  schema: string,
  table: string
): Promise<TablePoliciesResponse> {
  const url = `${POLICIES_API}/objects/${database}/${schema}/${table}/policies`;
  console.log('[getTablePolicies] GET', url);

  try {
    const response = await apiClient.get<StandardResponse<TablePoliciesResponse>>(url);
    console.log('[getTablePolicies] Response:', response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Get table policies error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    // Return empty structure if endpoint fails (table might not have any policies)
    return {
      database,
      schema,
      table,
      has_governance: false,
      policies: {
        row_access: [],
        masking: [],
        aggregation: [],
        tags: [],
      },
      total_policies: 0,
    };
  }
}

/**
 * Replace an existing masking policy on a column with a new one
 * Use this when column already has a masking policy applied
 */
export async function replaceMaskingPolicy(data: {
  new_policy_name: string;
  database: string;
  schema: string;
  table: string;
  column: string;
  policy_schema?: string;
}): Promise<any> {
  const url = `${POLICIES_API}/masking/replace`;
  console.log('[replaceMaskingPolicy] POST', url, 'data:', data);

  const params: Record<string, string> = {
    new_policy_name: data.new_policy_name,
    database: data.database,
    schema: data.schema,
    table_name: data.table,
    column_name: data.column,
  };

  if (data.policy_schema) {
    params.policy_schema = data.policy_schema;
  }

  try {
    const response = await apiClient.post<StandardResponse>(url, null, { params });
    console.log('[replaceMaskingPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Replace masking policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    throw error;
  }
}

/**
 * Replace an existing RLS policy on a table with a new one
 * Use this when table already has an RLS policy applied
 */
export async function replaceRLSPolicy(data: {
  new_policy_name: string;
  database: string;
  schema: string;
  table: string;
  policy_column: string;
  policy_schema?: string;
}): Promise<any> {
  const url = `${POLICIES_API}/row-access/replace`;
  console.log('[replaceRLSPolicy] POST', url, 'data:', data);

  const params: Record<string, string> = {
    new_policy_name: data.new_policy_name,
    database: data.database,
    schema: data.schema,
    table_name: data.table,
    policy_column: data.policy_column,
  };

  if (data.policy_schema) {
    params.policy_schema = data.policy_schema;
  }

  try {
    const response = await apiClient.post<StandardResponse>(url, null, { params });
    console.log('[replaceRLSPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Replace RLS policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    throw error;
  }
}

/**
 * Replace an existing aggregation policy on a table with a new one
 * Use this when table already has an aggregation policy applied
 */
export async function replaceAggregationPolicy(data: {
  new_policy_name: string;
  database: string;
  schema: string;
  table: string;
}): Promise<any> {
  const url = `${POLICIES_API}/aggregation/replace`;
  console.log('[replaceAggregationPolicy] POST', url, 'data:', data);

  const params: Record<string, string> = {
    new_policy_name: data.new_policy_name,
    database: data.database,
    schema: data.schema,
    table_name: data.table,
  };

  try {
    const response = await apiClient.post<StandardResponse>(url, null, { params });
    console.log('[replaceAggregationPolicy] Response:', response.status, response.data);
    return response.data.data;
  } catch (error: any) {
    console.error('Replace aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    throw error;
  }
}

// ============= UTILITY SERVICES =============

export async function healthCheck(): Promise<{ status: string; service: string }> {
  const response = await apiClient.get(`${POLICIES_API}/health`);
  return response.data;
}
