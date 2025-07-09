// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\services\gouvernance\fetch_users.ts

import { UserTableDataType } from '@/app/shared/gouvernance/users/table';
import { getSession } from 'next-auth/react'; // Ensure this import is correct

/**
 * Helper function to retrieve the access token from the NextAuth session.
 * This is the critical part for authentication.
 * @returns The access token string.
 * @throws Error if no session or access token is found.
 */
const getAccessTokenFromSession = async (): Promise<string> => {
  const session = await getSession();
  console.log('NextAuth Session in fetch_users.ts:', session); // <-- IMPORTANT: Check this log!
  if (!session) {
    throw new Error('Authentication required: No NextAuth session found.');
  }
  if (!session.user || !session.user.access_token) {
    throw new Error('Authentication required: Access token not found in session.user.');
  }
  return session.user.access_token;
};

/**
 * Fetches the list of users from the backend API.
 * @returns A promise that resolves to an array of UserTableDataType.
 * @throws Error if the API call fails or response is not OK.
 */
export async function getUsers(): Promise<UserTableDataType[]> {
  try {
    const accessToken = await getAccessTokenFromSession(); // Get token from session

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/users`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to fetch users: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('Raw API Response Data (in fetch_users.ts):', data);

    const users: UserTableDataType[] = data.map((user: any) => {
      console.log('Processing raw user object (in fetch_users.ts map):', user);

      let roles: string[] = [];
      if (user.default_role) {
        roles.push(user.default_role);
      }
      if (user.default_secondary_roles && user.default_secondary_roles !== '[]') {
        try {
          const secondaryRoles = JSON.parse(user.default_secondary_roles.replace(/'/g, '"'));
          if (Array.isArray(secondaryRoles)) {
            roles = [...new Set([...roles, ...secondaryRoles])];
          }
        } catch (e) {
          console.warn('Could not parse default_secondary_roles for user:', user.name, user.default_secondary_roles, e);
        }
      }

      const mappedUser: UserTableDataType = {
        id: user.name || user.login_name || crypto.randomUUID().toString(),
        name: user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name || user.name || user.login_name || ''),
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        roles: roles.length > 0 ? roles : [],
        status: user.disabled === 'false' ? 'Active' : 'Disabled',
        createdOn: user.created_on || '',
      };
      console.log('Mapped user object (in fetch_users.ts map):', mappedUser);
      return mappedUser;
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
 * @returns A promise that resolves to a success message or similar.
 * @throws Error if the API call fails.
 */
export async function addUser(userData: { username: string; password?: string; first_name: string; last_name: string; email: string }): Promise<string> {
    try {
        const accessToken = await getAccessTokenFromSession(); // Get token from session

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/add-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
            },
            body: JSON.stringify(userData),
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.detail ? JSON.stringify(errorData.detail) : `${response.status} ${response.statusText}`;
            throw new Error(`Failed to add user: ${errorMessage}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error adding user:', error);
        throw error;
    }
}

/**
 * Assigns a role to a user in the backend.
 * @param username The username to assign the role to.
 * @param roleName The name of the role to assign.
 * @returns A promise that resolves to a success message or similar.
 * @throws Error if the API call fails.
 */
export async function assignRoleToUser(username: string, roleName: string): Promise<string> {
  try {
    const accessToken = await getAccessTokenFromSession(); // Get token from session

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/assign-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
      },
      body: JSON.stringify({ username, role_name: roleName }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail ? JSON.stringify(errorData.detail) : `${response.status} ${response.statusText}`;
      throw new Error(`Failed to assign role: ${errorMessage}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error assigning role:', error);
    throw error;
  }
}