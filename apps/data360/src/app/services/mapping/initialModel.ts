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
 * Fetches constraints for a specific database, schema and optional table from the API.
 * Backend returns { constraints: [...] }; empty when params missing or not found.
 */
export const fetchConst = async (
  databaseName: string,
  schemaName: string,
  tableName?: string
): Promise<any[]> => {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    database_name: databaseName,
    schema: schemaName,
  });
  if (tableName) params.set('table', tableName);
  const url = `${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/constraints?${params.toString()}`;

  const response = await axios.get(url, { headers });
  if (response.status !== 200) throw new Error('Failed to fetch constraints');
  const data = response.data;
  return Array.isArray(data) ? data : (data?.constraints ?? []);
};
