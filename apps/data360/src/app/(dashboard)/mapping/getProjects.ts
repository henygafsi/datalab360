// src/app/services/mapping/getProjects.ts
import axios from "axios";
import { getSession } from "next-auth/react";

interface Project {
    project_id: string;
    name: string;
    created_by: string;
    shared_with: string[];
    deployment_version: number;
    step_name?: string | null;
    last_completed_step: string | null; // e.g., "CREATE_PROJECT", "ADD_PRIMARY_KEY", etc.
}

interface GetProjectsResponse {
    projects: Project[];
    message: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Fetches all mapping projects accessible by the current user.
 * @returns A list of project objects with their details and last completed step.
 */
export const getProjects = async (): Promise<Project[]> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        const response = await axios.post<GetProjectsResponse>(
            `${API_BASE_URL}/mapping/get_projects`,
            {}, // POST request with empty body as per backend
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.projects;
    } catch (error) {
        console.error("Error fetching projects:", error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(error.response.data.detail || 'Failed to fetch projects.');
        }
        throw error;
    }
};
