/**
 * admin-governance.ts — the platform "Governance & Access" editor contract
 * (served on :8078 under /studio/admin/governance/*). It is the SAME profile
 * machinery as per-app access, at platform scope: one `EntitlementSpec`
 * carries the whole 5-step flow (principals → app role → objects & baskets →
 * policies → review), previewed before save and run through
 * compile → approve (four-eyes) → apply → revoke.
 *
 * Nothing is applied for real without an explicit ACCOUNTADMIN confirm, and a
 * write / admin / approve grant requires a second approver (four-eyes).
 */

import apiClient from '@/lib/api-client';

export type PrincipalType = 'user' | 'role' | 'group';
export type AppRole = 'viewer' | 'editor' | 'approver' | 'admin';
export type ObjectRight = 'view' | 'edit' | 'delete';
export type FeatureLevel = 'view' | 'edit' | 'approve';

export interface EntitlementPrincipal {
  type: PrincipalType;
  name: string;
}
export interface EntitlementObject {
  fqn: string;
  rights: ObjectRight[];
}
export interface EntitlementRow {
  column?: string;
  operator?: string;
  values?: string[];
}
export interface EntitlementPolicies {
  rows?: EntitlementRow[];
  columns_masked?: string[];
  columns_encrypted?: string[];
  retention?: { column: string; days: number } | null;
}
export interface EntitlementFeature {
  key: string;
  level: FeatureLevel;
}

/** The whole 5-step flow as one object. */
export interface EntitlementSpec {
  name?: string;
  principals?: EntitlementPrincipal[];
  app_role?: AppRole;
  objects?: EntitlementObject[];
  policies?: EntitlementPolicies;
  features?: EntitlementFeature[];
}

export interface EntitlementItem extends EntitlementSpec {
  id?: string;
  /** draft | compiled | awaiting_approval | applied | revoked | … */
  state?: string;
  version?: number | null;
  created_by?: string | null;
  updated_at?: string | null;
}

export interface GovernanceSummary {
  principals_with_access?: number | null;
  active_policies?: number | null;
  protected_tables?: number | null;
  pending_approvals?: number | null;
  pending?: Array<Record<string, unknown>>;
  policy_compliance_pct?: number | null;
  entitlements?: Record<string, unknown>;
  method?: Record<string, unknown>;
}

export interface EntitlementsView {
  entitlements?: EntitlementItem[];
  features?: {
    features?: Array<{ key?: string; module?: string; name?: string; [k: string]: unknown }>;
    app_roles?: Record<AppRole, { grant_type?: string; template?: string }>;
  };
}

export interface EntitlementImpact {
  rows_accessible?: number | null;
  rows_hidden?: number | null;
  rows_accessible_pct?: number | null;
  columns_masked?: number | null;
  columns_encrypted?: number | null;
  write_access?: boolean;
  schema_changes?: boolean;
}

export interface EntitlementPreview {
  sample?: { columns?: string[]; rows?: unknown[][]; fqn?: string };
  impact?: EntitlementImpact;
  sql_preview?: string[];
  warnings?: string[];
  risk?: string;
  four_eyes?: Array<Record<string, unknown>>;
}

export interface EntitlementRunResult {
  id?: string;
  state?: string;
  status?: string;
  run_id?: string;
  mutations?: Array<Record<string, unknown>>;
  sql_preview?: string[];
  four_eyes_required?: boolean;
  [k: string]: unknown;
}

const BASE = '/studio/admin/governance';

export async function getGovernanceSummary(): Promise<GovernanceSummary> {
  const { data } = await apiClient.get<GovernanceSummary>(`${BASE}/summary`, { timeout: 60_000 });
  return data ?? {};
}

export async function listEntitlements(): Promise<EntitlementsView> {
  const { data } = await apiClient.get<EntitlementsView>(`${BASE}/entitlements`, { timeout: 60_000 });
  return data ?? {};
}

/** The « Preview & impact » — masked/hashed sample + impact, BEFORE any save. */
export async function previewEntitlement(body: {
  spec: EntitlementSpec;
  fqn?: string;
  rows?: number;
}): Promise<EntitlementPreview> {
  const { data } = await apiClient.post<EntitlementPreview>(
    `${BASE}/entitlements/preview`,
    { rows: 20, ...body },
    { timeout: 60_000 },
  );
  return data ?? {};
}

export async function createEntitlement(spec: EntitlementSpec): Promise<EntitlementItem> {
  const { data } = await apiClient.post<EntitlementItem>(`${BASE}/entitlements`, spec, { timeout: 60_000 });
  return data ?? {};
}

/** New version of an existing entitlement (409 if applied — revoke first). */
export async function updateEntitlement(id: string, spec: EntitlementSpec): Promise<EntitlementItem> {
  const { data } = await apiClient.put<EntitlementItem>(
    `${BASE}/entitlements/${encodeURIComponent(id)}`,
    spec,
    { timeout: 60_000 },
  );
  return data ?? {};
}

export async function compileEntitlement(id: string): Promise<EntitlementRunResult> {
  const { data } = await apiClient.post<EntitlementRunResult>(
    `${BASE}/entitlements/${encodeURIComponent(id)}/compile`,
    {},
    { timeout: 60_000 },
  );
  return data ?? {};
}

export async function approveEntitlement(
  id: string,
  body: { decision: 'approve' | 'reject'; note?: string },
): Promise<EntitlementRunResult> {
  const { data } = await apiClient.post<EntitlementRunResult>(
    `${BASE}/entitlements/${encodeURIComponent(id)}/approve`,
    body,
    { timeout: 60_000 },
  );
  return data ?? {};
}

export async function applyEntitlement(
  id: string,
  body: { confirm: boolean; mutation_ids?: string[] },
): Promise<EntitlementRunResult> {
  const { data } = await apiClient.post<EntitlementRunResult>(
    `${BASE}/entitlements/${encodeURIComponent(id)}/apply`,
    body,
    { timeout: 60_000 },
  );
  return data ?? {};
}

export async function revokeEntitlement(id: string, confirm: boolean): Promise<EntitlementRunResult> {
  const { data } = await apiClient.post<EntitlementRunResult>(
    `${BASE}/entitlements/${encodeURIComponent(id)}/revoke?confirm=${confirm ? 'true' : 'false'}`,
    {},
    { timeout: 60_000 },
  );
  return data ?? {};
}

/** A refusal rendered as a product answer (409 FOUR_EYES_REQUIRED /
 *  APPROVAL_PENDING, 422 policy clash, 403 …) — the code + message, never raw. */
export function governanceRefusal(e: unknown): { code?: string; message: string } | null {
  const anyE = e as { response?: { status?: number; data?: { detail?: unknown; message?: unknown } } };
  const status = anyE?.response?.status;
  if (status == null || status < 400) return null;
  const raw = anyE.response?.data;
  const detail =
    raw && typeof raw.detail === 'object' && raw.detail !== null
      ? (raw.detail as Record<string, unknown>)
      : (raw as Record<string, unknown> | undefined);
  const code = detail?.error_code ?? detail?.code;
  const message =
    (typeof detail?.message === 'string' && detail.message) ||
    (status === 409 ? 'A second approver is required (four-eyes).' : 'The action was refused.');
  return { code: code ? String(code) : undefined, message: String(message) };
}
