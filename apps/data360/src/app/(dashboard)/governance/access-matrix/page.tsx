'use client';

import { Grid3x3, Lock } from 'lucide-react';
import { HiOutlineUsers } from 'react-icons/hi2';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import UserAccessMatrix from '../components/UserAccessMatrix';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { isAdminRole } from '@/config/constants';

/**
 * Access Matrix — real users × Data360 UI pages, each cell the user's
 * governance-resolved page access (per role). Aggregates the data the
 * governance tabs manage (users · roles · effective permissions) into one
 * who-can-reach-what grid. Admin-only, mirroring the Users page gate.
 */
/** Embeddable body (governance consolidation): admin gate + matrix, no
 *  breadcrumb/PageHeader — the "Access matrix" tab of GovernanceEntitySurface. */
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

export default function AccessMatrixPage() {
  // Auto-emits PAGE_VIEW on mount (this is the top routed component for the route).
  useTrackEvent();

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <a href="/" className="hover:text-blue-600">Home</a> /{' '}
          <a href="/governance" className="hover:text-blue-600">Governance</a> /{' '}
          <span className="text-slate-700 dark:text-slate-300">Access Matrix</span>
        </div>

        <PageHeader
          icon={<Grid3x3 className="h-6 w-6" />}
          title="User Access Matrix"
          subtitle="Every user × every Data360 page — the access each role grants, resolved live from governance."
          color="blue"
        />

        <AccessMatrixSurface />
      </div>
    </ErrorBoundary>
  );
}
