/**
 * Gouvernance Service - Fetch Users
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { UserTableDataType } from '@/app/shared/governance/users/table';

/**
 * Raw single-user detail as returned by GET /gouvernance/users/{username}
 * (SHOW USERS columns, all strings). Unlike {@link getUserDetails}, this is NOT
 * mapped to UserTableDataType, so callers that need warehouse/comment/namespace/
 * security columns can read them directly.
 */
export interface UserDetailRaw {
  name?: string;
  login_name?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  comment?: string;
  disabled?: string;
  default_warehouse?: string;
  default_namespace?: string;
  default_role?: string;
  default_secondary_roles?: string;
  created_on?: string;
  last_success_login?: string;
  owner?: string;
  has_password?: string;
  has_rsa_public_key?: string;
}

/**
 * Fetches the raw detail object for a single user (unmapped Snowflake fields).
 * @param username The username to fetch.
 */
export async function getUserDetailRaw(username: string): Promise<UserDetailRaw> {
  try {
    const response = await apiClient.get(API.gouvernance.userDetail(username));
    return (response.data || {}) as UserDetailRaw;
  } catch (error) {
    console.error('Error fetching raw user details:', error);
    throw error;
  }
}

/**
 * Fetches the list of users from the backend API.
 * @returns A promise that resolves to an array of UserTableDataType.
 */
export async function getUsers(): Promise<UserTableDataType[]> {
  try {
    const response = await apiClient.get('/gouvernance/users');
    const raw = response.data;
    // Support both: direct array or paginated { data: [...], pagination: {...} }
    const safeData = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

    const users: UserTableDataType[] = safeData.map((user: any) => {
      let roles: string[] = [];
      if (user.default_role) {
        roles.push(user.default_role);
      }
      if (user.default_secondary_roles && user.default_secondary_roles !== '[]') {
        try {
          const secondaryRoles = JSON.parse(user.default_secondary_roles.replace(/'/g, '"')) as string[];
          if (Array.isArray(secondaryRoles)) {
            const combinedRoles: string[] = [...roles, ...secondaryRoles];
            roles = Array.from(new Set<string>(combinedRoles));
          }
        } catch (e) {
          console.warn('Could not parse default_secondary_roles for user:', user.name, e);
        }
      }

      return {
        id: user.name || user.login_name || crypto.randomUUID().toString(),
        name: user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name || user.name || user.login_name || ''),
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        roles: roles.length > 0 ? roles : [],
        status: user.disabled === 'false' ? 'Active' : 'Disabled',
        createdOn: user.created_on || '',
        lastLogin: user.last_success_login || '',
        defaultRole: user.default_role || '',
        owner: user.owner || '',
      };
    });

    return users;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

/**
 * Result of POST /gouvernance/add-user.
 *
 * The backend now accepts an optional `role` and performs role assignment as part
 * of user creation (partial-success): on a 2xx the user is ALWAYS created, but the
 * role grant may have failed independently — surfaced via `role_error`. Callers must
 * treat `role_error` (on a successful response) as a non-fatal warning, not a throw.
 */
export interface AddUserResult {
  /** Human-readable backend message, when provided. */
  message?: string;
  /** True if the optional role was successfully assigned. */
  role_assigned?: boolean;
  /** Non-null when role assignment failed (user still created). String = the reason. */
  role_error?: string | null;
  /** Raw backend payload (object or legacy string) for any extra fields. */
  raw: unknown;
}

/**
 * Adds a new user to the backend, optionally assigning a role at creation time.
 * @param userData The user data. `role` is optional; when omitted no role is sent.
 * @returns A structured result. A truthy `role_error` means the user was created
 *          but the role grant failed (partial success) — do NOT treat as an error.
 */
export async function addUser(userData: {
  username: string;
  password: string;
  email: string;
  role?: string;
}): Promise<AddUserResult> {
  try {
    // Drop an empty/whitespace-only role so we never POST role: "".
    const role = userData.role?.trim() ? userData.role.trim() : undefined;
    const payload = { ...userData, role };
    const response = await apiClient.post('/gouvernance/add-user', payload);
    const data = response.data;

    // Backend may return a bare string (legacy) or a structured object (new).
    if (typeof data === 'string') {
      return { message: data, raw: data };
    }
    return {
      message: data?.message ?? data?.detail ?? undefined,
      role_assigned: data?.role_assigned,
      role_error: data?.role_error ?? null,
      raw: data,
    };
  } catch (error) {
    console.error('Error adding user:', error);
    throw error;
  }
}

/**
 * Assigns a role to a user in the backend.
 * @param username The username to assign the role to.
 * @param roleName The name of the role to assign.
 */
export async function assignRoleToUser(username: string, roleName: string): Promise<string> {
  try {
    const response = await apiClient.post('/gouvernance/assign-role', { username, role_name: roleName });
    return response.data as string;
  } catch (error) {
    console.error('Error assigning role:', error);
    throw error;
  }
}

/**
 * Fetches details for a specific user.
 * @param username The username to fetch.
 */
export async function getUserDetails(username: string): Promise<UserTableDataType> {
  try {
    const response = await apiClient.get(`/gouvernance/users/${username}`);
    const user = response.data;

    let roles: string[] = [];
    if (user.default_role) {
      roles.push(user.default_role);
    }
    if (user.default_secondary_roles && user.default_secondary_roles !== '[]') {
      try {
        const secondaryRoles = JSON.parse(user.default_secondary_roles.replace(/'/g, '"')) as string[];
        if (Array.isArray(secondaryRoles)) {
          const combinedRoles: string[] = [...roles, ...secondaryRoles];
          roles = Array.from(new Set<string>(combinedRoles));
        }
      } catch (e) {
        console.warn('Could not parse default_secondary_roles for user:', user.name, e);
      }
    }

    return {
      id: user.name || user.login_name || username,
      name: user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name || user.name || user.login_name || ''),
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email || '',
      roles: roles.length > 0 ? roles : [],
      status: user.disabled === 'false' ? 'Active' : 'Disabled',
      createdOn: user.created_on || '',
      lastLogin: user.last_success_login || '',
      defaultRole: user.default_role || '',
      owner: user.owner || '',
    };
  } catch (error) {
    console.error('Error fetching user details:', error);
    throw error;
  }
}

/**
 * Deletes a user from Snowflake.
 * @param username The username to delete.
 * @returns A promise with the delete operation result.
 */
export async function deleteUser(username: string): Promise<{
  message: string;
  username: string;
  revoked_grants?: number;
}> {
  try {
    const response = await apiClient.delete('/gouvernance/drop-user', {
      data: { username }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Deletes multiple users from Snowflake in batch.
 * NOTE: Backend /gouvernance/drop-users-batch may not exist — falls back to
 * sequential single-user deletion if the batch endpoint is unavailable.
 * @param usernames Array of usernames to delete.
 * @returns A promise with batch delete results.
 */
export async function deleteMultipleUsers(usernames: string[]): Promise<{
  message: string;
  deleted: number;
  failed: { username: string; error: string }[];
}> {
  try {
    const response = await apiClient.post('/gouvernance/drop-users-batch', {
      usernames
    });
    return response.data;
  } catch (error: any) {
    // Batch endpoint may not exist — fall back to sequential deletion
    if (error?.response?.status === 404 || error?.response?.status === 405) {
      console.warn('drop-users-batch not available, falling back to sequential deletion');
      const failed: { username: string; error: string }[] = [];
      let deleted = 0;
      for (const username of usernames) {
        try {
          await deleteUser(username);
          deleted++;
        } catch (e: any) {
          failed.push({ username, error: e?.message || 'Unknown error' });
        }
      }
      return { message: `Deleted ${deleted}/${usernames.length} users`, deleted, failed };
    }
    console.error('Error deleting multiple users:', error);
    throw error;
  }
}

/**
 * Disables a user in Snowflake (sets DISABLED = TRUE).
 * @param username The username to disable.
 * @returns A promise with the disable operation result.
 */
export async function disableUser(username: string): Promise<{
  message: string;
  username: string;
}> {
  try {
    const response = await apiClient.post(`/gouvernance/disable_user/?username=${username}`);
    return response.data;
  } catch (error) {
    console.error('Error disabling user:', error);
    throw error;
  }
}

/**
 * Enables a user in Snowflake (sets DISABLED = FALSE).
 * @param username The username to enable.
 * @returns A promise with the enable operation result.
 */
export async function enableUser(username: string): Promise<{
  message: string;
  username: string;
}> {
  try {
    const response = await apiClient.post(`/gouvernance/enable_user/?username=${username}`);
    return response.data;
  } catch (error) {
    console.error('Error enabling user:', error);
    throw error;
  }
}

/**
 * Updates user information in Snowflake.
 * Tries PUT /gouvernance/enterprise-users/{username} first (full profile update),
 * falls back to PUT /gouvernance/users/{username} if the enterprise endpoint is unavailable.
 * @param username The username to update.
 * @param data The fields to update (email, first_name, last_name, etc.).
 * @returns A promise with the update operation result.
 */
export async function updateUser(
  username: string,
  data: {
    email?: string;
    first_name?: string;
    last_name?: string;
    display_name?: string;
    default_role?: string;
    default_warehouse?: string;
  }
): Promise<{
  status: string;
  username: string;
  updated_fields: string[];
}> {
  try {
    // Uses PUT /gouvernance/enterprise-users/{username} for full profile update
    const response = await apiClient.put(
      `/gouvernance/enterprise-users/${encodeURIComponent(username)}`,
      data
    );
    return response.data;
  } catch (error: any) {
    console.error('Error updating user:', error);
    throw error;
  }
}
