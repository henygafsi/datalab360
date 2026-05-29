// src/app/services/mapping/createProject.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface CreateProjectPayload {
    name: string;
    shared_with?: string[]; // Optional array of usernames
}

interface CreateProjectResponse {
    project_id: string;
    message: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Creates a new mapping project in the backend.
 * @param payload - The project details (name, optional shared_with users).
 * @returns The project_id and a success message.
 */
export const createProject = async (payload: CreateProjectPayload): Promise<CreateProjectResponse> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        // TODO(backend): POST /explore-design/guided/create_project — endpoint not in API; wire it or remove this call
        const response = await axios.post<CreateProjectResponse>(
            `${API_BASE_URL}/explore-design/guided/create_project`,
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
        console.error("Error creating project:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to create project.');
        }
        throw error;
    }
};
