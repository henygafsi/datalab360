/**
 * Gouvernance Service - Grants Management
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';

/**
 * Get all roles with their module grants
 *
 * Backend MUST return array of {role_name, modules[]}
 */
export const getRoles = async (): Promise<{ role_name: string; modules: string[] }[]> => {
  const response = await apiClient.get('/gouvernance/grants');
  return response.data as { role_name: string; modules: string[] }[];
};

/**
 * Update grants for a specific role
 */
export async function updateGrants(role_name: string, modules: string[]) {
  console.log('[API] Updating grants:', { role_name, modules });
  const response = await apiClient.put('/gouvernance/update-grants', { role_name, modules });
  console.log('[API] Update grants response:', response.data);
  return response;
}
