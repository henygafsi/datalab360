'use client';

import { useState, useCallback } from 'react';
import { Badge } from 'rizzui';
import { HiOutlineUsers } from 'react-icons/hi2';
import { Lock } from 'lucide-react';
import UsersTable from '@/app/shared/governance/users/table';
import AddUserButton from '@/app/shared/governance/users/add-user-button';
import ImportButton from '@/app/shared/import-button';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import GovernanceKpiStrip from '../components/GovernanceKpiStrip';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { isAdminRole } from '@/config/constants';

/** Embeddable body (governance consolidation): admin gate + KPI strip +
 *  actions + table, no breadcrumb/PageHeader — mounted as the "Users" tab of
 *  GovernanceEntitySurface and by the standalone route below. */
export function UsersSurface() {
  const { role } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAddUserSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // User management is admin-only. Mirror the coarse isAdminRole pattern used
  // across the app — role defaults to 'ACCOUNTADMIN' until the JWT resolves.
  if (!isAdminRole(role)) {
    return (
      <EmptyState
        icon={Lock}
        title="Access restricted"
        description="User management is only available to platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN). Contact your admin if you need access."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact toolbar actions — these buttons default to w-full (a
          container-query breakpoint that never fires in the embedded governance
          surface), which rendered two page-wide primary buttons. Pin w-auto. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ImportButton title="Import Users" className="w-auto" />
        <AddUserButton onAddUserSuccess={handleAddUserSuccess} className="w-auto" />
      </div>
      {/* Per-page KPI strip — total · active · disabled · roles (honest "—"). */}
      <GovernanceKpiStrip scope="users" />
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        <UsersTable key={refreshKey} onAddUserSuccess={handleAddUserSuccess} />
      </div>
    </div>
  );
}

export default function UsersManagementPage() {
  // Fire-and-forget PAGE_VIEW on mount/route change (before the admin gate
  // so the view is registered even when access is denied).
  useTrackEvent();

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <a href="/" className="hover:text-blue-600">Home</a> / <a href="/governance" className="hover:text-blue-600">Governance</a> / <span className="text-slate-700 dark:text-slate-300">Users</span>
      </div>

      <PageHeader
        icon={<HiOutlineUsers className="h-6 w-6" />}
        title="User Management"
        subtitle="Manage user accounts, roles, and permissions across your organization"
        color="blue"
        badges={
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">
            Active Users
          </Badge>
        }
      />

      <UsersSurface />
    </div>
    </ErrorBoundary>
  );
}
