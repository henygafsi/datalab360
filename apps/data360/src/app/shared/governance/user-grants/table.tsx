'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
} from '@tanstack/react-table';
import { exportToCSV } from '@core/utils/export-to-csv';
import {
  getUsersWithRolesAndModules,
  updateUserRoles
} from '@/app/services/governance/user_roles';
import { getRoles as getAllRoles } from '@/app/services/governance/fetch_roles';
import { getRoles as getRoleGrants } from '@/app/services/governance/grants';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
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
import { RefreshCw } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { GrantsMatrixSkeleton } from '@/components/ui/TableSkeleton';
import { redirectToLogin, shouldRedirectToLoginOnError } from '@/lib/api-client';

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
            title="Manage Roles"
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
  /* 4. Table Instance                                                  */
  /* ------------------------------------------------------------------ */
  const table = useReactTable({
    data: tableData ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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

        {/* Table */}
        <Table table={table} variant="modern" />

        {/* Footer */}
        <TableFooter table={table} />
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
            <Button onClick={handleSaveRoles}>Save Changes</Button>
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
    </>
  );
}
