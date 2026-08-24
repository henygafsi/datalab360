/**
 * Workflow Action Catalog — every builder capability as a governed action.
 * Backend: GET /workflow/actions (registry-in-tables,
 * EVENT_STORE.WF_ACTION_CATALOG), POST /workflow/actions/verify.
 * The Workflow › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance and
 * Projects action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface WorkflowActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface WorkflowAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: WorkflowActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface WorkflowActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, WorkflowAction[]>;
  actions: WorkflowAction[];
}

export interface WorkflowActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getWorkflowActions(): Promise<WorkflowActionCatalog> {
  const res = await apiClient.get('/workflow/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as WorkflowActionCatalog;
}

export async function verifyWorkflowActions(): Promise<WorkflowActionVerifyResult> {
  const res = await apiClient.post('/workflow/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as WorkflowActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isWorkflowActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
