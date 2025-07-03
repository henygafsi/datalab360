// src/app/services/mapping/addColumnsToTable.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface NewColumn {
    name: string;
    type: string;
    nullable: boolean;
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
 * @param columnType - "required" or "additional" (as per backend query param)
 * @returns The API response indicating success or failure.
 */
export const addColumnsToTable = async (payload: AddColumnsPayload, columnType: 'required' | 'additional'): Promise<AddColumnsResponse> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        const response = await axios.post<AddColumnsResponse>(
            `${API_BASE_URL}/mapping/add-columns?column_type=${columnType}`,
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
        console.error("Error adding columns:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to add columns.');
        }
        throw error;
    }
};
