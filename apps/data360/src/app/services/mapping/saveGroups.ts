import axios from 'axios';
import apiClient from '@/lib/api-client';
import { formatApiDetail } from '@/lib/utils';

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
 * Ensure project exists before adding events
 * Creates the project if it doesn't exist
 */
async function ensureProjectExists(projectId: string): Promise<void> {
    try {
        await apiClient.post(
            '/explore-design/guided/create_project',
            { name: projectId }
        );
        // console.log(`[saveGroups] Created/verified project: ${projectId}`);
    } catch (error: unknown) {
        // Ignore 409 (already exists) or similar - project might already exist
        if (axios.isAxiosError(error)) {
            const detail = error.response?.data?.detail;
            if (error.response?.status !== 409 && !(typeof detail === 'string' && detail.includes('already exists'))) {
                console.warn('[saveGroups] Warning ensuring project:', detail || error.message);
            }
        } else if (error instanceof Error) {
            console.warn('[saveGroups] Warning ensuring project:', error.message);
        }
    }
}

/**
 * Saves mapping groups using the event-based pattern
 * This is consistent with your existing backend architecture
 */
export async function addGroupEvent(payload: SaveGroupsPayload): Promise<void> {
    // Ensure project exists before adding events
    await ensureProjectExists(payload.project_id);

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

            return apiClient.post(
                '/explore-design/guided/add-event/',
                eventPayload
            );
        });

        await Promise.all(promises);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const errorMessage = typeof error.response?.data?.detail === 'string'
                ? error.response.data.detail
                : formatApiDetail(error.response?.data?.detail) || error.message;
            throw new Error(`Failed to save group events: ${errorMessage}`);
        }
        throw new Error('Failed to save group events: Unknown error');
    }
}
