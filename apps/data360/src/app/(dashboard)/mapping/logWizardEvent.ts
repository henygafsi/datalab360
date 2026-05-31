// src/app/(dashboard)/mapping/logWizardEvent.ts
import axios from 'axios';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

interface LogWizardEventPayload {
    project_id: string;
    event_type: string;
    status: string;
    username: string;
    details: any;
}

interface LogWizardEventResponse {
    status: string;
    message: string;
}

export const logWizardEvent = async (payload: LogWizardEventPayload): Promise<LogWizardEventResponse | null> => {
    try {
        const response = await apiClient.post<LogWizardEventResponse>(
            `/explore-design/guided/log_wizard_event`,
            payload,
        );
        return response.data;
    } catch (error) {
        // Wizard event logging is best-effort: if the route is not deployed (404),
        // skip silently rather than breaking the wizard flow.
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.warn('Service: logWizardEvent - endpoint not found (404). Skipping logging.');
            return null;
        }
        console.error('Service: logWizardEvent - Error logging wizard event:', error);
        throw new Error(getApiErrorMessage(error));
    }
};
