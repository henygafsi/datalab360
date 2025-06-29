import axios from "axios";
import { getSession } from "next-auth/react";

export interface TableColumn {
  name?: string;
  COLUMN_NAME?: string;
  type?: string;
  DATA_TYPE?: string;
  is_nullable?: boolean;
  IS_NULLABLE?: string;
  is_primary_key?: boolean;
  CONSTRAINT_TYPE?: string;
  is_foreign_key?: boolean;
}

function isTableColumn(obj: unknown): obj is TableColumn {
  return typeof obj === 'object' && obj !== null && (
    'name' in obj || 'COLUMN_NAME' in obj ||
    'type' in obj || 'DATA_TYPE' in obj
  );
}

/**
 * Fetches columns for a specific table from the API.
 * @param {string} databaseName - The database name.
 * @param {string} schemaName - The schema name.
 * @param {string} tableName - The table name.
 * @returns {Promise<TableColumn[]>} - A promise that resolves to an array of column details.
 */
export const getTableColumns = async (
  databaseName: string,
  schemaName: string,
  tableName: string
): Promise<TableColumn[]> => {
  const session = await getSession();
  console.log('Session data:', session);
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  const token = session.user.access_token;

  try {
    const response = await axios.get('/api/mapping/get_table_columns/', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: { database_name: databaseName, schema_name: schemaName, table_name: tableName },
    });

    // The backend returns { columns: [...] }
    if (response.data && Array.isArray(response.data.columns)) {
      return response.data.columns.filter(isTableColumn);
    }

    // If we got an array directly
    if (Array.isArray(response.data)) {
      return response.data.filter(isTableColumn);
    }

    console.warn('Unexpected response format:', response.data);
    return [];
  } catch (error) {
    console.error("Error fetching table columns:", error);
    throw error;
  }
};

// Alias for backward compatibility
export const getTableColumns2 = getTableColumns;
