'use client';

import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Badge, Input, Select, Tab, type SelectOption } from 'rizzui';
import {
  HiOutlineShieldCheck,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineGlobeAlt,
  HiOutlineBuildingStorefront,
  HiOutlineBriefcase,
  HiOutlineTableCells,
  HiOutlineArrowPath,
  HiOutlineCloudArrowDown,
  HiOutlineCheckCircle,
  HiOutlineUserGroup,
  HiOutlineFingerPrint,
  HiOutlineLockClosed,
} from 'react-icons/hi2';
import { Save, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';

import {
  getSecurityAxes,
  createSecurityAxis,
  updateSecurityAxis,
  deleteSecurityAxis,
  getSecurityMatrix,
  createSecurityMatrixEntry,
  updateSecurityMatrixEntry,
  deleteSecurityMatrixEntry,
  batchUpdateSecurityMatrix,
  getEnterpriseUsers,
  updateEnterpriseUser,
  deleteEnterpriseUser,
  syncEnterpriseUsers,
  type SecurityAxis,
  type SecurityMatrixEntryRow,
  type SecurityMatrixResponse,
  type EnterpriseUser,
  type EnterpriseUserUpdate,
} from '@/app/services/governance/security_matrix';
import { getMatrixColumns } from '@/app/shared/governance/security-matrix/columns';
import { getEnterpriseUsersColumns } from '@/app/shared/governance/security-matrix/enterprise-users-columns';
import SecurityMatrixFilters from '@/app/shared/governance/security-matrix/filters';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { formatApiDetail } from '@/lib/utils';
import { dash } from '@/app/shared/ui/format';
import { useCanPerform, invalidateMyPermissions } from '@/hooks/useCanPerform';
import { useAtomValue } from 'jotai';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';

// ============= SHARED UI COMPONENTS =============

const AXIS_TYPE_OPTIONS: { label: string; value: SecurityAxis['type'] }[] = [
  { label: 'Region', value: 'region' },
  { label: 'Store', value: 'store' },
  { label: 'Department', value: 'department' },
  { label: 'Custom', value: 'custom' },
];

const ModernCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`}>
    {children}
  </div>
);

const StatCard = ({ icon: Icon, label, value, color, badge }: {
  icon: React.ElementType;
  label: string;
  // Accepts a missing value — renders "—" for null/undefined/NaN (R3); a genuine
  // 0 still renders as 0.
  value: number | string | null | undefined;
  color: string;
  badge?: string;
}) => (
  <ModernCard className="p-5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{dash(value)}</p>
        </div>
      </div>
      {badge && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{badge}</Badge>}
    </div>
  </ModernCard>
);

// ============= CONSTANTS =============

const AXIS_TYPE_ICONS: Record<string, React.ElementType> = {
  region: HiOutlineGlobeAlt,
  store: HiOutlineBuildingStorefront,
  department: HiOutlineBriefcase,
  custom: HiOutlineShieldCheck,
};

const AXIS_TYPE_COLORS: Record<string, string> = {
  region: 'from-blue-500 to-cyan-600',
  store: 'from-emerald-500 to-teal-600',
  department: 'from-purple-500 to-violet-600',
  custom: 'from-amber-500 to-orange-600',
};

const TABS = [
  { label: 'Access Matrix', value: 'matrix' },
  { label: 'Enterprise Users', value: 'users' },
  { label: 'Security Axes', value: 'axes' },
];

// ============= PAGE COMPONENT =============

export default function SecurityMatrixPage() {
  // System 2 Action-RBAC: deleting a matrix entry or an enterprise user both
  // map to gouvernance:delete. Fail-open while the allow-set loads (no flash).
  const deletePerm = useCanPerform('gouvernance', 'delete');
  const canDeleteGov = deletePerm.allowed || deletePerm.loading;
  const [activeTab, setActiveTab] = useState('matrix');

  // Matrix state
  const [matrixData, setMatrixData] = useState<SecurityMatrixResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixSearch, setMatrixSearch] = useState('');
  const [accessLevelFilter, setAccessLevelFilter] = useState('');
  const [dirtyMatrixRows, setDirtyMatrixRows] = useState<Map<number, Record<string, string | null>>>(new Map());
  const [showAddMatrixModal, setShowAddMatrixModal] = useState(false);
  const [matrixFormError, setMatrixFormError] = useState<string | null>(null);
  const [matrixForm, setMatrixForm] = useState({
    role_name: '',
    region_id: '' as string | null,
    store_id: '' as string | null,
    department_id: '' as string | null,
    product_category: '' as string | null,
    customer_segment: '' as string | null,
    access_level: 'READ',
  });

  // Enterprise Users state
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const usersLoadedRef = useRef(false);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [idpFilter, setIdpFilter] = useState('');
  const [dirtyUserRows, setDirtyUserRows] = useState<Map<string, Partial<Record<keyof EnterpriseUserUpdate, string | null>>>>(new Map());
  const [syncing, setSyncing] = useState(false);

  // Axes state
  const [axes, setAxes] = useState<SecurityAxis[]>([]);
  const [axesLoading, setAxesLoading] = useState(true);
  const [axesError, setAxesError] = useState<string | null>(null);
  const [showAddAxisModal, setShowAddAxisModal] = useState(false);
  const [editingAxis, setEditingAxis] = useState<SecurityAxis | null>(null);
  const [axisFormError, setAxisFormError] = useState<string | null>(null);
  const [axisForm, setAxisForm] = useState<{ name: string; type: SecurityAxis['type']; description: string; values: string }>({ name: '', type: 'region', description: '', values: '' });

  // Inline confirmation state (replaces native confirm() popups)
  const [confirmAction, setConfirmAction] = useState<{ type: 'deleteMatrix' | 'deleteUser' | 'deleteAxis'; id: number | string } | null>(null);

  // ============= DATA LOADING =============

  const loadMatrix = useCallback(async (bustCache = false) => {
    setMatrixLoading(true);
    setMatrixError(null);
    try {
      const data = await getSecurityMatrix(bustCache);
      setMatrixData(data);
    } catch (err: any) {
      setMatrixError(formatApiDetail(err?.response?.data?.detail) || 'Failed to load access matrix');
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await getEnterpriseUsers();
      setUsers(data);
      usersLoadedRef.current = true;
    } catch (err: any) {
      setUsersError(formatApiDetail(err?.response?.data?.detail) || 'Failed to load enterprise users');
      usersLoadedRef.current = true; // Mark loaded even on error to prevent retry loop
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadAxes = useCallback(async (bustCache = false) => {
    setAxesLoading(true);
    setAxesError(null);
    try {
      const data = await getSecurityAxes(bustCache);
      setAxes(data);
    } catch (err: any) {
      setAxesError(formatApiDetail(err?.response?.data?.detail) || 'Failed to load security axes');
    } finally {
      setAxesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatrix();
    loadAxes();
  }, [loadMatrix, loadAxes]);

  useEffect(() => {
    if (activeTab === 'users' && !usersLoadedRef.current && !usersLoading) {
      loadUsers();
    }
  }, [activeTab, usersLoading, loadUsers]);

  // Real-time refresh: matrix/axes/enterprise-users are @shared_cache reads that
  // the backend SSE-invalidates (CacheKey.SECURITY_MATRIX / ENTERPRISE_USERS) on
  // any admin's write. Without this, a second admin's edit stays stale until a
  // manual refresh. The users tab is lazy — only refetch it once it has loaded.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const keys = lastInvalidation.keys;
    if (keys.includes(CACHE_KEYS.SECURITY_MATRIX)) {
      loadMatrix(true);
      loadAxes(true);
    }
    if (keys.includes(CACHE_KEYS.ENTERPRISE_USERS) && usersLoadedRef.current) {
      loadUsers();
    }
  }, [lastInvalidation, loadMatrix, loadAxes, loadUsers]);

  // ============= MATRIX INLINE EDITING =============

  const handleMatrixCellChange = useCallback((rowId: number, field: string, value: string | null) => {
    setDirtyMatrixRows((prev) => {
      const next = new Map(prev);
      const existing = next.get(rowId) || {};
      next.set(rowId, { ...existing, [field]: value });
      return next;
    });
    // Also update local state for immediate visual feedback
    setMatrixData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row
        ),
      };
    });
  }, []);

  const handleSaveMatrixChanges = async () => {
    if (dirtyMatrixRows.size === 0) return;
    try {
      const updates = Array.from(dirtyMatrixRows.entries()).map(([id, changes]) => {
        const axes: Record<string, string | null> = {};
        let access_level: string | undefined;
        for (const [key, val] of Object.entries(changes)) {
          if (key === 'access_level') {
            access_level = val ?? undefined;
          } else {
            axes[key] = val;
          }
        }
        return { id, axes: Object.keys(axes).length > 0 ? axes : undefined, access_level };
      });

      await batchUpdateSecurityMatrix({ updates });
      // Matrix edits change role→scope mappings — refresh the cached allow-set.
      invalidateMyPermissions();
      toast.success(`Saved ${updates.length} changes`);
      setDirtyMatrixRows(new Map());
      loadMatrix(true);
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Failed to save changes');
    }
  };

  const handleDeleteMatrixRow = async (row: SecurityMatrixEntryRow) => {
    if (confirmAction?.type !== 'deleteMatrix' || confirmAction.id !== row.id) {
      setConfirmAction({ type: 'deleteMatrix', id: row.id });
      return;
    }
    setConfirmAction(null);
    try {
      await deleteSecurityMatrixEntry(row.id);
      invalidateMyPermissions();
      toast.success('Entry deleted');
      setDirtyMatrixRows((prev) => { const next = new Map(prev); next.delete(row.id); return next; });
      loadMatrix(true);
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Failed to delete');
    }
  };

  const handleAddMatrixEntry = async () => {
    setMatrixFormError(null);
    try {
      await createSecurityMatrixEntry({
        role_name: matrixForm.role_name.trim(),
        axes: {
          region_id: matrixForm.region_id || null,
          store_id: matrixForm.store_id || null,
          department_id: matrixForm.department_id || null,
          product_category: matrixForm.product_category || null,
          customer_segment: matrixForm.customer_segment || null,
        },
        access_level: matrixForm.access_level,
      });
      invalidateMyPermissions();
      toast.success('Entry added');
      setShowAddMatrixModal(false);
      setMatrixForm({ role_name: '', region_id: '', store_id: '', department_id: '', product_category: '', customer_segment: '', access_level: 'READ' });
      loadMatrix(true);
    } catch (err: any) {
      setMatrixFormError(formatApiDetail(err?.response?.data?.detail) || 'Failed to add entry');
    }
  };

  // ============= ENTERPRISE USERS EDITING =============

  const handleUserCellChange = useCallback((username: string, field: keyof EnterpriseUserUpdate, value: string | null) => {
    setDirtyUserRows((prev) => {
      const next = new Map(prev);
      const existing = next.get(username) || {};
      next.set(username, { ...existing, [field]: value });
      return next;
    });
    setUsers((prev) =>
      prev.map((u) => u.USERNAME === username ? { ...u, [field.toUpperCase()]: value } : u)
    );
  }, []);

  const handleSaveUserChanges = async () => {
    if (dirtyUserRows.size === 0) return;
    let saved = 0;
    for (const [username, changes] of dirtyUserRows) {
      try {
        // Drop nulls (cleared cells) into empty strings so the backend resets them.
        const update: EnterpriseUserUpdate = {};
        (Object.keys(changes) as (keyof EnterpriseUserUpdate)[]).forEach((field) => {
          update[field] = changes[field] ?? '';
        });
        await updateEnterpriseUser(username, update);
        saved++;
      } catch (err: any) {
        toast.error(`Failed to update ${username}: ${formatApiDetail(err?.response?.data?.detail) || err.message}`);
      }
    }
    if (saved > 0) {
      toast.success(`Saved ${saved} user changes`);
      setDirtyUserRows(new Map());
      loadUsers();
    }
  };

  const handleDeleteUser = async (user: EnterpriseUser) => {
    if (confirmAction?.type !== 'deleteUser' || confirmAction.id !== user.USERNAME) {
      setConfirmAction({ type: 'deleteUser', id: user.USERNAME });
      return;
    }
    setConfirmAction(null);
    try {
      await deleteEnterpriseUser(user.USERNAME);
      toast.success('User removed from directory');
      setDirtyUserRows((prev) => { const next = new Map(prev); next.delete(user.USERNAME); return next; });
      loadUsers();
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Failed to remove user');
    }
  };

  const handleSyncUsers = async () => {
    setSyncing(true);
    try {
      const result = await syncEnterpriseUsers();
      toast.success(result.message || `Synced ${result.synced} users`);
      usersLoadedRef.current = false; // Allow reload after sync
      loadUsers();
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // ============= AXES CRUD =============

  const handleAddAxis = async () => {
    setAxisFormError(null);
    try {
      const values = axisForm.values.split(',').map((v) => v.trim()).filter(Boolean);
      await createSecurityAxis({ name: axisForm.name, type: axisForm.type, description: axisForm.description, values });
      toast.success('Axis created');
      setShowAddAxisModal(false);
      resetAxisForm();
      loadAxes(true);
    } catch (err: any) {
      setAxisFormError(formatApiDetail(err?.response?.data?.detail) || 'Failed to create axis');
    }
  };

  const handleUpdateAxis = async () => {
    if (!editingAxis) return;
    setAxisFormError(null);
    try {
      const values = axisForm.values.split(',').map((v) => v.trim()).filter(Boolean);
      await updateSecurityAxis(editingAxis.id, { name: axisForm.name, description: axisForm.description, values });
      toast.success('Axis updated');
      setEditingAxis(null);
      resetAxisForm();
      loadAxes(true);
    } catch (err: any) {
      setAxisFormError(formatApiDetail(err?.response?.data?.detail) || 'Failed to update axis');
    }
  };

  const handleDeleteAxis = async (id: number) => {
    if (confirmAction?.type !== 'deleteAxis' || confirmAction.id !== id) {
      setConfirmAction({ type: 'deleteAxis', id });
      return;
    }
    setConfirmAction(null);
    try {
      await deleteSecurityAxis(id);
      toast.success('Axis deleted');
      loadAxes(true);
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Failed to delete axis');
    }
  };

  const resetAxisForm = () => { setAxisForm({ name: '', type: 'region', description: '', values: '' }); setAxisFormError(null); };

  // ============= FILTERED DATA =============

  const filteredMatrixEntries = useMemo(() => {
    if (!matrixData?.entries) return [];
    return matrixData.entries.filter((row) => {
      if (matrixSearch && !row.role_name.toLowerCase().includes(matrixSearch.toLowerCase())) return false;
      if (accessLevelFilter && row.access_level !== accessLevelFilter) return false;
      return true;
    });
  }, [matrixData?.entries, matrixSearch, accessLevelFilter]);

  const filteredUsers = useMemo(() => {
    const safeUsers = Array.isArray(users) ? users : [];
    return safeUsers.filter((u) => {
      if (userSearch) {
        const q = userSearch.toLowerCase();
        if (!u.USERNAME.toLowerCase().includes(q) && !(u.DISPLAY_NAME || '').toLowerCase().includes(q) && !(u.EMAIL || '').toLowerCase().includes(q)) return false;
      }
      if (statusFilter && u.STATUS !== statusFilter) return false;
      if (idpFilter && u.IDENTITY_PROVIDER !== idpFilter) return false;
      return true;
    });
  }, [users, userSearch, statusFilter, idpFilter]);

  // ============= TANSTACK TABLES =============

  const matrixColumns = useMemo(
    () => getMatrixColumns(matrixData?.available_axes, new Set(dirtyMatrixRows.keys()), handleMatrixCellChange, handleDeleteMatrixRow, canDeleteGov),
    [matrixData?.available_axes, dirtyMatrixRows, handleMatrixCellChange, canDeleteGov]
  );

  const matrixTable = useReactTable({
    data: filteredMatrixEntries,
    columns: matrixColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const userColumns = useMemo(
    () => getEnterpriseUsersColumns(new Set(dirtyUserRows.keys()), handleUserCellChange, handleDeleteUser, canDeleteGov),
    [dirtyUserRows, handleUserCellChange, canDeleteGov]
  );

  const usersTable = useReactTable({
    data: filteredUsers,
    columns: userColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  // ============= ENTERPRISE USERS STATS =============

  const userStats = useMemo(() => {
    const safeUsers = Array.isArray(users) ? users : [];
    const total = safeUsers.length;
    const active = safeUsers.filter((u) => u.STATUS === 'ACTIVE').length;
    const disabled = safeUsers.filter((u) => u.STATUS === 'DISABLED').length;
    const saml = safeUsers.filter((u) => u.IDENTITY_PROVIDER && u.IDENTITY_PROVIDER !== 'LOCAL').length;
    const mfa = safeUsers.filter((u) => u.HAS_MFA).length;
    return { total, active, disabled, saml, mfa };
  }, [users]);

  // ============= RENDER =============

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-violet-500/25">
            <HiOutlineShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Security Matrix
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Enterprise access control with identity provider sync
            </p>
          </div>
        </div>
        {activeTab === 'users' && (
          <Button
            onClick={handleSyncUsers}
            disabled={syncing}
            className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-lg"
          >
            <HiOutlineCloudArrowDown className={`w-5 h-5 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from Snowflake'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab 1: Access Matrix */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SecurityMatrixFilters
              searchText={matrixSearch}
              onSearchChange={setMatrixSearch}
              accessLevelFilter={accessLevelFilter}
              onAccessLevelChange={setAccessLevelFilter}
              mode="matrix"
            />
            <Button
              onClick={() => { setMatrixFormError(null); setShowAddMatrixModal(true); }}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
            >
              <HiOutlinePlus className="w-4 h-4 mr-2" />
              Add Row
            </Button>
          </div>

          {matrixLoading ? (
            <TableSkeleton rows={8} columns={8} />
          ) : matrixError ? (
            <ErrorDisplay error={matrixError} onRetry={loadMatrix} context="general" />
          ) : filteredMatrixEntries.length === 0 ? (
            <ModernCard className="p-12 text-center">
              <HiOutlineTableCells className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">No matrix entries found</p>
              <Button onClick={() => { setMatrixFormError(null); setShowAddMatrixModal(true); }} className="mt-4 bg-emerald-600 text-white">
                Add First Entry
              </Button>
            </ModernCard>
          ) : (
            <ModernCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    {matrixTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {matrixTable.getRowModel().rows.map((row) => (
                      <Fragment key={row.id}>
                      <tr
                        className={`border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                          dirtyMatrixRows.has(row.original.id) ? 'bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-l-amber-400' : ''
                        }`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-2.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {confirmAction?.type === 'deleteMatrix' && confirmAction.id === row.original.id && (
                        <tr key={`${row.id}-confirm`}>
                          <td colSpan={row.getVisibleCells().length}>
                            <div className="flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded mx-2 my-1">
                              <span className="text-xs text-red-700 dark:text-red-400">Delete entry for role &quot;{row.original.role_name}&quot;?</span>
                              <div className="flex items-center gap-2">
                                <button
                                  className="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => handleDeleteMatrixRow(row.original)}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="text-xs px-3 py-1 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
                                  onClick={() => setConfirmAction(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredMatrixEntries.length} entries
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => matrixTable.previousPage()} disabled={!matrixTable.getCanPreviousPage()}>
                    Previous
                  </Button>
                  <span className="text-xs text-slate-500">
                    Page {matrixTable.getState().pagination.pageIndex + 1} of {matrixTable.getPageCount()}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => matrixTable.nextPage()} disabled={!matrixTable.getCanNextPage()}>
                    Next
                  </Button>
                </div>
              </div>
            </ModernCard>
          )}

          {/* Save Changes floating bar */}
          {dirtyMatrixRows.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
              <div className="flex items-center gap-3 px-6 py-3 bg-amber-500 text-white rounded-full shadow-2xl shadow-amber-500/30">
                <span className="text-sm font-medium">{dirtyMatrixRows.size} unsaved changes</span>
                <Button size="sm" onClick={handleSaveMatrixChanges} className="bg-white text-amber-700 hover:bg-amber-50 dark:bg-gray-800 dark:text-amber-400">
                  <Save className="w-4 h-4 mr-1" />
                  Save All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white text-white hover:bg-amber-600"
                  onClick={() => { setDirtyMatrixRows(new Map()); loadMatrix(); }}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Enterprise Users */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Info Panel */}
          <ModernCard className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-600 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Identity Provider Integration</p>
                <p>
                  Snowflake supports SCIM provisioning from <strong>Microsoft Entra ID</strong>, <strong>Okta</strong>, and custom SCIM providers.
                  Users provisioned via SCIM are automatically detected when you click &quot;Sync from Snowflake&quot;.
                  Their identity provider is inferred from user metadata fields.
                </p>
              </div>
            </div>
          </ModernCard>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard icon={HiOutlineUserGroup} label="Total Users" value={userStats.total} color="from-blue-500 to-cyan-600" />
            <StatCard icon={HiOutlineCheckCircle} label="Active" value={userStats.active} color="from-emerald-500 to-teal-600" />
            <StatCard icon={HiOutlineLockClosed} label="Disabled" value={userStats.disabled} color="from-red-500 to-rose-600" />
            <StatCard icon={HiOutlineGlobeAlt} label="SSO/SAML" value={userStats.saml} color="from-violet-500 to-purple-600" />
            <StatCard icon={HiOutlineFingerPrint} label="MFA Enabled" value={userStats.mfa} color="from-amber-500 to-orange-600" />
          </div>

          {/* Filters */}
          <SecurityMatrixFilters
            searchText={userSearch}
            onSearchChange={setUserSearch}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            idpFilter={idpFilter}
            onIdpChange={setIdpFilter}
            mode="users"
          />

          {/* Table */}
          {usersLoading ? (
            <TableSkeleton rows={8} columns={9} />
          ) : usersError ? (
            <ErrorDisplay error={usersError} onRetry={loadUsers} context="general" />
          ) : filteredUsers.length === 0 ? (
            <ModernCard className="p-12 text-center">
              <HiOutlineUserGroup className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">No enterprise users found</p>
              <p className="text-xs text-slate-400 mt-1">Click &quot;Sync from Snowflake&quot; to populate the directory</p>
            </ModernCard>
          ) : (
            <ModernCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    {usersTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wider">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {usersTable.getRowModel().rows.map((row) => (
                      <Fragment key={row.id}>
                      <tr
                        className={`border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                          dirtyUserRows.has(row.original.USERNAME) ? 'bg-amber-50/50 dark:bg-amber-900/10 border-l-2 border-l-amber-400' : ''
                        }`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-2.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {confirmAction?.type === 'deleteUser' && confirmAction.id === row.original.USERNAME && (
                        <tr key={`${row.id}-confirm`}>
                          <td colSpan={row.getVisibleCells().length}>
                            <div className="flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded mx-2 my-1">
                              <span className="text-xs text-red-700 dark:text-red-400">Remove &quot;{row.original.USERNAME}&quot; from enterprise directory?</span>
                              <div className="flex items-center gap-2">
                                <button
                                  className="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => handleDeleteUser(row.original)}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="text-xs px-3 py-1 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
                                  onClick={() => setConfirmAction(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredUsers.length} users
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => usersTable.previousPage()} disabled={!usersTable.getCanPreviousPage()}>
                    Previous
                  </Button>
                  <span className="text-xs text-slate-500">
                    Page {usersTable.getState().pagination.pageIndex + 1} of {usersTable.getPageCount()}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => usersTable.nextPage()} disabled={!usersTable.getCanNextPage()}>
                    Next
                  </Button>
                </div>
              </div>
            </ModernCard>
          )}

          {/* Save bar for user changes */}
          {dirtyUserRows.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
              <div className="flex items-center gap-3 px-6 py-3 bg-amber-500 text-white rounded-full shadow-2xl shadow-amber-500/30">
                <span className="text-sm font-medium">{dirtyUserRows.size} unsaved user changes</span>
                <Button size="sm" onClick={handleSaveUserChanges} className="bg-white text-amber-700 hover:bg-amber-50 dark:bg-gray-800 dark:text-amber-400">
                  <Save className="w-4 h-4 mr-1" />
                  Save All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white text-white hover:bg-amber-600"
                  onClick={() => { setDirtyUserRows(new Map()); loadUsers(); }}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Security Axes */}
      {activeTab === 'axes' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(['region', 'store', 'department', 'custom'] as const).map((type) => {
              const Icon = AXIS_TYPE_ICONS[type];
              const count = axes.filter((a) => a.type === type).length;
              const totalValues = axes.filter((a) => a.type === type).reduce((sum, a) => sum + a.values.length, 0);
              return (
                <StatCard
                  key={type}
                  icon={Icon}
                  label={`${type.charAt(0).toUpperCase() + type.slice(1)}s`}
                  value={count}
                  color={AXIS_TYPE_COLORS[type]}
                  badge={`${totalValues} values`}
                />
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => { setAxisFormError(null); setShowAddAxisModal(true); }} className="bg-gradient-to-r from-violet-500 to-purple-600 text-white">
              <HiOutlinePlus className="w-4 h-4 mr-2" />
              Add Security Axis
            </Button>
          </div>

          {/* Axes Grid */}
          {axesLoading ? (
            <TableSkeleton rows={3} columns={2} showHeader={false} />
          ) : axesError ? (
            <ErrorDisplay error={axesError} onRetry={loadAxes} context="general" />
          ) : axes.length === 0 ? (
            <ModernCard className="p-12 text-center">
              <HiOutlineShieldCheck className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">No security axes found</p>
              <Button onClick={() => { setAxisFormError(null); setShowAddAxisModal(true); }} className="mt-4 bg-violet-600 text-white">
                Create First Axis
              </Button>
            </ModernCard>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {axes.map((axis) => {
                const Icon = AXIS_TYPE_ICONS[axis.type];
                const colorClass = AXIS_TYPE_COLORS[axis.type];
                return (
                  <ModernCard key={axis.id} className="p-6 hover:shadow-xl transition-all duration-300">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{axis.name}</h3>
                          <Badge className="mt-1 capitalize">{axis.type}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAxisFormError(null);
                            setEditingAxis(axis);
                            setAxisForm({ name: axis.name, type: axis.type, description: axis.description || '', values: axis.values.join(', ') });
                          }}
                          className="text-blue-600 hover:bg-blue-50"
                        >
                          <HiOutlinePencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteAxis(axis.id)} className="text-red-600 hover:bg-red-50">
                          <HiOutlineTrash className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {confirmAction?.type === 'deleteAxis' && confirmAction.id === axis.id && (
                      <div className="flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded mb-4">
                        <span className="text-xs text-red-700 dark:text-red-400">Delete this security axis?</span>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                            onClick={() => handleDeleteAxis(axis.id)}
                          >
                            Confirm
                          </button>
                          <button
                            className="text-xs px-3 py-1 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
                            onClick={() => setConfirmAction(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {axis.description && <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{axis.description}</p>}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Values ({axis.values.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {axis.values.slice(0, 10).map((v, i) => (
                          <Badge key={i} className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-xs">
                            {v}
                          </Badge>
                        ))}
                        {axis.values.length > 10 && (
                          <Badge className="bg-blue-100 text-blue-700">+{axis.values.length - 10} more</Badge>
                        )}
                      </div>
                    </div>
                  </ModernCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Matrix Entry Panel */}
      <PolicyFormPanel
        isOpen={showAddMatrixModal}
        onClose={() => setShowAddMatrixModal(false)}
        title="New Matrix Entry"
        description="Role and axis access mapping"
        accentClassName="bg-emerald-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddMatrixModal(false)}>Cancel</Button>
            <Button onClick={handleAddMatrixEntry} disabled={!matrixForm.role_name.trim()} className="bg-emerald-600 text-white">
              Add Entry
            </Button>
          </>
        }
      >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Role</label>
              <Input value={matrixForm.role_name} onChange={(e) => setMatrixForm((f) => ({ ...f, role_name: e.target.value }))} placeholder="ROLE_NAME" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Access Level</label>
              <Select
                options={[{ label: 'READ', value: 'READ' }, { label: 'WRITE', value: 'WRITE' }, { label: 'ADMIN', value: 'ADMIN' }]}
                value={matrixForm.access_level}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, access_level: v?.value ?? 'READ' }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Region</label>
              <Select
                options={[{ label: '— All', value: '' }, ...(matrixData?.available_axes?.regions?.map((r) => ({ label: r.name, value: r.id })) ?? [])]}
                value={matrixForm.region_id ?? ''}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, region_id: v?.value || null }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Store</label>
              <Select
                options={[{ label: '— All', value: '' }, ...(matrixData?.available_axes?.stores?.map((s) => ({ label: s.name, value: s.id })) ?? [])]}
                value={matrixForm.store_id ?? ''}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, store_id: v?.value || null }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Department</label>
              <Select
                options={[{ label: '— All', value: '' }, ...(matrixData?.available_axes?.departments?.map((d) => ({ label: d.name, value: d.id })) ?? [])]}
                value={matrixForm.department_id ?? ''}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, department_id: v?.value || null }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Product Category</label>
              <Input value={matrixForm.product_category ?? ''} onChange={(e) => setMatrixForm((f) => ({ ...f, product_category: e.target.value || null }))} placeholder="optional" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Customer Segment</label>
              <Input value={matrixForm.customer_segment ?? ''} onChange={(e) => setMatrixForm((f) => ({ ...f, customer_segment: e.target.value || null }))} placeholder="optional" className="w-full" />
            </div>
          </div>
          {matrixFormError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {matrixFormError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Add/Edit Axis Panel */}
      <PolicyFormPanel
        isOpen={showAddAxisModal || !!editingAxis}
        onClose={() => { setShowAddAxisModal(false); setEditingAxis(null); resetAxisForm(); }}
        title={editingAxis ? 'Edit Security Axis' : 'Create Security Axis'}
        accentClassName="bg-violet-500"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowAddAxisModal(false); setEditingAxis(null); resetAxisForm(); }}>Cancel</Button>
            <Button onClick={editingAxis ? handleUpdateAxis : handleAddAxis} className="bg-violet-600 text-white">
              {editingAxis ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
              <Input value={axisForm.name} onChange={(e) => setAxisForm({ ...axisForm, name: e.target.value })} placeholder="e.g., North America" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
              <Select
                options={AXIS_TYPE_OPTIONS}
                value={axisForm.type}
                onChange={(option: SelectOption | string) => {
                  const next = typeof option === 'string' ? option : option?.value;
                  setAxisForm({ ...axisForm, type: (next as SecurityAxis['type']) ?? 'region' });
                }}
                disabled={!!editingAxis}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Description</label>
              <Input value={axisForm.description} onChange={(e) => setAxisForm({ ...axisForm, description: e.target.value })} placeholder="Brief description" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Values (comma-separated)</label>
              <textarea
                value={axisForm.values}
                onChange={(e) => setAxisForm({ ...axisForm, values: e.target.value })}
                placeholder="USA, Canada, Mexico"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
            </div>
            {axisFormError && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
                {axisFormError}
              </p>
            )}
          </div>
      </PolicyFormPanel>
    </div>
    </ErrorBoundary>
  );
}
