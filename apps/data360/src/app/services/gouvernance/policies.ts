/**
 * Frontend Service Layer for Snowflake Governance Policies
 * TypeScript service to interact with backend API endpoints
 *
 * Location: apps/data360/src/app/services/gouvernance/policies.ts
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const POLICIES_API = `${API_BASE_URL}/governance/policies`;

// Standard response wrapper from backend
interface StandardResponse<T = any> {
  message: string;
  data: T;
  status?: string;
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
  created_at?: string;
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
  created_at: string;
  updated_at: string;
}

export interface CreateNetworkPolicyRequest {
  policy_name: string;
  allowed_ip_list: string[];
  blocked_ip_list?: string[];
}

// Tag Types
export interface Tag {
  tag_name: string;
  schema: string;
  allowed_values?: string[];
  created_at?: string;
}

export interface CreateTagRequest {
  tag_name: string;
  allowed_values?: string[];
  schema?: string;
}

export interface ApplyTagRequest {
  tag_name: string;
  tag_value: string;
  object_type: string;
  object_name: string;
  schema?: string;
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
  created_at?: string;
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
  created_at?: string;
}

export interface CreateSessionPolicyRequest {
  policy_name: string;
  session_idle_timeout_mins?: number;
  session_ui_idle_timeout_mins?: number;
  schema?: string;
}

// ============= ROW ACCESS POLICY (RLS) SERVICES =============

export async function getRLSPolicies(schema: string = 'GOVERNANCE'): Promise<RLSPolicy[]> {
  const response = await axios.get<StandardResponse<RLSPolicy[]>>(`${POLICIES_API}/row-access/list`, {
    params: { schema },
  });
  return response.data.data;
}

export async function createRLSPolicy(data: CreateRLSPolicyRequest): Promise<RLSPolicy> {
  const response = await axios.post<StandardResponse<RLSPolicy>>(`${POLICIES_API}/row-access`, null, {
    params: {
      policy_name: data.policy_name,
      signature: data.signature,
      expression: data.expression,
      schema: data.schema || 'GOVERNANCE',
      description: data.description,
    },
  });
  return response.data.data;
}

export async function applyRLSPolicy(data: ApplyRLSPolicyRequest): Promise<any> {
  const response = await axios.post<StandardResponse>(`${POLICIES_API}/row-access/apply`, null, {
    params: {
      policy_name: data.policy_name,
      table_name: data.table_name,
      database: data.database,
      schema: data.schema,
      policy_column: data.policy_column,
      policy_schema: data.policy_schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function removeRLSPolicy(
  table_name: string,
  database: string,
  schema: string
): Promise<any> {
  const response = await axios.post<StandardResponse>(`${POLICIES_API}/row-access/remove`, null, {
    params: {
      table_name,
      database,
      schema,
    },
  });
  return response.data.data;
}

export async function deleteRLSPolicy(
  policy_name: string,
  schema: string = 'GOVERNANCE'
): Promise<any> {
  const response = await axios.delete<StandardResponse>(`${POLICIES_API}/row-access/${policy_name}`, {
    params: { schema },
  });
  return response.data.data;
}

// ============= MASKING POLICY SERVICES =============

export async function getMaskingPolicies(schema: string = 'GOVERNANCE'): Promise<MaskingPolicy[]> {
  const response = await axios.get<StandardResponse<MaskingPolicy[]>>(`${POLICIES_API}/masking/list`, {
    params: { schema },
  });
  return response.data.data;
}

export async function createMaskingPolicy(data: CreateMaskingPolicyRequest): Promise<MaskingPolicy> {
  const response = await axios.post<StandardResponse<MaskingPolicy>>(`${POLICIES_API}/masking`, null, {
    params: {
      policy_name: data.policy_name,
      data_type: data.data_type,
      masking_type: data.masking_type,
      schema: data.schema || 'GOVERNANCE',
      authorized_roles: data.authorized_roles?.join(','),
      custom_expression: data.custom_expression,
    },
  });
  return response.data.data;
}

export async function applyMaskingPolicy(data: ApplyMaskingPolicyRequest): Promise<any> {
  const response = await axios.post<StandardResponse>(`${POLICIES_API}/masking/apply`, null, {
    params: {
      policy_name: data.policy_name,
      database: data.database,
      schema: data.schema,
      table: data.table,
      column: data.column,
      policy_schema: data.policy_schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function removeMaskingPolicy(
  database: string,
  schema: string,
  table: string,
  column: string
): Promise<any> {
  const response = await axios.post<StandardResponse>(`${POLICIES_API}/masking/remove`, null, {
    params: {
      database,
      schema,
      table,
      column,
    },
  });
  return response.data.data;
}

export async function getMaskedColumns(
  database?: string,
  schema?: string
): Promise<MaskedColumn[]> {
  const response = await axios.get<StandardResponse<MaskedColumn[]>>(`${POLICIES_API}/masked-columns`, {
    params: { database, schema },
  });
  return response.data.data;
}

// ============= NETWORK POLICY SERVICES =============

export async function getNetworkPolicies(): Promise<NetworkPolicy[]> {
  const response = await axios.get<StandardResponse<NetworkPolicy[]>>(`${POLICIES_API}/network/list`);
  return response.data.data;
}

export async function createNetworkPolicy(data: CreateNetworkPolicyRequest): Promise<NetworkPolicy> {
  const response = await axios.post<StandardResponse<NetworkPolicy>>(`${POLICIES_API}/network`, null, {
    params: {
      policy_name: data.policy_name,
      allowed_ip_list: data.allowed_ip_list.join(','),
      blocked_ip_list: data.blocked_ip_list?.join(','),
    },
  });
  return response.data.data;
}

export async function deleteNetworkPolicy(policy_name: string): Promise<any> {
  const response = await axios.delete<StandardResponse>(`${POLICIES_API}/network/${policy_name}`);
  return response.data.data;
}

// ============= TAG SERVICES =============

export async function getTags(schema: string = 'GOVERNANCE'): Promise<Tag[]> {
  const response = await axios.get<StandardResponse<Tag[]>>(`${POLICIES_API}/tags/list`, {
    params: { schema },
  });
  return response.data.data;
}

export async function createTag(data: CreateTagRequest): Promise<Tag> {
  const response = await axios.post<StandardResponse<Tag>>(`${POLICIES_API}/tags`, null, {
    params: {
      tag_name: data.tag_name,
      allowed_values: data.allowed_values?.join(','),
      schema: data.schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function applyTag(data: ApplyTagRequest): Promise<any> {
  const response = await axios.post<StandardResponse>(`${POLICIES_API}/tags/apply`, null, {
    params: {
      tag_name: data.tag_name,
      tag_value: data.tag_value,
      object_type: data.object_type,
      object_name: data.object_name,
      schema: data.schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function deleteTag(tag_name: string, schema: string = 'GOVERNANCE'): Promise<any> {
  const response = await axios.delete<StandardResponse>(`${POLICIES_API}/tags/${tag_name}`, {
    params: { schema },
  });
  return response.data.data;
}

// ============= PASSWORD POLICY SERVICES =============

export async function getPasswordPolicies(schema: string = 'GOVERNANCE'): Promise<PasswordPolicy[]> {
  const response = await axios.get<StandardResponse<PasswordPolicy[]>>(`${POLICIES_API}/password/list`, {
    params: { schema },
  });
  return response.data.data;
}

export async function createPasswordPolicy(data: CreatePasswordPolicyRequest): Promise<PasswordPolicy> {
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
      schema: data.schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function deletePasswordPolicy(
  policy_name: string,
  schema: string = 'GOVERNANCE'
): Promise<any> {
  const response = await axios.delete<StandardResponse>(`${POLICIES_API}/password/${policy_name}`, {
    params: { schema },
  });
  return response.data.data;
}

// ============= SESSION POLICY SERVICES =============

export async function getSessionPolicies(schema: string = 'GOVERNANCE'): Promise<SessionPolicy[]> {
  const response = await axios.get<StandardResponse<SessionPolicy[]>>(`${POLICIES_API}/session/list`, {
    params: { schema },
  });
  return response.data.data;
}

export async function createSessionPolicy(data: CreateSessionPolicyRequest): Promise<SessionPolicy> {
  const response = await axios.post<StandardResponse<SessionPolicy>>(`${POLICIES_API}/session`, null, {
    params: {
      policy_name: data.policy_name,
      session_idle_timeout_mins: data.session_idle_timeout_mins,
      session_ui_idle_timeout_mins: data.session_ui_idle_timeout_mins,
      schema: data.schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function deleteSessionPolicy(
  policy_name: string,
  schema: string = 'GOVERNANCE'
): Promise<any> {
  const response = await axios.delete<StandardResponse>(`${POLICIES_API}/session/${policy_name}`, {
    params: { schema },
  });
  return response.data.data;
}

// ============= AGGREGATION POLICY SERVICES =============

export interface AggregationPolicy {
  policy_name: string;
  schema: string;
  aggregation_constraint: string;
  created_at?: string;
}

export interface CreateAggregationPolicyRequest {
  policy_name: string;
  aggregation_constraint: string;
  schema?: string;
}

export interface ApplyAggregationPolicyRequest {
  policy_name: string;
  database: string;
  schema: string;
  table: string;
  policy_schema?: string;
}

export async function getAggregationPolicies(schema: string = 'GOVERNANCE'): Promise<AggregationPolicy[]> {
  const response = await axios.get<StandardResponse<AggregationPolicy[]>>(`${POLICIES_API}/aggregation/list`, {
    params: { schema },
  });
  return response.data.data;
}

export async function createAggregationPolicy(data: CreateAggregationPolicyRequest): Promise<AggregationPolicy> {
  const response = await axios.post<StandardResponse<AggregationPolicy>>(`${POLICIES_API}/aggregation`, null, {
    params: {
      policy_name: data.policy_name,
      aggregation_constraint: data.aggregation_constraint,
      schema: data.schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function applyAggregationPolicy(data: ApplyAggregationPolicyRequest): Promise<any> {
  const response = await axios.post<StandardResponse>(`${POLICIES_API}/aggregation/apply`, null, {
    params: {
      policy_name: data.policy_name,
      database: data.database,
      schema: data.schema,
      table: data.table,
      policy_schema: data.policy_schema || 'GOVERNANCE',
    },
  });
  return response.data.data;
}

export async function removeAggregationPolicy(
  database: string,
  schema: string,
  table: string
): Promise<any> {
  const response = await axios.delete<StandardResponse>(
    `${POLICIES_API}/aggregation/${database}/${schema}/${table}`
  );
  return response.data.data;
}

export async function deleteAggregationPolicy(
  policy_name: string,
  schema: string = 'GOVERNANCE'
): Promise<any> {
  const response = await axios.delete<StandardResponse>(`${POLICIES_API}/aggregation/${policy_name}`, {
    params: { schema },
  });
  return response.data.data;
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
  name: string;
  type: string;
  nullable?: boolean;
  primary_key?: boolean;
}

export async function getDatabases(): Promise<DatabaseObject[]> {
  const response = await axios.get<StandardResponse<{ databases: DatabaseObject[] }>>(
    `${POLICIES_API}/objects/databases`
  );
  return response.data.data.databases || [];
}

export async function getSchemas(database: string): Promise<SchemaObject[]> {
  const response = await axios.get<StandardResponse<{ schemas: SchemaObject[] }>>(
    `${POLICIES_API}/objects/schemas/${database}`
  );
  return response.data.data.schemas || [];
}

export async function getTables(database: string, schema: string): Promise<TableObject[]> {
  const response = await axios.get<StandardResponse<{ tables: TableObject[] }>>(
    `${POLICIES_API}/objects/tables/${database}/${schema}`
  );
  return response.data.data.tables || [];
}

export async function getColumns(database: string, schema: string, table: string): Promise<ColumnObject[]> {
  const response = await axios.get<StandardResponse<{ columns: ColumnObject[] }>>(
    `${POLICIES_API}/objects/columns/${database}/${schema}/${table}`
  );
  return response.data.data.columns || [];
}

// ============= UTILITY SERVICES =============

export async function healthCheck(): Promise<{ status: string; service: string }> {
  const response = await axios.get(`${POLICIES_API}/health`);
  return response.data;
}
