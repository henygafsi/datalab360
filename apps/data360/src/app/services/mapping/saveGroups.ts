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
 * Ensure project exists before adding events.
 *
 * NOTE: /explore-design/guided/create_project DOES NOT EXIST on the current
 * backend router (no /guided sub-prefix). Canonical project creation is
 * POST /explore-design. We try the canonical path first, fall back to the
 * legacy /guided path for older deployments, and swallow 409/already-exists.
 */
async function ensureProjectExists(projectId: string): Promise<void> {
    // Canonical endpoint: POST /explore-design
    try {
        await apiClient.post('/explore-design', { project_name: projectId });
        return;
    } catch (canonicalError: unknown) {
        if (axios.isAxiosError(canonicalError)) {
            const detail = canonicalError.response?.data?.detail;
            const status = canonicalError.response?.status;
            if (status === 409 || (typeof detail === 'string' && detail.includes('already exists'))) {
                return;
            }
        }
        // Legacy fallback
        try {
            await apiClient.post('/explore-design/guided/create_project', { name: projectId });
        } catch (legacyError: unknown) {
            if (axios.isAxiosError(legacyError)) {
                const detail = legacyError.response?.data?.detail;
                if (legacyError.response?.status !== 409 && !(typeof detail === 'string' && detail.includes('already exists'))) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('[saveGroups] Warning ensuring project:', detail || legacyError.message);
                    }
                }
            } else if (legacyError instanceof Error && process.env.NODE_ENV === 'development') {
                console.warn('[saveGroups] Warning ensuring project:', legacyError.message);
            }
        }
    }
}

/**
 * Saves mapping groups using the event-based pattern.
 *
 * NOTE: /explore-design/guided/add-event/ DOES NOT EXIST on the current
 * backend router. Events are emitted server-side as side effects of domain
 * endpoints. Wrapped in try-catch so a 404 degrades gracefully.
 */
export async function addGroupEvent(payload: SaveGroupsPayload): Promise<void> {
    await ensureProjectExists(payload.project_id);

    try {
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
        // Known missing endpoint -- degrade gracefully on 404
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            if (process.env.NODE_ENV === 'development') {
                console.warn(
                    '[saveGroups] /explore-design/guided/add-event/ not on backend; group events not persisted.'
                );
            }
            return;
        }
        if (axios.isAxiosError(error)) {
            const errorMessage = typeof error.response?.data?.detail === 'string'
                ? error.response.data.detail
                : formatApiDetail(error.response?.data?.detail) || error.message;
            throw new Error(`Failed to save group events: ${errorMessage}`);
        }
        throw new Error('Failed to save group events: Unknown error');
    }
}
