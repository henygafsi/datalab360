'use client'; // <--- ADD THIS LINE AT THE VERY TOP

import axios from "axios";
import { getSession } from "next-auth/react";

interface TableObject {
  name: string;
}

function isTableObject(obj: unknown): obj is TableObject {
  return typeof obj === 'object' && obj !== null && 'name' in obj && typeof (obj as TableObject).name === 'string';
}

/**
 * Fetches the list of tables from the API.
 * Always returns an array of table names as strings.
 * @param {string} databaseName - The database name.
 * @param {string} schemaName - The schema name.
 * @returns {Promise<string[]>} - A promise that resolves to an array of table names.
 */
export const getTablesTarget = async (databaseName: string, schemaName: string): Promise<string[]> => {
  const session = await getSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  const token = session.user.access_token;
  const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/tables/${databaseName}/${schemaName}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    console.log(`Response for tables in ${databaseName}.${schemaName}:`, response.data);

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
    
    console.warn(`Unexpected response format for tables in ${databaseName}.${schemaName}:`, response.data);
    return [];

  } catch (error) {
    console.error(`Error fetching tables for ${databaseName}.${schemaName}:`, error);
    throw error;
  }
};

