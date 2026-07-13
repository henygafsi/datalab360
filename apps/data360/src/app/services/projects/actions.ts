/**
 * Projects Action Catalog — every project-lifecycle capability as a governed
 * action. Backend: GET /projects/actions (registry-in-tables,
 * EVENT_STORE.PROJECT_ACTION_CATALOG), POST /projects/actions/verify.
 * The Project › Actions page renders labels / why / gating / verified /
 * live-or-planned from this registry — the same pattern as the E&D, AI, Admin
 * and Governance action catalogs. `status:planned` rows are roadmap
 * capabilities with no endpoint yet (rendered as non-runnable chips, never a
 * live button to a 404).
 */
import apiClient from '@/lib/api-client';

export interface ProjectActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface ProjectAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: ProjectActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  status: 'live' | 'planned';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface ProjectActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  live: number;
  planned: number;
  areas: Record<string, ProjectAction[]>;
  actions: ProjectAction[];
}

export interface ProjectActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  results: { action_id: string; status: string }[];
}

export async function getProjectActions(): Promise<ProjectActionCatalog> {
  const res = await apiClient.get('/projects/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as ProjectActionCatalog;
}

export async function verifyProjectActions(): Promise<ProjectActionVerifyResult> {
  const res = await apiClient.post('/projects/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as ProjectActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx or honest 4xx). */
export function isProjectActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return status.startsWith('2') || status.startsWith('4') || status.includes('honest');
}
