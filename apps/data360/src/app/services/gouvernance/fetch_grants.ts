/**
 * Gouvernance Service - Fetch Grants
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { GrantTableDataType } from '@/app/shared/gouvernance/grants/table';
import { getRoles } from '@/app/services/gouvernance/fetch_roles';
/**
 * Returns grants for a single role (alias for getGrantsForRole for matrix/view usage).
 * @param roleName The name of the role.
 * @returns A promise that resolves to an array of grant strings.
 */
export async function getRolesForGrantsMatrix(roleName: string): Promise<string[]> {
  return getGrantsForRole(roleName);
}

/**
 * Fetches grants (privileges) for a specific role from the backend.
 * @param roleName The name of the role to fetch grants for.
 * @returns A promise that resolves to an array of grant strings.
 */
export async function getGrantsForRole(roleName: string): Promise<string[]> {
  try {
    const response = await apiClient.get(`/gouvernance/grants-for-role/${roleName}`);
    return Array.isArray(response.data) ? (response.data as string[]) : [];
  } catch (error: any) {
    console.error(`Error fetching grants for role ${roleName}:`, error.response?.data || error.message);
    throw error;
  }
}