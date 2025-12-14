import axios from "axios";
import { getAuthSession } from '@/lib/auth';

/**
 * Helper to get authentication headers with Snowflake account context
 */
async function getAuthHeaders() {
  const session = await getAuthSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
}

/**
 * Fetches constraints for a specific database and schema from the API.
 * @param {string} databaseName - The database name.
 * @param {string} schemaName - The schema name.
 * @returns {Promise<any[]>} - A promise that resolves to an array of constraints (objects).
 */
export const fetchConst = async (databaseName: string, schemaName: string): Promise<any[]> => {
    const headers = await getAuthHeaders();
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/constraints?database_name=${databaseName}&schema=${schemaName}`;

    try {
        const response = await axios.get(url, { headers });
        // Check if the request was successful
        if (response.status !== 200) {
            throw new Error('Failed to fetch constraints');
        }

        // Return the data (which will be automatically parsed to JSON by axios)
        return response.data;
    } catch (error) {
        console.error('Error fetching constraints:', error);
        throw error;
    }
};
