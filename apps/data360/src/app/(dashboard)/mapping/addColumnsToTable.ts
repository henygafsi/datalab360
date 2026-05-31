import axios from 'axios';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

interface NewColumn {
    name: string;
    type: string;
    default?: string | null;
    comment?: string;
}

interface AddColumnsPayload {
    project_id: string;
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: NewColumn[];
}

interface AddColumnsResponse {
    status: string;
    message: string;
}

/**
 * Adds new columns to a specified table within a project.
 * @param payload - The details for adding the columns.
 * @returns The API response indicating success or failure.
 */
export const addColumnsToTable = async (payload: AddColumnsPayload): Promise<AddColumnsResponse> => {
    try {
        const response = await apiClient.post<AddColumnsResponse>(
            `/explore-design/guided/add-columns`,
            payload,
        );
        return response.data;
    } catch (error) {
        console.error('Service: addColumnsToTable - Error adding columns:', error);
        if (axios.isAxiosError(error) && error.response) {
            const detail = error.response.data?.detail;
            // "column already exists" is a benign no-op for an idempotent add.
            if (
                error.response.status === 500 &&
                typeof detail === 'string' &&
                detail.includes('SQL compilation error: column') &&
                detail.includes('already exists')
            ) {
                const columnNameMatch = detail.match(/column '([^']+)' already exists/);
                const existingColumnName = columnNameMatch ? columnNameMatch[1] : 'a column';
                return { status: 'info', message: `Column '${existingColumnName}' already exists in the table. Skipping adding this column.` };
            }
        }
        throw new Error(getApiErrorMessage(error));
    }
};
