/**
 * Frontend Service Layer for Snowflake Governance Policies
 * TypeScript service to interact with backend API endpoints
 *
 * Location: apps/data360/src/app/services/governance/policies.ts
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
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

// ============= ENRICHED POLICY (unified endpoint) =============

export interface GrantedObject {
  database: string;
  schema: string;
  object_name: string;
  column: string | null;
  object_type: string;
  display: string;
}

export interface EnrichedPolicy {
  name: string;
  database_name: string;
  schema_name: string;
  created_on: string | null;
  comment: string | null;
  granted_roles: string[];
  granted_objects: GrantedObject[];
  granted_objects_count: number;
  expiration_date: string | null;
}

type EnrichedPolicyType = 'AGGREGATION' | 'MASKING' | 'PASSWORD' | 'ROW_ACCESS' | 'SESSION';

export async function listPoliciesEnriched(
  policyType: EnrichedPolicyType
): Promise<EnrichedPolicy[]> {
  const { data } = await apiClient.get<{
    policy_type: string;
    total: number;
    policies: EnrichedPolicy[];
  }>(`${API_CONFIG.ENDPOINTS.GOVERNANCE}/policies/${policyType}`);
  return data?.policies ?? [];
}

// ============= ROLE-SCOPED VIEW (G1 — /policies/my-scope) =============

/**
 * One policy in the caller's role scope. `manageable_by_me` / `references_my_role`
 * are TRI-STATE:
 *   - `true`  → determined yes
 *   - `false` → determined no
 *   - `null`  → could NOT be determined (render "—", never a fake 0/No)
 */
export interface MyScopePolicy {
  name: string;
  database_name: string | null;
  schema_name: string | null;
  policy_type: string; // MASKING | ROW_ACCESS | AGGREGATION
  owner: string | null;
  created_on: string | null;
  comment: string | null;
  /** Role owns it OR holds a direct APPLY/OWNERSHIP grant (admin bypass). null = unknown. */
  manageable_by_me: boolean | null;
  /** Best-effort: role name appears as a token in the policy body. null = unknown. */
  references_my_role: boolean | null;
}

export interface MyScopePoliciesResult {
  role: string;
  policies: MyScopePolicy[];
  total: number;
  /** Honest disclaimer about the precision of the two flags. */
  note?: string | null;
}

/**
 * G1 — policies relevant to the caller's ACTIVE role. Not accountadmin-gated:
 * any authenticated user gets the policies that apply to / are manageable by
 * their role. Backend wraps the payload in StandardResponse (`data.data`).
 */
export async function getMyScopePolicies(
  database?: string,
  schema?: string,
): Promise<MyScopePoliciesResult> {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;

  const response = await apiClient.get<StandardResponse<MyScopePoliciesResult>>(
    API.gouvernance.policiesMyScope(),
    { params },
  );
  const data = response.data?.data;
  return {
    role: data?.role ?? '',
    policies: Array.isArray(data?.policies) ? data.policies : [],
    total: typeof data?.total === 'number' ? data.total : 0,
    note: data?.note ?? null,
  };
}

export function formatPolicyError(error: any, defaultMessage: string): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
  return error?.response?.data?.message || error?.message || defaultMessage;
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
  created_on?: string;
  created_by?: string;
  owner?: string;
  granted_roles?: string[];
  expiration_date?: string;
  references_count?: number;
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
  allowed_ip_list?: string;
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
  // Config detail fields are NOT in the LIST response (only the details endpoint
  // returns them). The LIST mapper sets these to `null` rather than fabricating a
  // default — null renders as "—"/"not set", never an invented value.
  min_length: number | null;
  max_length: number | null;
  min_upper_case_chars: number | null;
  min_lower_case_chars: number | null;
  min_numeric_chars: number | null;
  min_special_chars: number | null;
  max_age_days: number | null;
  max_retries: number | null;
  lockout_time_mins: number | null;
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
  // Timeout fields are NOT in the LIST response — the LIST mapper sets these to
  // `null` (rendered as "—") instead of fabricating a default.
  session_idle_timeout_mins: number | null;
  session_ui_idle_timeout_mins: number | null;
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

export async function getRLSPolicies(
  database?: string,
  schema?: string,
): Promise<RLSPolicy[]> {
  // The backend has no GET /row-access/list (405) — row-access policies come from
  // the unified inventory GET /gouvernance/policies, under data.row_access
  // (mirror getMaskingPolicies). The unified LIST carries no signature/expression,
  // so those advisory fields default to '(Not available)'; a caller that needs them
  // fetches per-policy via getRLSPolicyDetails on demand (avoids an N+1 on list).
  const url = POLICIES_API;
  const params: Record<string, string> = {
    database: database || DEFAULTS.DATABASE,
    schema: schema || DEFAULT_GOVERNANCE_SCHEMA,
  };

  // Backend returns StandardResponse: { status, message, data: { masking, row_access, aggregation, total } }
  const response = await apiClient.get<
    StandardResponse<{ masking: unknown[]; row_access: BackendPolicy[]; aggregation: unknown[]; total: number }>
  >(url, { params });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.row_access;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface.
  // Unified LIST returns: name, database_name, schema_name, created_on, comment (+ optional granted_roles/expiration_date).
  return backendPolicies.map((policy: BackendPolicy): RLSPolicy => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    database: policy.database_name,
    signature: '(Not available)',
    expression: '(Not available)',
    filter_expression: '',
    active: true,
    description: policy.comment || '',
    created_at: policy.created_on,
    table_name: undefined,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));
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

  const response = await apiClient.post<StandardResponse<RLSPolicy>>(url, null, { params });

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

  try {
    const response = await apiClient.delete<StandardResponse>(url);
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

// ============= MASKING POLICY SERVICES =============

/**
 * Shape of the masking policy detail payload returned by
 * `/policies/masking/{name}/details`. The backend nests the function
 * signature under `details.details`; older callers also read the flat
 * top-level fields, so both are modelled here.
 */
export interface MaskingPolicyDetailFields {
  signature?: string;
  return_type?: string;
  body?: string;
}

export interface MaskingPolicyDetails extends MaskingPolicyDetailFields {
  schema?: string;
  details?: { details?: MaskingPolicyDetailFields } & MaskingPolicyDetailFields;
}

export async function getMaskingPolicyDetails(
  policy_name: string,
): Promise<any> {
  const url = `${POLICIES_API}/masking/${policy_name}/details`;

  try {
    const response = await apiClient.get<StandardResponse>(url);
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for masking policy ${policy_name}:`, error);
    return null;
  }
}

/**
 * Batch variant of {@link getMaskingPolicyDetails}.
 *
 * Sends ONE POST request with all policy names and returns a map
 * `{ [policyName]: details | null }`. Replaces the N+1 pattern of
 * looping `getMaskingPolicyDetails` per policy.
 */
export async function getMaskingPolicyDetailsBatch(
  policy_names: string[],
  database?: string,
  schema?: string,
): Promise<Record<string, any>> {
  const names = (policy_names || []).filter((n): n is string => typeof n === 'string' && !!n);
  if (names.length === 0) return {};

  const url = `${POLICIES_API}/masking/batch-details`;
  try {
    const response = await apiClient.post<StandardResponse<{ details: Record<string, any>; missing: string[] }>>(
      url,
      { names, database, schema },
    );
    return response.data?.data?.details ?? {};
  } catch (error: any) {
    console.error('Batch masking policy details failed, falling back to per-policy fetch:', error);
    // Graceful fallback: per-policy (may N+1 once until backend is deployed).
    const entries = await Promise.all(
      names.map(async (n) => [n, await getMaskingPolicyDetails(n)] as const),
    );
    return Object.fromEntries(entries);
  }
}

export async function getMaskingPolicies(
  database?: string,
  schema?: string,
): Promise<MaskingPolicy[]> {
  // The backend has no GET /masking/list (405) — masking policies come from the
  // unified inventory GET /gouvernance/policies, under data.masking.
  const url = POLICIES_API;
  const params: Record<string, string> = {};
  if (database) params.database = database;
  else params.database = DEFAULTS.DATABASE;
  if (schema) params.schema = schema;
  else params.schema = DEFAULT_GOVERNANCE_SCHEMA;

  // Backend returns StandardResponse: { status, message, data: { masking, row_access, aggregation, total } }
  const response = await apiClient.get<
    StandardResponse<{ masking: BackendPolicy[]; row_access: unknown[]; aggregation: unknown[]; total: number }>
  >(url, { params });

  const responseData = response.data.data;

  // Defensive check: ensure we always return an array
  const backendPolicies = responseData?.masking;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface with details for data_type.
  // Backend LIST returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date.
  // We need the per-policy details to enrich data_type / masking_type — fetch them in ONE batch call
  // instead of N+1 (see backend POST /gouvernance/policies/masking/batch-details).
  const names = backendPolicies.map((p: BackendPolicy) => p.name).filter((n): n is string => !!n);
  const detailsMap = await getMaskingPolicyDetailsBatch(
    names,
    params.database,
    params.schema,
  );

  const mappedPolicies: MaskingPolicy[] = backendPolicies.map((policy: BackendPolicy) => {
    const details = detailsMap[policy.name] ?? null;
    // Defensive access — batch may return null for policies that don't exist anymore.
    const inner = details?.details?.details ?? details?.details ?? {};
    const signature: string | undefined = inner.signature;
    const body: string | undefined = inner.body;
    return {
      policy_name: policy.name,
      schema: policy.schema_name,
      data_type: signature?.split(' ')[1] || details?.data_type || 'TEXT',
      masking_type: body ? 'CUSTOM' : undefined,
      masking_expression: body || undefined,
      column_type: undefined,
      created_at: policy.created_on,
      granted_roles: policy.granted_roles || [],
      expiration_date: policy.expiration_date || undefined,
    };
  });


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

  const response = await apiClient.post<StandardResponse<MaskingPolicy>>(url, null, { params });

  return response.data.data;
}

export async function applyMaskingPolicy(data: ApplyMaskingPolicyRequest): Promise<any> {
  try {
    const response = await apiClient.post<StandardResponse>(`${POLICIES_API}/masking/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        // Backend POST /masking/apply expects query params `table`/`column`
        // (NOT table_name/column_name — those are the /masking/replace contract).
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
export async function deleteMaskingPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/MASKING/${policy_name}`;

  try {
    const response = await apiClient.delete<StandardResponse>(url);
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
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for network policy ${policy_name}:`, error);
    return null;
  }
}

export async function getNetworkPolicies(): Promise<NetworkPolicy[]> {
  const url = `${POLICIES_API}/network/list`;

  // Backend returns StandardResponse: { status, message, data: { policies: [...] } }
  const response = await apiClient.get<StandardResponse<{ policies: BackendPolicy[] }>>(url);

  const responseData = response.data.data;

  // Defensive check: ensure we always return an array
  const backendPolicies = responseData?.policies;
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


  return mappedPolicies;
}

export async function createNetworkPolicy(data: CreateNetworkPolicyRequest): Promise<NetworkPolicy> {
  const params: Record<string, any> = {
    policy_name: data.policy_name,
  };

  if (data.allowed_ip_list) {
    params.allowed_ip_list = data.allowed_ip_list;
  }
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

  const response = await apiClient.post<StandardResponse<NetworkPolicy>>(url, null, { params });

  return response.data.data;
}

export async function deleteNetworkPolicy(policy_name: string): Promise<any> {
  // Backend spec: Network uses specific endpoint (lowercase)
  // DELETE /gouvernance/policies/network/{name}
  const url = `${POLICIES_API}/network/${policy_name}`;

  try {
    const response = await apiClient.delete<StandardResponse>(url);
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
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for tag ${tag_name}:`, error);
    return null;
  }
}

export async function getTags(): Promise<Tag[]> {
  const response = await apiClient.get<StandardResponse<{ tags: any[] }>>(`${POLICIES_API}/tags/list`);


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
        ...(data.table && { table: data.table }),
        ...(data.column && { column: data.column }),
        ...(data.tag_schema && { tag_schema: data.tag_schema }),
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
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for password policy ${policy_name}:`, error);
    return null;
  }
}

export async function getPasswordPolicies(): Promise<PasswordPolicy[]> {
  const url = `${POLICIES_API}/password/list`;

  // Backend returns a bare envelope { policy_type, total, policies: [...] }
  // (mirrors GET /network/list) — NOT the StandardResponse data wrapper.
  const response = await apiClient.get<{ policy_type: string; total: number; policies: BackendPolicy[] }>(url);

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Note: password settings (min_length, etc.) are NOT in LIST response - need details endpoint
  const mappedPolicies: PasswordPolicy[] = backendPolicies.map((policy: BackendPolicy) => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    // The LIST response carries no config detail — surface null (→ "—") instead
    // of a fabricated default. The real values come from the details endpoint.
    min_length: null,
    max_length: null,
    min_upper_case_chars: null,
    min_lower_case_chars: null,
    min_numeric_chars: null,
    min_special_chars: null,
    max_age_days: null,
    max_retries: null,
    lockout_time_mins: null,
    is_default: false,
    created_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));


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

  const response = await apiClient.post<StandardResponse<PasswordPolicy>>(url, null, { params });

  return response.data.data;
}

export async function deletePasswordPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/PASSWORD/${policy_name}`;

  try {
    const response = await apiClient.delete<StandardResponse>(url);
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
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for session policy ${policy_name}:`, error);
    return null;
  }
}

export async function getSessionPolicies(): Promise<SessionPolicy[]> {
  const url = `${POLICIES_API}/session/list`;

  // Backend returns a bare envelope { policy_type, total, policies: [...] }
  // (mirrors GET /network/list) — NOT the StandardResponse data wrapper.
  const response = await apiClient.get<{ policy_type: string; total: number; policies: BackendPolicy[] }>(url);

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data?.policies;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface
  // Backend returns: name, database_name, schema_name, created_on, comment, granted_roles, expiration_date
  // Note: session timeout settings are NOT in LIST response - need details endpoint
  const mappedPolicies: SessionPolicy[] = backendPolicies.map((policy: BackendPolicy) => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    // Timeouts are not in the LIST response — surface null (→ "—") not a default.
    session_idle_timeout_mins: null,
    session_ui_idle_timeout_mins: null,
    is_default: false,
    created_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));


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

  const response = await apiClient.post<StandardResponse<SessionPolicy>>(url, null, { params });

  return response.data.data;
}

export async function deleteSessionPolicy(
  policy_name: string
): Promise<any> {
  // Backend spec: DELETE /gouvernance/policies/{TYPE}/{NAME}
  const url = `${POLICIES_API}/SESSION/${policy_name}`;

  try {
    const response = await apiClient.delete<StandardResponse>(url);
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
    return response.data.data;
  } catch (error: any) {
    console.error(`Failed to get details for aggregation policy ${policy_name}:`, error);
    return null;
  }
}


export async function getAggregationPolicies(
  database?: string,
  schema?: string,
): Promise<AggregationPolicy[]> {
  // No GET /aggregation/list (405) — aggregation policies come from the unified
  // inventory GET /gouvernance/policies under data.aggregation (mirror getMaskingPolicies).
  const url = POLICIES_API;
  const params: Record<string, string> = {
    database: database || DEFAULTS.DATABASE,
    schema: schema || DEFAULT_GOVERNANCE_SCHEMA,
  };

  // Backend returns StandardResponse: { status, message, data: { masking, row_access, aggregation, total } }
  const response = await apiClient.get<
    StandardResponse<{ masking: unknown[]; row_access: unknown[]; aggregation: BackendPolicy[]; total: number }>
  >(url, { params });

  // Defensive check: ensure we always return an array
  const backendPolicies = response.data.data?.aggregation;
  if (!Array.isArray(backendPolicies)) {
    return [];
  }

  // Map backend response to frontend interface.
  // aggregation_constraint is NOT in the unified LIST — fetch via getAggregationPolicyDetails on demand.
  return backendPolicies.map((policy: BackendPolicy): AggregationPolicy => ({
    policy_name: policy.name,
    schema: policy.schema_name,
    aggregation_constraint: '',
    created_at: policy.created_on,
    granted_roles: policy.granted_roles || [],
    expiration_date: policy.expiration_date || undefined,
  }));
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

  const response = await apiClient.post<StandardResponse<AggregationPolicy>>(url, null, { params });

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
    // Backend spec: DELETE /gouvernance/policies/aggregation/{database}/{schema}/{table}
    const url = `${POLICIES_API}/aggregation/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`;
    const response = await apiClient.delete<StandardResponse>(url);
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

  try {
    const response = await apiClient.delete<StandardResponse>(url);
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


  try {
    // PUT /gouvernance/policies/{policy_type}/{policy_name}/roles — confirmed in backend OpenAPI.
    const response = await apiClient.put<{
      message: string;
      policy_name: string;
      policy_type: string;
      granted: string[];
      already_had_policy: string[];
      requested_roles: string[];
      errors: { action: string; role: string; error: string }[] | null;
    }>(`${POLICIES_API}/${backendPolicyType}/${policyName}/roles`,
      { roles } // Send as body
    );

    const data = response.data;
    return {
      message: data.message,
      policy_name: data.policy_name,
      added: data.granted || [],
      removed: [],
      verified_roles: data.requested_roles || roles,
    };
  } catch (error: any) {
    console.error('Assign policy to roles error (endpoint may not exist):', {
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
  // GET /gouvernance/policies/{policy_type}/{policy_name}/references — confirmed
  // in backend OpenAPI (generic across policy types). The `dmf/references`
  // variant also exists for data-metric functions specifically.
  const type = policyType.toLowerCase().replace('_', '-');
  const url = `${POLICIES_API}/${type}/${policyName}/references`;

  try {
    const response = await apiClient.get<StandardResponse<PolicyReferencesResponse>>(url, {
      params: { database, schema }
    });
    return response.data.data;
  } catch (error: any) {
    console.warn(`getPolicyReferences: ${url} may not exist`, {
      status: error.response?.status,
      detail: error.response?.data?.detail,
    });
    // Return safe default — assume no references (allows delete to proceed)
    return {
      policy_name: policyName,
      policy_type: policyType,
      references: [],
      reference_count: 0,
      can_delete: true,
    };
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
  // POST /gouvernance/policies/{policy_type}/{policy_name}/unapply-all — confirmed
  // in backend OpenAPI. Still degrades gracefully (empty result) if a given
  // deployment hasn't shipped it yet.
  const type = policyType.toLowerCase().replace('_', '-');
  const url = `${POLICIES_API}/${type}/${policyName}/unapply-all`;

  try {
    const response = await apiClient.post<StandardResponse<UnapplyAllResponse>>(url, null, {
      params: { database, schema }
    });
    return response.data.data;
  } catch (error: any) {
    console.warn(`unapplyPolicyFromAll: ${url} may not exist`, {
      status: error.response?.status,
      detail: error.response?.data?.detail,
    });
    // Return safe fallback — no removals, no errors, allow deletion to proceed
    return {
      policy_name: policyName,
      removed: [],
      errors: [],
      can_delete: true,
    };
  }
}

// ============= POLICY METADATA (edit expiration / comment in place) =============

/**
 * Body for PUT /gouvernance/policies/{policy_type}/{policy_name}/metadata.
 * Both fields are optional — send only what changed. `expiration_date` is an ISO
 * string (e.g. 2026-12-31T23:59:59Z) or null to clear it.
 */
export interface UpdatePolicyMetadataRequest {
  expiration_date?: string | null;
  comment?: string | null;
}

export interface UpdatePolicyMetadataResult {
  policy_name: string;
  policy_type: string;
  expiration_date?: string | null;
  comment?: string | null;
  [k: string]: unknown;
}

/**
 * Edit a policy's expiration/comment metadata in place (no drop + recreate).
 *
 * PUT /gouvernance/policies/{policy_type}/{policy_name}/metadata
 *   ?database=&schema=   body: { expiration_date?, comment? }
 *
 * Path-form note: policy_type comes BEFORE policy_name and uses the
 * lowercase-hyphen casing — same skeleton as getPolicyReferences. The enriched
 * LIST endpoint (UPPERCASE, no name) is a different route shape.
 *
 * Unlike the read helpers above, this MUTATION rethrows a normalized backend
 * message (via formatPolicyError) so the caller's error toast is honest.
 */
export async function updatePolicyMetadata(
  policyType: string,
  policyName: string,
  body: UpdatePolicyMetadataRequest,
  database: string = 'cp_data360',
  schema: string = DEFAULT_GOVERNANCE_SCHEMA,
): Promise<UpdatePolicyMetadataResult> {
  const type = policyType.toLowerCase().replace('_', '-');
  const url = `${POLICIES_API}/${type}/${encodeURIComponent(policyName)}/metadata`;
  try {
    const response = await apiClient.put<StandardResponse<UpdatePolicyMetadataResult>>(
      url,
      body,
      { params: { database, schema } },
    );
    return (
      response.data?.data ?? {
        policy_name: policyName,
        policy_type: policyType,
        ...body,
      }
    );
  } catch (error: any) {
    throw new Error(formatPolicyError(error, 'Failed to update policy metadata'));
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

  try {
    const response = await apiClient.get<StandardResponse<TablePoliciesResponse>>(url);
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

// ============= POLICY → GRANTED-ROLES MAP (single unified read) =============

/**
 * The roles a queued/applied policy affects, keyed by policy name. Built from a
 * SINGLE call to the unified inventory `GET /gouvernance/policies` (which already
 * returns masking / row_access / aggregation, each carrying `granted_roles`).
 *
 * Why not call getMaskingPolicies()/getRLSPolicies()/getAggregationPolicies()?
 * All three hit the SAME endpoint and slice one field out of one response — so
 * calling all three is 3 identical GETs, and getMaskingPolicies additionally
 * fires a /masking/batch-details POST we don't need here. This helper is the
 * one-GET path for "which roles does policy X grant" at design time.
 *
 * `granted_roles` is OPTIONAL in the unified list — when a policy has none we
 * return [] (callers must render an honest "—", never a fabricated role).
 */
export interface PolicyGrantedRolesMap {
  /** policyName → granted_roles, merged across masking + row_access + aggregation. */
  byName: Record<string, string[]>;
  masking: Record<string, string[]>;
  row_access: Record<string, string[]>;
  aggregation: Record<string, string[]>;
}

export async function getPolicyGrantedRolesMap(
  database?: string,
  schema?: string,
): Promise<PolicyGrantedRolesMap> {
  const params: Record<string, string> = {
    database: database || DEFAULTS.DATABASE,
    schema: schema || DEFAULT_GOVERNANCE_SCHEMA,
  };

  const response = await apiClient.get<
    StandardResponse<{
      masking?: BackendPolicy[];
      row_access?: BackendPolicy[];
      aggregation?: BackendPolicy[];
    }>
  >(POLICIES_API, { params });

  const data = response.data?.data;
  const byName: Record<string, string[]> = {};
  const masking: Record<string, string[]> = {};
  const row_access: Record<string, string[]> = {};
  const aggregation: Record<string, string[]> = {};

  const ingest = (arr: BackendPolicy[] | undefined, into: Record<string, string[]>) => {
    (Array.isArray(arr) ? arr : []).forEach((p) => {
      if (!p?.name) return;
      const roles = Array.isArray(p.granted_roles) ? p.granted_roles : [];
      into[p.name] = roles;
      byName[p.name] = roles;
    });
  };

  ingest(data?.masking, masking);
  ingest(data?.row_access, row_access);
  ingest(data?.aggregation, aggregation);

  return { byName, masking, row_access, aggregation };
}

/**
 * Replace an existing masking policy on a column with a new one
 * Use this when column already has a masking policy applied
 */
/**
 * Replace an existing masking policy on a column with a new one.
 * NOTE: POST /gouvernance/policies/masking/replace does NOT exist in backend.
 * Fallback: remove old policy then apply new one.
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
    return response.data.data;
  } catch (error: any) {
    // Fallback: remove then apply
    if (error?.response?.status === 404 || error?.response?.status === 405) {
      console.warn('replaceMaskingPolicy: /masking/replace not available, using remove+apply fallback');
      await removeMaskingPolicy(data.database, data.schema, data.table, data.column);
      return applyMaskingPolicy({
        policy_name: data.new_policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
        column: data.column,
        policy_schema: data.policy_schema,
      });
    }
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
/**
 * Replace an existing RLS policy on a table with a new one.
 * NOTE: POST /gouvernance/policies/row-access/replace does NOT exist in backend.
 * Fallback: remove old policy then apply new one.
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
    return response.data.data;
  } catch (error: any) {
    // Fallback: remove then apply
    if (error?.response?.status === 404 || error?.response?.status === 405) {
      console.warn('replaceRLSPolicy: /row-access/replace not available, using remove+apply fallback');
      await removeRLSPolicy(data.table, data.database, data.schema);
      return applyRLSPolicy({
        policy_name: data.new_policy_name,
        table_name: data.table,
        database: data.database,
        schema: data.schema,
        policy_column: data.policy_column,
        policy_schema: data.policy_schema,
      });
    }
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
/**
 * Replace an existing aggregation policy on a table with a new one.
 * NOTE: POST /gouvernance/policies/aggregation/replace does NOT exist in backend.
 * Fallback: remove old policy then apply new one.
 */
export async function replaceAggregationPolicy(data: {
  new_policy_name: string;
  database: string;
  schema: string;
  table: string;
}): Promise<any> {
  const url = `${POLICIES_API}/aggregation/replace`;

  const params: Record<string, string> = {
    new_policy_name: data.new_policy_name,
    database: data.database,
    schema: data.schema,
    table_name: data.table,
  };

  try {
    const response = await apiClient.post<StandardResponse>(url, null, { params });
    return response.data.data;
  } catch (error: any) {
    // Fallback: remove then apply
    if (error?.response?.status === 404 || error?.response?.status === 405) {
      console.warn('replaceAggregationPolicy: /aggregation/replace not available, using remove+apply fallback');
      await removeAggregationPolicy(data.database, data.schema, data.table);
      return applyAggregationPolicy({
        policy_name: data.new_policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
      });
    }
    console.error('Replace aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
    });
    throw error;
  }
}

// ============= GOVERNANCE DEPTH (advisory, read-only — honest 404 degrade) =============
// D1 RLS simulate · D2 masking preview · D3 least-privilege.
// All three are advisory probes (~0 credits). When the route is not deployed the
// backend returns 404/501; callers must treat any thrown error as "unavailable"
// and degrade quietly (never fabricate a result).

export interface RowAccessSimulateResult {
  target?: string;
  applies?: boolean | null;
  predicate?: string | null;
  visible_count?: number | null;
  hidden_count?: number | null;
  available: boolean;
  note?: string | null;
}

/** D1 — simulate which rows a role/user would see under the row-access policy. */
export async function simulateRowAccess(input: {
  database: string;
  schema: string;
  table: string;
  role?: string;
  user?: string;
}): Promise<RowAccessSimulateResult> {
  const res = await apiClient.post<RowAccessSimulateResult>(
    API.gouvernance.policyRowAccessSimulate(),
    input
  );
  return res.data;
}

export interface MaskingPreviewColumn {
  column: string;
  policy?: string | null;
  masking_expr?: string | null;
  preview?: string | null;
  available: boolean;
}

export interface MaskingPreviewResult {
  target?: string;
  columns: MaskingPreviewColumn[];
}

/** D2 — preview the masking expression (and sample) applied per column. */
export async function previewMasking(input: {
  database: string;
  schema: string;
  table: string;
  column?: string;
}): Promise<MaskingPreviewResult> {
  const res = await apiClient.post<MaskingPreviewResult>(
    API.gouvernance.policyMaskingPreview(),
    input
  );
  return res.data;
}

export interface LeastPrivilegeGrant {
  privilege: string;
  object: string;
}

export interface LeastPrivilegeResult {
  role?: string;
  window_days?: number | null;
  granted_count?: number | null;
  used_count?: number | null;
  unused_grants: LeastPrivilegeGrant[];
  available: boolean;
  note?: string | null;
}

/** D3 — granted-but-unused privileges for a role over a recent window (advisory). */
export async function getRoleLeastPrivilege(
  role: string
): Promise<LeastPrivilegeResult> {
  const res = await apiClient.get<LeastPrivilegeResult>(
    API.gouvernance.roleLeastPrivilege(role)
  );
  return res.data;
}

// ============= UTILITY SERVICES =============

