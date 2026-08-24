/**
 * Admin Action Catalog — platform-admin capabilities as governed actions.
 * Backend: GET /api/administration/actions (registry-in-tables,
 * EVENT_STORE.ADMIN_ACTION_CATALOG), POST /api/administration/actions/verify.
 * The Administration hub's Actions tab renders labels / why / gating / verified
 * from this registry — the same pattern as the E&D and AI action catalogs.
 */
import apiClient from '@/lib/api-client';

export interface AdminActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
}

export interface AdminAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: AdminActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface AdminActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, AdminAction[]>;
  actions: AdminAction[];
}

export interface AdminActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  results: { action_id: string; status: string }[];
}

export async function getAdminActions(): Promise<AdminActionCatalog> {
  const res = await apiClient.get('/api/administration/actions', { timeout: 180_000 });
  return (res.data?.data ?? res.data) as AdminActionCatalog;
}

export async function verifyAdminActions(): Promise<AdminActionVerifyResult> {
  const res = await apiClient.post('/api/administration/actions/verify', {}, { timeout: 180_000 });
  return (res.data?.data ?? res.data) as AdminActionVerifyResult;
}

/** True when a verify stamp reflects a healthy contract (2xx or honest 4xx). */
export function isAdminActionVerified(status?: string | null): boolean {
  if (!status) return false;
  // 2xx/4xx = live-probed OK/honest; 'contract-ok' = mutation whose route is
  // registered but is not auto-run (verified by contract, not execution).
  return status.startsWith('2') || status.startsWith('4')
    || status.includes('honest') || status.includes('contract-ok');
}
