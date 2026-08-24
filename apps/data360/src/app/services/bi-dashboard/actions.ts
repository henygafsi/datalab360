/**
 * BI-Dashboard Action Catalog — every dashboard capability as a governed action.
 * Backend: GET /bi-dashboard/actions (registry-in-tables,
 * EVENT_STORE.BI_ACTION_CATALOG), POST /bi-dashboard/actions/verify.
 * The BI-Dashboard › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance,
 * Projects and Workflow action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface BiActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface BiAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: BiActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface BiActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, BiAction[]>;
  actions: BiAction[];
}

export interface BiActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getBiActions(): Promise<BiActionCatalog> {
  const res = await apiClient.get('/bi-dashboard/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as BiActionCatalog;
}

export async function verifyBiActions(): Promise<BiActionVerifyResult> {
  const res = await apiClient.post('/bi-dashboard/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as BiActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isBiActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
