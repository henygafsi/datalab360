/**
 * Frontend Service Layer for Snowflake Governance Policies
 * TypeScript service to interact with backend API endpoints
 *
 * Location: apps/data360/src/app/services/gouvernance/policies.ts
 */

import axios from 'axios';
import { getAuthSession } from '@/lib/auth';
import { API_CONFIG, DEFAULTS } from '@/config/database.config';

const API_BASE_URL = API_CONFIG.BASE_URL;
const POLICIES_API = `${API_BASE_URL}${API_CONFIG.ENDPOINTS.GOVERNANCE}/policies`;

// Default governance schema FQN
const DEFAULT_GOVERNANCE_SCHEMA = DEFAULTS.GOVERNANCE_FQN;

// Standard response wrapper from backend
interface StandardResponse<T = any> {
  message: string;
  data: T;
  status?: string;
}

// Helper to get authentication headers from session with Snowflake account context
async function getAuthHeaders() {
  const session = await getAuthSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available. Please sign in.');
  }
  return {
    Authorization: `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
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
}

export interface CreateRLSPolicyRequest {
  policy_name: string;
  signature: string;
  expression: string;
  schema?: string;
  description?: string;
}

export interface ApplyRLSPolicyRequest {
  policy_name: string;
  table_name: string;
  database: string;
  schema: string;
  policy_column: string;
  policy_schema?: string;
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
}

export interface CreateMaskingPolicyRequest {
  policy_name: string;
  data_type: string;
  return_type?: string;
  role_name?: string;
  replace_with?: string;
  masking_type?: MaskingType;
  schema?: string;
  authorized_roles?: string[];
  custom_expression?: string;
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
}

export interface CreateNetworkPolicyRequest {
  policy_name: string;
  allowed_ip_list: string;
  blocked_ip_list?: string;
  comment?: string;
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
}

export interface CreateSessionPolicyRequest {
  policy_name: string;
  session_idle_timeout_mins?: number;
  session_ui_idle_timeout_mins?: number;
}

// ============= ROW ACCESS POLICY (RLS) SERVICES =============

export async function getRLSPolicyDetails(
  policy_name: string,
): Promise<any> {
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/row-access/${policy_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, {
      params: {  },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for policy ${policy_name}:`, error);
    return null;
  }
}

export async function getRLSPolicies(): Promise<RLSPolicy[]> {
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/row-access/list`;
  console.log('🔍 GET RLS Policies API Call:', { url });

  const response = await axios.get<StandardResponse<{ policies: any[] }>>(url, {
    params: {  },
    headers,
  });

  console.log('✅ GET RLS Policies Response:', {
    status: response.status,
    fullData: response.data,
    policiesArray: response.data.data?.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend uses: name, database_name, schema_name, comment, created_on, owner, kind
  // Frontend expects: policy_name, signature, expression, schema, database
  const mappedPolicies: RLSPolicy[] = await Promise.all(
    backendPolicies.map(async (policy: any) => {
      // Try to fetch details for signature and expression
      const details = await getRLSPolicyDetails(policy.name);

      return {
        policy_name: policy.name || policy.policy_name || '',
        schema: policy.schema_name || policy.schema || '',
        database: policy.database_name || policy.database || '',
        signature: details?.details?.signature || policy.signature || '(Not available)',
        expression: details?.details?.body || policy.body || policy.expression || policy.comment || '(Not available)',
        filter_expression: policy.filter_expression || policy.expression || '',
        active: true, // Backend doesn't provide this, assume active
        description: policy.comment || policy.description || '',
        created_at: policy.created_on || policy.created_at || '',
        table_name: policy.table_name || undefined,
        owner: policy.owner,
        kind: policy.kind,
      };
    })
  );

  console.log('🔄 Mapped policies with details:', mappedPolicies);

  return mappedPolicies;
}

export async function createRLSPolicy(data: CreateRLSPolicyRequest): Promise<RLSPolicy> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse<RLSPolicy>>(`${POLICIES_API}/row-access`, null, {
      params: {
        policy_name: data.policy_name,
        signature: data.signature,
        expression: data.expression,
        description: data.description,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create RLS policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function applyRLSPolicy(data: ApplyRLSPolicyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/row-access/apply`, null, {
      params: {
        policy_name: data.policy_name,
        table_name: data.table_name,
        database: data.database,
        schema: data.schema,
        policy_column: data.policy_column,
        policy_schema: data.policy_schema || DEFAULT_GOVERNANCE_SCHEMA,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply RLS policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/row-access/remove`, null, {
      params: {
        table_name,
        database,
        schema,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Remove RLS policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      params: { table_name, database, schema },
    });
    throw error;
  }
}

export async function deleteRLSPolicy(
  policy_name: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<any> {
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/row-access/${policy_name}`;

  console.log('🗑️ DELETE RLS Policy API Call:', {
    url,
    policy_name,
    schema,
    fullUrl: `${url}?schema=${schema}`
  });

  try {
    const response = await axios.delete<StandardResponse>(url, {
      params: { schema },
      headers,
    });

    console.log('✅ DELETE RLS Policy Response:', {
      status: response.status,
      data: response.data
    });

    return response.data.data;
  } catch (error: any) {
    console.error('❌ DELETE RLS Policy Error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
      schema,
      fullError: error.response?.data
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
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/masking/${policy_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, {
      params: {  },
      headers,
    });
    console.log('✅ GET Masking Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for masking policy ${policy_name}:`, error);
    return null;
  }
}

export async function getMaskingPolicies(): Promise<MaskingPolicy[]> {
  const headers = await getAuthHeaders();
  console.log('🔍 GET Masking Policies API Call:', {  });

  const response = await axios.get<StandardResponse<{ policies: any[] }>>(`${POLICIES_API}/masking/list`, {
    params: {  },
    headers,
  });

  console.log('✅ GET Masking Policies Response:', {
    status: response.status,
    fullData: response.data,
    policiesArray: response.data.data?.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Handle field name variations between backend and frontend
  const mappedPolicies: MaskingPolicy[] = backendPolicies.map((policy: any) => ({
    policy_name: policy.policy_name || policy.name || '',
    schema: policy.schema || policy.schema_name || '',
    data_type: policy.data_type || policy.column_type || policy.type || '',
    masking_type: policy.masking_type || policy.type || undefined,
    masking_expression: policy.masking_expression || policy.body || policy.expression || undefined,
    column_type: policy.column_type || policy.data_type || undefined,
    created_at: policy.created_at || policy.created_on || '',
  }));

  console.log('🔄 Mapped masking policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createMaskingPolicy(data: CreateMaskingPolicyRequest): Promise<MaskingPolicy> {
  const headers = await getAuthHeaders();

  // Build params object, only including custom_expression if masking_type is not provided
  const params: Record<string, any> = {
    policy_name: data.policy_name,
    data_type: data.data_type,
  };

  // Only add masking_type if it's defined
  if (data.masking_type) {
    params.masking_type = data.masking_type;
  }

  // Only add custom_expression if provided
  if (data.custom_expression) {
    params.custom_expression = data.custom_expression;
  }

  // Only add authorized_roles if provided
  if (data.authorized_roles && data.authorized_roles.length > 0) {
    params.authorized_roles = data.authorized_roles.join(',');
  }

  try {
    const response = await axios.post<StandardResponse<MaskingPolicy>>(`${POLICIES_API}/masking`, null, {
      params,
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create masking policy error:', error.response?.data || error.message);
    throw error;
  }
}

export async function applyMaskingPolicy(data: ApplyMaskingPolicyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/masking/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
        column: data.column,
        policy_schema: data.policy_schema || DEFAULT_GOVERNANCE_SCHEMA,
      },
      headers,
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/masking/remove`, null, {
      params: {
        database,
        schema,
        table,
        column,
      },
      headers,
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
  const headers = await getAuthHeaders();
  const response = await axios.get<StandardResponse<{ columns: MaskedColumn[] }>>(`${POLICIES_API}/masked-columns`, {
    params: { database, schema },
    headers,
  });
  // Defensive check: ensure we always return an array
  const columns = response.data.data?.columns;
  return Array.isArray(columns) ? columns : [];
}

export async function deleteMaskingPolicy(
  policy_name: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.delete<StandardResponse>(`${POLICIES_API}/masking/${policy_name}`, {
      params: { schema },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Delete masking policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
      schema,
    });
    throw error;
  }
}

// ============= NETWORK POLICY SERVICES =============

export async function getNetworkPolicyDetails(policy_name: string): Promise<any> {
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/network/${policy_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, { headers });
    console.log('✅ GET Network Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for network policy ${policy_name}:`, error);
    return null;
  }
}

export async function getNetworkPolicies(): Promise<NetworkPolicy[]> {
  const headers = await getAuthHeaders();
  console.log('🔍 GET Network Policies API Call:', {  });

  const response = await axios.get<StandardResponse<{ policies: any[] }>>(`${POLICIES_API}/network/list`, {
    params: {  },
    headers,
  });

  console.log('✅ GET Network Policies Response:', {
    status: response.status,
    fullData: response.data,
    policiesArray: response.data.data?.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Handle field name variations between backend and frontend
  const mappedPolicies: NetworkPolicy[] = backendPolicies.map((policy: any) => ({
    policy_name: policy.policy_name || policy.name || '',
    id: policy.id || policy.policy_name || policy.name || '',
    name: policy.name || policy.policy_name || '',
    type: policy.type || 'allow',
    ip_ranges: policy.ip_ranges || [],
    description: policy.description || policy.comment || undefined,
    is_default: policy.is_default || false,
    allowed_ip_list: policy.allowed_ip_list || policy.allowedIpList || undefined,
    blocked_ip_list: policy.blocked_ip_list || policy.blockedIpList || undefined,
    comment: policy.comment || policy.description || undefined,
    created_at: policy.created_at || policy.created_on || '',
    updated_at: policy.updated_at || policy.updated_on || '',
  }));

  console.log('🔄 Mapped network policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createNetworkPolicy(data: CreateNetworkPolicyRequest): Promise<NetworkPolicy> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse<NetworkPolicy>>(`${POLICIES_API}/network`, null, {
      params: {
        policy_name: data.policy_name,
        allowed_ip_list: data.allowed_ip_list,
        blocked_ip_list: data.blocked_ip_list,
        comment: data.comment,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create network policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function deleteNetworkPolicy(policy_name: string): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.delete<StandardResponse>(`${POLICIES_API}/network/${policy_name}`, { headers });
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/network/${policy_name}/set-default`, null, { headers });
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
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/tags/${tag_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, {
      params: {  },
      headers,
    });
    console.log('✅ GET Tag Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for tag ${tag_name}:`, error);
    return null;
  }
}

export async function getTags(): Promise<Tag[]> {
  const headers = await getAuthHeaders();

  const response = await axios.get<StandardResponse<{ tags: any[] }>>(`${POLICIES_API}/tags/list`, {
    params: {  },
    headers,
  });

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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse<Tag>>(`${POLICIES_API}/tags`, null, {
      params: {
        tag_name: data.tag_name,
        allowed_values: data.allowed_values,
        comment: data.comment,
        //schema: data.schema || DEFAULT_GOVERNANCE_SCHEMA,
      },
      headers,
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/tags/apply`, null, {
      params: {
        tag_name: data.tag_name,
        tag_value: data.tag_value,
        object_type: data.object_type,
        database: data.database,
        schema: data.schema,
        table: data.table,
        //column: data.column,
      },
      headers,
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/tags/remove`, null, {
      params: {
        object_type,
        object_name,
        tag_name,
      },
      headers,
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.delete<StandardResponse>(`${POLICIES_API}/tags/${tag_name}`, {
      params: {  },
      headers,
    });
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
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/password/${policy_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, {
      params: {  },
      headers,
    });
    console.log('✅ GET Password Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for password policy ${policy_name}:`, error);
    return null;
  }
}

export async function getPasswordPolicies(): Promise<PasswordPolicy[]> {
  const headers = await getAuthHeaders();
  console.log('🔍 GET Password Policies API Call:', {  });

  const response = await axios.get<StandardResponse<{ policies: any[] }>>(`${POLICIES_API}/password/list`, {
    params: {  },
    headers,
  });

  console.log('✅ GET Password Policies Response:', {
    status: response.status,
    fullData: response.data,
    policiesArray: response.data.data?.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Handle field name variations between backend and frontend
  const mappedPolicies: PasswordPolicy[] = backendPolicies.map((policy: any) => ({
    policy_name: policy.policy_name || policy.name || '',
    schema: policy.schema || policy.schema_name || '',
    min_length: policy.min_length || policy.PASSWORD_MIN_LENGTH || 8,
    max_length: policy.max_length || policy.PASSWORD_MAX_LENGTH || 256,
    min_upper_case_chars: policy.min_upper_case_chars || policy.PASSWORD_MIN_UPPER_CASE_CHARS || 0,
    min_lower_case_chars: policy.min_lower_case_chars || policy.PASSWORD_MIN_LOWER_CASE_CHARS || 0,
    min_numeric_chars: policy.min_numeric_chars || policy.PASSWORD_MIN_NUMERIC_CHARS || 0,
    min_special_chars: policy.min_special_chars || policy.PASSWORD_MIN_SPECIAL_CHARS || 0,
    max_age_days: policy.max_age_days || policy.PASSWORD_MAX_AGE_DAYS || 90,
    max_retries: policy.max_retries || policy.PASSWORD_MAX_RETRIES || 5,
    lockout_time_mins: policy.lockout_time_mins || policy.PASSWORD_LOCKOUT_TIME_MINS || 15,
    is_default: policy.is_default || false,
    created_at: policy.created_at || policy.created_on || '',
  }));

  console.log('🔄 Mapped password policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createPasswordPolicy(data: CreatePasswordPolicyRequest): Promise<PasswordPolicy> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse<PasswordPolicy>>(`${POLICIES_API}/password`, null, {
      params: {
        policy_name: data.policy_name,
        min_length: data.min_length,
        max_length: data.max_length,
        min_upper_case_chars: data.min_upper_case_chars,
        min_lower_case_chars: data.min_lower_case_chars,
        min_numeric_chars: data.min_numeric_chars,
        min_special_chars: data.min_special_chars,
        max_age_days: data.max_age_days,
        max_retries: data.max_retries,
        lockout_time_mins: data.lockout_time_mins,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create password policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function deletePasswordPolicy(
  policy_name: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.delete<StandardResponse>(`${POLICIES_API}/password/${policy_name}`, {
      params: { schema },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Delete password policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
      schema,
    });
    throw error;
  }
}

export async function setPasswordPolicyAsDefault(
  policy_name: string,
  schema: string = DEFAULT_GOVERNANCE_SCHEMA
): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/password/${policy_name}/set-default`, null, {
      params: { schema },
      headers,
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
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/session/${policy_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, {
      params: {  },
      headers,
    });
    console.log('✅ GET Session Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for session policy ${policy_name}:`, error);
    return null;
  }
}

export async function getSessionPolicies(): Promise<SessionPolicy[]> {
  const headers = await getAuthHeaders();
  console.log('🔍 GET Session Policies API Call:', {  });

  const response = await axios.get<StandardResponse<{ policies: any[] }>>(`${POLICIES_API}/session/list`, {
    params: {  },
    headers,
  });

  console.log('✅ GET Session Policies Response:', {
    status: response.status,
    fullData: response.data,
    policiesArray: response.data.data?.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Handle field name variations between backend and frontend
  const mappedPolicies: SessionPolicy[] = backendPolicies.map((policy: any) => ({
    policy_name: policy.policy_name || policy.name || '',
    schema: policy.schema || policy.schema_name || '',
    session_idle_timeout_mins: policy.session_idle_timeout_mins || policy.SESSION_IDLE_TIMEOUT_MINS || 60,
    session_ui_idle_timeout_mins: policy.session_ui_idle_timeout_mins || policy.SESSION_UI_IDLE_TIMEOUT_MINS || 30,
    is_default: policy.is_default || false,
    created_at: policy.created_at || policy.created_on || '',
  }));

  console.log('🔄 Mapped session policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createSessionPolicy(data: CreateSessionPolicyRequest): Promise<SessionPolicy> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse<SessionPolicy>>(`${POLICIES_API}/session`, null, {
      params: {
        policy_name: data.policy_name,
        session_idle_timeout_mins: data.session_idle_timeout_mins,
        session_ui_idle_timeout_mins: data.session_ui_idle_timeout_mins,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create session policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function deleteSessionPolicy(
  policy_name: string,
): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.delete<StandardResponse>(`${POLICIES_API}/session/${policy_name}`, {
      params: {  },
      headers,
    });
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/session/${policy_name}/set-default`, null, {
      params: {  },
      headers,
    });
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
}

export interface CreateAggregationPolicyRequest {
  policy_name: string;
  aggregation_constraint: string;
  database?: string;
  schema?: string;
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
  const headers = await getAuthHeaders();
  const url = `${POLICIES_API}/aggregation/${policy_name}/details`;

  try {
    const response = await axios.get<StandardResponse>(url, {
      params: {  },
      headers,
    });
    console.log('✅ GET Aggregation Policy Details Response:', response.data.data);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for aggregation policy ${policy_name}:`, error);
    return null;
  }
}


export async function getAggregationPolicies(): Promise<AggregationPolicy[]> {
  const headers = await getAuthHeaders();
  console.log('🔍 GET Aggregation Policies API Call:', {  });

  const response = await axios.get<StandardResponse<{ policies: any[] }>>(`${POLICIES_API}/aggregation/list`, {
    params: {  },
    headers,
  });

  console.log('✅ GET Aggregation Policies Response:', {
    status: response.status,
    fullData: response.data,
    policiesArray: response.data.data?.policies
  });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Handle field name variations between backend and frontend
  const mappedPolicies: AggregationPolicy[] = backendPolicies.map((policy: any) => ({
    policy_name: policy.policy_name || policy.name || '',
    schema: policy.schema || policy.schema_name || '',
    aggregation_constraint: policy.aggregation_constraint || policy.body || policy.expression || '',
    created_at: policy.created_at || policy.created_on || '',
  }));

  console.log('🔄 Mapped aggregation policies:', mappedPolicies);

  return mappedPolicies;
}

export async function createAggregationPolicy(data: CreateAggregationPolicyRequest): Promise<AggregationPolicy> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse<AggregationPolicy>>(`${POLICIES_API}/aggregation`, null, {
      params: {
        policy_name: data.policy_name,
        aggregation_constraint: data.aggregation_constraint,
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      requestData: data,
    });
    throw error;
  }
}

export async function applyAggregationPolicy(data: ApplyAggregationPolicyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/aggregation/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
      },
      headers,
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
  const headers = await getAuthHeaders();
  try {
    const response = await axios.delete<StandardResponse>(
      `${POLICIES_API}/aggregation/${database}/${schema}/${table}`,
      { headers }
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
  const headers = await getAuthHeaders();
  console.log('🗑️ DELETE Aggregation Policy API Call:', {
    url: `${POLICIES_API}/aggregation/${policy_name}`,
    policy_name,
  });
  
  try {
    const response = await axios.delete<StandardResponse>(`${POLICIES_API}/aggregation/${policy_name}`, {
      headers,
    });
    
    console.log('✅ DELETE Aggregation Policy Response:', {
      status: response.status,
      data: response.data
    });
    
    return response.data.data;
  } catch (error: any) {
    console.error('❌ DELETE Aggregation Policy Error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      policy_name,
      fullError: error.response?.data
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
  const headers = await getAuthHeaders();
  const response = await axios.get<StandardResponse<{ databases: DatabaseObject[] }>>(
    `${POLICIES_API}/objects/databases`,
    { headers }
  );
  return response.data.data.databases || [];
}

export async function getSchemas(database: string): Promise<SchemaObject[]> {
  const headers = await getAuthHeaders();
  const response = await axios.get<StandardResponse<{ schemas: SchemaObject[] }>>(
    `${POLICIES_API}/objects/schemas/${database}`,
    { headers }
  );
  return response.data.data.schemas || [];
}

export async function getTables(database: string, schema: string): Promise<TableObject[]> {
  const headers = await getAuthHeaders();
  const response = await axios.get<StandardResponse<{ tables: TableObject[] }>>(
    `${POLICIES_API}/objects/tables/${database}/${schema}`,
    { headers }
  );
  return response.data.data.tables || [];
}

export async function getColumns(database: string, schema: string, table: string): Promise<string[]> {
  const headers = await getAuthHeaders();
  const response = await axios.get<StandardResponse<{ columns: ColumnObject[] }>>(
    `${POLICIES_API}/objects/columns/${database}/${schema}/${table}`,
    { headers }
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
  const headers = await getAuthHeaders();

  // Map frontend policy type to backend policy type
  const backendPolicyType = POLICY_TYPE_MAP[policyType] || policyType.toUpperCase();

  console.log('[assignPolicyToRoles] Assigning policy:', policyName);
  console.log('[assignPolicyToRoles] Policy type:', policyType, '→', backendPolicyType);
  console.log('[assignPolicyToRoles] Roles:', roles);

  try {
    const response = await axios.put<StandardResponse<{
      message: string;
      policy_name: string;
      added: string[];
      removed: string[];
      verified_roles: string[];
    }>>(`${POLICIES_API}/${backendPolicyType}/${policyName}/roles`,
      { roles }, // Send as body
      { headers }
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

// ============= UTILITY SERVICES =============

export async function healthCheck(): Promise<{ status: string; service: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${POLICIES_API}/health`, { headers });
  return response.data;
}
