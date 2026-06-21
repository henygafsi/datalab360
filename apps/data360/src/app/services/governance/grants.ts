/**
 * Gouvernance Service - Grants Management
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { invalidateMyPermissions } from '@/hooks/useCanPerform';

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
  // console.log('[API] Updating grants:', { role_name, modules });
  const response = await apiClient.put('/gouvernance/update-grants', { role_name, modules });
  // console.log('[API] Update grants response:', response.data);
  // Module grants gate sidebar/feature access — bust the cached action allow-set
  // so the editor's own controls re-resolve against the new grants (no stale UI).
  invalidateMyPermissions();
  return response;
}
