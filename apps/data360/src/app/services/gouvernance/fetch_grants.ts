import { GrantTableDataType } from "@/app/shared/gouvernance/grants/table";
import axios from "axios";
import { getSession } from "next-auth/react";



/**
 * Fetches columns for a specific table from the API.
 * @returns {Promise<string[]>} - A promise that resolves to an array of column names.
 */
export const getPermissions = async (

): Promise<GrantTableDataType[]> => {
  const session = await getSession();
    if (!session?.user?.access_token) {
      throw new Error('No access token available');
    }
    const token = session.user.access_token;
  const url = `${process.env.NEXT_PUBLIC_API_URL}/gouvernance/permissions`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    console.log("Response data:", response.data);
    const permissions = Array.isArray(response.data) ? response.data : [response.data];
    const mappedPermission = permissions.map((permission, index) => ({
      id: index + 1, // Convert id to number as required
      name: permission.permissionName || '',
      roles: permission.roles || '',
      
    }));
    console.log("Mapped roles:", mappedPermission);

    return mappedPermission;
    // Assuming the response returns an object with a 'columns' field containing an array of column names
  } catch (error) {
    console.error("Error fetching Roles:", error);
    throw error; // Rethrow error to be handled by the caller
  }
};