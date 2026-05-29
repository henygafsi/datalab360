/**
 * Gouvernance Service - Fetch Roles
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { RoleTableDataType } from '@/app/shared/governance/roles/table';

/**
 * Fetches the list of roles from the backend API.
 * @returns A promise that resolves to an array of RoleTableDataType.
 */
export async function getRoles(): Promise<RoleTableDataType[]> {
  try {
    const response = await apiClient.get('/gouvernance/roles');
    const raw = response.data;
    // Support both: direct array or paginated { data: [...], pagination: {...} }
    const data = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    const safeData = data;

    const roles: RoleTableDataType[] = safeData.map((role: any) => ({
      id: role.name || crypto.randomUUID().toString(),
      role: role.name || 'N/A',
      numberOfGrants: role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
      owner: role.owner || '',
      assignedUsers: role.assigned_to_users || 0,
    }));

    return roles;
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
}

/**
 * Adds a new role to the backend.
 * @param roleName The name of the role to add.
 */
export async function addRole(roleName: string): Promise<string> {
  try {
    const response = await apiClient.post('/gouvernance/add-role', { role_name: roleName });
    return response.data;
  } catch (error) {
    console.error('Error adding role:', error);
    throw error;
  }
}

/**
 * Fetches roles for a specific user from the backend.
 * @param username The username to fetch roles for.
 */
export async function getRolesForUser(username: string): Promise<string[]> {
  try {
    const response = await apiClient.get(`/gouvernance/roles-for-user/${username}`);
    return Array.isArray(response.data) ? (response.data as string[]) : [];
  } catch (error) {
    console.error('Error fetching roles for user:', error);
    throw error;
  }
}

/**
 * Fetches details for a specific role.
 * @param roleName The name of the role to fetch.
 */
export async function getRoleDetails(roleName: string): Promise<RoleTableDataType> {
  try {
    const response = await apiClient.get(`/gouvernance/roles/${roleName}`);
    const role = response.data;

    return {
      id: role.role_name || role.name || roleName,
      role: role.role_name || role.name || roleName,
      numberOfGrants: role.total_grants || role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
    };
  } catch (error) {
    console.error('Error fetching role details:', error);
    throw error;
  }
}

/**
 * Fetches role data for editing.
 * @param roleName The name of the role to fetch for editing.
 */
export async function getRoleForEdit(roleName: string): Promise<RoleTableDataType> {
  try {
    const response = await apiClient.get(`/gouvernance/roles/edit/${roleName}`);
    const role = response.data;

    return {
      id: role.role_name || role.name || roleName,
      role: role.role_name || role.name || roleName,
      numberOfGrants: role.total_grants || role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
    };
  } catch (error) {
    console.error('Error fetching role for edit:', error);
    throw error;
  }
}

/**
 * Deletes a role from Snowflake.
 * This will also revoke the role from all users who have it assigned.
 * @param roleName The name of the role to delete.
 * @returns A promise with the delete operation result including affected users.
 */
export async function deleteRole(roleName: string): Promise<{
  message: string;
  role_name: string;
  revoked_from_users: number;
  revoked_grants: number;
}> {
  try {
    const response = await apiClient.delete('/gouvernance/drop-role', {
      data: { role_name: roleName }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting role:', error);
    throw error;
  }
}

/**
 * Deletes multiple roles from Snowflake in batch.
 * @param roleNames Array of role names to delete.
 * @returns A promise with batch delete results.
 */
export async function deleteMultipleRoles(roleNames: string[]): Promise<{
  message: string;
  deleted: number;
  failed: { role_name: string; error: string }[];
}> {
  try {
    const response = await apiClient.post('/gouvernance/drop-roles-batch', {
      role_names: roleNames
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting multiple roles:', error);
    throw error;
  }
}

/**
 * Updates role information in Snowflake.
 * @param roleName The name of the role to update.
 * @param data The fields to update (comment, modules, etc.).
 * @returns A promise with the update operation result.
 */
export async function updateRole(
  roleName: string,
  data: {
    comment?: string;
    modules?: string[];
  }
): Promise<{
  status: string;
  role_name: string;
  updated_fields: string[];
}> {
  try {
    const response = await apiClient.put(`/gouvernance/roles/${roleName}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating role:', error);
    throw error;
  }
}
