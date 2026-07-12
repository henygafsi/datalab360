/**
 * Project-360 context — GET /projects/{id}/360.
 * One call with purpose + sources + charts + ETL blocks + scores + events.
 * Feeds the always-present context right-bar and the agentic AI surface so a
 * user (and an LLM) sees what a project IS without clicking through tabs.
 */
import apiClient from '@/lib/api-client';
import { toServiceError } from '../_errors';

export interface Project360Scores {
  quality?: number; governance?: number; finops?: number;
  modeling?: number; ml_ready?: number; trust_score?: number;
  [k: string]: number | undefined;
}

export interface Project360 {
  project: {
    project_id: string; name: string; type: string;
    purpose?: string | null; status?: string; step?: string;
    version?: number; owner?: string; tags?: string[];
  };
  sources: Array<Record<string, unknown>>;
  etl_blocks: Array<Record<string, unknown>> | null;
  charts: Array<Record<string, unknown>> | null;
  scores: Project360Scores | null;
  recent_events: Array<{ type?: string; status?: string; at?: string; by?: string }>;
  _degraded: string[];
}

/** Fetch the aggregated 360 context for a project. */
export async function getProject360(projectId: string): Promise<Project360> {
  try {
    const res = await apiClient.get(`/projects/${projectId}/360`);
    return (res.data?.data ?? res.data) as Project360;
  } catch (err) {
    throw toServiceError(err, 'getProject360');
  }
}
