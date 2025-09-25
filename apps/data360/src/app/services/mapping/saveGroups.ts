'use client';

import axios from 'axios';
import { getSession } from 'next-auth/react';

export interface TableSelection {
    database: string;
    schema: string;
    table: string;
}

export interface GroupData {
    sources: TableSelection[];
    target: TableSelection | null;
}

export interface SaveGroupsPayload {
    project_id: string;
    groups: GroupData[];
}

/**
 * Saves mapping groups using the event-based pattern
 * This is consistent with your existing backend architecture
 */
export async function addGroupEvent(payload: SaveGroupsPayload): Promise<void> {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }

    const token = session.user.access_token;
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

    try {
        // Send each group as a separate event
        const promises = payload.groups.map((group, index) => {
            const eventPayload = {
                project_id: payload.project_id,
                event_type: 'ADD_GROUP',
                event_details: {
                    group_index: index,
                    sources: group.sources,
                    target: group.target
                }
            };

            return axios.post(
                `${API_BASE_URL}/mapping/add-event/`,
                eventPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        });

        await Promise.all(promises);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const errorMessage = error.response?.data?.detail || error.message;
            throw new Error(`Failed to save group events: ${errorMessage}`);
        }
        throw new Error('Failed to save group events: Unknown error');
    }
}
