/**
 * Gouvernance Service - Grants Management
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';

export type RoleGrantData = {
  role_name: string;
  modules: string[];
  created_at?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  last_action?: string | null;
};

/**
 * Get all roles with their module grants and tracking info
 */
export const getRoles = async (): Promise<RoleGrantData[]> => {
  const response = await apiClient.get('/gouvernance/grants');
  return Array.isArray(response.data) ? (response.data as RoleGrantData[]) : [];
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
