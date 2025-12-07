// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\services\gouvernance\fetch_grants.ts

import { GrantTableDataType } from '@/app/shared/gouvernance/grants/table';
import { getSession } from 'next-auth/react';
import axios from 'axios'; // Using axios as per your example

// Import getRoles from fetch_roles to aggregate grants
import { getRoles } from '@/app/services/gouvernance/fetch_roles';


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
 * Fetches permissions/grants from the backend.
 * This is an aggregation based on available roles and their grants.
 * Since there's no direct API to list all permissions globally and their associated roles,
 * this function will fetch all roles and then fetch grants for each role to compile the data.
 * @returns A promise that resolves to an array of GrantTableDataType.
 */
export async function getPermissions(): Promise<GrantTableDataType[]> {
  try {
    const accessToken = await getAccessTokenFromSession();
    const allRoles = await getRoles(); // Reuse getRoles from fetch_roles.ts

    const grantsMap = new Map<string, Set<string>>(); // Map: "privilege on object" -> Set<roleName>

    for (const roleData of allRoles) {
      const roleName = roleData.role;
      try {
        const roleGrants = await getGrantsForRole(roleName); // Fetches grants for a specific role
        for (const grantString of roleGrants) {
          // Example grantString: "SELECT on DATABASE my_db"
          // We need to parse this string to get privilege, objectType, objectName
          // This parsing is a simplification and might need to be more robust based on actual grant strings.
          const parts = grantString.split(' on ');
          let privilege = parts[0];
          let objectDetails = parts[1] || ''; // e.g., "DATABASE my_db"

          // Example: If grantString is just "SELECT", it means global or common privilege.
          if (!objectDetails && privilege) {
            objectDetails = "GLOBAL"; // Default object type if not specified
          }

          const fullGrantIdentifier = `${privilege} on ${objectDetails}`; // e.g., "SELECT on DATABASE my_db"
          if (!grantsMap.has(fullGrantIdentifier)) {
            grantsMap.set(fullGrantIdentifier, new Set<string>());
          }
          grantsMap.get(fullGrantIdentifier)?.add(roleName);
        }
      } catch (roleError: any) {
        console.warn(`Could not fetch grants for role "${roleName}":`, roleError.message);
        // Continue processing other roles even if one fails
      }
    }

    const mappedPermissions: GrantTableDataType[] = Array.from(grantsMap.entries()).map(([grantIdentifier, rolesSet], index) => ({
      id: grantIdentifier, // Using the full grant string as a unique ID
      name: grantIdentifier, // Displaying the full grant string as the name
      roles: Array.from(rolesSet).sort(), // Convert set to array and sort roles
    }));

    console.log("Aggregated and Mapped Permissions:", mappedPermissions);
    return mappedPermissions;

  } catch (error) {
    console.error('Error fetching aggregated permissions:', error);
    throw error;
  }
}


/**
 * Fetches grants (privileges) for a specific role from the backend.
 * @param roleName The name of the role to fetch grants for.
 * @returns A promise that resolves to an array of grant strings (e.g., "SELECT on TABLE my_table").
 * @throws Error if the API call fails.
 */
export async function getGrantsForRole(roleName: string): Promise<string[]> {
  try {
    const accessToken = await getAccessTokenFromSession();
    const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/grants-for-role/${roleName}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch grants for role: ${response.status} ${response.statusText}`);
    }

    // Assuming the API returns an array of strings like ["SELECT on DATABASE db", "INSERT on TABLE tbl"]
    return Array.isArray(response.data) ? (response.data as string[]) : [];
  } catch (error: any) {
    console.error(`Error fetching grants for role ${roleName}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Grants a specific permission to a role on an object in the backend.
 * @param privileges An array of privileges (e.g., ["SELECT", "INSERT"]).
 * @param object_type The type of object (e.g., "DATABASE", "TABLE").
 * @param object_name The name of the object.
 * @param role_name The name of the role to grant permission to.
 * @returns A promise that resolves to a success message.
 * @throws Error if the API call fails.
 */
export async function grantPermission(
  privileges: string[],
  object_type: string,
  object_name: string,
  role_name: string
): Promise<string> {
  try {
    const accessToken = await getAccessTokenFromSession();
    const params = new URLSearchParams();
    privileges.forEach(p => params.append('privileges', p));
    params.append('object_type', object_type);
    params.append('object_name', object_name);
    params.append('role_name', role_name);

    const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/gouvernance/grant-permission?${params.toString()}`, null, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to grant permission: ${response.status} ${response.statusText}`);
    }

    return response.data; // Assuming backend returns a success message
  } catch (error: any) {
    console.error('Error granting permission:', error.response?.data || error.message);
    throw error;
  }
}

// Available privilege values as per Swagger
export const availablePrivileges = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'USAGE', 'CREATE', 'MODIFY',
  'MONITOR', 'OWNERSHIP', 'REFERENCES', 'READ', 'WRITE', 'TRUNCATE',
  'OPERATE', 'EXECUTE', 'ALL PRIVILEGES'
];

// Available object types as per Swagger
export const availableObjectTypes = [
  'DATABASE', 'SCHEMA', 'TABLE', 'VIEW', 'STAGE', 'PIPE', 'FUNCTION',
  'PROCEDURE', 'WAREHOUSE', 'STREAM', 'TASK', 'FILE FORMAT', 'SEQUENCE'
];