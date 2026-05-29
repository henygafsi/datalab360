'use client';

import { useState, useCallback } from 'react';
import { Badge } from 'rizzui';
import { HiOutlineShieldCheck, HiOutlineKey } from 'react-icons/hi2';
import RolesTable from '@/app/shared/governance/roles/table';
import AddRoleButton from '@/app/shared/governance/roles/add-role-button';
import ImportButton from '@/app/shared/import-button';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

export default function RolesManagementPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAddRoleSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <a href="/" className="hover:text-blue-600">Home</a> / <a href="/governance" className="hover:text-blue-600">Governance</a> / <span className="text-slate-700 dark:text-slate-300">Roles</span>
      </div>

      <PageHeader
        icon={<HiOutlineShieldCheck className="h-6 w-6" />}
        title="Role Management"
        subtitle="Define and manage user roles with specific permissions and access controls"
        color="emerald"
        badges={
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 text-sm font-medium">
            <HiOutlineKey className="w-3 h-3 mr-1 inline" />
            Active Roles
          </Badge>
        }
        actions={
          <>
            <ImportButton title="Import Roles" />
            <AddRoleButton onAddRoleSuccess={handleAddRoleSuccess} />
          </>
        }
      />

      {/* Main Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        <RolesTable key={refreshKey} />
      </div>
    </div>
    </ErrorBoundary>
  );
}
