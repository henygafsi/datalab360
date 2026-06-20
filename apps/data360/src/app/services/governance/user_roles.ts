/**
 * User roles service — getUsersWithRolesAndModules + updateUserRoles.
 * Used by: shared/gouvernance/user-grants/table.tsx
 */
import apiClient from '@/lib/api-client';

/**
 * Grant lineage for a single role (who granted it + when), as exposed by the
 * additive `role_grants` field on /gouvernance/users-with-roles. ACCOUNT_USAGE
 * lineage may be absent on some accounts, so granted_by/granted_at are nullable.
 */
export interface RoleGrantLineage {
  role: string;
  granted_by: string | null;
  granted_at: string | null;
}

/**
 * Raw user record from /gouvernance/users-with-roles.
 * Snowflake SHOW USERS returns snake_case string fields.
 */
interface RawSnowflakeUser {
  name: string;
  display_name: string;
  login_name: string;
  email: string;
  disabled: string; // "true" | "false" (Snowflake returns strings)
  roles: string[];
  /** Additive grant-lineage field — may be absent on accounts without ACCOUNT_USAGE. */
  role_grants?: RoleGrantLineage[];
  [key: string]: unknown;
}

/**
 * Normalized user record for the UserGrantsTable component.
 */
export interface UserGrantTableData {
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  /** Per-role grant lineage (who granted + when). Empty when the backend omits it. */
  roleGrants: RoleGrantLineage[];
  modules: string[];
  status: string;
}

/**
 * Fetch users with their Snowflake roles and map to frontend schema.
 * The backend returns raw Snowflake SHOW USERS fields (snake_case).
 * We normalize to camelCase and derive `status` from `disabled`.
 *
 * Note: `modules` is left empty here — it must be computed in the table
 * component by joining user roles with the role-module grants data.
 */
export async function getUsersWithRolesAndModules(): Promise<UserGrantTableData[]> {
  const response = await apiClient.get('/gouvernance/users-with-roles');
  const raw: RawSnowflakeUser[] = Array.isArray(response.data) ? (response.data as RawSnowflakeUser[]) : [];

  return raw.map((u) => ({
    username: u.name || u.login_name || '',
    displayName: u.display_name || u.name || '',
    email: u.email || '',
    roles: Array.isArray(u.roles) ? u.roles : [],
    roleGrants: Array.isArray(u.role_grants)
      ? u.role_grants.map((g) => ({
          role: String(g?.role ?? ''),
          granted_by: g?.granted_by ?? null,
          granted_at: g?.granted_at ?? null,
        }))
      : [],
    modules: [], // Computed later from roles + grants mapping
    status: u.disabled === 'true' ? 'Disabled' : 'Active',
  }));
}

/**
 * Update user role assignments in Snowflake.
 * Calls PUT /gouvernance/users/{username}/roles with { roles: [...] }.
 */
export async function updateUserRoles(username: string, roles: string[]) {
  const response = await apiClient.put(
    `/gouvernance/users/${encodeURIComponent(username)}/roles`,
    { roles }
  );
  return response.data;
}
