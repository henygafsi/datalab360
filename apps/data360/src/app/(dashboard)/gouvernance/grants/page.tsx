'use client';

import { useState } from 'react';
import { Badge, Button } from 'rizzui';
import {
  HiOutlineKey,
  HiOutlineCog6Tooth,
  HiOutlineShieldExclamation,
  HiOutlineLockClosed,
  HiOutlineUserGroup,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
import GrantsTable from '@/app/shared/gouvernance/grants/table';
import UserGrantsTable from '@/app/shared/gouvernance/user-grants/table';
import PolicyGrantsTable from '@/app/shared/gouvernance/policy-grants/table';
import StageGrantsTable from '@/app/shared/gouvernance/stage-grants/table';
import PageHeader from '@/components/layout/PageHeader';
import { HiOutlineCube } from 'react-icons/hi2';

type TabType = 'role-grants' | 'user-grants' | 'policy-grants' | 'stage-grants';

export default function GrantsManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('role-grants');

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

      {/* Main Content with Tabs */}
      <div className="bg-white dark:bg-gray-50 rounded-xl border border-muted p-6">
        {/* Tabs Header */}
        <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('role-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'role-grants'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineLockClosed className="h-4 w-4" />
              Role Grants
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Modules
              </Badge>
            </button>
            <button
              onClick={() => setActiveTab('user-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'user-grants'
                  ? 'border-b-2 border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineUserGroup className="h-4 w-4" />
              User Grants
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                RBAC
              </Badge>
            </button>
            <button
              onClick={() => setActiveTab('policy-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'policy-grants'
                  ? 'border-b-2 border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineShieldCheck className="h-4 w-4" />
              Policy Grants
              <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                Policies
              </Badge>
            </button>
            <button
              onClick={() => setActiveTab('stage-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'stage-grants'
                  ? 'border-b-2 border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineCube className="h-4 w-4" />
              Stage Grants
              <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                Snowflake
              </Badge>
            </button>
          </div>
        </div>

        {/* Tab Content - Lazy loaded (only active tab mounts to prevent redundant API calls) */}
        {activeTab === 'role-grants' ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Role Permission Matrix
                </h2>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  <HiOutlineLockClosed className="w-3 h-3 mr-1 inline" />
                  Module Access Control
                </Badge>
              </div>
            </div>
            <GrantsTable />
          </div>
        ) : activeTab === 'user-grants' ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  User Access Management
                </h2>
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                  <HiOutlineUserGroup className="w-3 h-3 mr-1 inline" />
                  RBAC
                </Badge>
              </div>
            </div>
            <UserGrantsTable />
          </div>
        ) : activeTab === 'stage-grants' ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Stage access (Snowflake)
                </h2>
                <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                  <HiOutlineCube className="w-3 h-3 mr-1 inline" />
                  Stages
                </Badge>
              </div>
            </div>
            <StageGrantsTable />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Policy-Role Assignments
                </h2>
                <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                  <HiOutlineShieldCheck className="w-3 h-3 mr-1 inline" />
                  Security Policies
                </Badge>
              </div>
            </div>
            <PolicyGrantsTable />
          </div>
        )}
      </div>
    </div>
  );
}
