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
 *   - Non-admins get an explanatory EmptyState instead of the full admin shell
 *     (previously the shell rendered and only the data calls 403'd).
 *   - PAGE_VIEW still fires before the gate (useTrackEvent dedupes globally
 *     per route, so pages that also call it don't double-count).
 *
 * Server-component pages can render this client wrapper around their content —
 * the children stay server-rendered and are passed through as a slot.
 */
export default function AdminRouteGuard({
  children,
  surface = 'This page',
}: {
  children: ReactNode;
  /** Human name of the guarded surface, e.g. "Administration". */
  surface?: string;
}) {
  const { role } = useAuth();
  // Register the view even when access is denied (same as governance/users).
  useTrackEvent();

  if (!isAdminRole(role)) {
    return (
      <ErrorBoundary>
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description={`${surface} is only available to platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN). Contact your administrator if you need access.`}
        />
      </ErrorBoundary>
    );
  }

  return <>{children}</>;
}
