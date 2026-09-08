'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { isAdminRole } from '@/config/constants';

/**
 * Route-level guard for admin-only surfaces (`/admin/*`, `/administration/*`,
 * deploy-app, client-accounts, …). Mirrors the exact pattern established in
 * governance/users/page.tsx:
 *
 *   - Coarse `isAdminRole(role)` check on the JWT role from useAuth. The hook
 *     defaults the role to 'ACCOUNTADMIN' until the JWT resolves, so admins
 *     never see a denial flash; non-admins flip to the restricted state once
 *     the token is read.
 *   - Non-admins get an explanatory EmptyState instead of the full admin shell.
 *   - PAGE_VIEW still fires before the gate (useTrackEvent dedupes globally
 *     per route, so pages that also call it don't double-count).
 *
 * Server-component pages can render this client wrapper around their content —
 * the children stay server-rendered and are passed through as a slot.
 */
export default function AdminRouteGuard({
  children,
  surface = 'This page',
  requireRoles,
}: {
  children: ReactNode;
  /** Human name of the guarded surface, e.g. "Administration". */
  surface?: string;
  /**
   * Stricter gate: when set, ONLY these exact roles pass (case-insensitive) —
   * e.g. ['ACCOUNTADMIN'] for the Administration control room (2026-09 user
   * directive). Default: the coarse platform-admin trio via isAdminRole.
   */
  requireRoles?: string[];
}) {
  const { role } = useAuth();
  // Register the view even when access is denied (same as governance/users).
  useTrackEvent();

  const allowed = requireRoles
    ? requireRoles.some((r) => r.toUpperCase() === (role ?? '').toUpperCase())
    : isAdminRole(role);

  if (!allowed) {
    const who = requireRoles
      ? requireRoles.join(', ')
      : 'platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN)';
    return (
      <ErrorBoundary>
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description={`${surface} is only available to ${who}. Contact your administrator if you need access.`}
        />
      </ErrorBoundary>
    );
  }

  return <>{children}</>;
}
