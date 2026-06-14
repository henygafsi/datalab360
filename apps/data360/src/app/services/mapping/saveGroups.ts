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
 * The historical /explore-design/guided/add-event/ route DOES NOT EXIST on the
 * current backend (the /explore-design router has no /guided sub-prefix and there
 * is no canonical group-event endpoint). Rather than silently pretend the groups
 * were persisted, we ensure the project exists and then surface an honest error so
 * the caller can inform the user instead of showing a false "saved" confirmation.
 */
export async function addGroupEvent(payload: SaveGroupsPayload): Promise<void> {
    await ensureProjectExists(payload.project_id);

    throw new Error(
        'Saving mapping groups is not available: the backend does not expose a group-event endpoint.'
    );
}
