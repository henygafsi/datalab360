/**
 * Governance Action Catalog — every steward capability as a governed action.
 * Backend: GET /gouvernance/actions (registry-in-tables,
 * EVENT_STORE.GOV_ACTION_CATALOG), POST /gouvernance/actions/verify.
 * The Governance › Actions page renders labels / why / gating / verified /
 * live-or-planned from this registry — the same pattern as the E&D, AI and
 * Admin action catalogs. `status:planned` rows are roadmap capabilities with no
 * endpoint yet (rendered as non-runnable chips, never a live button to a 404).
 */
import apiClient from '@/lib/api-client';

export interface GovernanceActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface GovernanceAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: GovernanceActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  status: 'live' | 'planned';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface GovernanceActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  live: number;
  planned: number;
  areas: Record<string, GovernanceAction[]>;
  actions: GovernanceAction[];
}

export interface GovernanceActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  results: { action_id: string; status: string }[];
}

export async function getGovernanceActions(): Promise<GovernanceActionCatalog> {
  const res = await apiClient.get('/gouvernance/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as GovernanceActionCatalog;
}

export async function verifyGovernanceActions(): Promise<GovernanceActionVerifyResult> {
  const res = await apiClient.post('/gouvernance/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as GovernanceActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx or honest 4xx). */
export function isGovernanceActionVerified(status?: string | null): boolean {
  if (!status) return false;
  // 2xx/4xx = live-probed OK/honest; 'contract-ok' = mutation whose route is
  // registered but is not auto-run (verified by contract, not execution).
  return status.startsWith('2') || status.startsWith('4')
    || status.includes('honest') || status.includes('contract-ok');
}
