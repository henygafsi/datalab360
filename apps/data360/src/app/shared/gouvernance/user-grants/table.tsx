'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
} from '@tanstack/react-table';
import { exportToCSV } from '@core/utils/export-to-csv';
import {
  getUsersWithRolesAndModules,
  updateUserRoles
} from '@/app/services/gouvernance/user_roles';
import { getRoles as getAllRoles } from '@/app/services/gouvernance/fetch_roles';
import { getRoles as getRoleGrants } from '@/app/services/gouvernance/grants';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import Table from '@core/components/table';
import { toast } from 'react-hot-toast';
import { Checkbox, Button, Badge, Modal, ActionIcon } from 'rizzui';
import { getAllModules, type ModuleConfig } from '@/config/modules';
import {
  PiUserCircleDuotone,
  PiPencilDuotone,
  PiTrashDuotone,
  PiCheckCircleDuotone,
  PiXCircleDuotone,
} from 'react-icons/pi';
import { IconType } from 'react-icons/lib';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<UserGrantTableDataType[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [roleGrants, setRoleGrants] = useState<{ role_name: string; modules: string[] }[]>([]);
  const [modal, setModal] = useState<{
    open: boolean;
    user?: UserGrantTableDataType;
    selectedRoles: string[];
  }>({ open: false, selectedRoles: [] });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Watch for SSE cache invalidation events
  const { wasInvalidated } = useCacheInvalidationWatcher([
    CACHE_KEYS.USERS,
    CACHE_KEYS.GRANTS,
  ]);
  const mountedRef = useRef(true);

  /* ------------------------------------------------------------------ */
  /* 1. Fetch Data                                                      */
  /* ------------------------------------------------------------------ */
  const fetchUserGrantsData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      console.log('[User Grants] 🔄 Starting data fetch...');
      console.log('[User Grants] API Calls:');
      console.log('[User Grants]   1. GET /gouvernance/users (with roles and modules)');
      console.log('[User Grants]   2. GET /gouvernance/roles (all available roles)');
      console.log('[User Grants]   3. GET /gouvernance/grants (role-module permissions)');
      const startTime = Date.now();

      // Fetch all data in parallel (users, roles, and grants)
      // Cache roleGrants to avoid redundant fetches in modal
      const [usersData, rolesData, grantsData] = await Promise.all([
        getUsersWithRolesAndModules(),
        getAllRoles(),
        getRoleGrants(), // Fetch grants once here, cache for modal use
      ]);

      const fetchTime = Date.now() - startTime;
      console.log(`[User Grants] ✅ Data fetched successfully in ${fetchTime}ms`);
      console.log(`[User Grants]   - Users: ${usersData.length}`);
      console.log(`[User Grants]   - Roles (total): ${rolesData.length}`);
      console.log(`[User Grants]   - Grants: ${grantsData.length}`);

      // All roles from backend are assignable (no system role filtering)
      // ALL, PUBLIC, ACCOUNTADMIN, etc. are custom roles managed in Snowflake tables
      const assignableRoles = rolesData.map(r => r.role);

      console.log(`[User Grants]   - Assignable roles: ${assignableRoles.length}`);
      console.log(`[User Grants]   - Available roles:`, assignableRoles);

      if (mountedRef.current) {
        setTableData(usersData);
        setAvailableRoles(assignableRoles);
        setRoleGrants(grantsData); // Cache for modal
      }
    } catch (err: any) {
      console.error('[User Grants Table] ❌ Error fetching data:', err);
      console.error('[User Grants Table] Error type:', err.name);
      console.error('[User Grants Table] Error code:', err.code);
      console.error('[User Grants Table] Error message:', err.message);

      // Only redirect when real auth (no token, expired) or 500 connection; not on 503/401 endpoint issues
      if (shouldRedirectToLoginOnError(err)) {
        console.warn('[User Grants Table] Auth/connection error, redirecting to login...', err.name);
        redirectToLogin();
        return;
      }

      // For timeout/network/server errors, show helpful error message
      if (mountedRef.current) {
        let errorMessage = 'Failed to load grants data. ';

        if (err.name === 'TimeoutError' || err.code === 'ECONNABORTED') {
          errorMessage += 'Backend is taking too long (>30s). Please check backend performance.';
        } else if (err.name === 'NetworkError') {
          errorMessage += 'Cannot connect to backend. Please check if backend is running.';
        } else if (err.response?.status === 500) {
          errorMessage += 'Backend server error. Please check backend logs.';
        } else {
          errorMessage += err.message || 'Unknown error';
        }

        setError(errorMessage);
      }

      if (mountedRef.current) {
        // For any other unexpected errors, show message
        setError(err.message || 'Failed to load user grants. Check console for details.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchUserGrantsData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchUserGrantsData]);

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] User grants cache invalidated - refreshing data...');
      fetchUserGrantsData(true);
    }
  }, [wasInvalidated, loading, fetchUserGrantsData]);

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
          {row.original.modules.length > 0 ? (
            row.original.modules.slice(0, 3).map((module) => {
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
          {row.original.modules.length > 3 && (
            <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              +{row.original.modules.length - 3}
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

    setModal({
      open: true,
      user,
      selectedRoles: [...userRolesWithoutAll],
    });
  };

  const handleCloseModal = () => {
    setModal({ open: false, selectedRoles: [] });
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
      grant?.modules.forEach((mod) => modules.add(mod));
    });

    return Array.from(modules).sort();
  }, [modal.selectedRoles, roleGrants]);

  const handleSaveRoles = async () => {
    if (!modal.user) return;

    const currentUser = modal.user; // Capture user reference for closure

    try {
      console.log('[User Grants] ========== SAVE STARTED ==========');
      console.log('[User Grants] Username:', currentUser.username);
      console.log('[User Grants] Display Name:', currentUser.displayName);
      console.log('[User Grants] Selected roles:', modal.selectedRoles);
      console.log('[User Grants] Previous roles:', currentUser.roles);

      const username = currentUser.username;
      const displayName = currentUser.displayName;

      // Filter out "ALL" - it's a UI-only concept, not a real Snowflake role
      // ALL means "select all available roles" in the UI
      const rolesToSend = modal.selectedRoles.filter(r => r !== 'ALL');
      const expectedRoles = [...rolesToSend].sort();

      console.log('[User Grants] Selected roles (UI):', modal.selectedRoles);
      console.log('[User Grants] Roles to send (API):', rolesToSend);

      // Step 1: Send update to backend
      console.log('[User Grants] Step 1: Sending update to backend...');
      console.log('[User Grants] Step 1: Endpoint: PUT /gouvernance/users/' + username + '/roles');
      console.log('[User Grants] Step 1: Payload:', { roles: rolesToSend });
      const updateResponse = await updateUserRoles(username, rolesToSend);
      console.log('[User Grants] Step 1: Backend response:', updateResponse);

      // Step 2: Refresh data from backend
      console.log('[User Grants] Step 2: Refreshing data from backend...');
      const refreshStartTime = Date.now();
      await fetchUserGrantsData(true);
      console.log('[User Grants] Step 2: Data refreshed in', Date.now() - refreshStartTime, 'ms');

      // Step 3: Verify what we got back (after state update)
      setTimeout(() => {
        setTableData((currentData) => {
          const updatedUser = currentData.find(u => u.username === username);
          console.log('[User Grants] Step 3: Verification after refresh');
          console.log('[User Grants]   - Expected roles (sent to backend):', expectedRoles);
          console.log('[User Grants]   - Actual roles from backend:', updatedUser?.roles);

          // Filter out "ALL" from actual roles (might be legacy data)
          // Filter out "PUBLIC" (auto-added by Snowflake)
          const protectedRoles = ['ALL', 'PUBLIC'];
          const actualRoles = (updatedUser?.roles || [])
            .filter(r => !protectedRoles.includes(r))
            .sort();

          // Normalize to uppercase for case-insensitive comparison
          const expectedNormalized = expectedRoles.map(r => r.toUpperCase()).sort();
          const actualNormalized = actualRoles.map(r => r.toUpperCase()).sort();

          const match = JSON.stringify(expectedNormalized) === JSON.stringify(actualNormalized);

          console.log('[User Grants]   - Expected (normalized):', expectedNormalized);
          console.log('[User Grants]   - Actual (without ALL/PUBLIC):', actualNormalized);
          console.log('[User Grants]   - Match:', match);

          if (!match) {
            console.error('[User Grants] ⚠️ PERSISTENCE ISSUE DETECTED!');
            console.error('[User Grants]   Expected:', expectedNormalized);
            console.error('[User Grants]   Got:', actualNormalized);

            const missing = expectedNormalized.filter(r => !actualNormalized.includes(r));
            const extra = actualNormalized.filter(r => !expectedNormalized.includes(r));

            if (missing.length > 0) {
              console.error('[User Grants]   Missing roles:', missing);
            }
            if (extra.length > 0) {
              console.error('[User Grants]   Extra roles:', extra);
            }

            console.error('[User Grants]   → Check backend logs for GRANT ROLE execution issues');
          } else {
            console.log('[User Grants] ✅ Roles persisted correctly');
          }

          return currentData;
        });
      }, 1000);

      // Show success toast immediately (aligned with Role Grants behavior)
      if (expectedRoles.length === 0) {
        toast.success(`✅ Removed all roles from ${displayName}`);
      } else {
        toast.success(`✅ Updated roles for ${displayName}`);
      }

      console.log('[User Grants] ========== SAVE COMPLETED ==========');
      handleCloseModal();
    } catch (err: any) {
      console.error('[User Grants] ❌ Error saving roles:', err);
      console.error('[User Grants] Error type:', err.name);
      console.error('[User Grants] Error message:', err.message);
      console.error('[User Grants] Error response:', err.response?.data);

      if (shouldRedirectToLoginOnError(err)) {
        console.warn('[User Grants Table] Auth/connection error during save, redirecting to login...', err.name);
        redirectToLogin();
        return;
      }

      toast.error(`Failed to update roles: ${err.message || 'Unknown error'}`);
    }
  };

  /* ------------------------------------------------------------------ */
  /* 4. Table Instance                                                  */
  /* ------------------------------------------------------------------ */
  const table = useReactTable({
    data: tableData,
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
        error={error}
        onRetry={() => fetchUserGrantsData()}
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
              onClick={() => fetchUserGrantsData(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <span className="text-sm text-slate-500">
              {tableData.length} users
            </span>
          </div>
        </div>

        {/* Table */}
        <Table table={table} variant="modern" />

        {/* Footer */}
        <TableFooter table={table} />
      </div>

      {/* Edit Roles Modal */}
      <Modal isOpen={modal.open} onClose={handleCloseModal} size="lg">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Manage Roles - {modal.user?.displayName}
          </h2>

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

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button onClick={handleSaveRoles}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
