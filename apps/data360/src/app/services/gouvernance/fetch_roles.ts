/**
 * Gouvernance Service - Fetch Roles
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { RoleTableDataType } from '@/app/shared/gouvernance/roles/table';

/**
 * Fetches the list of roles from the backend API.
 * @returns A promise that resolves to an array of RoleTableDataType.
 */
export async function getRoles(): Promise<RoleTableDataType[]> {
  try {
    const response = await apiClient.get('/gouvernance/roles');
    const data = response.data;

    const roles: RoleTableDataType[] = data.map((role: any) => ({
      id: role.name || crypto.randomUUID().toString(),
      role: role.name || 'N/A',
      numberOfGrants: role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
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
    return response.data as string[];
  } catch (error) {
    console.error('Error fetching roles for user:', error);
    throw error;
  }
}
