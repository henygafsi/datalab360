'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
} from '@tanstack/react-table';
import {
  getUsersWithRolesAndModules,
  updateUserRoles
} from '@/app/services/governance/user_roles';
import { getRoles as getAllRoles } from '@/app/services/governance/fetch_roles';
import { getRoles as getRoleGrants } from '@/app/services/governance/grants';
import Table from '@core/components/table';
import { toast } from 'react-hot-toast';
import { Checkbox, Button, Badge, ActionIcon } from 'rizzui';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import { getAllModules, type ModuleConfig } from '@/config/modules';
import {
  PiUserCircleDuotone,
  PiPencilDuotone,
  PiTrashDuotone,
  PiCheckCircleDuotone,
  PiXCircleDuotone,
} from 'react-icons/pi';
import { IconType } from 'react-icons/lib';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw, Loader2, ShieldCheck } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { GrantsMatrixSkeleton } from '@/components/ui/TableSkeleton';
import { redirectToLogin, shouldRedirectToLoginOnError } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toServiceError } from '@/app/services/_errors';

export type UserGrantTableDataType = {
  username: string;
  displayName: string;
  email: string;
  roles: string[];
  modules: string[];
  status: string;
};

// Get ONLY visible modules
const VISIBLE_MODULES = getAllModules().filter(m => m.visible !== false);

export default function UserGrantsTable() {
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [roleGrants, setRoleGrants] = useState<{ role_name: string; modules: string[] }[]>([]);
  const [modal, setModal] = useState<{
    open: boolean;
    user?: UserGrantTableDataType;
    selectedRoles: string[];
  }>({ open: false, selectedRoles: [] });
  const [saveRolesError, setSaveRolesError] = useState<string | null>(null);

  // Action-RBAC: assigning roles is a mutating allow-set change → gate on
  // gouvernance:edit. Fail-open while the allow-set loads (row-action precedent
  // in users/columns.tsx), so a slow permission fetch doesn't lock out an admin.
  const { allowed: canEditAllowed, loading: canEditLoading } = useCanPerform('gouvernance', 'edit');
  const canEdit = canEditAllowed || canEditLoading;
  const editDeniedReason = 'You lack the "edit" permission on governance. Ask an administrator to grant it.';

  // Bulk reconcile (§E-3): set N selected users to an exact target role set,
  // atomically per user via updateUserRoles (PUT users/{u}/roles is a REPLACE).
  const [reconcileRoles, setReconcileRoles] = useState<string[]>([]);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileProgress, setReconcileProgress] = useState<{ done: number; total: number } | null>(null);
  const [reconcileConfirmOpen, setReconcileConfirmOpen] = useState(false);

  /* ------------------------------------------------------------------ */
  /* 1. Fetch Data                                                      */
  /* ------------------------------------------------------------------ */
  const fetchUserGrantsData = useCallback(async () => {
    // Fetch all data in parallel (users, roles, and grants)
    const [usersData, rolesData, grantsData] = await Promise.all([
      getUsersWithRolesAndModules(),
      getAllRoles(),
      getRoleGrants(),
    ]);

    // All roles from backend are assignable
    const assignableRoles = rolesData.map(r => r.role);

    // Build role -> modules lookup from grants data
    const roleModulesMap = new Map<string, string[]>();
    grantsData.forEach((g: { role_name: string; modules: string[] }) => {
      roleModulesMap.set(g.role_name.toUpperCase(), g.modules || []);
    });

    // Enrich each user with their derived modules (union of all role modules)
    const enrichedUsers: UserGrantTableDataType[] = usersData.map((user) => {
      const userModules = new Set<string>();
      (user.roles || []).forEach((role: string) => {
        const mods = roleModulesMap.get(role.toUpperCase());
        if (mods) mods.forEach((m: string) => userModules.add(m));
      });
      return {
        ...user,
        modules: Array.from(userModules).sort(),
      };
    });

    // Side-effect: update auxiliary state for the modal
    setAvailableRoles(assignableRoles);
    setRoleGrants(grantsData);

    return enrichedUsers;
  }, []);

  const { data: tableData, loading, error, refetch, isStale } = useCacheAwareQuery<UserGrantTableDataType[]>(
    fetchUserGrantsData,
    { cacheKeys: [CACHE_KEYS.USERS, CACHE_KEYS.GRANTS], initialData: [] }
  );

  /* ------------------------------------------------------------------ */
  /* 2. Table Columns                                                   */
  /* ------------------------------------------------------------------ */
  const columns: ColumnDef<UserGrantTableDataType>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all users"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select user"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    {
      header: 'User',
      accessorKey: 'displayName',
      cell: ({ row }) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">
            {row.original.displayName}
          </div>
          <div className="text-xs text-slate-500">{row.original.username}</div>
        </div>
      ),
    },
    {
      header: 'Email',
      accessorKey: 'email',
      cell: ({ getValue }) => (
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {getValue() as string || 'N/A'}
        </span>
      ),
    },
    {
      header: 'Roles',
      accessorKey: 'roles',
      cell: ({ row }) => {
        // Filter out "ALL" - it's a UI-only concept, not a real role
        const displayRoles = row.original.roles.filter(r => r !== 'ALL');

        return (
          <div className="flex flex-wrap gap-1">
            {displayRoles.length > 0 ? (
              displayRoles.map((role) => (
                <Badge
                  key={role}
                  className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                >
                  {role}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-slate-400">No roles</span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Modules',
      accessorKey: 'modules',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.modules || []).length > 0 ? (
            (row.original.modules || []).slice(0, 3).map((module) => {
              const moduleConfig = VISIBLE_MODULES.find(m => m.apiName === module);
              return (
                <Badge
                  key={module}
                  className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  {moduleConfig?.name || module}
                </Badge>
              );
            })
          ) : (
            <span className="text-xs text-slate-400">No access</span>
          )}
          {(row.original.modules || []).length > 3 && (
            <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              +{(row.original.modules || []).length - 3}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: ({ getValue }) => {
        const status = getValue() as string;
        return (
          <div className="flex items-center gap-2">
            {status === 'Active' ? (
              <>
                <PiCheckCircleDuotone className="text-green-500 h-4 w-4" />
                <span className="text-green-600 dark:text-green-400">Active</span>
              </>
            ) : (
              <>
                <PiXCircleDuotone className="text-red-500 h-4 w-4" />
                <span className="text-red-600 dark:text-red-400">Disabled</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      header: 'Actions',
      accessorKey: 'actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ActionIcon
            size="sm"
            variant="outline"
            onClick={() => handleEditClick(row.original)}
            disabled={!canEdit}
            title={canEdit ? 'Manage Roles' : editDeniedReason}
          >
            <PiPencilDuotone className="h-4 w-4" />
          </ActionIcon>
        </div>
      ),
    },
  ];

  /* ------------------------------------------------------------------ */
  /* 3. Modal Handlers                                                  */
  /* ------------------------------------------------------------------ */
  const handleEditClick = (user: UserGrantTableDataType) => {
    // Filter out "ALL" when opening modal - it's a UI-only concept
    // If user somehow has "ALL" in their roles, don't pre-select it
    const userRolesWithoutAll = user.roles.filter(r => r !== 'ALL');

    setSaveRolesError(null);
    setModal({
      open: true,
      user,
      selectedRoles: [...userRolesWithoutAll],
    });
  };

  const handleCloseModal = () => {
    setModal({ open: false, selectedRoles: [] });
    setSaveRolesError(null);
  };

  const handleRoleToggle = (roleName: string) => {
    setModal(prev => {
      const isSelected = prev.selectedRoles.includes(roleName);
      return {
        ...prev,
        selectedRoles: isSelected
          ? prev.selectedRoles.filter(r => r !== roleName)
          : [...prev.selectedRoles, roleName],
      };
    });
  };

  // Calculate module preview using cached roleGrants data (no API call!)
  const modulePreview = useMemo(() => {
    if (modal.selectedRoles.length === 0) return [];

    const modules = new Set<string>();
    modal.selectedRoles.forEach((role) => {
      const grant = roleGrants.find((g) => g.role_name === role);
      (grant?.modules || []).forEach((mod: string) => modules.add(mod));
    });

    return Array.from(modules).sort();
  }, [modal.selectedRoles, roleGrants]);

  const handleSaveRoles = async () => {
    if (!modal.user) return;

    const currentUser = modal.user; // Capture user reference for closure
    setSaveRolesError(null);

    try {
      // console.log('[User Grants] ========== SAVE STARTED ==========');
      // console.log('[User Grants] Username:', currentUser.username);
      // console.log('[User Grants] Display Name:', currentUser.displayName);
      // console.log('[User Grants] Selected roles:', modal.selectedRoles);
      // console.log('[User Grants] Previous roles:', currentUser.roles);

      const username = currentUser.username;
      const displayName = currentUser.displayName;

      // Filter out "ALL" - it's a UI-only concept, not a real Snowflake role
      // ALL means "select all available roles" in the UI
      const rolesToSend = modal.selectedRoles.filter(r => r !== 'ALL');
      const expectedRoles = [...rolesToSend].sort();

      // console.log('[User Grants] Selected roles (UI):', modal.selectedRoles);
      // console.log('[User Grants] Roles to send (API):', rolesToSend);

      // Step 1: Send update to backend
      // console.log('[User Grants] Step 1: Sending update to backend...');
      // console.log('[User Grants] Step 1: Endpoint: PUT /gouvernance/users/' + username + '/roles');
      // console.log('[User Grants] Step 1: Payload:', { roles: rolesToSend });
      const updateResponse = await updateUserRoles(username, rolesToSend);
      // console.log('[User Grants] Step 1: Backend response:', updateResponse);

      // Step 2: Refresh data from backend
      const refreshStartTime = Date.now();
      await refetch();
      // console.log('[User Grants] Step 2: Data refreshed in', Date.now() - refreshStartTime, 'ms');

      // Show success toast
      if (expectedRoles.length === 0) {
        toast.success(`✅ Removed all roles from ${displayName}`);
      } else {
        toast.success(`✅ Updated roles for ${displayName}`);
      }

      // console.log('[User Grants] ========== SAVE COMPLETED ==========');
      handleCloseModal();
    } catch (err: any) {
      // console.error('[User Grants] ❌ Error saving roles:', err);
      // console.error('[User Grants] Error type:', err.name);
      // console.error('[User Grants] Error message:', err.message);
      // console.error('[User Grants] Error response:', err.response?.data);

      if (shouldRedirectToLoginOnError(err)) {
        redirectToLogin();
        return;
      }

      setSaveRolesError(`Failed to update roles: ${err.message || 'Unknown error'}`);
    }
  };

  /* ------------------------------------------------------------------ */
  /* 3b. Bulk reconcile (§E-3)                                          */
  /* ------------------------------------------------------------------ */
  const toggleReconcileRole = (roleName: string) =>
    setReconcileRoles(prev =>
      prev.includes(roleName) ? prev.filter(r => r !== roleName) : [...prev, roleName],
    );

  // Module access the target role set would grant — computed from cached
  // roleGrants (no API call), so the admin sees the impact before applying.
  const reconcileModulePreview = useMemo(() => {
    if (reconcileRoles.length === 0) return [];
    const modules = new Set<string>();
    reconcileRoles.forEach((role) => {
      const grant = roleGrants.find((g) => g.role_name === role);
      (grant?.modules || []).forEach((mod: string) => modules.add(mod));
    });
    return Array.from(modules).sort();
  }, [reconcileRoles, roleGrants]);

  /* ------------------------------------------------------------------ */
  /* 4. Table Instance                                                  */
  /* ------------------------------------------------------------------ */
  const table = useReactTable({
    data: tableData ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Selected rows drive the docked reconcile bar (uncontrolled row-selection
  // state lives in the table instance; toggling a checkbox re-renders here).
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedUsernames = selectedRows.map((r) => r.original.username);

  // Apply the exact target role set to every selected user. PUT users/{u}/roles
  // is a REPLACE, so each user is set to exactly `reconcileRoles` (roles not in
  // the set are revoked). One statement per user → loop with per-row results.
  const handleReconcile = async () => {
    const targetRoles = reconcileRoles.filter(r => r !== 'ALL');
    setReconcileBusy(true);
    setReconcileProgress({ done: 0, total: selectedUsernames.length });
    const results: { user: string; ok: boolean; error?: string }[] = [];
    for (const username of selectedUsernames) {
      try {
        // updateUserRoles already calls invalidateMyPermissions() internally —
        // do NOT add a second call; the loop re-gates every open tab.
        await updateUserRoles(username, targetRoles);
        results.push({ user: username, ok: true });
      } catch (e: any) {
        if (shouldRedirectToLoginOnError(e)) {
          redirectToLogin();
          return;
        }
        results.push({ user: username, ok: false, error: toServiceError(e, 'Reconcile failed').message });
      }
      setReconcileProgress(p => (p ? { ...p, done: p.done + 1 } : p));
    }
    const okCount = results.filter(r => r.ok).length;
    const failCount = results.length - okCount;
    if (failCount === 0) {
      toast.success(`✅ Reconciled ${okCount} user${okCount === 1 ? '' : 's'} to the target role set`);
    } else if (okCount > 0) {
      toast(
        `⚠️ Reconcile: ${okCount} succeeded, ${failCount} failed (${results.filter(r => !r.ok).map(r => r.user).join(', ')})`,
        { icon: '⚠️' },
      );
    } else {
      toast.error(`❌ Reconcile failed for all ${failCount} user${failCount === 1 ? '' : 's'}`);
    }
    setReconcileBusy(false);
    setReconcileProgress(null);
    table.resetRowSelection();
    await refetch();
  };

  /* ------------------------------------------------------------------ */
  /* 5. Render                                                          */
  /* ------------------------------------------------------------------ */
  if (loading) {
    return <GrantsMatrixSkeleton />;
  }

  if (error) {
    return (
      <ErrorDisplay
        error={error?.message}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isStale}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isStale ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <span className="text-sm text-slate-500">
              {(tableData ?? []).length} users
            </span>
          </div>
        </div>

        {/* Docked bulk-reconcile bar — appears when ≥1 user is selected. Sets
            every selected user to an exact target role set (REPLACE), gated by
            useCanPerform('gouvernance','edit') and confirmed before it runs. */}
        {selectedRows.length > 0 && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                {selectedRows.length} user{selectedRows.length === 1 ? '' : 's'} selected — reconcile to a target role set
              </span>
              <Button
                variant="text"
                size="sm"
                onClick={() => table.resetRowSelection()}
                disabled={reconcileBusy}
              >
                Clear selection
              </Button>
            </div>

            {/* Target role set (exact — applied to every selected user) */}
            <div className="flex flex-wrap gap-2">
              {availableRoles.length > 0 ? (
                availableRoles.map((role) => (
                  <label
                    key={role}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2 py-1 text-sm dark:border-blue-900/40 dark:bg-gray-800"
                  >
                    <Checkbox
                      checked={reconcileRoles.includes(role)}
                      onChange={() => toggleReconcileRole(role)}
                      disabled={reconcileBusy}
                    />
                    <span>{role}</span>
                  </label>
                ))
              ) : (
                <span className="text-sm text-slate-500">No roles available</span>
              )}
            </div>

            {/* Resulting module access + apply */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium">Resulting module access:</span>
                {reconcileModulePreview.length > 0 ? (
                  reconcileModulePreview.map((module) => {
                    const moduleConfig = VISIBLE_MODULES.find(m => m.apiName === module);
                    return (
                      <Badge
                        key={module}
                        className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {moduleConfig?.name || module}
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-slate-400">
                    {reconcileRoles.length === 0 ? 'none — all roles will be revoked' : '—'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {reconcileProgress && (
                  <span className="text-sm text-blue-800 dark:text-blue-300">
                    {reconcileProgress.done}/{reconcileProgress.total}…
                  </span>
                )}
                <Button
                  onClick={() => setReconcileConfirmOpen(true)}
                  disabled={reconcileBusy || !canEdit}
                  title={canEdit ? undefined : editDeniedReason}
                >
                  {reconcileBusy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-2" />
                  )}
                  Apply to {selectedRows.length} user{selectedRows.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Roles Panel */}
      <PolicyFormPanel
        isOpen={modal.open}
        onClose={handleCloseModal}
        title={`Manage Roles${modal.user?.displayName ? ` — ${modal.user.displayName}` : ''}`}
        accentClassName="bg-blue-500"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button
              onClick={handleSaveRoles}
              disabled={!canEdit}
              title={canEdit ? undefined : editDeniedReason}
            >
              Save Changes
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            {/* Roles Selection */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Assign Roles
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                {availableRoles.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={modal.selectedRoles.includes(role)}
                      onChange={() => handleRoleToggle(role)}
                    />
                    <span className="text-sm">{role}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Module Preview */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Module Access Preview ({modulePreview.length})
              </h3>
              <div className="flex flex-wrap gap-1 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg min-h-[60px]">
                {modulePreview.length > 0 ? (
                  modulePreview.map((module) => {
                    const moduleConfig = VISIBLE_MODULES.find(m => m.apiName === module);
                    return (
                      <Badge
                        key={module}
                        className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {moduleConfig?.name || module}
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-sm text-slate-400">
                    Select roles to see module access
                  </span>
                )}
              </div>
            </div>

            {saveRolesError && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
                {saveRolesError}
              </p>
            )}
          </div>
      </PolicyFormPanel>

      {/* Reconcile confirm — explicit about REPLACE semantics (roles not in the
          target set are revoked) since this touches many identities at once. */}
      <ConfirmDialog
        open={reconcileConfirmOpen}
        title={`Reconcile ${selectedUsernames.length} user${selectedUsernames.length === 1 ? '' : 's'}`}
        message={
          reconcileRoles.filter(r => r !== 'ALL').length === 0
            ? `This will REVOKE ALL roles from ${selectedUsernames.length} selected user(s) — they will lose every role.\n\nUsers: ${selectedUsernames.join(', ')}`
            : `This REPLACES the current roles of ${selectedUsernames.length} selected user(s) with exactly:\n${reconcileRoles.filter(r => r !== 'ALL').join(', ')}\n\nAny role a user currently has that is not in this set will be revoked.\n\nUsers: ${selectedUsernames.join(', ')}`
        }
        confirmLabel="Apply"
        onConfirm={() => { setReconcileConfirmOpen(false); handleReconcile(); }}
        onCancel={() => setReconcileConfirmOpen(false)}
      />
    </>
  );
}
