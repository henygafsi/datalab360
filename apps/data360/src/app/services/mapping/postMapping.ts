import axios from 'axios';
import { getSession } from 'next-auth/react';

/**
 * The shape of the test mapping payload
 * Expected by the backend test_mapping endpoint
 */
export interface TestMappingPayload {
    project_id: string;
    mappings: Array<{
        source_database: string;
        source_schema: string;
        source_table: string;
        source_columns: string[];
        pk_source: string[];
        target_database: string;
        target_schema: string;
        target_table: string;
        target_columns: string[];
        pk_target: string[];
    }>;
}

/**
 * Sends mapping data to your FastAPI endpoint: POST /mapping/test_mapping
 * The endpoint expects a TestMappingPayload with project_id and mappings array.
 */
export async function postMapping(payload: TestMappingPayload) {
    const session = await getSession();
    if (!session?.user?.access_token) {
            throw new Error('No access token available');
    }
    const token = session.user.access_token;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/test_mapping/`; // e.g., http://api.datalab360.io/mapping
    try {
        //const response = await axios.post(url, payload);
        const response = await axios.post<TestMappingPayload>(url, payload,{
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',

            }
          });
        return response.data; // Return response from server
    } catch (error) {
        console.error('Error saving mapping:', error);
        throw error;
    }
}
