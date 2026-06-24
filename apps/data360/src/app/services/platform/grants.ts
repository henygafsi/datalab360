'use client';

/**
 * platform/grants — page/role grant management (cross-page "Manage access").
 *
 * Thin typed wrapper over the validated, super-admin-gated backend surface
 * `/api/platform/grants/*` (adds NO backend routes). Uses the shared `apiClient`
 * and the `API.platform.grants.*` path constants in `src/lib/api-contracts.ts`.
 *
 * Read/refetch discipline (per backend guidance):
 *   - List + post-mutation refresh use GET /grants (fresh right after a revoke).
 *   - GET /grants/role/{role} can serve STALE data post-revoke — NOT used here.
 *
 * Writes are super-admin only (ACCOUNTADMIN / ORGADMIN / SECURITYADMIN); the
 * backend 403s otherwise and we surface that honestly via getApiErrorMessage.
 */
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ── Super-admin gate ─────────────────────────────────────────────────────────

/**
 * Roles the backend allows to WRITE grants. NOTE: deliberately NOT the shared
 * `D360_ADMIN_ROLES` (which is ACCOUNTADMIN/SYSADMIN/SECURITYADMIN) — the grant
 * surface gates on ORGADMIN, not SYSADMIN.
 */
export const GRANT_ADMIN_ROLES = ['ACCOUNTADMIN', 'ORGADMIN', 'SECURITYADMIN'] as const;

/** True when `role` may write grants (case-insensitive). */
export function canManageGrants(role?: string | null): boolean {
  return GRANT_ADMIN_ROLES.includes((role ?? '').toUpperCase() as (typeof GRANT_ADMIN_ROLES)[number]);
}

// ── Domain types — mirror the validated backend payloads ─────────────────────

/** One page/role grant row (GET /grants → items[]). */
export interface PageGrant {
  grant_id: string;
  role: string;
  page: string;
  module: string;
  tab: string | null;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface ListGrantsResponse {
  items: PageGrant[];
  count: number;
}

/** One user→role binding (GET /grants/users). Shape is defensive: backend may
 *  return a flat list keyed slightly differently across deployments. */
export interface UserRoleBinding {
  username: string;
  role: string;
  granted_at?: string | null;
  granted_by?: string | null;
}

export interface RevokeResult {
  revoked: number;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * GET /api/platform/grants?role=&page=&module= — list grants (fresh after a
 * revoke). Tolerates a bare-array or {items,count} envelope.
 */
export async function listGrants(opts?: {
  role?: string;
  page?: string;
  module?: string;
}): Promise<ListGrantsResponse> {
  const res = await apiClient.get<ListGrantsResponse | PageGrant[]>(API.platform.grants.list(opts));
  const body = res.data;
  if (Array.isArray(body)) return { items: body, count: body.length };
  const items = Array.isArray(body?.items) ? body.items : [];
  return { items, count: typeof body?.count === 'number' ? body.count : items.length };
}

/**
 * GET /api/platform/grants/users?username= — user→role bindings.
 * Defensive across {items}/{users}/bare-array shapes.
 */
export async function listUserGrants(username?: string): Promise<UserRoleBinding[]> {
  const res = await apiClient.get<unknown>(API.platform.grants.users(username));
  const body = res.data as { items?: UserRoleBinding[]; users?: UserRoleBinding[] } | UserRoleBinding[];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.users)) return body.users;
  return [];
}

// ── Writes (super-admin only — backend 403s otherwise) ───────────────────────

/** POST /api/platform/grants — grant a role access to a page. */
export async function grantPage(body: {
  role: string;
  page: string;
  module: string;
  tab?: string;
}): Promise<PageGrant | void> {
  const res = await apiClient.post<PageGrant>(API.platform.grants.base(), body);
  return res.data;
}

/**
 * DELETE /api/platform/grants — revoke. Always pass `page` (and `module`) so we
 * revoke THIS page only; omitting `page` revokes the role's whole module access.
 */
export async function revokePage(body: {
  role: string;
  module: string;
  page?: string;
  tab?: string;
}): Promise<RevokeResult> {
  const res = await apiClient.delete<RevokeResult>(API.platform.grants.base(), { data: body });
  return res.data ?? { revoked: 0 };
}

/** POST /api/platform/grants/users — bind a user to a role. */
export async function bindUser(body: { username: string; role: string }): Promise<void> {
  await apiClient.post(API.platform.grants.users(), body);
}

/** DELETE /api/platform/grants/users — unbind a user from a role. */
export async function unbindUser(body: { username: string; role: string }): Promise<void> {
  await apiClient.delete(API.platform.grants.users(), { data: body });
}

/** POST /api/platform/grants/actions — grant/revoke a role one action on a page. */
export async function grantAction(body: {
  role: string;
  action_key: string;
  module: string;
  page: string;
  can_execute: boolean;
}): Promise<void> {
  await apiClient.post(API.platform.grants.actions(), body);
}

/** POST /api/platform/grants/policies — set a role's policy read access. */
export async function grantPolicy(body: {
  role: string;
  policy_type: string;
  can: { read: boolean };
  policy_name?: string;
}): Promise<void> {
  await apiClient.post(API.platform.grants.policies(), body);
}

export { getApiErrorMessage };
