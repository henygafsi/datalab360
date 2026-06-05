/**
 * Gouvernance Service - Fetch Roles
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { RoleTableDataType } from '@/app/shared/governance/roles/table';

/**
 * Fetches the list of roles from the backend API.
 * @returns A promise that resolves to an array of RoleTableDataType.
 */
export async function getRoles(): Promise<RoleTableDataType[]> {
  try {
    const response = await apiClient.get('/gouvernance/roles');
    const raw = response.data;
    // Support both: direct array or paginated { data: [...], pagination: {...} }
    const data = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    const safeData = data;

    const roles: RoleTableDataType[] = safeData.map((role: any) => ({
      id: role.name || crypto.randomUUID().toString(),
      role: role.name || 'N/A',
      numberOfGrants: role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
      owner: role.owner || '',
      assignedUsers: role.assigned_to_users || 0,
    }));

    return roles;
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
}

/**
 * Adds a new role to the backend.
 * @param roleName The name of the role to add.
 */
export async function addRole(roleName: string): Promise<string> {
  try {
    const response = await apiClient.post('/gouvernance/add-role', { role_name: roleName });
    return response.data;
  } catch (error) {
    console.error('Error adding role:', error);
    throw error;
  }
}

/**
 * Fetches roles for a specific user from the backend.
 * @param username The username to fetch roles for.
 */
export async function getRolesForUser(username: string): Promise<string[]> {
  try {
    const response = await apiClient.get(`/gouvernance/roles-for-user/${username}`);
    return Array.isArray(response.data) ? (response.data as string[]) : [];
  } catch (error) {
    console.error('Error fetching roles for user:', error);
    throw error;
  }
}

/**
 * Fetches details for a specific role.
 * @param roleName The name of the role to fetch.
 */
export async function getRoleDetails(roleName: string): Promise<RoleTableDataType> {
  try {
    const response = await apiClient.get(`/gouvernance/roles/${roleName}`);
    const role = response.data;

    return {
      id: role.role_name || role.name || roleName,
      role: role.role_name || role.name || roleName,
      numberOfGrants: role.total_grants || role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
    };
  } catch (error) {
    console.error('Error fetching role details:', error);
    throw error;
  }
}

/**
 * Fetches role data for editing.
 * @param roleName The name of the role to fetch for editing.
 */
export async function getRoleForEdit(roleName: string): Promise<RoleTableDataType> {
  try {
    const response = await apiClient.get(`/gouvernance/roles/edit/${roleName}`);
    const role = response.data;

    return {
      id: role.role_name || role.name || roleName,
      role: role.role_name || role.name || roleName,
      numberOfGrants: role.total_grants || role.granted_roles || 0,
      comment: role.comment || '',
      createdOn: role.created_on || '',
    };
  } catch (error) {
    console.error('Error fetching role for edit:', error);
    throw error;
  }
}

/**
 * Deletes a role from Snowflake.
 * This will also revoke the role from all users who have it assigned.
 * @param roleName The name of the role to delete.
 * @returns A promise with the delete operation result including affected users.
 */
export async function deleteRole(roleName: string): Promise<{
  message: string;
  role_name: string;
  revoked_from_users: number;
  revoked_grants: number;
}> {
  try {
    const response = await apiClient.delete('/gouvernance/drop-role', {
      data: { role_name: roleName }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting role:', error);
    throw error;
  }
}

/**
 * Deletes multiple roles from Snowflake in batch.
 * @param roleNames Array of role names to delete.
 * @returns A promise with batch delete results.
 */
export async function deleteMultipleRoles(roleNames: string[]): Promise<{
  message: string;
  deleted: number;
  failed: { role_name: string; error: string }[];
}> {
  try {
    const response = await apiClient.post('/gouvernance/drop-roles-batch', {
      role_names: roleNames
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting multiple roles:', error);
    throw error;
  }
}

/**
 * Updates role information in Snowflake.
 * @param roleName The name of the role to update.
 * @param data The fields to update (comment, modules, etc.).
 * @returns A promise with the update operation result.
 */
export async function updateRole(
  roleName: string,
  data: {
    comment?: string;
    modules?: string[];
  }
): Promise<{
  status: string;
  role_name: string;
  updated_fields: string[];
}> {
  try {
    const response = await apiClient.put(`/gouvernance/roles/${roleName}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating role:', error);
    throw error;
  }
}

// ===========================================================================
// D360 GRANULAR ROLES (page/module/action-level RBAC)
// Backend routes:
//   GET  /gouvernance/d360-roles                  — list system + custom roles
//   POST /gouvernance/d360-roles                  — create custom role (D360RoleCreate)
//   GET  /gouvernance/d360-roles/templates        — list standard role templates
//   PUT  /gouvernance/d360-roles/{role_name}      — update role metadata (D360RoleUpdate)
//   DELETE /gouvernance/d360-roles/{role_name}    — delete custom role
// ===========================================================================

/** A D360 granular role as returned by the backend (snake_case, may vary by deploy). */
export interface D360Role {
  role_name: string;
  display_name?: string | null;
  description?: string | null;
  permission_count?: number | null;
  is_system?: boolean | null;
  created_at?: string | null;
}

/** A standard role template that can seed a new custom role via `template_from`. */
export interface D360RoleTemplate {
  name: string;
  display_name?: string | null;
  description?: string | null;
  permission_count?: number | null;
}

/** Payload for POST /gouvernance/d360-roles (D360RoleCreate). */
export interface D360RoleCreatePayload {
  role_name: string;
  display_name?: string;
  description?: string;
  /** Name of a template to clone permissions from (optional). */
  template_from?: string;
}

/** Payload for PUT /gouvernance/d360-roles/{role_name} (D360RoleUpdate). */
export interface D360RoleUpdatePayload {
  display_name?: string;
  description?: string;
}

/** Normalize a backend role record (handles both snake_case and UPPER_CASE keys). */
function normalizeD360Role(raw: any): D360Role {
  return {
    role_name: raw?.role_name ?? raw?.ROLE_NAME ?? '',
    display_name: raw?.display_name ?? raw?.DISPLAY_NAME ?? null,
    description: raw?.description ?? raw?.DESCRIPTION ?? null,
    permission_count: raw?.permission_count ?? raw?.PERMISSION_COUNT ?? null,
    is_system: raw?.is_system ?? raw?.IS_SYSTEM ?? null,
    created_at: raw?.created_at ?? raw?.CREATED_AT ?? null,
  };
}

/**
 * List all D360 roles (system + custom).
 * GET /gouvernance/d360-roles
 */
export async function getD360Roles(): Promise<D360Role[]> {
  const response = await apiClient.get('/gouvernance/d360-roles');
  const d = response.data ?? {};
  // Backend returns either an array, {roles}/{data}, or {system_roles, custom_roles}.
  const raw: any[] = Array.isArray(d)
    ? d
    : [
        ...(Array.isArray(d.roles) ? d.roles : []),
        ...(Array.isArray(d.data) ? d.data : []),
        ...(Array.isArray(d.system_roles) ? d.system_roles : []),
        ...(Array.isArray(d.custom_roles) ? d.custom_roles : []),
      ];
  return raw.map(normalizeD360Role);
}

/**
 * List standard role templates.
 * GET /gouvernance/d360-roles/templates
 */
export async function getD360RoleTemplates(): Promise<D360RoleTemplate[]> {
  const response = await apiClient.get('/gouvernance/d360-roles/templates');
  const raw = response.data?.templates ?? response.data?.data ?? response.data;
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any) => ({
    name: t?.name ?? t?.TEMPLATE_NAME ?? t?.template_name ?? '',
    display_name: t?.display_name ?? t?.DISPLAY_NAME ?? null,
    description: t?.description ?? t?.DESCRIPTION ?? null,
    permission_count: t?.permission_count ?? t?.PERMISSION_COUNT ?? null,
  }));
}

/**
 * Create a custom D360 role (optionally seeded from a template).
 * POST /gouvernance/d360-roles
 */
export async function createD360Role(payload: D360RoleCreatePayload): Promise<D360Role> {
  const response = await apiClient.post('/gouvernance/d360-roles', payload);
  const raw = response.data?.role ?? response.data?.data ?? response.data;
  return normalizeD360Role(raw);
}

/**
 * Update a custom D360 role's metadata.
 * PUT /gouvernance/d360-roles/{role_name}
 */
export async function updateD360Role(
  roleName: string,
  payload: D360RoleUpdatePayload
): Promise<D360Role> {
  const response = await apiClient.put(
    `/gouvernance/d360-roles/${encodeURIComponent(roleName)}`,
    payload
  );
  const raw = response.data?.role ?? response.data?.data ?? response.data;
  return normalizeD360Role(raw);
}

/**
 * Delete a custom D360 role.
 * DELETE /gouvernance/d360-roles/{role_name}
 */
export async function deleteD360Role(roleName: string): Promise<{ message: string }> {
  const response = await apiClient.delete(
    `/gouvernance/d360-roles/${encodeURIComponent(roleName)}`
  );
  return response.data;
}

// ===========================================================================
// D360 ACTION-RBAC — granular permission matrix (module:page:tab:action × role)
// Backend routes (System 2 — the "target enforced path"):
//   GET  /gouvernance/d360-roles/action-registry            — full grantable catalog
//   GET  /gouvernance/d360-roles/my-permissions             — caller's effective set
//   GET  /gouvernance/d360-roles/{role_name}/permissions    — one role's matrix
//   PUT  /gouvernance/d360-roles/{role_name}/permissions    — wholesale replace (custom roles only)
//   POST /gouvernance/d360-roles/{role_name}/apply-template — copy a system template onto a custom role
//
// NOTE — PROJECT_ID: the backend `PermissionBulkSet` model has NO project_id field
// yet (account-global only). The `projectId?` params below are forward-compat
// placeholders and are intentionally NOT sent until the backend migration lands.
// ===========================================================================

/** A single grantable action coordinate (one cell of the matrix). */
export interface ActionRegistryEntry {
  module: string;
  page: string;
  tab: string;
  action: string;
}

/** Nested catalog shape: module → { label, pages: { page → { label, tabs[], actions[] }}}. */
export interface ActionRegistryModule {
  label: string;
  pages: Record<
    string,
    { label?: string; tabs: string[]; actions: string[] }
  >;
}

/** Response of GET /gouvernance/d360-roles/action-registry. */
export interface ActionRegistryResponse {
  /** module_key → human label. */
  modules: Record<string, string>;
  /** Full nested registry (module → pages → {tabs, actions}). */
  registry: Record<string, ActionRegistryModule>;
  /** Flat list of every (module, page, tab, action) coordinate. */
  actions: ActionRegistryEntry[];
  action_count: number;
}

/** One ALLOW/DENY permission row. */
export interface RolePermission {
  module: string;
  page: string;
  tab: string;
  action: string;
  access_level: 'ALLOW' | 'DENY' | string;
}

/** Response of GET /gouvernance/d360-roles/{role}/permissions. */
export interface RolePermissionsResponse {
  role_name: string;
  is_system: boolean;
  permissions: RolePermission[];
  allow: RolePermission[];
  deny: RolePermission[];
  permission_count: number;
  /** 'db' = stored rows, 'matrix' = derived from the hardcoded system template. */
  source: 'db' | 'matrix' | string;
  /** True when the backing table is absent in this environment. */
  uninitialized: boolean;
}

/** Response of GET /gouvernance/d360-roles/my-permissions. */
export interface MyPermissionsResponse {
  username: string;
  snowflake_role: string;
  d360_role: string;
  permissions: RolePermission[];
  permission_count: number;
  source: 'db' | 'matrix' | string;
  uninitialized: boolean;
}

/**
 * Fetch the full grantable-action catalog (module → page → tab → action).
 * Static structure on the backend (long TTL) — used to render the permission grid.
 * GET /gouvernance/d360-roles/action-registry
 */
export async function getActionRegistry(): Promise<ActionRegistryResponse> {
  const response = await apiClient.get('/gouvernance/d360-roles/action-registry');
  const d = response.data ?? {};
  return {
    modules: d.modules ?? {},
    registry: d.registry ?? {},
    actions: Array.isArray(d.actions) ? d.actions : [],
    action_count: d.action_count ?? (Array.isArray(d.actions) ? d.actions.length : 0),
  };
}

/**
 * Resolve the CALLING user's effective Data360 action set (mirrors runtime
 * enforcement: Snowflake role → highest-priority D360 role → DB-first allow-set
 * with the hardcoded template as fallback).
 * GET /gouvernance/d360-roles/my-permissions
 */
export async function getMyPermissions(): Promise<MyPermissionsResponse> {
  const response = await apiClient.get('/gouvernance/d360-roles/my-permissions');
  const d = response.data ?? {};
  return {
    username: d.username ?? '',
    snowflake_role: d.snowflake_role ?? '',
    d360_role: d.d360_role ?? '',
    permissions: Array.isArray(d.permissions) ? d.permissions : [],
    permission_count: d.permission_count ?? 0,
    source: d.source ?? 'matrix',
    uninitialized: Boolean(d.uninitialized),
  };
}

/**
 * Fetch a single role's full module→page→tab→action allow/deny matrix.
 * System roles return a template-derived matrix (source: 'matrix'); custom roles
 * return their stored rows (source: 'db').
 * GET /gouvernance/d360-roles/{role_name}/permissions
 */
export async function getRolePermissions(
  roleName: string
): Promise<RolePermissionsResponse> {
  const response = await apiClient.get(
    `/gouvernance/d360-roles/${encodeURIComponent(roleName)}/permissions`
  );
  const d = response.data ?? {};
  return {
    role_name: d.role_name ?? roleName,
    is_system: Boolean(d.is_system),
    permissions: Array.isArray(d.permissions) ? d.permissions : [],
    allow: Array.isArray(d.allow) ? d.allow : [],
    deny: Array.isArray(d.deny) ? d.deny : [],
    permission_count: d.permission_count ?? 0,
    source: d.source ?? 'db',
    uninitialized: Boolean(d.uninitialized),
  };
}

/**
 * Replace a CUSTOM role's permission matrix wholesale (the backend DELETEs then
 * re-INSERTs the supplied set — there is no per-cell PATCH). Blocked for system
 * roles (403) and requires an accountadmin Snowflake role.
 *
 * @param projectId Forward-compat only — NOT sent to the backend yet (the
 *   `PermissionBulkSet` model is account-global). Pending PROJECT_ID migration.
 * PUT /gouvernance/d360-roles/{role_name}/permissions
 */
export async function setRolePermissions(
  roleName: string,
  permissions: RolePermission[],
  projectId?: string | null
): Promise<{ success: boolean; role_name: string; permissions_set: number }> {
  // projectId is intentionally ignored until the backend accepts PROJECT_ID.
  void projectId;
  const response = await apiClient.put(
    `/gouvernance/d360-roles/${encodeURIComponent(roleName)}/permissions`,
    {
      permissions: permissions.map((p) => ({
        module: p.module,
        page: p.page,
        tab: p.tab ?? '*',
        action: p.action,
        access_level: (p.access_level || 'ALLOW').toUpperCase(),
      })),
    }
  );
  return response.data;
}

/**
 * Copy a system template's action set onto a custom role.
 * mode='replace' clears existing rows first; mode='merge' appends.
 * Blocked for system targets (403); requires an accountadmin Snowflake role.
 * POST /gouvernance/d360-roles/{role_name}/apply-template
 */
export async function applyTemplate(
  roleName: string,
  template: string,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{
  success: boolean;
  role_name: string;
  template: string;
  mode: string;
  permissions_applied?: number;
}> {
  const response = await apiClient.post(
    `/gouvernance/d360-roles/${encodeURIComponent(roleName)}/apply-template`,
    { template, mode }
  );
  return response.data;
}
