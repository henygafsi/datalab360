// src/app/services/mapping/storeSelectedColumns.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface StoreSelectedColumnsPayload {
    project_id: string;
    selected_columns: string[]; // Array of column names
    source_table: string; // The table from which columns were selected
}

interface StoreSelectedColumnsResponse {
    status: string;
    message: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Stores the list of selected (required/nullable) columns for a project step.
 * This corresponds to the backend's /mapping/store-selected-columns endpoint.
 * @param payload - The project ID, selected column names, and source table.
 * @returns The API response.
 */
export const storeSelectedColumns = async (payload: StoreSelectedColumnsPayload): Promise<StoreSelectedColumnsResponse> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        const response = await axios.post<StoreSelectedColumnsResponse>(
            `${API_BASE_URL}/mapping/store-selected-columns`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error storing selected columns:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to store selected columns.');
        }
        throw error;
    }
};
