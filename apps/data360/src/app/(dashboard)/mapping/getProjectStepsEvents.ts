import axios from 'axios';
import { getAuthSession } from '@/lib/auth';
import { formatApiDetail } from '@/lib/utils';

// This interface defines a single event object from the API
export interface StepEvent {
    event_type: string;
    event_details: Record<string, any>;
}

// This interface matches the nested structure of the API response
interface ApiResponse {
    project_id: string;
    latest_event: {
        project_id: string;
        latest_event: StepEvent[];
    };
}

/**
 * Fetches the complete event history for a given project ID to reconstruct its state.
 * This function calls the /mapping/get-steps-event/ endpoint.
 * @param projectId The ID of the project to fetch events for.
 * @returns A promise that resolves to an array of StepEvent objects.
 */
export const getProjectStepsEvents = async (projectId: string): Promise<StepEvent[]> => {
    try {
        const session = await getAuthSession();
        const accessToken = session?.user?.access_token;

        if (!accessToken) {
            throw new Error('User is not authenticated: Access token not found in session.');
        }

        const response = await axios.post<ApiResponse>(
            `${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/get-steps-event/`,
            null, // The body is null for this POST request
            {
                params: { project_id: projectId },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
            }
        );

        // Access the deeply nested array of events.
        // It returns an empty array if the structure is missing, preventing crashes.
    return response.data?.latest_event?.latest_event || [];

    } catch (error) {
        if (axios.isAxiosError(error)) {
            const msg = formatApiDetail(error.response?.data?.detail) || error.message;
            console.error(`API Error fetching event history for project ${projectId}:`, msg, error.response?.data);
        } else {
            console.error(`Failed to get event history for project ${projectId}:`, error);
        }
        // Return an empty array on failure so the application doesn't crash.
        return [];
    }
};
