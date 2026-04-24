'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, Button, Loader } from 'rizzui';
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
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { HiOutlineCube } from 'react-icons/hi2';
import apiClient from '@/lib/api-client';

type TabType = 'role-grants' | 'user-grants' | 'policy-grants' | 'stage-grants' | 'd360-roles';

export default function GrantsManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('role-grants');
  const [d360Roles, setD360Roles] = useState<any[]>([]);
  const [d360RolesLoading, setD360RolesLoading] = useState(false);
  const [d360Templates, setD360Templates] = useState<any[]>([]);

  // Fetch D360 roles when tab is active
  useEffect(() => {
    if (activeTab !== 'd360-roles') return;
    let mounted = true;
    setD360RolesLoading(true);
    Promise.all([
      apiClient.get('/gouvernance/d360-roles').then(res => res.data?.roles || res.data?.data || []).catch(() => []),
      apiClient.get('/gouvernance/d360-roles/templates').then(res => res.data?.templates || res.data?.data || []).catch(() => []),
    ]).then(([roles, templates]) => {
      if (!mounted) return;
      setD360Roles(Array.isArray(roles) ? roles : []);
      setD360Templates(Array.isArray(templates) ? templates : []);
    }).finally(() => { if (mounted) setD360RolesLoading(false); });
    return () => { mounted = false; };
  }, [activeTab]);

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <a href="/" className="hover:text-blue-600">Home</a> / <a href="/gouvernance" className="hover:text-blue-600">Governance</a> / <span className="text-slate-700 dark:text-slate-300">Access Control</span>
      </div>

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

      {/* Info Cards — explain each grant type for business users */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50/80 dark:bg-blue-950/30 rounded-xl border border-blue-200/60 dark:border-blue-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <HiOutlineKey className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Role Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Which modules each role can access (Connect Data, Workflow, BI, etc.). Controls sidebar menu visibility.</p>
        </div>

        <div className="bg-purple-50/80 dark:bg-purple-950/30 rounded-xl border border-purple-200/60 dark:border-purple-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <HiOutlineUserGroup className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">User Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Snowflake role assignments per user. Maps SSO identities (Entra ID, Okta, SAML) to Snowflake roles like SYSADMIN, ANALYST.</p>
        </div>

        <div className="bg-violet-50/80 dark:bg-violet-950/30 rounded-xl border border-violet-200/60 dark:border-violet-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <HiOutlineShieldCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Policy Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Security policies (masking, RLS, network) applied to roles. Controls who sees what data and from which IPs.</p>
        </div>

        <div className="bg-teal-50/80 dark:bg-teal-950/30 rounded-xl border border-teal-200/60 dark:border-teal-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <HiOutlineCube className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Stage Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Read/write access to Snowflake stages (data loading areas). Controls which roles can upload or access raw files.</p>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        {/* Tabs Header */}
        <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex gap-1" role="tablist" aria-label="Grant type tabs">
            <button
              role="tab"
              aria-selected={activeTab === 'role-grants'}
              aria-controls="tabpanel-role-grants"
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
              role="tab"
              aria-selected={activeTab === 'user-grants'}
              aria-controls="tabpanel-user-grants"
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
              role="tab"
              aria-selected={activeTab === 'policy-grants'}
              aria-controls="tabpanel-policy-grants"
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
              role="tab"
              aria-selected={activeTab === 'stage-grants'}
              aria-controls="tabpanel-stage-grants"
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
            <button
              role="tab"
              aria-selected={activeTab === 'd360-roles'}
              aria-controls="tabpanel-d360-roles"
              onClick={() => setActiveTab('d360-roles')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'd360-roles'
                  ? 'border-b-2 border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineCog6Tooth className="h-4 w-4" />
              D360 Roles
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                Granular
              </Badge>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'role-grants' ? (
          <div role="tabpanel" id="tabpanel-role-grants" aria-labelledby="tab-role-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Role Permission Matrix
                </h2>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  <HiOutlineLockClosed className="w-3 h-3 mr-1 inline" />
                  Module Access Control
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Toggle module access for each Snowflake role. Changes take effect on next user login.</p>
            </div>
            <GrantsTable />
          </div>
        ) : activeTab === 'user-grants' ? (
          <div role="tabpanel" id="tabpanel-user-grants" aria-labelledby="tab-user-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  User Access Management
                </h2>
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                  <HiOutlineUserGroup className="w-3 h-3 mr-1 inline" />
                  RBAC
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">View and manage Snowflake roles granted to each user. Users with SSO (Entra ID, Okta, SAML) appear with their identity provider.</p>
            </div>
            <UserGrantsTable />
          </div>
        ) : activeTab === 'stage-grants' ? (
          <div role="tabpanel" id="tabpanel-stage-grants" aria-labelledby="tab-stage-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Stage Access Control
                </h2>
                <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                  <HiOutlineCube className="w-3 h-3 mr-1 inline" />
                  Snowflake Stages
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Control which roles can read, write, or own data loading stages. Stages are used for file uploads and data ingestion.</p>
            </div>
            <StageGrantsTable />
          </div>
        ) : activeTab === 'd360-roles' ? (
          <div role="tabpanel" id="tabpanel-d360-roles" aria-labelledby="tab-d360-roles">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  D360 Granular Roles
                </h2>
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                  <HiOutlineCog6Tooth className="w-3 h-3 mr-1 inline" />
                  Page-Level RBAC
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Custom Data360 roles with module/page/tab/action-level permissions. Apply standard templates or build custom roles.</p>
            </div>
            {d360RolesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader variant="spinner" size="lg" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Templates row */}
                {d360Templates.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 self-center">Templates:</span>
                    {d360Templates.map((t: any, i: number) => (
                      <Badge key={i} className="bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 text-xs cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/40">
                        {t.name || t.TEMPLATE_NAME || `Template ${i + 1}`}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* Roles table */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Permissions</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {d360Roles.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                            <HiOutlineCog6Tooth className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            No D360 roles defined yet. Create one or apply a standard template.
                          </td>
                        </tr>
                      ) : (
                        d360Roles.map((role: any, i: number) => (
                          <tr key={role.role_name || i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{role.role_name || role.ROLE_NAME || '—'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{role.description || role.DESCRIPTION || '—'}</td>
                            <td className="px-4 py-3">
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">
                                {role.permission_count ?? role.PERMISSION_COUNT ?? '—'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{role.created_at || role.CREATED_AT || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <Button size="sm" variant="outline" className="text-xs h-7 px-2"
                                onClick={() => {
                                  apiClient.get(`/gouvernance/d360-roles/${encodeURIComponent(role.role_name || role.ROLE_NAME)}/permissions`)
                                    .then(res => {
                                      const perms = res.data?.permissions || res.data?.data || [];
                                      alert(`${(role.role_name || role.ROLE_NAME)} has ${Array.isArray(perms) ? perms.length : 0} permissions`);
                                    })
                                    .catch(() => alert('Failed to load permissions'));
                                }}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="tabpanel-policy-grants" aria-labelledby="tab-policy-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Policy-Role Assignments
                </h2>
                <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                  <HiOutlineShieldCheck className="w-3 h-3 mr-1 inline" />
                  Security Policies
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">View which security policies (masking, RLS, aggregation, network) are assigned to each role. Policies restrict data access automatically.</p>
            </div>
            <PolicyGrantsTable />
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
