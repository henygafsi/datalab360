'use client';

import { Lock } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import UserAccessMatrix from '../components/UserAccessMatrix';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/config/constants';

/**
 * Access Matrix — real users × Data360 UI pages, each cell the user's
 * governance-resolved page access (per role).
 *
 * Embeddable body (governance consolidation): admin gate + matrix, no
 * breadcrumb/PageHeader — used both by the /governance/access-matrix route
 * and as the "Access matrix" tab of GovernanceEntitySurface. Lives in its own
 * module (not the route's page.tsx) because a Next.js App Router page file may
 * only export a default + reserved fields — a named component export there
 * fails `next build`.
 */
export function AccessMatrixSurface() {
  const { role } = useAuth();
  if (!isAdminRole(role)) {
    return (
      <EmptyState
        icon={Lock}
        title="Access restricted"
        description="The access matrix is only available to platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN)."
      />
    );
  }
  return (
    <div className="rounded-xl border border-muted bg-white p-6 dark:bg-gray-800">
      <UserAccessMatrix />
    </div>
  );
}

export default AccessMatrixSurface;
