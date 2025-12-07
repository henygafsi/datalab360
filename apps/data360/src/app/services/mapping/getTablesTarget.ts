// app/services/mapping/getTablesTarget.ts
'use client';

import axios from "axios";
import { getSession } from "next-auth/react";

interface TableObject {
    name: string;
}

function isTableObject(obj: unknown): obj is TableObject {
    return typeof obj === 'object' && obj !== null && 'name' in obj && typeof (obj as TableObject).name === 'string';
}

/**
 * Fetches the list of tables from the API for the target selection.
 * Always returns an array of table names as strings.
 * @param {string} databaseName - The database name.
 * @param {string} schemaName - The schema name.
 * @returns {Promise<string[]>} - A promise that resolves to an array of table names.
 */
export const getTablesTarget = async (databaseName: string, schemaName: string): Promise<string[]> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/tables/${databaseName}/${schemaName}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = response.data;

        // Handle format { "tables": [{ "name": "T1" }] } or { "tables": ["T1"] }
        if (data && Array.isArray(data.tables)) {
            if (data.tables.length > 0 && isTableObject(data.tables[0])) {
                return data.tables.map((table: TableObject) => table.name);
            }
            if (data.tables.length > 0 && typeof data.tables[0] === 'string') {
                return data.tables;
            }
            return [];
        }
        
        // Handle format [{ "name": "T1" }]
        if (Array.isArray(data) && data.length > 0 && isTableObject(data[0])) {
            return (data as TableObject[]).map((table) => table.name);
        }

        // Handle format ["T1", "T2"]
        if (Array.isArray(data) && (data.length === 0 || typeof data[0] === 'string')) {
            return data as string[];
        }

        console.warn(`Unexpected response format for tables in ${databaseName}.${schemaName}:`, data);
        return [];

    } catch (error) {
        console.error(`Error fetching tables for ${databaseName}.${schemaName}:`, error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || `Failed to fetch tables for ${databaseName}.${schemaName}.`);
        }
        throw error;
    }
};
