// app/(dashboard)/mapping/manageColumns.ts

import apiClient from '@/lib/api-client';

interface ColumnDefinition {
    name: string;
    type: string; // e.g., "VARCHAR(255)", "INT"
    default?: any;
    comment?: string;
    is_nullable?: boolean; // Le backend pourrait gérer ça via le type
}

interface AddColumnsPayload {
    project_id: string;
    database_name: string;
    schema_name: string;
    table_name: string;
    columns: ColumnDefinition[];
}

interface RemoveColumnsPayload {
    project_id: string;
    database_name: string;
    schema_name: string;
    table_name: string;
    column_names: string[];
}

/**
 * Appelle l'endpoint pour ajouter une ou plusieurs colonnes à une table.
 */
export const addTableColumns = async (payload: AddColumnsPayload): Promise<any> => {
    try {
        const response = await apiClient.post(`/explore-design/guided/add-columns`, payload);
        return response.data;
    } catch (error: any) {
        console.error("Error adding columns:", error);
        // Renvoyer l'erreur pour que le composant puisse la gérer
        throw error.response?.data || new Error("An unknown error occurred while adding columns.");
    }
};

/**
 * Appelle l'endpoint pour supprimer des colonnes d'une table.
 */
export const removeTableColumns = async (payload: RemoveColumnsPayload): Promise<any> => {
    try {
        const response = await apiClient.post(`/explore-design/guided/remove-columns`, payload);
        return response.data;
    } catch (error: any) {
        console.error("Error removing columns:", error);
        throw error.response?.data || new Error("An unknown error occurred while removing columns.");
    }
};
