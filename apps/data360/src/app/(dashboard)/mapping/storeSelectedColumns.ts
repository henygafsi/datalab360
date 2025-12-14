// src/app/services/mapping/storeSelectedColumns.ts
import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

interface StoreSelectedColumnsPayload {
    project_id: string;
    database_name: string;
    schema_name: string;
    table_name: string;
    selected_columns: string[];
}

interface StoreSelectedColumnsResponse {
    status: string;
    message: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const storeSelectedColumns = async (payload: StoreSelectedColumnsPayload): Promise<StoreSelectedColumnsResponse> => {
    const session = await getAuthSession();
    if (!session?.user?.access_token) {
        console.error('Service: storeSelectedColumns - No access token available.');
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        console.log(`Service: storeSelectedColumns - Sending POST request to ${API_BASE_URL}/mapping/store-selected-columns`);
        console.log('Service: storeSelectedColumns - Request payload:', payload);
        const response = await axios.post<StoreSelectedColumnsResponse>(
            `${API_BASE_URL}/mapping/store-selected-columns`.replace(/\/$/, ''),
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Service: storeSelectedColumns - Response received:', response.data);
        return response.data;
    } catch (error) {
        console.error('Service: storeSelectedColumns - Error storing selected columns:', error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Service: storeSelectedColumns - Error response status:', error.response.status);
            console.error('Service: storeSelectedColumns - Error response data:', error.response.data);
            if (error.response.status === 422) {
                const detail = error.response.data.detail || 'Validation failed';
                if (Array.isArray(detail)) {
                    const errorMessages = detail.map((err: any) => `Field ${err.loc.join('.')}: ${err.msg}`).join(', ');
                    throw new Error(errorMessages || 'Validation failed for selected columns.');
                }
                throw new Error(detail || 'Validation failed for selected columns.');
            }
            throw new Error(error.response.data.detail || 'Failed to store selected columns.');
        }
        throw error;
    }
};