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
        const roleGrants = await getRolesForGrantsMatrix(roleName);
        for (const g of roleGrants) {
          const objectDetails = [g.granted_on, g.name].filter(Boolean).join(' ') || 'GLOBAL';
          const fullGrantIdentifier = `${g.privilege || 'GRANT'} on ${objectDetails}`;
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
 * A normalized object-level grant row (one `SHOW GRANTS TO ROLE` privilege).
 * `revocable` is true only when we have BOTH an object type and an object name,
 * which the REVOKE call requires — string-only rows (rare/legacy) render but
 * cannot be safely revoked.
 */
export interface RoleGrant {
  privilege: string;
  granted_on: string;
  name: string;
  revocable: boolean;
}

/**
 * Normalize a single raw grant row coming from `/gouvernance/grants-for-role`.
 * The backend (real `SHOW GRANTS`) returns OBJECTS with snake_case keys, but a
 * couple of legacy aggregators stringified rows ("SELECT on TABLE DB.SCH.T").
 * We accept BOTH so the panel renders + revoke works regardless of shape.
 */
function normalizeGrant(raw: unknown): RoleGrant {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const privilege = String(o.privilege ?? o.PRIVILEGE ?? '').trim();
    const granted_on = String(o.granted_on ?? o.GRANTED_ON ?? o.type ?? o.TYPE ?? '').trim();
    const name = String(o.name ?? o.NAME ?? o.object_name ?? o.OBJECT_NAME ?? '').trim();
    return { privilege, granted_on, name, revocable: Boolean(privilege && granted_on && name) };
  }
  // Legacy string row: "PRIVILEGE on OBJECT_TYPE OBJECT_NAME". We can recover the
  // privilege + the object descriptor but cannot reliably split type vs name, so
  // mark it non-revocable rather than firing a malformed REVOKE.
  const s = String(raw ?? '');
  const [priv, rest] = s.split(' on ');
  const restParts = (rest ?? '').trim().split(/\s+/);
  const granted_on = restParts.length > 1 ? restParts[0] : '';
  const name = restParts.length > 1 ? restParts.slice(1).join(' ') : (rest ?? '').trim();
  return {
    privilege: (priv ?? '').trim() || s.trim(),
    granted_on,
    name,
    revocable: false,
  };
}

/**
 * Returns the object-level grants for a single role as NORMALIZED objects
 * (alias of getGrantsForRole for the matrix/view/admin panels). Always shaped
 * `{ privilege, granted_on, name, revocable }` regardless of whether the backend
 * emits objects or legacy strings.
 * @param roleName The name of the role.
 */
export async function getRolesForGrantsMatrix(roleName: string): Promise<RoleGrant[]> {
  const rows = await getGrantsForRole(roleName);
  return rows.map(normalizeGrant);
}

/**
 * Fetches grants (privileges) for a specific role from the backend.
 * The real `SHOW GRANTS TO ROLE` returns OBJECT rows; a couple of legacy paths
 * stringified them. We return the raw rows untouched (objects or strings) and let
 * {@link normalizeGrant} reconcile the shape — see getRolesForGrantsMatrix.
 * @param roleName The name of the role to fetch grants for.
 */
export async function getGrantsForRole(roleName: string): Promise<unknown[]> {
  try {
    const response = await apiClient.get(`/gouvernance/grants-for-role/${encodeURIComponent(roleName)}`);
    return Array.isArray(response.data) ? (response.data as unknown[]) : [];
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

