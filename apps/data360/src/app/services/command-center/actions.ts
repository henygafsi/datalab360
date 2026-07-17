/**
 * Command-Center Action Catalog — every executive capability as a governed action.
 * Backend: GET /command-center/actions (registry-in-tables,
 * EVENT_STORE.CC_ACTION_CATALOG), POST /command-center/actions/verify.
 * The Account-Overview › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance,
 * Projects and Workflow action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface CcActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface CcAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: CcActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface CcActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, CcAction[]>;
  actions: CcAction[];
}

export interface CcActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getCcActions(): Promise<CcActionCatalog> {
  const res = await apiClient.get('/command-center/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as CcActionCatalog;
}

export async function verifyCcActions(): Promise<CcActionVerifyResult> {
  const res = await apiClient.post('/command-center/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as CcActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isCcActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
