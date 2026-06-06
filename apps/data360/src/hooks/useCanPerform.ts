'use client';

/**
 * useCanPerform — frontend gating seam for Data360 Action-RBAC (System 2).
 *
 * Backed by `GET /gouvernance/d360-roles/my-permissions` (the caller's effective
 * allow-set, resolved the same way runtime enforcement resolves it). The result
 * is cached module-wide so a page full of gated buttons makes a single request.
 *
 * Replaces hardcoded `D360_ADMIN_ROLES.includes(role)` checks.
 *
 * Fail-open policy: on a HARD failure (network / HTTP error) we ALLOW, so a
 * transient backend hiccup never locks an admin out of their own controls — this
 * is the first real gate and nothing else enforces yet. We only DENY on a
 * successful response whose allow-set does not contain the requested action.
 */
import { useEffect, useState } from 'react';
import {
  getMyPermissions,
  type MyPermissionsResponse,
  type RolePermission,
} from '@/app/services/governance/fetch_roles';

// --- Module-level cache (shared across every hook instance) -----------------
let cachePromise: Promise<MyPermissionsResponse> | null = null;
let cacheData: MyPermissionsResponse | null = null;
let cacheError = false;
// Subscribers are notified whenever the cache is (re)populated or invalidated.
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

function load(): Promise<MyPermissionsResponse> {
  if (!cachePromise) {
    cacheError = false;
    cachePromise = getMyPermissions()
      .then((res) => {
        cacheData = res;
        cacheError = false;
        notify();
        return res;
      })
      .catch((e) => {
        cacheData = null;
        cacheError = true;
        notify();
        throw e;
      });
  }
  return cachePromise;
}

/** Drop the cached permissions and immediately refetch (call after a permission edit). */
export function invalidateMyPermissions() {
  cachePromise = null;
  cacheData = null;
  cacheError = false;
  notify(); // immediate re-render (mounted consumers show loading)
  void load(); // kick a fresh fetch; load() notifies again on resolve
}

/** Imperative check against the loaded allow-set (any page/tab for module+action). */
function isAllowed(
  perms: RolePermission[],
  module: string,
  action: string
): boolean {
  return perms.some(
    (p) =>
      p.module === module &&
      p.action === action &&
      String(p.access_level || 'ALLOW').toUpperCase() === 'ALLOW'
  );
}

export interface CanPerformResult {
  /** True if the action is permitted (or fail-open on hard error). */
  allowed: boolean;
  /** True while the permission set is still loading. */
  loading: boolean;
  /** True if the my-permissions request hard-failed (we then fail open). */
  error: boolean;
  /** The resolved D360 role (for tooltips / debugging), null until loaded. */
  d360Role: string | null;
}

/**
 * Returns whether the current user may perform `action` on `module`.
 *
 * @param module  action-registry module key (e.g. 'gouvernance', 'bi_dashboard')
 * @param action  action key (e.g. 'create', 'edit', 'view')
 * @param projectId forward-compat only — not yet honored (PROJECT_ID migration pending)
 */
export function useCanPerform(
  module: string,
  action: string,
  projectId?: string | null
): CanPerformResult {
  // projectId is accepted for forward-compat; account-global today.
  void projectId;
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    subscribers.add(rerender);
    // Kick a fetch if the cache is empty (and not in a hard-error state).
    if (cacheData == null && !cacheError) {
      load().catch(() => {
        /* hard error → fail open, handled below */
      });
    }
    return () => {
      subscribers.delete(rerender);
    };
  }, []);

  // `loading` is derived from shared cache state so re-renders triggered by
  // invalidateMyPermissions() reflect the in-flight refetch (not stale denial).
  const loading = cacheData == null && !cacheError;

  if (cacheError) {
    // Hard failure → fail open (don't regress admins out of their own buttons).
    return { allowed: true, loading: false, error: true, d360Role: null };
  }
  if (cacheData == null) {
    return { allowed: false, loading, error: false, d360Role: null };
  }
  return {
    allowed: isAllowed(cacheData.permissions, module, action),
    loading: false,
    error: false,
    d360Role: cacheData.d360_role || null,
  };
}
