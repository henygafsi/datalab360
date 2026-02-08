/** Data journey: UI → getTableColumns() → GET /explore-design/guided/get_table_columns/ → backend. */
import apiClient from '@/lib/api-client';

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
  try {
    const response = await apiClient.get<{ columns?: TableColumn[] } | TableColumn[]>(
      '/explore-design/guided/get_table_columns/',
      { params: { database_name: databaseName, schema_name: schemaName, table_name: tableName } }
    );
    const data = response.data;

    if (data && Array.isArray((data as { columns?: TableColumn[] }).columns)) {
      return ((data as { columns: TableColumn[] }).columns).filter(isTableColumn);
    }
    if (Array.isArray(data)) {
      return (data as TableColumn[]).filter(isTableColumn);
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('Unexpected response format for getTableColumns:', data);
    }
    return [];
  } catch (error: unknown) {
    console.error('Error fetching table columns:', error);
    throw error;
  }
};
