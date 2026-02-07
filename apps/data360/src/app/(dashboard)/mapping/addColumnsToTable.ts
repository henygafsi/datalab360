import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Adds new columns to a specified table within a project.
 * @param payload - The details for adding the columns.
 * @returns The API response indicating success or failure.
 */
export const addColumnsToTable = async (payload: AddColumnsPayload): Promise<AddColumnsResponse> => {
    const session = await getAuthSession();
    if (!session?.user?.access_token) {
        console.error('Service: addColumnsToTable - No access token available.');
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        console.log(`Service: addColumnsToTable - Sending POST request to ${API_BASE_URL}/mapping/add-columns with payload:`, payload);
        const response = await axios.post<AddColumnsResponse>(
            `${API_BASE_URL}/explore-design/guided/add-columns`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Service: addColumnsToTable - Response received:', response.data);
        return response.data;
    } catch (error) {
        console.error('Service: addColumnsToTable - Error adding columns:', error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Service: addColumnsToTable - Error response status:', error.response.status);
            console.error('Service: addColumnsToTable - Error response data:', error.response.data);

            if (error.response.status === 500 && error.response.data?.detail?.includes('SQL compilation error: column') && error.response.data.detail.includes('already exists')) {
                const columnNameMatch = error.response.data.detail.match(/column '([^']+)' already exists/);
                const existingColumnName = columnNameMatch ? columnNameMatch[1] : 'a column';
                return { status: 'info', message: `Column '${existingColumnName}' already exists in the table. Skipping adding this column.` };
            }

            throw new Error(error.response.data.detail || 'Failed to add columns.');
        }
        throw error;
    }
};