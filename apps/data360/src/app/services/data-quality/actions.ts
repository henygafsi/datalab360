/**
 * Data Quality Action Catalog — every quality capability as a governed action.
 * Backend: GET /data-quality/actions (registry-in-tables,
 * EVENT_STORE.DQ_ACTION_CATALOG), POST /data-quality/actions/verify.
 * The Data Quality › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance,
 * Projects and Workflow action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface DataQualityActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface DataQualityAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: DataQualityActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface DataQualityActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, DataQualityAction[]>;
  actions: DataQualityAction[];
}

export interface DataQualityActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getDataQualityActions(): Promise<DataQualityActionCatalog> {
  const res = await apiClient.get('/data-quality/actions', { timeout: 180_000 });
  return (res.data?.data ?? res.data) as DataQualityActionCatalog;
}

export async function verifyDataQualityActions(): Promise<DataQualityActionVerifyResult> {
  const res = await apiClient.post('/data-quality/actions/verify', {}, { timeout: 180_000 });
  return (res.data?.data ?? res.data) as DataQualityActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isDataQualityActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
