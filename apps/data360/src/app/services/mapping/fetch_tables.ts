/** Data journey: UI → getTableColumns() → GET /explore-design/guided/get_table_columns/ → backend. */
// ////dependency//// service → axios, next-auth (getSession for token)
'use client';

import axios from "axios";
import { getSession } from "next-auth/react";

/**
 * Helper to get authentication headers with Snowflake account context
 */
async function getAuthHeaders() {
  const session = await getSession() as any;
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  const snowflakeAccount = session.user.account_name || '';
  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': snowflakeAccount,
    'X-Username': session.user.username || '',
  };
}

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
    const headers = await getAuthHeaders();

    try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/get_table_columns/`, {
            headers,
            params: { database_name: databaseName, schema_name: schemaName, table_name: tableName },
        });

        // The backend returns { columns: [...] }
        if (response.data && Array.isArray(response.data.columns)) {
            return response.data.columns.filter(isTableColumn);
        }

        // Fallback for an array directly
        if (Array.isArray(response.data)) {
            return response.data.filter(isTableColumn);
        }

        console.warn('Unexpected response format for getTableColumns:', response.data);
        return [];
    } catch (error) {
        console.error("Error fetching table columns:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to fetch table columns.');
        }
        throw error;
    }
};
