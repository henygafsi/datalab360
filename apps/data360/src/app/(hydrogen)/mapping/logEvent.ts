'use client';

import { getSession } from 'next-auth/react';

interface EventPayload {
    project_id: string;
    module_name: string;
    event_type: string;
    status: string;
    username: string;
    details: any;
    error?: string | null;
}

/**
 * Logs a navigation event to local storage since /mapping/log_event is unavailable.
 * @param payload - The event details to log.
 */
export const logNavigationEvent = async (payload: EventPayload): Promise<void> => {
    try {
        console.log(`Service: logNavigationEvent - Saving navigation event to local storage:`, payload);
        const localEvents = JSON.parse(localStorage.getItem('events') || '[]');
        localEvents.push({ ...payload, timestamp: new Date().toISOString() });
        localStorage.setItem('events', JSON.stringify(localEvents));
    } catch (error) {
        console.error('Service: logNavigationEvent - Error saving to local storage:', error);
    }
};

/**
 * Fetches the auth token for API requests.
 */
export const getAuthToken = async (): Promise<string | null> => {
    const session = await getSession();
    if (!session?.user?.access_token) {
        console.error('Service: getAuthToken - No access token available.');
        return null;
    }
    return session.user.access_token;
};