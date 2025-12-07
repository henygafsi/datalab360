// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\services\gouvernance\fetch_roles.ts

import { RoleTableDataType } from '@/app/shared/gouvernance/roles/table';
import { getSession } from 'next-auth/react'; // Import getSession

/**
 * Helper function to retrieve the access token from the NextAuth session.
 * @returns The access token string.
 * @throws Error if no session or access token is found.
 */
const getAccessTokenFromSession = async (): Promise<string> => {
  const session = await getSession();
  if (!session || !session.user || !session.user.access_token) {
    throw new Error('No access token available in session. Please log in.');
  }
  return session.user.access_token;
};

/**
 * Fetches the list of roles from the backend API.
 * @returns A promise that resolves to an array of RoleTableDataType.
 * @throws Error if the API call fails or response is not OK.
 */
export async function getRoles(): Promise<RoleTableDataType[]> {
  try {
    const accessToken = await getAccessTokenFromSession();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/roles`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
      },
      cache: 'no-store', // Ensure fresh data
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      throw new Error(`Failed to fetch roles: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data: any = await response.json();
    console.log("Raw API Response Data (Roles):", data);

    const roles: RoleTableDataType[] = data.map((role: any) => ({
      id: role.name || crypto.randomUUID().toString(), // Use role name as ID (string), fallback to UUID
      role: role.name || 'N/A',
      numberOfGrants: role.granted_roles || 0, // Assuming 'granted_roles' from backend maps to numberOfGrants
      comment: role.comment || '',
      createdOn: role.created_on || '',
    }));
    console.log("Mapped roles:", roles);
    return roles;
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
}

/**
 * Adds a new role to the backend.
 * @param roleName The name of the role to add.
 * @returns A promise that resolves to a success message or similar.
 * @throws Error if the API call fails.
 */
export async function addRole(roleName: string): Promise<string> {
  try {
    const accessToken = await getAccessTokenFromSession();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/add-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
      },
      body: JSON.stringify({ role_name: roleName }),
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      const errorMessage = errorData.detail ? JSON.stringify(errorData.detail) : `${response.status} ${response.statusText}`;
      throw new Error(`Failed to add role: ${errorMessage}`);
    }

    const data: any = await response.json();
    return data; // Assuming backend returns a success message
  } catch (error) {
    console.error('Error adding role:', error);
    throw error;
  }
}

/**
 * Fetches roles for a specific user from the backend.
 * @param username The username to fetch roles for.
 * @returns A promise that resolves to an array of role names.
 * @throws Error if the API call fails.
 */
export async function getRolesForUser(username: string): Promise<string[]> {
  try {
    const accessToken = await getAccessTokenFromSession();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/roles-for-user/${username}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`, // AUTH TOKEN PASSED HERE
      },
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      throw new Error(`Failed to fetch roles for user: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json() as string[];
    return data; // Assuming it returns an array of role names
  } catch (error) {
    console.error('Error fetching roles for user:', error);
    throw error;
  }
}