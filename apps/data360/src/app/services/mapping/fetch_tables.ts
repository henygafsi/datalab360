/** Data journey: UI → getTableColumns() → GET /common/get_table_columns → backend.
 *  Canonical form has NO trailing slash; backend now exposes both for safety.
 */
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
 * Error subclass surfaced when the backend reports a Snowflake timeout (504).
 * The UI can `instanceof TableColumnsTimeoutError` to render a retry CTA.
 */
export class TableColumnsTimeoutError extends Error {
  constructor(message = 'Snowflake query timed out — Retry') {
    super(message);
    this.name = 'TableColumnsTimeoutError';
  }
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
    // Canonical: no trailing slash to avoid duplicate calls (FastAPI redirects /foo/ -> /foo).
    const response = await apiClient.get<{ columns?: TableColumn[] } | TableColumn[]>(
      '/common/get_table_columns',
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
    // Tag 504 / SNOWFLAKE_TIMEOUT so callers can render a real error state.
    const ax = error as { response?: { status?: number; data?: { error_code?: string; message?: string } }, message?: string };
    if (ax?.response?.status === 504 || ax?.response?.data?.error_code === 'SNOWFLAKE_TIMEOUT') {
      throw new TableColumnsTimeoutError(ax?.response?.data?.message);
    }
    console.error('Error fetching table columns:', error);
    throw error;
  }
};
