'use client';

import { Badge } from 'rizzui';
import {
  HiOutlineKey,
  HiOutlineCog6Tooth,
  HiOutlineShieldExclamation,
  HiOutlineLockClosed
} from 'react-icons/hi2';
import GrantsTable from '@/app/shared/gouvernance/grants/table';
import PageHeader from '@/components/layout/PageHeader';

export default function GrantsManagementPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<HiOutlineKey className="h-6 w-6" />}
        title="Access Control"
        subtitle="Configure role-based access control and manage module permissions"
        color="amber"
        badges={
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-sm font-medium">
            <HiOutlineShieldExclamation className="w-3 h-3 mr-1 inline" />
            Security Center
          </Badge>
        }
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50/80 dark:bg-blue-950/30 rounded-xl border border-muted p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <HiOutlineKey className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Role-Based Access</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Define granular permissions for each role</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50/80 dark:bg-green-950/30 rounded-xl border border-muted p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <HiOutlineCog6Tooth className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Module Access</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Control access to system modules</p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50/80 dark:bg-purple-950/30 rounded-xl border border-muted p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <HiOutlineLockClosed className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Security Control</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Maintain secure access policies</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white dark:bg-gray-50 rounded-xl border border-muted p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Permission Matrix</h2>
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              <HiOutlineLockClosed className="w-3 h-3 mr-1 inline" />
              Access Control
            </Badge>
          </div>
        </div>

        <GrantsTable />
      </div>
    </div>
  );
}
