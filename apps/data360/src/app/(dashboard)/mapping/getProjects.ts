/**
 * Mapping projects list: uses backend GET /explore-design/projects (single source for cross-module project list).
 */
import apiClient from '@/lib/api-client';

export interface Project {
  project_id: string;
  name: string;
  created_by: string;
  shared_with: string[];
  deployment_version: number;
  step_name?: string | null;
  last_completed_step: string | null;
}

/**
 * Fetches all projects for the current user (explore-design + mapping).
 * Backend: GET /explore-design/projects
 */
export const getProjects = async (): Promise<Project[]> => {
  try {
    const response = await apiClient.get<{ projects: Array<{
      project_id: string;
      project_name: string;
      created_by: string;
      status: string;
      metadata?: { shared_with?: string[]; deployment_version?: number };
    }>; total: number }>('/explore-design/projects');
    const list = response.data?.projects ?? [];
    return list.map((p) => ({
      project_id: p.project_id,
      name: p.project_name,
      created_by: p.created_by,
      shared_with: p.metadata?.shared_with ?? [],
      deployment_version: p.metadata?.deployment_version ?? 0,
      step_name: p.status,
      last_completed_step: null as string | null,
    }));
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
};
