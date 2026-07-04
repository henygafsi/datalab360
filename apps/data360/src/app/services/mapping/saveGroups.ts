import axios from 'axios';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

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
 * Ensure project exists before adding events.
 *
 * Canonical project creation is POST /explore-design (API.exploreDesign.createProject).
 * The historical /explore-design/guided/create_project route does not exist on the
 * current backend, so there is no fallback. A 409 / "already exists" is treated as success.
 */
async function ensureProjectExists(projectId: string): Promise<void> {
    try {
        await apiClient.post(API.exploreDesign.createProject(), { project_name: projectId });
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            const detail = error.response?.data?.detail;
            const status = error.response?.status;
            if (status === 409 || (typeof detail === 'string' && detail.includes('already exists'))) {
                return;
            }
            if (process.env.NODE_ENV === 'development') {
                console.warn('[saveGroups] Warning ensuring project:', detail || error.message);
            }
        } else if (error instanceof Error && process.env.NODE_ENV === 'development') {
            console.warn('[saveGroups] Warning ensuring project:', error.message);
        }
    }
}

/**
 * Saves mapping groups using the event-based pattern.
 *
 * POST /explore-design/guided/add-event, one call per group (the backend's
 * AddEventRequest carries a single {group_index, sources, target}).
 */
export async function addGroupEvent(payload: SaveGroupsPayload): Promise<void> {
    await ensureProjectExists(payload.project_id);

    for (let i = 0; i < payload.groups.length; i++) {
        const group = payload.groups[i];
        await apiClient.post(API.exploreDesign.guidedAddEvent(), {
            project_id: payload.project_id,
            event_details: {
                group_index: i,
                sources: group.sources,
                target: group.target,
            },
        });
    }
}
