'use client';

import { Grid3x3, Lock } from 'lucide-react';
import { HiOutlineUsers } from 'react-icons/hi2';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import UserAccessMatrix from '../components/UserAccessMatrix';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/config/constants';

/**
 * Access Matrix — real users × Data360 UI pages, each cell the user's
 * governance-resolved page access (per role). Aggregates the data the
 * governance tabs manage (users · roles · effective permissions) into one
 * who-can-reach-what grid. Admin-only, mirroring the Users page gate.
 */
export default function AccessMatrixPage() {
  const { role } = useAuth();

  if (!isAdminRole(role)) {
    return (
      <ErrorBoundary>
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="The access matrix is only available to platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN)."
        />
      </ErrorBoundary>
    );
  }

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

        <div className="rounded-xl border border-muted bg-white p-6 dark:bg-gray-800">
          <UserAccessMatrix />
        </div>
      </div>
    </ErrorBoundary>
  );
}
