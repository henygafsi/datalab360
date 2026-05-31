import apiClient from '@/lib/api-client';

// This interface defines a single event object
interface StepEvent {
    event_type: string;
    event_details: Record<string, any>;
}

// This interface matches the nested structure of the API response
interface LatestEventApiResponse {
    project_id: string;
    latest_event: {
        project_id: string;
        latest_event: StepEvent[];
    };
}

export const getProjectLatestEvents = async (projectId: string): Promise<StepEvent[]> => {
    try {
        const response = await apiClient.post<LatestEventApiResponse>(
            `/explore-design/guided/get-steps-event/`,
            null,
            {
                params: { project_id: projectId },
            }
        );

        // Access the deeply nested array here
        return response.data.latest_event?.latest_event || [];
    } catch (error) {
        console.error(`Failed to get latest events for project ${projectId}:`, error);
        return [];
    }
};
