// src/app/services/mapping/describeSelectedColumns.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface DescribeSelectedColumnsResponse {
    describe_filtered: Array<[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]>; // Snowflake DESCRIBE TABLE output format
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Fetches the description of previously selected columns for a given project and table.
 * This corresponds to the backend's /mapping/describe-selected-columns endpoint.
 * @param projectId - The ID of the project.
 * @param databaseName - The database name of the table.
 * @param schemaName - The schema name of the table.
 * @param tableName - The table name.
 * @returns The API response containing filtered column descriptions.
 */
export const describeSelectedColumns = async (
    projectId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
): Promise<DescribeSelectedColumnsResponse> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        const response = await axios.get<DescribeSelectedColumnsResponse>(
            `${API_BASE_URL}/mapping/describe-selected-columns`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                params: {
                    project_id: projectId,
                    database_name: databaseName,
                    schema_name: schemaName,
                    table_name: tableName,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error describing selected columns:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to describe selected columns.');
        }
        throw error;
    }
};
