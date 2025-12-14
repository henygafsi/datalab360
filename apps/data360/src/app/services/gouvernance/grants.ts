/**
 * Gouvernance Service - Grants Management
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';

/**
 * Get all roles with their module grants
 */
export const getRoles = async (): Promise<{ role_name: string; modules: string[] }[]> => {
  const response = await apiClient.get('/gouvernance/grants');
  return response.data as { role_name: string; modules: string[] }[];
};

/**
 * Update grants for a specific role
 */
export async function updateGrants(role_name: string, modules: string[]) {
  return apiClient.put('/gouvernance/update-grants', { role_name, modules });
}
