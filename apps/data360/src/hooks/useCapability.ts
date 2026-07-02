'use client';

/**
 * useCapability — one hook that answers "may the current user use THIS
 * capability, and how should the UI react if not?".
 *
 * It combines, per the CAPABILITIES metadata map (src/config/capabilities.ts):
 *   1. Action-RBAC        — useCanPerform(module, action)
 *                           (GET /gouvernance/d360-roles/my-permissions)
 *   2. Module posture     — GET /gouvernance/d360-roles/my-module-access
 *                           ({module: read|write|none}) when the map requires
 *                           coarse write access,
 *   3. Project role       — GET /projects/{id}/contributors (the EXISTING
 *                           endpoint already wired in projectsApi) resolved to
 *                           the caller's owner|editor|viewer role, with the
 *                           backend's creator-counts-as-owner parity
 *                           (projects/services.py get_my_role), and
 *   4. Account role       — raw substring check against the session role string
 *                           (mirrors backend `any(r in role for r in …)` gates).
 *
 * ADDITIVE layer: existing useCanPerform call sites are untouched — use this
 * hook (or <CapabilityGate>) on new/updated surfaces.
 *
 * Fail-open policy mirrors useCanPerform: a HARD fetch failure never locks an
 * admin out (the backend gates cited in capabilities.ts still enforce). A
 * missing contributor row, however, is an honest DENY for project-role
 * capabilities — that is real data, not an error.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CAPABILITIES,
  type CapabilityDef,
  type CapabilityKey,
  type ProjectRole,
  type UiBehavior,
} from '@/config/capabilities';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useAuth } from '@/hooks/useAuth';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  getMyModuleAccess,
  type ModuleAccessLevel,
} from '@/app/services/governance/fetch_roles';
import { getProject, listContributors } from '@/app/services/api/projectsApi';

// ─────────────────────────────────────────────────────────────────────────────
// Shared caches (module-level, mirroring the useCanPerform pattern so a page
// full of gates makes one my-module-access call and one contributors call per
// project).
// ─────────────────────────────────────────────────────────────────────────────

const subscribers = new Set<() => void>();
function notify() {
  subscribers.forEach((fn) => fn());
}

// -- my-module-access singleton ----------------------------------------------
let moduleAccessPromise: Promise<void> | null = null;
let moduleAccessData: Record<string, ModuleAccessLevel> | null = null;
let moduleAccessError = false;

function loadModuleAccess(): void {
  if (moduleAccessPromise) return;
  moduleAccessError = false;
  moduleAccessPromise = getMyModuleAccess()
    .then((res) => {
      moduleAccessData = res.modules ?? {};
      notify();
    })
    .catch(() => {
      moduleAccessData = null;
      moduleAccessError = true; // hard error → fail open below
      notify();
    });
}

// -- per-project contributor-role cache --------------------------------------
type RoleEntry = {
  status: 'loading' | 'ready' | 'error';
  /** Resolved role, null = signed-in user is NOT a contributor (honest deny). */
  role: ProjectRole | null;
};
const projectRoleCache = new Map<string, RoleEntry>();

function roleCacheKey(projectId: string, username: string): string {
  return `${projectId}::${username.toUpperCase()}`;
}

function normalizeRole(raw: unknown): ProjectRole | null {
  const r = String(raw ?? '').toLowerCase();
  return r === 'owner' || r === 'editor' || r === 'viewer' ? r : null;
}

async function resolveProjectRole(
  projectId: string,
  username: string,
): Promise<ProjectRole | null> {
  const uname = username.toUpperCase();
  const rows = await listContributors(projectId);
  const mine = rows.find((r) => (r.username || '').toUpperCase() === uname);
  if (mine) return normalizeRole(mine.role);
  // Creator-counts-as-owner parity with backend get_my_role
  // (app/modules/projects/services.py — creator resolves to owner even
  // without a contributor row). Best-effort: a failure here just means
  // "no role", the contributors read above already succeeded.
  try {
    const project = await getProject(projectId);
    if ((project?.created_by || '').toUpperCase() === uname) return 'owner';
  } catch {
    /* keep the contributors verdict */
  }
  return null;
}

function ensureProjectRole(projectId: string, username: string): void {
  const key = roleCacheKey(projectId, username);
  if (projectRoleCache.has(key)) return;
  projectRoleCache.set(key, { status: 'loading', role: null });
  resolveProjectRole(projectId, username)
    .then((role) => {
      projectRoleCache.set(key, { status: 'ready', role });
      notify();
    })
    .catch(() => {
      projectRoleCache.set(key, { status: 'error', role: null });
      notify();
    });
}

/**
 * Drop the cached project role(s) — call after contributor edits so gates
 * re-resolve (all projects when no id is given).
 */
export function invalidateProjectRoles(projectId?: string) {
  if (!projectId) {
    projectRoleCache.clear();
  } else {
    Array.from(projectRoleCache.keys())
      .filter((k) => k.startsWith(`${projectId}::`))
      .forEach((k) => projectRoleCache.delete(k));
  }
  notify();
}

// Account-role substring check — mirrors backend
// `any(r in role for r in (...))` (requirements.py:45, tracking.py:44).
function hasAccountRole(sessionRole: string, tokens: readonly string[]): boolean {
  const role = (sessionRole || '').toUpperCase();
  return tokens.some((t) => role.includes(t.toUpperCase()));
}

const ADMIN_ACCOUNT_TOKENS = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityResult {
  /** True if every requirement in the map entry is satisfied (or fail-open). */
  allowed: boolean;
  /** True while any required source is still resolving. */
  loading: boolean;
  /** True when a permission source hard-failed (we then fail open, like useCanPerform). */
  error: boolean;
  /** How the UI should react when not allowed — from the capability map. */
  behavior: UiBehavior;
  /** Human-readable denial reason (null when allowed / loading). */
  reason: string | null;
  /** The caller's resolved role on the relevant project (null = not a contributor / N-A). */
  projectRole: ProjectRole | null;
  /** The caller's resolved application role (from my-permissions), for tooltips. */
  d360Role: string | null;
}

export interface UseCapabilityOptions {
  /**
   * Project to evaluate project-role requirements against. Defaults to the
   * active project of the capability's module (useProjectContext).
   */
  projectId?: string | null;
}

export function useCapability(
  capability: CapabilityKey,
  opts?: UseCapabilityOptions,
): CapabilityResult {
  const cap: CapabilityDef = CAPABILITIES[capability];
  const { username, role: accountRole } = useAuth();

  // Action-RBAC seam (hook must be called unconditionally — the '' action is
  // ignored below when the map entry declares no action gate).
  const perm = useCanPerform(cap.module, cap.action ?? '');

  // Active-project fallback for project-role capabilities.
  const { activeProject } = useProjectContext(cap.module);
  const projectId =
    opts?.projectId !== undefined
      ? opts.projectId
      : cap.requiredProjectRole
        ? (activeProject?.id ?? null)
        : null;

  // Re-render on shared-cache updates.
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, []);

  // Kick the fetches this capability actually needs.
  useEffect(() => {
    if (cap.requiredModuleAccess && moduleAccessData == null && !moduleAccessError) {
      loadModuleAccess();
    }
  }, [cap.requiredModuleAccess]);
  useEffect(() => {
    if (cap.requiredProjectRole && projectId && username) {
      ensureProjectRole(projectId, username);
    }
  }, [cap.requiredProjectRole, projectId, username]);

  const deny = useCallback(
    (reason: string, projectRole: ProjectRole | null = null): CapabilityResult => ({
      allowed: false,
      loading: false,
      error: false,
      behavior: cap.uiBehavior,
      reason,
      projectRole,
      d360Role: perm.d360Role,
    }),
    [cap.uiBehavior, perm.d360Role],
  );

  let loading = false;
  let softError = false;

  // ── 1. Action-RBAC gate ────────────────────────────────────────────────────
  if (cap.action) {
    if (perm.loading) loading = true;
    else if (perm.error) softError = true; // useCanPerform already fail-opened/closed
    if (!perm.loading && !perm.allowed) {
      return deny(
        `Your role${perm.d360Role ? ` (${perm.d360Role})` : ''} doesn't include the "${cap.module} · ${cap.action}" permission. An admin can grant it under Governance › Roles.`,
      );
    }
  }

  // ── 2. Account-role gate (raw substring, like the backend) ────────────────
  if (cap.requiredAccountRoles?.length) {
    if (!accountRole) {
      loading = true; // session role not hydrated yet — don't flash a denial
    } else if (!hasAccountRole(accountRole, cap.requiredAccountRoles)) {
      return deny(
        'This action needs an approver-tier account role. Ask an admin if you should have it.',
      );
    }
  }

  // ── 3. Coarse module posture ───────────────────────────────────────────────
  if (cap.requiredModuleAccess) {
    if (moduleAccessError) {
      softError = true; // hard error → fail open (backend still enforces)
    } else if (moduleAccessData == null) {
      loading = true;
    } else {
      const level = moduleAccessData[cap.module];
      // Only judge when the backend map actually covers this module.
      if (level !== undefined && level !== 'write') {
        return deny(
          level === 'read'
            ? 'You have read-only access to this module.'
            : 'Your role has no access to this module.',
        );
      }
    }
  }

  // ── 4. Project-role gate ───────────────────────────────────────────────────
  let projectRole: ProjectRole | null = null;
  if (cap.requiredProjectRole?.length) {
    const isAdmin =
      cap.adminBypass &&
      (perm.d360Role === 'Admin' || hasAccountRole(accountRole, ADMIN_ACCOUNT_TOKENS));
    if (!isAdmin) {
      if (!projectId) {
        return deny('Select a project first — this action applies to a specific project.');
      }
      if (!username) {
        loading = true;
      } else {
        const entry = projectRoleCache.get(roleCacheKey(projectId, username));
        if (!entry || entry.status === 'loading') {
          loading = true;
        } else if (entry.status === 'error') {
          softError = true; // could not resolve → fail open, backend enforces
        } else {
          projectRole = entry.role;
          if (!entry.role) {
            return deny(
              'You are not a contributor on this project — ask the project owner to add you.',
            );
          }
          if (!cap.requiredProjectRole.includes(entry.role)) {
            const needed = cap.requiredProjectRole.join(' or ');
            return deny(
              `Requires ${needed} access on this project (you are ${entry.role}).`,
              entry.role,
            );
          }
        }
      }
    }
  }

  if (loading) {
    return {
      allowed: false,
      loading: true,
      error: false,
      behavior: cap.uiBehavior,
      reason: null,
      projectRole,
      d360Role: perm.d360Role,
    };
  }

  return {
    allowed: true,
    loading: false,
    error: softError,
    behavior: cap.uiBehavior,
    reason: null,
    projectRole,
    d360Role: perm.d360Role,
  };
}
