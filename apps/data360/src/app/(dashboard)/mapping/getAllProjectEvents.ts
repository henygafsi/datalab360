import axios from 'axios';
import { getSession } from 'next-auth/react';

// This interface defines a single event object
export interface StepEvent {
    event_type: string;
    event_details: Record<string, any>;
}

// This new interface matches the nested structure of your API response
interface ApiResponse {
    project_id: string;
    latest_event: {
        project_id: string;
        latest_event: StepEvent[];
    };
}

/**
 * Fetches the complete event history for a given project ID.
 * @param projectId The ID of the project to fetch events for.
 * @returns A promise that resolves to an array of StepEvent objects.
 */
export const getAllProjectEvents = async (projectId: string): Promise<StepEvent[]> => {
    try {
        const session = await getSession();
        const accessToken = session?.user?.access_token;

        if (!accessToken) {
            throw new Error('User is not authenticated: Access token not found in session.');
        }

        const response = await axios.post<ApiResponse>(
            // Ensure this URL is correct and accessible
            `${process.env.NEXT_PUBLIC_API_URL}/mapping/get-steps-event/`,
            null, // No body is needed for a POST request with params
            {
                params: { project_id: projectId },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
            }
        );

        // **THE FIX**: Access the deeply nested array here
        // It returns an empty array if the structure is missing, preventing crashes.
        return response.data?.latest_event?.latest_event || [];

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`API Error fetching events for project ${projectId}:`, error.response?.data || error.message);
        } else {
            console.error(`Failed to get all events for project ${projectId}:`, error);
        }
        // Return an empty array on failure so the application doesn't crash.
        return [];
    }
};
