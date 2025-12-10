import axios from 'axios';
import { getSession } from 'next-auth/react';

interface DatabaseObject {
  name: string;
}

function isDatabaseObject(obj: unknown): obj is DatabaseObject {
  return typeof obj === 'object' && obj !== null && 'name' in obj && typeof (obj as DatabaseObject).name === 'string';
}

/**
 * Fetches the list of databases from the API.
 * Handles multiple response formats:
 * - { databases: [{ name: "..." }] }
 * - { databases: ["..."] }
 * - [{ name: "..." }]
 * - ["..."]
 *
 * @returns {Promise<string[]>} - A promise that resolves to the list of database names.
 */
export const getDatabases = async (): Promise<string[]> => {
  const session = await getSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available. Please log in again.');
  }
  const token = session.user.access_token;

  const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    console.log('[getDatabases] Raw response:', response.data);

    // Handle different response formats
    const data = response.data;

    // If response is an array directly
    if (Array.isArray(data)) {
      // Array of objects with 'name' property
      if (data.length > 0 && isDatabaseObject(data[0])) {
        return data.filter(isDatabaseObject).map(db => db.name);
      }
      // Array of strings
      if (data.length > 0 && typeof data[0] === 'string') {
        return data.filter((item): item is string => typeof item === 'string');
      }
      // Empty array
      return [];
    }

    // If response is an object with 'databases' property
    if (data && typeof data === 'object' && 'databases' in data) {
      const databases = data.databases;
      if (Array.isArray(databases)) {
        // Array of objects with 'name' property
        if (databases.length > 0 && isDatabaseObject(databases[0])) {
          return databases.filter(isDatabaseObject).map(db => db.name);
        }
        // Array of strings
        if (databases.length > 0 && typeof databases[0] === 'string') {
          return databases.filter((item): item is string => typeof item === 'string');
        }
        return [];
      }
    }

    // If response is an object with 'data' property (nested)
    if (data && typeof data === 'object' && 'data' in data) {
      const nestedData = data.data;
      if (Array.isArray(nestedData)) {
        if (nestedData.length > 0 && isDatabaseObject(nestedData[0])) {
          return nestedData.filter(isDatabaseObject).map(db => db.name);
        }
        if (nestedData.length > 0 && typeof nestedData[0] === 'string') {
          return nestedData.filter((item): item is string => typeof item === 'string');
        }
        return [];
      }
    }

    console.warn('[getDatabases] Unexpected response format:', data);
    return [];
  } catch (error: any) {
    console.error('[getDatabases] Error:', error);

    // Detect CORS errors
    const isCorsError =
      error.message?.includes('CORS') ||
      error.message?.includes('Network Error') ||
      error.code === 'ERR_NETWORK' ||
      (error.response === undefined && error.request);

    if (isCorsError) {
      throw new Error('Unable to connect to the server. Please check your network connection or contact your administrator.');
    }

    if (error.response?.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }

    if (error.response?.status === 403) {
      throw new Error('You do not have permission to access databases.');
    }

    throw new Error(error.response?.data?.message || error.message || 'Failed to fetch databases. Please try again.');
  }
};
