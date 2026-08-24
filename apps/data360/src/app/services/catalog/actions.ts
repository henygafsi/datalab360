/**
 * Catalog Action Catalog — every curator capability as a governed action.
 * Backend: GET /catalog/actions (registry-in-tables,
 * EVENT_STORE.CATALOG_ACTION_CATALOG), POST /catalog/actions/verify.
 * The Catalog › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance,
 * Projects and Workflow action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface CatalogActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface CatalogAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: CatalogActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface CatalogActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, CatalogAction[]>;
  actions: CatalogAction[];
}

export interface CatalogActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getCatalogActions(): Promise<CatalogActionCatalog> {
  const res = await apiClient.get('/catalog/actions', { timeout: 180_000 });
  return (res.data?.data ?? res.data) as CatalogActionCatalog;
}

export async function verifyCatalogActions(): Promise<CatalogActionVerifyResult> {
  const res = await apiClient.post('/catalog/actions/verify', {}, { timeout: 180_000 });
  return (res.data?.data ?? res.data) as CatalogActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isCatalogActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
