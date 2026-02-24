/**
 * Mapping Service - Get Tables
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';

interface TableObject {
  name: string;
}

function isTableObject(obj: unknown): obj is TableObject {
  return typeof obj === 'object' && obj !== null && 'name' in obj && typeof (obj as TableObject).name === 'string';
}

/**
 * Fetches the list of tables from the API for a given database and schema.
 * Always returns an array of table names as strings.
 * @param {string} databaseName - The database name.
 * @param {string} schemaName - The schema name.
 * @returns {Promise<string[]>} - A promise that resolves to the list of table names.
 */
export const getTables = async (databaseName: string, schemaName: string): Promise<string[]> => {
  try {
    const response = await apiClient.get(`/common/tables/${databaseName}/${schemaName}`);

    // Handle different response formats and always return string[]
    if (Array.isArray(response.data)) {
      // If array of objects with 'name' property
      if (response.data.length > 0 && isTableObject(response.data[0])) {
        return response.data.filter(isTableObject).map(table => table.name);
      }
      // If array of strings
      if (response.data.length > 0 && typeof response.data[0] === 'string') {
        return response.data.filter((item): item is string => typeof item === 'string');
      }
      // If empty array
      if (response.data.length === 0) {
        return [];
      }
    }

    // If response.data is an object with a tables property
    if (response.data && typeof response.data === 'object' && 'tables' in response.data) {
      const tables = response.data.tables;
      if (Array.isArray(tables)) {
        // If array of objects with 'name' property
        if (tables.length > 0 && isTableObject(tables[0])) {
          return tables.filter(isTableObject).map(table => table.name);
        }
        // If array of strings
        if (tables.length > 0 && typeof tables[0] === 'string') {
          return tables.filter((item): item is string => typeof item === 'string');
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(`Unexpected response format for tables in ${databaseName}.${schemaName}:`, response.data);
    }
    return [];

  } catch (error) {
    console.error(`Error fetching tables for ${databaseName}.${schemaName}:`, error);
    throw error;
  }
};
