/**
 * AI Action Catalog — "all capabilities as actions".
 * Backend: GET /cortex/actions (registry-in-tables, EVENT_STORE.AI_ACTION_CATALOG),
 * POST /cortex/actions/verify (self-audit that stamps VERIFIED_AT/STATUS on the
 * GET-probeable rows). The agentic command surface renders labels / why / gating
 * / verified-✓ from this registry instead of hardcoding a wall of tabs.
 */
import apiClient from '@/lib/api-client';
import { toServiceError } from '../_errors';

export interface AiActionParam {
  name: string;
  in: 'query' | 'body' | 'path';
  required?: boolean;
  enum?: string[];
  format?: string;
}

export interface AiAction {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  params: AiActionParam[];
  rbac: string;
  probe: 'get' | 'none';
  seed_version?: number;
  verified_at?: string | null;
  verified_status?: string | null;
}

export interface AiActionCatalog {
  seed_version: number;
  fingerprint: string;
  count: number;
  areas: Record<string, AiAction[]>;
  actions: AiAction[];
}

export interface AiActionVerifyResult {
  probed: number;
  healthy_contracts: number;
  results: { action_id: string; status: string }[];
}

/** Fetch the full AI action catalog (grouped by area). */
export async function getCortexActions(): Promise<AiActionCatalog> {
  try {
    const res = await apiClient.get('/cortex/actions');
    return (res.data?.data ?? res.data) as AiActionCatalog;
  } catch (err) {
    throw toServiceError(err, 'getCortexActions');
  }
}

/** Replay every GET-probeable action live and stamp verified status on the rows. */
export async function verifyCortexActions(): Promise<AiActionVerifyResult> {
  try {
    const res = await apiClient.post('/cortex/actions/verify', {});
    return (res.data?.data ?? res.data) as AiActionVerifyResult;
  } catch (err) {
    throw toServiceError(err, 'verifyCortexActions');
  }
}

/** True when a verify stamp reflects a healthy contract (2xx or honest 4xx). */
export function isActionVerified(status?: string | null): boolean {
  if (!status) return false;
  return status.startsWith('2') || status.startsWith('4') || status.includes('honest');
}
