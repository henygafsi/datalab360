/**
 * Connect Action Catalog — every ingestion capability as a governed action.
 * Backend: GET /connect/actions (registry-in-tables,
 * EVENT_STORE.CONNECT_ACTION_CATALOG), POST /connect/actions/verify.
 * The Connect › Actions page renders labels / why / gating / verified from
 * this registry — the same pattern as the E&D, AI, Admin, Governance,
 * Projects and Workflow action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface ConnectActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface ConnectAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: ConnectActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface ConnectActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, ConnectAction[]>;
  actions: ConnectAction[];
}

export interface ConnectActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  contract_ok: number;
  missing_routes: string[];
  results: { action_id: string; status: string }[];
}

export async function getConnectActions(): Promise<ConnectActionCatalog> {
  const res = await apiClient.get('/connect/actions', { timeout: 60_000 });
  return (res.data?.data ?? res.data) as ConnectActionCatalog;
}

export async function verifyConnectActions(): Promise<ConnectActionVerifyResult> {
  const res = await apiClient.post('/connect/actions/verify', {}, { timeout: 120_000 });
  return (res.data?.data ?? res.data) as ConnectActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx, honest 4xx or contract-ok). */
export function isConnectActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return (
    status.startsWith('2') ||
    status.startsWith('4') ||
    status.includes('honest') ||
    status.includes('contract-ok')
  );
}
