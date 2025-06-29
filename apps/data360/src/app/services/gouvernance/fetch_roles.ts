import { RoleTableDataType } from "@/app/shared/gouvernance/roles/table";
import axios from "axios";
import { getSession } from "next-auth/react";



/**
 * Fetches columns for a specific table from the API.
 * @returns {Promise<string[]>} - A promise that resolves to an array of column names.
 */
export const getRoles = async (

): Promise<RoleTableDataType[]> => {
  const session = await getSession();
    if (!session?.user?.access_token) {
      throw new Error('No access token available');
    }
    const token = session.user.access_token;
  const url = `${process.env.NEXT_PUBLIC_API_URL}/gouvernance/roles`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    console.log("Response data:", response.data);
    const roles = Array.isArray(response.data) ? response.data : [response.data];
    const mappedRoles = roles.map((role, index) => ({
      id: index + 1, // Convert id to number as required
      role: role.name || '',
      numberOfGrants: role.grant_count || 0,
      comment: role.comment || '', // Provide a default value for comment
      createdOn: role.created_on || '',
    }));
    console.log("Mapped roles:", mappedRoles);

    return mappedRoles;
    // Assuming the response returns an object with a 'columns' field containing an array of column names
  } catch (error) {
    console.error("Error fetching Roles:", error);
    throw error; // Rethrow error to be handled by the caller
  }
};