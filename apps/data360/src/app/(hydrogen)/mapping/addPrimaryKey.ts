// src/app/services/mapping/addPrimaryKey.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface AddPrimaryKeyPayload {
    project_id: string;
    database_name: string;
    schema_name: string;
    table_name: string;
    column_names: string[]; // Can be a single column or multiple for composite PK
}

interface AddPrimaryKeyResponse {
    status: string;
    message: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Adds a primary key constraint to a specified table within a project.
 * @param payload - The details for adding the primary key.
 * @returns The API response indicating success or failure.
 */
export const addPrimaryKey = async (payload: AddPrimaryKeyPayload): Promise<AddPrimaryKeyResponse> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        const response = await axios.post<AddPrimaryKeyResponse>(
            `${API_BASE_URL}/mapping/primary-key`,
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
        console.error("Error adding primary key:", error);
        if (axios.isAxiosError(error) && error.response) {
            // Check for specific "already exists" error from Snowflake
            if (error.response.data?.detail?.includes("primary key already exists for table")) {
                return { status: 'info', message: `Primary key already exists for table ${payload.table_name}. Skipping operation.` };
            }
            throw new Error(error.response.data.detail || 'Failed to add primary key.');
        }
        throw error;
    }
};
