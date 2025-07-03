'use client';

import axios from "axios";
import { getSession } from "next-auth/react";

/**
 * Defines the payload for any table structure management operation.
 * This aligns with the query parameters of the backend's /manage_table endpoint.
 */
export interface ManageTablePayload {
    CONSTRAINT_TYPE: 'ADD_COLUMN' | 'DROP_COLUMN' | 'CHANGE_TYPE' | 'RENAME_COL' | 'ADD_PK' | 'ADD_FK' | 'SET_DEFAULT' | 'SET_NULL' | 'SET_NOT_NULL' | 'RENAME_TAB' | 'SWAP' | 'ADD_UNIQUE' | 'DROP_PK' | 'DROP_FK' | 'DROP_UNIQUE' | 'ADD_CHECK_CONSTRAINT' | 'DROP_CHECK_CONSTRAINT' | 'COMMENT_ON_COLUMN' | 'AUTO_INCREMENT';
    SOURCE_TABLE: string; // Fully qualified table name, e.g., "DATABASE.SCHEMA.TABLE"
    COLUMN_NAME?: string;
    COLUMN_TYPE?: string;
    NEW_NAME?: string;
    TABLE_REF?: string; // Fully qualified reference table name for FKs
    COLUMN_REF?: string;
    DEFAULT_VALUE?: string;
    TARGET_TABLE?: string; // For SWAP operation
    COLUMN_COMMENT?: string;
}

/**
 * Calls the backend's generic /manage_table endpoint to alter table structures.
 * This single function handles PK, FK, and other constraints by specifying the CONSTRAINT_TYPE.
 *
 * @param payload - The details of the management operation.
 * @returns The API response.
 */
export const manageTableStructure = async (payload: ManageTablePayload): Promise<any> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    // The backend expects a GET request with query parameters
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/manage_table`;

    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: payload, // Axios will serialize this object into query parameters
        });
        return response.data;
    } catch (error) {
        console.error("Error managing table structure:", error);
        if (axios.isAxiosError(error) && error.response) {
            let errorDetailMessage = '';

            // Safely access and convert error detail to a string for checking
            if (error.response.data && typeof error.response.data.detail === 'string') {
                errorDetailMessage = error.response.data.detail;
            } else if (error.response.data && Array.isArray(error.response.data.detail)) {
                // If 'detail' is an array (common for validation errors), join messages
                errorDetailMessage = error.response.data.detail.map((item: any) => item.msg || item).join('; ');
            } else if (error.response.data) {
                // Fallback for other unexpected structures, stringify the whole data object
                errorDetailMessage = JSON.stringify(error.response.data);
            } else {
                errorDetailMessage = 'An unknown error occurred during table management.';
            }

            const status = error.response.status;

            // Check for specific "already exists" errors from Snowflake
            // We are now directly looking for the specific phrases within the errorDetailMessage
            // without requiring a specific prefix like "SQL compilation error:"
            if (status === 500) {
                if (errorDetailMessage.includes("primary key already exists for table")) {
                    return { status: 'info', message: `Primary key already exists for table ${payload.SOURCE_TABLE.replace(/"/g, '')}. Skipping operation.` };
                }
                if (errorDetailMessage.includes("foreign key already exists for table")) {
                    // This assumes the backend error message for FK also mentions the table name.
                    // Adjust if the actual error message is different.
                    return { status: 'info', message: `Foreign key already exists for table ${payload.SOURCE_TABLE.replace(/"/g, '')} on column ${payload.COLUMN_NAME}. Skipping operation.` };
                }
            }

            // For any other 500 errors or unhandled Axios errors, re-throw them as critical.
            throw new Error(errorDetailMessage || 'An unknown error occurred during table management.');
        }
        // Re-throw non-Axios errors or unexpected errors that don't have a response
        throw error;
    }
};
