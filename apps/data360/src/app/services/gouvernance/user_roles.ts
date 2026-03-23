/**
 * User roles service — getUsersWithRolesAndModules + updateUserRoles.
 * Used by: shared/gouvernance/user-grants/table.tsx
 */
import apiClient from '@/lib/api-client';

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
  const raw: RawSnowflakeUser[] = Array.isArray(response.data) ? response.data : [];

  return raw.map((u) => ({
    username: u.name || u.login_name || '',
    displayName: u.display_name || u.name || '',
    email: u.email || '',
    roles: Array.isArray(u.roles) ? u.roles : [],
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
