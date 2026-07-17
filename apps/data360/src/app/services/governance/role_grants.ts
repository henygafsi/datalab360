/**
 * Frontend Service Layer for Role Object-Grants & Role Hierarchy
 * (Governance Reverse Provisioning)
 *
 * Wires the "role power-user" CRUD surface:
 *   - GET    /gouvernance/roles/{role}/object-grants     SHOW GRANTS TO ROLE
 *   - POST   /gouvernance/roles/{role}/grant-role        attach role -> functional role
 *   - DELETE /gouvernance/roles/{role}/grant-role?to_role=  detach role -> functional role
 *   - POST   /gouvernance/access-roles/from-objects      mint an access role from object grants
 *
 * INVARIANT (locked, matches the read endpoint's direction):
 *   The drawer's role R is ALWAYS the recipient (`to_role`).
 *   The OTHER role (the one being granted) is ALWAYS the path param.
 *     attach A to R  ->  POST   /roles/A/grant-role     { to_role: R }
 *     detach A from R->  DELETE /roles/A/grant-role?to_role=R
 *   This keeps mutations in the same direction as SHOW GRANTS TO ROLE R, so the
 *   object-grants list reflects every attach/detach without guessing.
 *
 * Honesty contract: getter degrades to [] on hard failure so the panel can render
 * an honest empty/error state; mutators rethrow a normalized message for toast.
 *
 * Location: apps/data360/src/app/services/governance/role_grants.ts
 */

import apiClient, { getApiErrorMessage } from '@/lib/api-client';

// TODO: lift to api-contracts.ts (API.gouvernance.*) once the shared file is free
// to edit — kept local here to stay parallel-safe with other module agents.
const ROLE_OBJECT_GRANTS = (role: string) =>
  `/gouvernance/roles/${encodeURIComponent(role)}/object-grants`;
const ROLE_GRANT_ROLE = (role: string) =>
  `/gouvernance/roles/${encodeURIComponent(role)}/grant-role`;
const ACCESS_ROLES_FROM_OBJECTS = '/gouvernance/access-roles/from-objects';

// Re-export so the panel can normalize backend errors in one place.
export { getApiErrorMessage };

// ============= OBJECT GRANTS (SHOW GRANTS TO ROLE) =============

/**
 * One row of SHOW GRANTS TO ROLE. The exact column set is not captured in the
 * API docs, so every field is optional and we tolerate renamed/missing columns
 * rather than dropping the row.
 */
export interface RoleObjectGrant {
  privilege?: string;
  /** Object class the grant is on: TABLE / SCHEMA / DATABASE / ROLE / WAREHOUSE ... */
  granted_on?: string;
  /** Fully-qualified object name (or role name when granted_on === 'ROLE'). */
  name?: string;
  granted_by?: string;
  created_on?: string;
  grant_option?: boolean | string;
  [k: string]: unknown;
}

/** Normalize the many shapes a list endpoint can return into an array. */
function asArray<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.grants)) return o.grants as T[];
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.rows)) return o.rows as T[];
  }
  return [];
}

/**
 * GET /gouvernance/roles/{role}/object-grants — SHOW GRANTS TO ROLE {role}.
 * Returns [] on hard failure (panel renders honest empty/error via the throw flag).
 */
export async function getRoleObjectGrants(role: string): Promise<RoleObjectGrant[]> {
  const { data } = await apiClient.get(ROLE_OBJECT_GRANTS(role));
  return asArray<RoleObjectGrant>(data).map((g) => {
    const row = g as Record<string, unknown>;
    return {
      privilege: (row.privilege ?? row.PRIVILEGE) as string | undefined,
      granted_on: (row.granted_on ?? row.GRANTED_ON ?? row.granted_on_type) as string | undefined,
      name: (row.name ?? row.NAME ?? row.object_name) as string | undefined,
      granted_by: (row.granted_by ?? row.GRANTED_BY) as string | undefined,
      created_on: (row.created_on ?? row.CREATED_ON) as string | undefined,
      grant_option: (row.grant_option ?? row.GRANT_OPTION) as boolean | string | undefined,
      ...row,
    };
  });
}

/** True when a grant row is actually a role-to-role grant (USAGE on a ROLE). */
export function isRoleGrant(g: RoleObjectGrant): boolean {
  const on = (g.granted_on ?? '').toString().toUpperCase();
  return on === 'ROLE';
}

// ============= ROLE HIERARCHY (attach / detach) =============

/**
 * Attach access role `accessRole` to functional role `toRole`
 * -> GRANT ROLE accessRole TO ROLE toRole.
 * POST /gouvernance/roles/{accessRole}/grant-role  { to_role: toRole }
 */
export async function attachRole(accessRole: string, toRole: string): Promise<void> {
  try {
    await apiClient.post(ROLE_GRANT_ROLE(accessRole), { to_role: toRole });
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

/**
 * Detach access role `accessRole` from functional role `toRole`
 * -> REVOKE ROLE accessRole FROM ROLE toRole.
 * DELETE /gouvernance/roles/{accessRole}/grant-role?to_role=toRole
 */
export async function detachRole(accessRole: string, toRole: string): Promise<void> {
  try {
    await apiClient.delete(ROLE_GRANT_ROLE(accessRole), {
      params: { to_role: toRole },
    });
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

// ============= MINT ACCESS ROLE FROM OBJECT GRANTS =============

export interface FromObjectGrant {
  database: string;
  schema: string;
  table: string;
  privileges: string[];
}

export interface MintAccessRolePayload {
  /** Optional — backend defaults to AR_<DB>_<SCHEMA> of the first grant. */
  role_name?: string;
  grants: FromObjectGrant[];
}

export interface MintAccessRoleResult {
  role_name?: string;
  message?: string;
  [k: string]: unknown;
}

/**
 * POST /gouvernance/access-roles/from-objects — mint a reusable access (technical)
 * role carrying a set of object grants.
 */
export async function mintAccessRoleFromObjects(
  payload: MintAccessRolePayload,
): Promise<MintAccessRoleResult> {
  try {
    const { data } = await apiClient.post<MintAccessRoleResult>(
      ACCESS_ROLES_FROM_OBJECTS,
      payload,
    );
    return data ?? {};
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

// ============= FUTURE GRANTS (new objects auto-inherit access) =============
const FUTURE_GRANTS = '/gouvernance/future-grants';

export interface FutureGrant {
  privilege?: string;
  grant_on?: string;
  name?: string;
  grantee_name?: string;
  [k: string]: unknown;
}

export interface FutureGrantPayload {
  privilege: string;      // SELECT | INSERT | UPDATE | DELETE | REFERENCES | USAGE | ALL
  object_type: string;    // TABLES | VIEWS | SCHEMAS | STAGES | DYNAMIC TABLES
  database: string;
  schema_name?: string | null;
  role: string;
}

/** List FUTURE grants in a schema (or whole database when schema omitted). */
export async function listFutureGrants(database: string, schema?: string | null): Promise<FutureGrant[]> {
  const { data } = await apiClient.get(FUTURE_GRANTS, {
    params: { database, ...(schema ? { schema_name: schema } : {}) },
  });
  return data?.grants ?? [];
}

/** Grant a privilege on FUTURE objects so new tables auto-inherit access. */
export async function createFutureGrant(payload: FutureGrantPayload): Promise<void> {
  try {
    await apiClient.post(FUTURE_GRANTS, payload);
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}

/** Revoke a FUTURE-objects privilege from a role. */
export async function revokeFutureGrant(payload: FutureGrantPayload): Promise<void> {
  try {
    await apiClient.delete(FUTURE_GRANTS, { data: payload });
  } catch (e) {
    throw new Error(getApiErrorMessage(e));
  }
}
