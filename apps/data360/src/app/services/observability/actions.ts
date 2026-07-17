/**
 * Observability Action Catalog — every operator capability as a governed action.
 * Backend: GET /observability/actions (registry-in-tables,
 * EVENT_STORE.OBS_ACTION_CATALOG), POST /observability/actions/verify.
 * The Observability › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance,
 * Projects and Workflow action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface ObsActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface ObsAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: ObsActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface ObsActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, ObsAction[]>;
  actions: ObsAction[];
}

export interface ObsActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getObsActions(): Promise<ObsActionCatalog> {
  const res = await apiClient.get('/observability/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as ObsActionCatalog;
}

export async function verifyObsActions(): Promise<ObsActionVerifyResult> {
  const res = await apiClient.post('/observability/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as ObsActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isObsActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
