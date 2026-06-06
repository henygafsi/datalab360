/**
 * Gouvernance Service - Fetch Grants
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { GrantTableDataType } from '@/app/shared/governance/grants/table';
import { getRoles } from '@/app/services/governance/fetch_roles';

/**
 * Fetches permissions/grants from the backend.
 * This is an aggregation based on available roles and their grants.
 * @returns A promise that resolves to an array of GrantTableDataType.
 */
export async function getPermissions(): Promise<GrantTableDataType[]> {
  try {
    const allRoles = await getRoles();
    const grantsMap = new Map<string, Set<string>>();

    for (const roleData of allRoles) {
      const roleName = roleData.role;
      try {
        const roleGrants = await getGrantsForRole(roleName);
        for (const grantString of roleGrants) {
          const parts = grantString.split(' on ');
          let privilege = parts[0];
          let objectDetails = parts[1] || 'GLOBAL';

          const fullGrantIdentifier = `${privilege} on ${objectDetails}`;
          if (!grantsMap.has(fullGrantIdentifier)) {
            grantsMap.set(fullGrantIdentifier, new Set<string>());
          }
          grantsMap.get(fullGrantIdentifier)?.add(roleName);
        }
      } catch (roleError: any) {
        console.warn(`Could not fetch grants for role "${roleName}":`, roleError.message);
      }
    }

    const mappedPermissions: GrantTableDataType[] = Array.from(grantsMap.entries()).map(([grantIdentifier, rolesSet]) => ({
      id: grantIdentifier,
      name: grantIdentifier,
      roles: Array.from(rolesSet).sort(),
    }));

    return mappedPermissions;
  } catch (error) {
    console.error('Error fetching aggregated permissions:', error);
    throw error;
  }
}

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

/**
 * Grants a specific permission to a role on an object in the backend.
 */
export async function grantPermission(
  privileges: string[],
  object_type: string,
  object_name: string,
  role_name: string
): Promise<string> {
  try {
    const params = new URLSearchParams();
    privileges.forEach(p => params.append('privileges', p));
    params.append('object_type', object_type);
    params.append('object_name', object_name);
    params.append('role_name', role_name);

    const response = await apiClient.post(`/gouvernance/grant-permission?${params.toString()}`);
    return response.data;
  } catch (error: any) {
    console.error('Error granting permission:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Revokes a specific permission from a role on an object.
 * Mirror of grantPermission — backed by POST /gouvernance/revoke-permission
 * (real Snowflake `REVOKE <priv> ON <object> FROM ROLE`, traced as REVOKE_PERMISSION).
 */
export async function revokePermission(
  privileges: string[],
  object_type: string,
  object_name: string,
  role_name: string
): Promise<string> {
  try {
    const params = new URLSearchParams();
    privileges.forEach(p => params.append('privileges', p));
    params.append('object_type', object_type);
    params.append('object_name', object_name);
    params.append('role_name', role_name);

    const response = await apiClient.post(`/gouvernance/revoke-permission?${params.toString()}`);
    return response.data;
  } catch (error: any) {
    console.error('Error revoking permission:', error.response?.data || error.message);
    throw error;
  }
}

