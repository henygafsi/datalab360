// src/app/(dashboard)/mapping/storeSelectedColumns.ts
import axios from 'axios';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

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

export const storeSelectedColumns = async (payload: StoreSelectedColumnsPayload): Promise<StoreSelectedColumnsResponse> => {
    try {
        const response = await apiClient.post<StoreSelectedColumnsResponse>(
            `/explore-design/guided/store-selected-columns`,
            payload,
        );
        return response.data;
    } catch (error) {
        console.error('Service: storeSelectedColumns - Error storing selected columns:', error);
        if (axios.isAxiosError(error) && error.response?.status === 422) {
            const detail = error.response.data?.detail || 'Validation failed';
            if (Array.isArray(detail)) {
                const errorMessages = detail.map((err: any) => `Field ${err.loc.join('.')}: ${err.msg}`).join(', ');
                throw new Error(errorMessages || 'Validation failed for selected columns.');
            }
            throw new Error(typeof detail === 'string' ? detail : 'Validation failed for selected columns.');
        }
        throw new Error(getApiErrorMessage(error));
    }
};
