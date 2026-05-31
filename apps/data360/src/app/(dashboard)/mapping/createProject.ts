// src/app/(dashboard)/mapping/createProject.ts
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

interface CreateProjectPayload {
    name: string;
    shared_with?: string[]; // Optional array of usernames
}

interface CreateProjectResponse {
    project_id: string;
    message: string;
}

/**
 * Creates a new mapping project in the backend.
 * @param payload - The project details (name, optional shared_with users).
 * @returns The project_id and a success message.
 */
export const createProject = async (payload: CreateProjectPayload): Promise<CreateProjectResponse> => {
    try {
        const response = await apiClient.post<CreateProjectResponse>(
            `/explore-design/guided/create_project`,
            payload,
        );
        return response.data;
    } catch (error) {
        console.error("Error creating project:", error);
        throw new Error(getApiErrorMessage(error));
    }
};
