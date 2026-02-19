/** Mapping: get databases. Data journey: UI (e.g. explore-design/mapping) → getDatabases() → GET /explore-design/guided/databases → backend. */
// ////dependency//// service → lib.api-client (auth + base URL)
import apiClient from '@/lib/api-client';

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
  try {
    const response = await apiClient.get('/common/databases');
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

    if (process.env.NODE_ENV === 'development') {
      console.warn('[getDatabases] Unexpected response format:', data);
    }
    return [];
  } catch (error: any) {
    console.error('[getDatabases] Error:', error);
    throw error;
  }
};
