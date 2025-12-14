import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

/**
 * Helper to get authentication headers with Snowflake account context
 */
async function getAuthHeaders() {
  const session = await getAuthSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
}

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
    const headers = await getAuthHeaders();
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

    try {
        await axios.post(
            `${API_BASE_URL}/mapping/create_project`,
            { name: projectId },
            { headers }
        );
        console.log(`[saveGroups] Created/verified project: ${projectId}`);
    } catch (error: any) {
        // Ignore 409 (already exists) or similar - project might already exist
        if (error.response?.status !== 409 && !error.response?.data?.detail?.includes('already exists')) {
            console.warn('[saveGroups] Warning ensuring project:', error.response?.data?.detail || error.message);
        }
    }
}

/**
 * Saves mapping groups using the event-based pattern
 * This is consistent with your existing backend architecture
 */
export async function addGroupEvent(payload: SaveGroupsPayload): Promise<void> {
    const headers = await getAuthHeaders();
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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

            return axios.post(
                `${API_BASE_URL}/mapping/add-event/`,
                eventPayload,
                { headers }
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
