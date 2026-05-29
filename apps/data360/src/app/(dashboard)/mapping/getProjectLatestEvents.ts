import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

// This interface defines a single event object
interface StepEvent {
    event_type: string;
    event_details: Record<string, any>;
}

// This new interface matches the nested structure of your API response
interface LatestEventApiResponse {
    project_id: string;
    latest_event: {
        project_id: string;
        latest_event: StepEvent[];
    };
}

export const getProjectLatestEvents = async (projectId: string): Promise<StepEvent[]> => {
    try {
        const session = await getAuthSession();
        const accessToken = session?.user?.access_token;

        if (!accessToken) {
            throw new Error('User is not authenticated: Access token not found in session.');
        }

        // TODO(backend): POST /explore-design/guided/get-steps-event/ — endpoint not in API; wire it or remove this call
        const response = await axios.post<LatestEventApiResponse>(
            `${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/get-steps-event/`,
            null,
            {
                params: { project_id: projectId },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }
        );

        // **THE FIX**: Access the deeply nested array here
        return response.data.latest_event?.latest_event || [];

    } catch (error) {
        console.error(`Failed to get latest events for project ${projectId}:`, error);
        return [];
    }
};