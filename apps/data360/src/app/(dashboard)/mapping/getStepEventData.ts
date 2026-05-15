// src/app/services/mapping/getLatestStepEvent.ts
import axios from 'axios';
import { getAuthSession } from '@/lib/auth';
import { formatApiDetail } from '@/lib/utils';

const API_BASE_URL = (typeof window !== 'undefined' ? '/api-proxy' : (process.env.NEXT_PUBLIC_API_URL || 'http://api.datalab360.io'));

interface LatestStepEventResponse {
    project_id: string;
    latest_event: {
        event_type: string;
        event_details: any; // Use 'any' as details structure varies by event_type
    } | null; // latest_event can be null if no event found for the step
}

/**
 * Fetches the latest successful event data for a specific step type within a project.
 * This corresponds to the backend's /mapping/latest-step-event/ endpoint.
 *
 * @param projectId The ID of the project.
 * @param stepType The type of the wizard step (e.g., "ADD_PRIMARY_KEY", "TABLES_RELATIONS").
 * @returns The latest event details for the step, or null if not found.
 */
export const getLatestStepEvent = async (projectId: string, stepType: string): Promise<LatestStepEventResponse['latest_event']> => {
    const session = await getAuthSession();
    if (!session?.user?.access_token) {
        console.error('Service: getLatestStepEvent - No access token available.');
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    try {
        // console.log(`Service: getLatestStepEvent - Fetching latest event for project ${projectId}, step ${stepType}`);
        const response = await axios.post<LatestStepEventResponse>(
            `${API_BASE_URL}/explore-design/guided/get-steps-event/`,
            null, // POST request with empty body as per your Swagger
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json', // Even with no body, set content-type for POST
                },
                params: {
                    project_id: projectId,
                    event_type: stepType, // Pass event_type as a query parameter
                }
            }
        );
        // console.log(`Service: getLatestStepEvent - Response for step ${stepType}:`, response.data);
        return response.data.latest_event;
    } catch (error) {
        console.error(`Service: getLatestStepEvent - Error fetching latest event for step ${stepType}:`, error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Service: getLatestStepEvent - Error response status:', error.response.status);
            console.error('Service: getLatestStepEvent - Error response data:', error.response.data);
            // Don't re-throw for 404s for specific steps, just return null
            if (error.response.status === 404 || error.response.status === 422) { // 422 might be returned if project_id is invalid
                 console.warn(`Service: getLatestStepEvent - No event found or invalid request for step ${stepType}.`);
                 return null;
            }
            const msg = formatApiDetail(error.response.data?.detail) || `Failed to fetch latest event for step ${stepType}.`;
            throw new Error(msg);
        }
        throw error;
    }
};