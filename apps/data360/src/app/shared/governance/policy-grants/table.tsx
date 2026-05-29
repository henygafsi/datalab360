'use client';

import { useEffect, useState, useCallback } from 'react';
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table';
import { Badge, Button } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  HiOutlineShieldCheck,
  HiOutlinePlus,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineGlobeAlt,
  HiOutlineUserGroup,
} from 'react-icons/hi2';
import Table from '@core/components/table';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import {
  getRLSPolicies,
  getNetworkPolicies,
  getMaskingPolicies,
  getPasswordPolicies,
  getSessionPolicies,
  getAggregationPolicies,
  RLSPolicy,
  NetworkPolicy,
  MaskingPolicy,
  PasswordPolicy,
  SessionPolicy,
  AggregationPolicy,
} from '@/app/services/governance/policies';
import AssignPolicyModal from './AssignPolicyModal';

// All supported policy types based on backend spec
export type PolicyType =
  | 'rls'           // Row-Level Security (ROW_ACCESS)
  | 'masking'       // Data Masking (MASKING)
  | 'cls'           // Column-Level Security (MASKING)
  | 'network'       // Network Policy (NETWORK)
  | 'aggregation'   // Aggregation Policy
  | 'authentication' // Authentication Policy
  | 'join'          // Join Policy
  | 'packages'      // Packages Policy
  | 'password'      // Password Policy
  | 'privacy'       // Privacy Policy
  | 'projection'    // Projection Policy
  | 'session'       // Session Policy
  | 'storage';      // Storage Lifecycle Policy

// Combined policy type
export type PolicyGrant = {
  id: string;
  policy_name: string;
  policy_type: PolicyType;
  description?: string;
  active: boolean;
  // For RLS/CLS
  table_name?: string;
  database?: string;
  schema?: string;
  filter_expression?: string;
  // For Network
  allowed_ip_list?: string[];
  blocked_ip_list?: string[];
  // Roles granted this policy
  granted_roles: string[];
  // Objects touched
  objects_touched: string[];
  // Expiration date for policy assignment
  expiration_date?: string;
  created_at?: string;
};

// Policy type colors
const POLICY_TYPE_COLORS: Record<PolicyType, { bg: string; text: string; border: string; gradient: string }> = {
  rls: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-400',
    border: 'border-blue-500',
    gradient: 'from-blue-500 to-cyan-600',
  },
  masking: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-800 dark:text-purple-400',
    border: 'border-purple-500',
    gradient: 'from-purple-500 to-violet-600',
  },
  cls: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-800 dark:text-emerald-400',
    border: 'border-emerald-500',
    gradient: 'from-emerald-500 to-teal-600',
  },
  network: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-400',
    border: 'border-amber-500',
    gradient: 'from-amber-500 to-orange-600',
  },
  aggregation: {
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-800 dark:text-violet-400',
    border: 'border-violet-500',
    gradient: 'from-violet-500 to-purple-600',
  },
  authentication: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    text: 'text-cyan-800 dark:text-cyan-400',
    border: 'border-cyan-500',
    gradient: 'from-cyan-500 to-blue-600',
  },
  join: {
    bg: 'bg-lime-100 dark:bg-lime-900/30',
    text: 'text-lime-800 dark:text-lime-400',
    border: 'border-lime-500',
    gradient: 'from-lime-500 to-green-600',
  },
  packages: {
    bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30',
    text: 'text-fuchsia-800 dark:text-fuchsia-400',
    border: 'border-fuchsia-500',
    gradient: 'from-fuchsia-500 to-pink-600',
  },
  password: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-400',
    border: 'border-red-500',
    gradient: 'from-red-500 to-rose-600',
  },
  privacy: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/30',
    text: 'text-indigo-800 dark:text-indigo-400',
    border: 'border-indigo-500',
    gradient: 'from-indigo-500 to-purple-600',
  },
  projection: {
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-800 dark:text-teal-400',
    border: 'border-teal-500',
    gradient: 'from-teal-500 to-cyan-600',
  },
  session: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-800 dark:text-orange-400',
    border: 'border-orange-500',
    gradient: 'from-orange-500 to-amber-600',
  },
  storage: {
    bg: 'bg-slate-100 dark:bg-slate-900/30',
    text: 'text-slate-800 dark:text-slate-400',
    border: 'border-slate-500',
    gradient: 'from-slate-500 to-gray-600',
  },
};

const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  rls: 'Row-Level Security',
  masking: 'Data Masking',
  cls: 'Column-Level Security',
  network: 'Network Policy',
  aggregation: 'Aggregation Policy',
  authentication: 'Authentication Policy',
  join: 'Join Policy',
  packages: 'Packages Policy',
  password: 'Password Policy',
  privacy: 'Privacy Policy',
  projection: 'Projection Policy',
  session: 'Session Policy',
  storage: 'Storage Lifecycle',
};

export default function PolicyGrantsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-source failures from the parallel fetch — surfaced inline instead of swallowed.
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [tableData, setTableData] = useState<PolicyGrant[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyGrant | null>(null);
  const [activeTab, setActiveTab] = useState<PolicyType | 'all'>('all');

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);

    setPartialErrors([]);

    try {
      // Fetch all available policy types in parallel. Each source can fail
      // independently — we keep what loaded and surface the failures inline
      // instead of silently swallowing them.
      const [
        rlsRes,
        networkRes,
        maskingRes,
        passwordRes,
        sessionRes,
        aggregationRes,
      ] = await Promise.allSettled([
        getRLSPolicies(),
        getNetworkPolicies(),
        getMaskingPolicies(),
        getPasswordPolicies(),
        getSessionPolicies(),
        getAggregationPolicies(),
      ]);

      const failures: string[] = [];
      const unwrap = <T,>(label: string, res: PromiseSettledResult<T[]>): T[] => {
        if (res.status === 'fulfilled') return res.value;
        const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        failures.push(`${label}: ${msg}`);
        return [];
      };

      const rlsPolicies = unwrap('Row access', rlsRes);
      const networkPolicies = unwrap('Network', networkRes);
      const maskingPolicies = unwrap('Masking', maskingRes);
      const passwordPolicies = unwrap('Password', passwordRes);
      const sessionPolicies = unwrap('Session', sessionRes);
      const aggregationPolicies = unwrap('Aggregation', aggregationRes);

      setPartialErrors(failures);

      // Transform to unified format
      const policies: PolicyGrant[] = [
        // RLS Policies
        ...rlsPolicies.map((p) => ({
          id: `rls-${p.policy_name}`,
          policy_name: p.policy_name,
          policy_type: 'rls' as const,
          description: p.description,
          active: p.active,
          table_name: p.table_name,
          database: p.database,
          schema: p.schema,
          filter_expression: p.filter_expression,
          granted_roles: p.granted_roles || [],
          objects_touched: p.table_name ? [p.table_name] : [],
        })),

        // Masking Policies
        ...maskingPolicies.map((p) => ({
          id: `masking-${p.policy_name}`,
          policy_name: p.policy_name,
          policy_type: 'masking' as const,
          description: p.masking_expression || `Type: ${p.data_type}`,
          active: true,
          schema: p.schema,
          granted_roles: p.granted_roles || [],
          objects_touched: [p.schema],
        })),

        // Network Policies
        ...networkPolicies.map((p) => {
          const allowedIPs = p.allowed_ip_list ? p.allowed_ip_list.split(',').map(ip => ip.trim()) : [];
          const blockedIPs = p.blocked_ip_list ? p.blocked_ip_list.split(',').map(ip => ip.trim()) : [];

          return {
            id: `network-${p.policy_name}`,
            policy_name: p.policy_name,
            policy_type: 'network' as const,
            description: p.description || p.comment,
            active: p.is_default || false,
            allowed_ip_list: allowedIPs,
            blocked_ip_list: blockedIPs,
            granted_roles: p.granted_roles || [],
            objects_touched: ['Account Level'],
          };
        }),

        // Password Policies
        ...passwordPolicies.map((p) => ({
          id: `password-${p.policy_name}`,
          policy_name: p.policy_name,
          policy_type: 'password' as const,
          description: `Min length: ${p.min_length}, Min uppercase: ${p.min_upper_case_chars}`,
          active: p.is_default || true,
          schema: p.schema,
          granted_roles: p.granted_roles || [],
          objects_touched: [p.schema],
        })),

        // Session Policies
        ...sessionPolicies.map((p) => ({
          id: `session-${p.policy_name}`,
          policy_name: p.policy_name,
          policy_type: 'session' as const,
          description: `Idle timeout: ${p.session_idle_timeout_mins}min, UI timeout: ${p.session_ui_idle_timeout_mins}min`,
          active: p.is_default || true,
          schema: p.schema,
          granted_roles: p.granted_roles || [],
          objects_touched: [p.schema],
        })),

        // Aggregation Policies
        ...aggregationPolicies.map((p) => ({
          id: `aggregation-${p.policy_name}`,
          policy_name: p.policy_name,
          policy_type: 'aggregation' as const,
          description: p.aggregation_constraint,
          active: true,
          schema: p.schema,
          granted_roles: p.granted_roles || [],
          objects_touched: [p.schema],
        })),
      ];

      console.log('[Policy Grants] Total policies loaded:', policies.length);
      setTableData(policies);
    } catch (err: any) {
      console.error('[Policy Grants] Error fetching policies:', err);
      setError(err.message || 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const columns: ColumnDef<PolicyGrant>[] = [
    {
      header: 'Policy Name',
      accessorKey: 'policy_name',
      cell: ({ row }) => {
        const colors = POLICY_TYPE_COLORS[row.original.policy_type];
        return (
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${colors.bg} ${colors.border} border-2`}
            />
            <span className="font-semibold text-slate-900 dark:text-white">
              {row.original.policy_name}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Type',
      accessorKey: 'policy_type',
      cell: ({ getValue }) => {
        const type = getValue() as PolicyGrant['policy_type'];
        const colors = POLICY_TYPE_COLORS[type];
        return (
          <Badge className={`${colors.bg} ${colors.text} font-medium`}>
            {POLICY_TYPE_LABELS[type]}
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      accessorKey: 'active',
      cell: ({ getValue }) => {
        const isActive = getValue() as boolean;
        return (
          <div className="flex items-center gap-1.5">
            {isActive ? (
              <>
                <HiOutlineEye className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">Active</span>
              </>
            ) : (
              <>
                <HiOutlineEyeSlash className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-500">Inactive</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      header: 'Granted Roles',
      accessorKey: 'granted_roles',
      cell: ({ getValue }) => {
        const roles = (getValue() as string[]) || [];
        if (roles.length === 0) {
          return <span className="italic text-gray-400">No roles assigned</span>;
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {roles.slice(0, 3).map((role) => (
              <Badge key={role} className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                <HiOutlineUserGroup className="mr-1 h-3 w-3" />
                {role}
              </Badge>
            ))}
            {roles.length > 3 && (
              <Badge className="bg-blue-100 text-blue-700">+{roles.length - 3} more</Badge>
            )}
          </div>
        );
      },
    },
    {
      header: 'Objects Touched',
      accessorKey: 'objects_touched',
      cell: ({ getValue }) => {
        const objects = (getValue() as string[]) || [];
        if (objects.length === 0) {
          return <span className="italic text-gray-400">No objects</span>;
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {objects.slice(0, 2).map((obj, idx) => (
              <Badge key={idx} className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                <HiOutlineGlobeAlt className="mr-1 h-3 w-3" />
                {obj.length > 30 ? `${obj.substring(0, 30)}...` : obj}
              </Badge>
            ))}
            {objects.length > 2 && (
              <Badge className="bg-blue-100 text-blue-700">+{objects.length - 2} more</Badge>
            )}
          </div>
        );
      },
    },
    {
      header: 'Expiration',
      accessorKey: 'expiration_date',
      cell: ({ getValue }) => {
        const expirationDate = getValue() as string | undefined;
        if (!expirationDate) {
          return <span className="text-sm text-gray-400 italic">No expiration</span>;
        }

        const date = new Date(expirationDate);
        const now = new Date();
        const isExpired = date < now;
        const daysUntilExpiration = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${
              isExpired
                ? 'text-red-600 dark:text-red-400'
                : daysUntilExpiration <= 7
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-green-600 dark:text-green-400'
            }`}>
              {date.toLocaleDateString()}
            </span>
            {!isExpired && daysUntilExpiration <= 30 && (
              <Badge className={`${
                daysUntilExpiration <= 7
                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              } text-xs`}>
                {daysUntilExpiration}d left
              </Badge>
            )}
            {isExpired && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">
                Expired
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedPolicy(row.original);
              setShowAssignModal(true);
            }}
            className="text-blue-600 hover:bg-blue-50"
          >
            Manage Grants
          </Button>
        </div>
      ),
    },
  ];

  // Filter data based on active tab
  const filteredData = activeTab === 'all'
    ? tableData
    : tableData.filter(p => p.policy_type === activeTab);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  if (loading) {
    return <TableSkeleton rows={5} columns={6} />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={fetchPolicies} context="policy-grants" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Policy Grants Management
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage policy assignments to roles and view affected objects
          </p>
        </div>
        <Button
          onClick={() => setShowAssignModal(true)}
          className="bg-gradient-to-r from-violet-500 to-purple-600 text-white"
        >
          <HiOutlinePlus className="mr-2 h-4 w-4" />
          Assign Policy
        </Button>
      </div>

      {/* Partial-load errors — some policy sources failed but we still show what loaded */}
      {partialErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700/60 dark:bg-amber-900/20"
        >
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {partialErrors.length} policy source{partialErrors.length > 1 ? 's' : ''} failed to load — showing partial results.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-400">
            {partialErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
          <button
            onClick={fetchPolicies}
            className="mt-2 text-xs font-semibold text-amber-800 underline hover:text-amber-900 dark:text-amber-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Policy Type Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
            activeTab === 'all'
              ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700'
          }`}
        >
          All Policies ({tableData.length})
        </button>

        {(['rls', 'masking', 'network', 'password', 'session', 'authentication', 'aggregation', 'privacy', 'projection', 'join', 'packages', 'storage'] as const).map((type) => {
          const count = tableData.filter((p) => p.policy_type === type).length;
          const colors = POLICY_TYPE_COLORS[type];

          // Only show tabs that have at least one policy
          if (count === 0) return null;

          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === type
                  ? `${colors.bg} ${colors.text} ${colors.border} border-2 shadow-md`
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${colors.bg} ${colors.border} border`} />
              {POLICY_TYPE_LABELS[type]} ({count})
            </button>
          );
        })}
      </div>

      {/* Stats Cards - Only show for active tab */}
      {activeTab !== 'all' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {POLICY_TYPE_LABELS[activeTab]}
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
                {filteredData.length} {filteredData.length === 1 ? 'Policy' : 'Policies'}
              </p>
              <div className="mt-3 flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {filteredData.filter(p => p.active).length} Active
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {filteredData.filter(p => !p.active).length} Inactive
                  </span>
                </div>
              </div>
            </div>
            <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${POLICY_TYPE_COLORS[activeTab].gradient} flex items-center justify-center shadow-lg`}>
              <HiOutlineShieldCheck className="h-10 w-10 text-white" />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {filteredData.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
            <HiOutlineShieldCheck className="h-10 w-10 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {activeTab === 'all' ? 'No policies found' : `No ${POLICY_TYPE_LABELS[activeTab]} policies`}
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {activeTab === 'all'
              ? 'Create security policies to manage access control'
              : `No ${POLICY_TYPE_LABELS[activeTab]} policies have been created yet`
            }
          </p>
          {activeTab !== 'all' && (
            <Button
              onClick={() => setActiveTab('all')}
              variant="outline"
              className="mt-4"
            >
              View All Policies
            </Button>
          )}
        </div>
      ) : (
        <>
          <Table
            table={table}
            variant="modern"
            classNames={{
              container: 'rounded-md border border-muted',
              rowClassName: 'last:border-0',
            }}
          />

          <TableFooter
            table={table}
            onExport={() => {
              toast.success('Exporting policy grants...');
            }}
          />
          <TablePagination table={table} className="py-4" />
        </>
      )}

      {/* Assign Policy Modal */}
      {showAssignModal && (
        <AssignPolicyModal
          policy={selectedPolicy}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedPolicy(null);
          }}
          onSuccess={(grantedRoles: string[]) => {
            // Update local state immediately with the granted roles
            if (selectedPolicy) {
              setTableData(prev => prev.map(p =>
                p.id === selectedPolicy.id
                  ? { ...p, granted_roles: grantedRoles }
                  : p
              ));
            }
          }}
        />
      )}
    </div>
  );
}
