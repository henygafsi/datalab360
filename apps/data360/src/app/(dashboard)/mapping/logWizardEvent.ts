// src/app/services/mapping/logWizardEvent.ts
import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const logWizardEvent = async (payload: LogWizardEventPayload): Promise<LogWizardEventResponse | null> => {
    const session = await getAuthSession();
    if (!session?.user?.access_token) {
        console.warn('Service: logWizardEvent - No access token available for logging wizard event');
        return null;
    }
    const token = session.user.access_token;

    try {
        console.log(`Service: logWizardEvent - Sending POST request to ${API_BASE_URL}/mapping/log_wizard_event`);
        console.log('Service: logWizardEvent - Request payload:', payload);
        const response = await axios.post<LogWizardEventResponse>(
            `${API_BASE_URL}/explore-design/guided/log_wizard_event`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log('Service: logWizardEvent - Response received:', response.data);
        return response.data;
    } catch (error) {
        console.error('Service: logWizardEvent - Error logging wizard event:', error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Service: logWizardEvent - Error response status:', error.response.status);
            console.error('Service: logWizardEvent - Error response data:', error.response.data);
            if (error.response.status === 404) {
                console.warn('Service: logWizardEvent - Wizard event logging endpoint not found (404). Skipping logging.');
                return null;
            }
            throw new Error(error.response.data.detail || 'Failed to log wizard event.');
        }
        throw error;
    }
};