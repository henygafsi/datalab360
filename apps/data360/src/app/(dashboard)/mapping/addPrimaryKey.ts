// src/app/(dashboard)/mapping/addPrimaryKey.ts
import axios from "axios";
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

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

/**
 * Adds a primary key constraint to a specified table within a project.
 * @param payload - The details for adding the primary key.
 * @returns The API response indicating success or failure.
 */
export const addPrimaryKey = async (payload: AddPrimaryKeyPayload): Promise<AddPrimaryKeyResponse> => {
    try {
        const response = await apiClient.post<AddPrimaryKeyResponse>(
            `/explore-design/guided/primary-key`,
            payload,
        );
        return response.data;
    } catch (error) {
        console.error("Error adding primary key:", error);
        // "primary key already exists" is a benign no-op for an idempotent add.
        if (
            axios.isAxiosError(error) &&
            typeof error.response?.data?.detail === 'string' &&
            error.response.data.detail.includes("primary key already exists for table")
        ) {
            return { status: 'info', message: `Primary key already exists for table ${payload.table_name}. Skipping operation.` };
        }
        throw new Error(getApiErrorMessage(error));
    }
};
