import { UserTableDataType } from "@/app/shared/gouvernance/users/table";
import axios from "axios";
import { getSession } from "next-auth/react";



/**
 * Fetches columns for a specific table from the API.
 * @returns {Promise<string[]>} - A promise that resolves to an array of column names.
 */
export const getUsers = async (

): Promise<UserTableDataType[]> => {
  const session = await getSession();
    if (!session?.user?.access_token) {
      throw new Error('No access token available');
    }
    const token = session.user.access_token;
  const url = `${process.env.NEXT_PUBLIC_API_URL}/gouvernance/users`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    console.log("Response data:", response.data);
    const users = Array.isArray(response.data) ? response.data : [response.data];
    const mappedUsers = users.map((user, index) => ({
      id: `${index + 1}`, // You can use a real ID if you have one
      name: user.USERNAME || '',
      email: user.EMAIL || '',
      roles: user.ROLENAME ? [user.ROLENAME] : [],
      status: 'active', // Or use a real field if available
      createdOn: user.CREATED_ON || '',
    }));
    console.log("Mapped Users:", mappedUsers);
    return mappedUsers;
    // Assuming the response returns an object with a 'columns' field containing an array of column names
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error; // Rethrow error to be handled by the caller
  }
};