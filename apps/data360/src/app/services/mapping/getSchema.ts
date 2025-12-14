/**
 * Mapping Service - Get Schemas
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';

interface SchemaObject {
  name: string;
}

function isSchemaObject(obj: unknown): obj is SchemaObject {
  return typeof obj === 'object' && obj !== null && 'name' in obj && typeof (obj as SchemaObject).name === 'string';
}

/**
 * Fetches the list of schemas from the API for a given database.
 * Handles multiple response formats:
 * - { schemas: [{ name: "..." }] }
 * - { schemas: ["..."] }
 * - [{ name: "..." }]
 * - ["..."]
 *
 * @param {string} databaseName - The database name.
 * @returns {Promise<string[]>} - A promise that resolves to the list of schema names.
 */
export const getSchemas = async (databaseName: string): Promise<string[]> => {
  try {
    const response = await apiClient.get(`/mapping/schemas/${databaseName}`);
    const data = response.data;

    // If response is an array directly
    if (Array.isArray(data)) {
      if (data.length > 0 && isSchemaObject(data[0])) {
        return data.filter(isSchemaObject).map(schema => schema.name);
      }
      if (data.length > 0 && typeof data[0] === 'string') {
        return data.filter((item): item is string => typeof item === 'string');
      }
      return [];
    }

    // If response is an object with 'schemas' property
    if (data && typeof data === 'object' && 'schemas' in data) {
      const schemas = data.schemas;
      if (Array.isArray(schemas)) {
        if (schemas.length > 0 && isSchemaObject(schemas[0])) {
          return schemas.filter(isSchemaObject).map(schema => schema.name);
        }
        if (schemas.length > 0 && typeof schemas[0] === 'string') {
          return schemas.filter((item): item is string => typeof item === 'string');
        }
        return [];
      }
    }

    // If response is an object with 'data' property (nested)
    if (data && typeof data === 'object' && 'data' in data) {
      const nestedData = data.data;
      if (Array.isArray(nestedData)) {
        if (nestedData.length > 0 && isSchemaObject(nestedData[0])) {
          return nestedData.filter(isSchemaObject).map(schema => schema.name);
        }
        if (nestedData.length > 0 && typeof nestedData[0] === 'string') {
          return nestedData.filter((item): item is string => typeof item === 'string');
        }
        return [];
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(`[getSchemas] Unexpected response format for ${databaseName}:`, data);
    }
    return [];
  } catch (error) {
    console.error(`[getSchemas] Error fetching schemas for ${databaseName}:`, error);
    throw error;
  }
};
