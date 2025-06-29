// app/services/mapping/addConstraints.ts
'use client'; // <--- ADD THIS LINE AT THE VERY TOP

import axios from "axios";
import { getSession } from "next-auth/react";

/**
 * Payload type for adding a primary key.
 */
export interface AddPrimaryKeyPayload {
    database_name: string;
    schema_name: string;
    table_name: string;
    column_names: string[];
}

/**
 * Defines a single column to be added to a table.
 */
export interface ColumnDefinition {
    name: string;
    type: string; // e.g., "VARCHAR(50)", "NUMBER", "DATE"
    default?: string; // Optional default value (as a string or SQL literal)
    comment?: string; // Optional column comment
    nullable?: boolean; // Optional: true if nullable, false if NOT NULL (default true)
}

/**
 * Payload type for adding multiple columns to a table.
 */
export interface AddColumnPayload {
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: ColumnDefinition[];
}

/**
 * Payload type for managing individual table columns (rename, change type, set default etc.)
 * This matches the structure of the new POST /manage_table_structure endpoint.
 */
export interface ManageTableColumnPayload {
    database_name: string;
    schema_name: string;
    table_name: string; // The table on which the operation is performed
    constraint_type: 'ADD_COLUMN' | 'DROP_COLUMN' | 'CHANGE_TYPE' | 'RENAME_COL' | 'ADD_PK' | 'ADD_FK' | 'SET_DEFAULT' | 'SET_NULL' | 'SET_NOT_NULL' | 'RENAME_TAB' | 'SWAP' | 'ADD_UNIQUE' | 'DROP_PK' | 'DROP_FK' | 'DROP_UNIQUE' | 'ADD_CHECK_CONSTRAINT' | 'DROP_CHECK_CONSTRAINT' | 'COMMENT_ON_COLUMN' | 'AUTO_INCREMENT';
    column_name?: string;
    column_type?: string;
    new_name?: string;
    table_ref?: string;
    column_ref?: string;
    default_value?: string;
    column_comment?: string;
}


/**
 * Calls the backend API to add a primary key constraint to a table.
 * @param payload - The details for the primary key.
 * @returns The API response.
 */
export const addPrimaryKey = async (payload: AddPrimaryKeyPayload): Promise<any> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/primary-key`; // New POST endpoint
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        return response.data;
    } catch (error) {
        console.error("Error adding primary key:", error);
        throw error;
    }
};

/**
 * Calls the backend API to add one or more new columns to a table.
 * @param payload - The details of the columns to add.
 * @returns The API response.
 */
export const addColumns = async (payload: AddColumnPayload): Promise<any> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/add-columns`; // New POST endpoint
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        return response.data;
    } catch (error) {
        console.error("Error adding columns:", error);
        throw error;
    }
};

/**
 * Calls the backend API to manage (alter) a table column or add FK.
 * This now uses the new POST /mapping/manage_table_structure endpoint.
 * @param payload - The details of the column management operation.
 * @returns The API response.
 */
export const manageTableColumn = async (payload: ManageTableColumnPayload): Promise<any> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/manage_table_structure`; // NEW POST endpoint

    try {
        const response = await axios.post(url, payload, { // Changed to POST
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        return response.data;
    } catch (error) {
        console.error("Error managing table column:", error);
        throw error;
    }
};