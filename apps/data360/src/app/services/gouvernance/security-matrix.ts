/**
 * Security Matrix Service
 * Manages region/store/department axes for user access control
 */

import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

async function getAuthHeaders() {
  const session = await getAuthSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
}

// ============= TYPES =============

export interface SecurityAxis {
  id: string;
  name: string;
  type: 'region' | 'store' | 'department' | 'custom';
  values: string[];
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserSecurityProfile {
  username: string;
  regions: string[];
  stores: string[];
  departments: string[];
  custom_axes?: Record<string, string[]>;
  created_at?: string;
  updated_at?: string;
}

export interface PolicyAssignment {
  id: string;
  policy_name: string;
  policy_type: 'masking' | 'rls' | 'cls' | 'network';
  assigned_to_type: 'user' | 'role';
  assigned_to_name: string;
  security_filters: {
    regions?: string[];
    stores?: string[];
    departments?: string[];
    custom?: Record<string, string[]>;
  };
  created_at?: string;
  created_by?: string;
}

export interface RLSPolicy {
  policy_name: string;
  table_name: string;
  database: string;
  schema: string;
  filter_expression: string;
  description?: string;
  active: boolean;
}

export interface NetworkPolicy {
  policy_name: string;
  allowed_ip_list?: string[];
  blocked_ip_list?: string[];
  description?: string;
  active: boolean;
}

// ============= SECURITY AXES =============

/**
 * Get all security axes (regions, stores, departments)
 */
export async function getSecurityAxes(): Promise<SecurityAxis[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/gouvernance/security-axes`, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error fetching security axes:', error);
    throw error;
  }
}

/**
 * Create a new security axis
 */
export async function createSecurityAxis(axis: Omit<SecurityAxis, 'id'>): Promise<SecurityAxis> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/gouvernance/security-axes`, axis, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error creating security axis:', error);
    throw error;
  }
}

/**
 * Update security axis values
 */
export async function updateSecurityAxis(id: string, updates: Partial<SecurityAxis>): Promise<SecurityAxis> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.put(`${API_BASE_URL}/gouvernance/security-axes/${id}`, updates, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error updating security axis:', error);
    throw error;
  }
}

/**
 * Delete security axis
 */
export async function deleteSecurityAxis(id: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await axios.delete(`${API_BASE_URL}/gouvernance/security-axes/${id}`, { headers });
  } catch (error: any) {
    console.error('Error deleting security axis:', error);
    throw error;
  }
}

// ============= USER SECURITY PROFILES =============

/**
 * Get security profile for a user
 */
export async function getUserSecurityProfile(username: string): Promise<UserSecurityProfile> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/gouvernance/users/${username}/security-profile`, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error fetching user security profile:', error);
    throw error;
  }
}

/**
 * Update user security profile
 */
export async function updateUserSecurityProfile(username: string, profile: Partial<UserSecurityProfile>): Promise<UserSecurityProfile> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.put(`${API_BASE_URL}/gouvernance/users/${username}/security-profile`, profile, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error updating user security profile:', error);
    throw error;
  }
}

// ============= POLICY ASSIGNMENTS =============

/**
 * Get all policy assignments
 */
export async function getPolicyAssignments(filters?: {
  policy_type?: string;
  assigned_to?: string;
}): Promise<PolicyAssignment[]> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (filters?.policy_type) params.append('policy_type', filters.policy_type);
    if (filters?.assigned_to) params.append('assigned_to', filters.assigned_to);

    const url = params.toString()
      ? `${API_BASE_URL}/gouvernance/policy-assignments?${params}`
      : `${API_BASE_URL}/gouvernance/policy-assignments`;

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error fetching policy assignments:', error);
    throw error;
  }
}

/**
 * Create policy assignment with security filters
 */
export async function createPolicyAssignment(assignment: Omit<PolicyAssignment, 'id'>): Promise<PolicyAssignment> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/gouvernance/policy-assignments`, assignment, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error creating policy assignment:', error);
    throw error;
  }
}

/**
 * Delete policy assignment
 */
export async function deletePolicyAssignment(id: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await axios.delete(`${API_BASE_URL}/gouvernance/policy-assignments/${id}`, { headers });
  } catch (error: any) {
    console.error('Error deleting policy assignment:', error);
    throw error;
  }
}

// ============= RLS POLICIES =============

/**
 * Get all RLS policies
 */
export async function getRLSPolicies(): Promise<RLSPolicy[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/gouvernance/rls-policies`, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error fetching RLS policies:', error);
    throw error;
  }
}

/**
 * Create RLS policy
 */
export async function createRLSPolicy(policy: Omit<RLSPolicy, 'active'>): Promise<RLSPolicy> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/gouvernance/rls-policies`, policy, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error creating RLS policy:', error);
    throw error;
  }
}

/**
 * Apply RLS policy to a table
 */
export async function applyRLSPolicy(policyName: string, tableName: string, database: string, schema: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await axios.post(`${API_BASE_URL}/gouvernance/rls-policies/apply`, {
      policy_name: policyName,
      table_name: tableName,
      database,
      schema
    }, { headers });
  } catch (error: any) {
    console.error('Error applying RLS policy:', error);
    throw error;
  }
}

/**
 * Remove RLS policy from a table
 */
export async function removeRLSPolicy(tableName: string, database: string, schema: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await axios.post(`${API_BASE_URL}/gouvernance/rls-policies/remove`, {
      table_name: tableName,
      database,
      schema
    }, { headers });
  } catch (error: any) {
    console.error('Error removing RLS policy:', error);
    throw error;
  }
}

// ============= NETWORK POLICIES =============

/**
 * Get all network policies
 */
export async function getNetworkPolicies(): Promise<NetworkPolicy[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/gouvernance/network-policies`, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error fetching network policies:', error);
    throw error;
  }
}

/**
 * Create network policy
 */
export async function createNetworkPolicy(policy: Omit<NetworkPolicy, 'active'>): Promise<NetworkPolicy> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/gouvernance/network-policies`, policy, { headers });
    return response.data;
  } catch (error: any) {
    console.error('Error creating network policy:', error);
    throw error;
  }
}

/**
 * Apply network policy to user/role
 */
export async function applyNetworkPolicy(policyName: string, targetType: 'user' | 'role', targetName: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await axios.post(`${API_BASE_URL}/gouvernance/network-policies/apply`, {
      policy_name: policyName,
      target_type: targetType,
      target_name: targetName
    }, { headers });
  } catch (error: any) {
    console.error('Error applying network policy:', error);
    throw error;
  }
}
