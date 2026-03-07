/**
 * Gouvernance Service - Fetch Users
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { UserTableDataType } from '@/app/shared/gouvernance/users/table';

/**
 * Fetches the list of users from the backend API.
 * @returns A promise that resolves to an array of UserTableDataType.
 */
export async function getUsers(): Promise<UserTableDataType[]> {
  try {
    const response = await apiClient.get('/gouvernance/users');
    const data = response.data;

    const users: UserTableDataType[] = data.map((user: any) => {
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
 * Adds a new user to the backend.
 * @param userData The user data to be sent to the API.
 */
export async function addUser(userData: { username: string; password: string; email: string }): Promise<string> {
  try {
    const response = await apiClient.post('/gouvernance/add-user', userData);
    return response.data as string;
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
  } catch (error) {
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
    comment?: string;
  }
): Promise<{
  status: string;
  username: string;
  updated_fields: string[];
}> {
  try {
    const response = await apiClient.put(`/gouvernance/users/${username}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}
