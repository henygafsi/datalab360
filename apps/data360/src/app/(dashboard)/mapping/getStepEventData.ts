// src/app/(dashboard)/mapping/getStepEventData.ts
import axios from 'axios';
import apiClient from '@/lib/api-client';
import { formatApiDetail } from '@/lib/utils';

interface LatestStepEventResponse {
    project_id: string;
    latest_event: {
        event_type: string;
        event_details: any; // Use 'any' as details structure varies by event_type
    } | null; // latest_event can be null if no event found for the step
}

/**
 * Fetches the latest successful event data for a specific step type within a project.
 * This corresponds to the backend's /explore-design/guided/get-steps-event/ endpoint.
 *
 * @param projectId The ID of the project.
 * @param stepType The type of the wizard step (e.g., "ADD_PRIMARY_KEY", "TABLES_RELATIONS").
 * @returns The latest event details for the step, or null if not found.
 */
export const getLatestStepEvent = async (projectId: string, stepType: string): Promise<LatestStepEventResponse['latest_event']> => {
    try {
        const response = await apiClient.post<LatestStepEventResponse>(
            `/explore-design/guided/get-steps-event/`,
            null, // POST request with empty body as per Swagger
            {
                params: {
                    project_id: projectId,
                    event_type: stepType, // Pass event_type as a query parameter
                },
            }
        );
        return response.data.latest_event;
    } catch (error) {
        console.error(`Service: getLatestStepEvent - Error fetching latest event for step ${stepType}:`, error);
        if (axios.isAxiosError(error) && error.response) {
            // Don't re-throw for 404/422 for specific steps, just return null
            if (error.response.status === 404 || error.response.status === 422) {
                console.warn(`Service: getLatestStepEvent - No event found or invalid request for step ${stepType}.`);
                return null;
            }
            const msg = formatApiDetail(error.response.data?.detail) || `Failed to fetch latest event for step ${stepType}.`;
            throw new Error(msg);
        }
        throw error;
    }
};
