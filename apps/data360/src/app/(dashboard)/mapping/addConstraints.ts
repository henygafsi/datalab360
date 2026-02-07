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
        console.error('Service: manageTableStructure - No access token available.');
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    const url = `${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/manage_table`;
    console.log(`Service: manageTableStructure - Sending GET request to ${url} with params:`, payload);

    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: payload,
        });
        console.log('Service: manageTableStructure - Response received:', response.data);
        return response.data;
    } catch (error) {
        console.error("Service: manageTableStructure - Error managing table structure:", error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Service: manageTableStructure - Error response status:', error.response.status);
            console.error('Service: manageTableStructure - Error response data:', error.response.data);
            let errorDetailMessage = '';

            if (error.response.data && typeof error.response.data.detail === 'string') {
                errorDetailMessage = error.response.data.detail;
            } else if (error.response.data && Array.isArray(error.response.data.detail)) {
                errorDetailMessage = error.response.data.detail.map((item: any) => item.msg || item).join('; ');
            } else if (error.response.data) {
                errorDetailMessage = JSON.stringify(error.response.data);
            } else {
                errorDetailMessage = 'An unknown error occurred during table management.';
            }

            const status = error.response.status;

            if (status === 500) {
                if (errorDetailMessage.includes("primary key already exists for table")) {
                    return { status: 'info', message: `Primary key already exists for table ${payload.SOURCE_TABLE.replace(/"/g, '')}. Skipping operation.` };
                }
                if (errorDetailMessage.includes("foreign key already exists for table")) {
                    return { status: 'info', message: `Foreign key already exists for table ${payload.SOURCE_TABLE.replace(/"/g, '')} on column ${payload.COLUMN_NAME}. Skipping operation.` };
                }
            }

            throw new Error(errorDetailMessage || 'An unknown error occurred during table management.');
        }
        throw error;
    }
};