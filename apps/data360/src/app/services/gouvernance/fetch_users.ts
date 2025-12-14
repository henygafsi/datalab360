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
