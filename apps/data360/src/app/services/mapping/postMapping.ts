import axios from 'axios';
import { getSession } from 'next-auth/react';

/**
 * The shape of one mapping item
 * (e.g., one link between source & target).
 */
export interface MappingPayload {
    source_database: string;
    source_schema: string;
    source_table: string;
    source_column: string;
    target_database: string;
    target_schema: string;
    target_table: string;
    target_column: string;
}

/**
 * Sends mapping data to your FastAPI endpoint: POST /mapping
 * The endpoint is expected to handle an array of MappingPayload objects.
 */
export async function postMapping(payload: MappingPayload[]) {
    const session = await getSession();
    if (!session?.user?.access_token) {
            throw new Error('No access token available');
    }
    const token = session.user.access_token;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/test_mapping`; // e.g., http://api.datalab360.io/mapping
    try {
        //const response = await axios.post(url, payload);
        const response = await axios.post<MappingPayload>(url, payload,{
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
