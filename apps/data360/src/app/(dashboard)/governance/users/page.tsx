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

export default function UsersManagementPage() {
  const { role } = useAuth();
  // Fire-and-forget PAGE_VIEW on mount/route change (before the admin gate
  // so the view is registered even when access is denied).
  useTrackEvent();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAddUserSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // User management is admin-only. Mirror the coarse isAdminRole pattern used
  // across the app (AccessControlCenter, ActionsPanel, etc.) — role defaults to
  // 'ACCOUNTADMIN' until the JWT resolves, so admins never see a flash.
  if (!isAdminRole(role)) {
    return (
      <ErrorBoundary>
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="User management is only available to platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN). Contact your admin if you need access."
        />
      </ErrorBoundary>
    );
  }

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
        actions={
          <>
            <ImportButton title="Import Users" />
            <AddUserButton onAddUserSuccess={handleAddUserSuccess} />
          </>
        }
      />

      {/* Per-page KPI strip — total · active · disabled · roles (honest "—"). */}
      <GovernanceKpiStrip scope="users" />

      {/* Main Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        <UsersTable
          key={refreshKey}
          onAddUserSuccess={handleAddUserSuccess}
        />
      </div>
    </div>
    </ErrorBoundary>
  );
}
