/**
 * Gouvernance Service - Enhanced Role Management
 * Uses the new /roles/{role}/full and /roles/{role}/grants endpoints
 */
import apiClient from '@/lib/api-client';
import { SecurityMatrixEntry } from './security_matrix';

/**
 * Complete role details including modules, grants, matrix, and users
 */
export type RoleFullDetails = {
  role_name: string;
  comment?: string;
  created_on?: string;
  owner?: string;
  // Module permissions
  modules: string[];
  // Snowflake grants/privileges
  grants: Array<{
    privilege: string;
    object_type: string;
    object_name: string;
    granted_on?: string;
  }>;
  // Security matrix entries (RLS)
  matrix_entries: SecurityMatrixEntry[];
  // Users assigned to this role
  assigned_users: Array<{
    username: string;
    display_name?: string;
    email?: string;
  }>;
  // Statistics
  total_grants: number;
  total_users: number;
  total_matrix_entries: number;
};

/**
 * Snowflake grant/privilege
 */
export type SnowflakeGrant = {
  privilege: string;
  object_type: string;
  object_name: string;
};

/**
 * Get complete role details (modules + grants + matrix + users)
 * GET /gouvernance/roles/{role}/full
 *
 * This is the comprehensive endpoint that returns everything about a role
 */
export async function getRoleFullDetails(roleName: string): Promise<RoleFullDetails> {
  try {
    const response = await apiClient.get(`/gouvernance/roles/${roleName}/full`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching full details for role ${roleName}:`, error);
    throw error;
  }
}

/**
 * Add or remove Snowflake grants for a role
 * PUT /gouvernance/roles/{role}/grants
 *
 * @param roleName The role to update grants for
 * @param grantsToAdd Array of grants to add
 * @param grantsToRemove Array of grants to remove
 */
export async function updateRoleGrants(
  roleName: string,
  options: {
    add?: SnowflakeGrant[];
    remove?: SnowflakeGrant[];
  }
): Promise<{
  message: string;
  added: number;
  removed: number;
}> {
  try {
    const response = await apiClient.put(`/gouvernance/roles/${roleName}/grants`, {
      add: options.add || [],
      remove: options.remove || [],
    });
    return response.data;
  } catch (error) {
    console.error(`Error updating grants for role ${roleName}:`, error);
    throw error;
  }
}

/**
 * Full role update (comment, modules, grants, matrix)
 * PUT /gouvernance/roles/{role}/full
 *
 * This is the comprehensive update endpoint that can update all aspects of a role
 */
export async function updateRoleFull(
  roleName: string,
  updates: {
    comment?: string;
    modules?: string[];
    grants?: {
      add?: SnowflakeGrant[];
      remove?: SnowflakeGrant[];
    };
    matrix_entries?: {
      add?: Array<Omit<SecurityMatrixEntry, 'id' | 'role_name' | 'created_at' | 'updated_at'>>;
      remove?: number[]; // entry IDs to remove
    };
  }
): Promise<{
  message: string;
  role_name: string;
  updated_fields: string[];
}> {
  try {
    const response = await apiClient.put(`/gouvernance/roles/${roleName}/full`, updates);
    return response.data;
  } catch (error) {
    console.error(`Error performing full update for role ${roleName}:`, error);
    throw error;
  }
}

/**
 * Revoke a Snowflake permission from a role
 * POST /gouvernance/revoke-permission
 */
export async function revokePermission(options: {
  privileges: string[];
  object_type: string;
  object_name: string;
  role_name: string;
}): Promise<{ message: string }> {
  try {
    const params = new URLSearchParams();
    options.privileges.forEach((p) => params.append('privileges', p));
    params.append('object_type', options.object_type);
    params.append('object_name', options.object_name);
    params.append('role_name', options.role_name);

    const response = await apiClient.post(
      `/gouvernance/revoke-permission?${params.toString()}`
    );
    return response.data;
  } catch (error) {
    console.error('Error revoking permission:', error);
    throw error;
  }
}
