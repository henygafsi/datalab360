'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
} from '@tanstack/react-table';
import { exportToCSV } from '@core/utils/export-to-csv';
import { getRoles, updateGrants, type RoleGrantData } from '@/app/services/gouvernance/grants';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import Filters from './filters';
import Table from '@core/components/table';
import { toast } from 'react-hot-toast';
import { Checkbox, Button } from 'rizzui';
import {
  getAllModules,
  expandModulesToIncludeSubModules,
  collapseSubModulesToParents,
  findModuleByApiName,
  type ModuleConfig,
  type SubModuleConfig
} from '@/config/modules';
import {
  PiUserCircleDuotone,
  PiMapPinLineDuotone,
  PiShootingStarDuotone,
  PiChartBarDuotone,
  PiCheckCircleDuotone,
  PiUserGearDuotone,
  PiStorefrontDuotone,
  PiBinocularsDuotone,
  PiBrainDuotone,
  PiGridFourDuotone,
  PiGlobeDuotone,
  PiCubeDuotone,
  PiChatCircleDuotone,
} from 'react-icons/pi';
import { IconType } from 'react-icons/lib';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { GrantsMatrixSkeleton } from '@/components/ui/TableSkeleton';
import { redirectToLogin, shouldRedirectToLoginOnError } from '@/lib/api-client';

type RoleGrant = RoleGrantData;

// Type used by columns.tsx - represents module with associated roles
export type GrantTableDataType = {
  id: string;
  name: string;
  roles: string[];
};

// Module icons mapping - includes both main modules and sub-modules
const MODULE_ICONS: Record<number, IconType> = {
  1: PiUserCircleDuotone,    // Connect Data
  2: PiMapPinLineDuotone,    // Mapping
  3: PiShootingStarDuotone,  // Workflow
  4: PiChartBarDuotone,      // Business Reporting
  5: PiCheckCircleDuotone,   // Data Health
  6: PiUserGearDuotone,      // Governance
  7: PiStorefrontDuotone,    // KPI's Store
  8: PiShootingStarDuotone,  // DaRquest / DAC
  9: PiBinocularsDuotone,    // Observability
  10: PiBrainDuotone,        // AI Intelligence
  11: PiGridFourDuotone,     // Dashboard
  12: PiGlobeDuotone,        // Explore & Design
  13: PiUserCircleDuotone,   // Account Overview
};

// Sub-module icons mapping (apiName → icon)
const SUB_MODULE_ICONS: Record<string, IconType> = {
  'cortex': PiBrainDuotone,
  'semantic_models': PiCubeDuotone,
  'cortex_chat': PiChatCircleDuotone,
};

// Get ONLY visible modules with icons for this component (excludes hidden modules)
const ALL_MODULES = getAllModules()
  .filter(m => m.visible !== false)  // Only show visible modules in the edit modal
  .map((m) => ({
    ...m,
    icon: MODULE_ICONS[m.id] || PiUserCircleDuotone,
  }));

export default function GrantsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [tableData, setTableData] = useState<RoleGrant[]>([]);
  const [modal, setModal] = useState<{ open: boolean; role?: RoleGrant }>(
    { open: false }
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Watch for SSE cache invalidation events on 'grants' key
  const { wasInvalidated } = useCacheInvalidationWatcher([CACHE_KEYS.GRANTS]);
  const mountedRef = useRef(true);

  /* ------------------------------------------------------------------ */
  /* 1. Fetch                                                            */
  /* ------------------------------------------------------------------ */
  const fetchGrantsData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      console.log('[Role Grants] 🔄 Starting data fetch...');
      const startTime = Date.now();

      const roles = await getRoles();

      const fetchTime = Date.now() - startTime;
      console.log(`[Role Grants] ✅ Data fetched successfully in ${fetchTime}ms`);
      console.log(`[Role Grants]   - Roles: ${roles.length}`);

      if (mountedRef.current) {
        setTableData(roles);
      }
    } catch (err: any) {
      console.error('[Grants Table] ❌ Error fetching grants:', err);
      console.error('[Grants Table] Error type:', err.name);
      console.error('[Grants Table] Error code:', err.code);
      console.error('[Grants Table] Error message:', err.message);

      // Only redirect when real auth or 500 connection; not on 503/401 endpoint issues
      if (shouldRedirectToLoginOnError(err)) {
        console.warn('[Grants Table] Auth/connection error, redirecting to login...', err.name);
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
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Initial fetch and set columns
  useEffect(() => {
    mountedRef.current = true;
    fetchGrantsData();
    setColumns([
          {
            header: 'Role',
            accessorKey: 'role_name',
            cell: ({ getValue }: any) => (
              <span className="font-semibold text-slate-900 dark:text-white">
                {getValue()}
              </span>
            ),
          },
          {
            header: 'Modules',
            accessorKey: 'modules',
            cell: ({ getValue }: any) => {
              const modules = getValue() as string[];
              if (!modules?.length) {
                return <span className="italic text-gray-400">No access</span>;
              }

              // Expand modules to include sub-modules for display
              const expandedModules = expandModulesToIncludeSubModules(modules);

              return (
                <div className="flex flex-wrap gap-1.5">
                  {expandedModules.map((apiName) => {
                    // Find module or sub-module by apiName
                    const item = findModuleByApiName(apiName);

                    // Determine icon
                    let Icon: IconType | undefined;
                    if (item) {
                      if ('id' in item && typeof item.id === 'number') {
                        // Main module
                        Icon = MODULE_ICONS[item.id];
                      } else {
                        // Sub-module
                        Icon = SUB_MODULE_ICONS[apiName];
                      }
                    }

                    return (
                      <span
                        key={apiName}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {Icon && <Icon className="h-3 w-3" />}
                        {item?.name || apiName}
                      </span>
                    );
                  })}
                </div>
              );
            },
          },
          {
            header: 'Last Action',
            accessorKey: 'last_action',
            cell: ({ getValue }: any) => {
              const action = getValue() as string | null;
              if (!action) return <span className="text-slate-400 dark:text-slate-500">-</span>;
              const colorMap: Record<string, string> = {
                'CREATED': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                'GRANTS_UPDATED': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                'SYNCED': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
              };
              const cls = colorMap[action] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
              return (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
                  {action.replace(/_/g, ' ')}
                </span>
              );
            },
          },
          {
            header: 'Updated',
            accessorKey: 'updated_at',
            cell: ({ row }: any) => {
              const date = row.original.updated_at;
              const by = row.original.updated_by;
              if (!date) return <span className="text-slate-400 dark:text-slate-500">-</span>;
              const formatted = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const time = new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              return (
                <div className="text-xs">
                  <div className="text-slate-700 dark:text-slate-300">{formatted} {time}</div>
                  {by && <div className="text-slate-400 dark:text-slate-500">by {by}</div>}
                </div>
              );
            },
          },
          {
            header: 'Actions',
            id: 'actions',
            cell: ({ row }: any) => (
              <button
                className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:from-blue-600 hover:to-indigo-700 hover:shadow-md"
                onClick={() => setModal({ open: true, role: row.original })}
              >
                Edit Modules
              </button>
            ),
          },
        ]);
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] Grants cache invalidated - refreshing data...');
      fetchGrantsData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasInvalidated]); // Only depend on wasInvalidated, not loading or fetchGrantsData

  /* Table instance */
  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  /* Export selected rows */
  const selectedData = table.getSelectedRowModel().rows.map((r) => r.original);
  const handleExportData = () => {
    exportToCSV(
      selectedData.map((r) => ({ Role: r.role_name, Modules: r.modules.join(', ') })),
      'Role,Modules',
      `grants_table_${selectedData.length}`
    );
  };

  if (loading) {
    return <GrantsMatrixSkeleton />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => fetchGrantsData()} context="grants" />;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Render                                                           */
  /* ------------------------------------------------------------------ */
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filters table={table} />
          {isRefreshing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Syncing...</span>
            </div>
          )}
        </div>
      </div>

      <Table
        table={table}
        variant="modern"
        classNames={{ container: 'rounded-md border border-muted', rowClassName: 'last:border-0' }}
      />

      <TableFooter table={table} onExport={handleExportData} />
      <TablePagination table={table} className="py-4" />

      {/* ---------------------------------------------------------------- */}
      {/*  Edit modal */}
      {/* ---------------------------------------------------------------- */}
      {modal.open && modal.role && (
        <EditModal
          role={modal.role}
          onClose={() => setModal({ open: false })}
          onSave={async (newModules) => {
            try {
              // Collapse sub-modules to parent before sending to backend
              // e.g., ["cortex", "semantic_models"] → ["intelligent"]
              const collapsedModules = collapseSubModulesToParents(newModules);

              console.log('[Grants] ========== SAVE STARTED ==========');
              console.log('[Grants] Selected modules (UI):', newModules);
              console.log('[Grants] Collapsed modules (API):', collapsedModules);
              console.log('[Grants] Role name:', modal.role!.role_name);

              const roleName = modal.role!.role_name;

              // Step 1: Send update to backend
              console.log('[Grants] Step 1: Sending update to backend...');
              const updateResponse = await updateGrants(roleName, collapsedModules);
              console.log('[Grants] Step 1: Backend response:', updateResponse.data);

              // Step 2: Refresh data from backend
              console.log('[Grants] Step 2: Refreshing data from backend...');
              const refreshStartTime = Date.now();
              await fetchGrantsData();
              console.log('[Grants] Step 2: Data refreshed in', Date.now() - refreshStartTime, 'ms');

              // Step 3: Verify what we got back (after state update)
              setTimeout(() => {
                setTableData((currentData) => {
                  const updatedRole = currentData.find(r => r.role_name === roleName);
                  console.log('[Grants] Step 3: Verification after refresh');
                  console.log('[Grants]   - Expected modules:', collapsedModules);
                  console.log('[Grants]   - Actual modules from backend:', updatedRole?.modules);

                  const expected = collapsedModules.sort();
                  const actual = (updatedRole?.modules || []).sort();
                  const match = JSON.stringify(expected) === JSON.stringify(actual);

                  console.log('[Grants]   - Match:', match);

                  if (!match) {
                    console.error('[Grants] ⚠️ PERSISTENCE ISSUE DETECTED!');
                    console.error('[Grants]   Expected:', expected);
                    console.error('[Grants]   Got:', actual);
                    console.error('[Grants]   → Backend returned 200 OK but did not persist the data!');
                    console.error('[Grants]   → Check backend logs for database commit issues');
                  } else {
                    console.log('[Grants] ✅ Data persisted correctly');
                  }

                  return currentData;
                });
              }, 1000);

              // Show success toast
              if (collapsedModules.length === 0) {
                toast.success(`✅ Removed all modules from ${roleName}`);
              } else {
                toast.success(`✅ Updated modules for ${roleName}`);
              }

              console.log('[Grants] ========== SAVE COMPLETED ==========');
              setModal({ open: false });
            } catch (err: any) {
              console.error('[Grants] ========== SAVE FAILED ==========');
              console.error('[Grants] Error:', err);
              console.error('[Grants] Error name:', err.name);
              console.error('[Grants] Error message:', err.message);
              console.error('[Grants] Error response:', err.response?.data);
              toast.error(err.message || 'Failed to update modules');
            }
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Edit Modal component                                             */
/* ------------------------------------------------------------------ */
function EditModal({
  role,
  onClose,
  onSave,
}: {
  role: RoleGrant;
  onClose: () => void;
  onSave: (mods: string[]) => Promise<void>;
}) {
  // Expand role modules to include sub-modules for UI display
  const initialModules = expandModulesToIncludeSubModules(role.modules || []);
  console.log('[EditModal] Initial state:', {
    roleModules: role.modules,
    expandedModules: initialModules
  });
  const [selectedModules, setSelectedModules] = useState<string[]>(initialModules);
  const [saving, setSaving] = useState(false);

  const toggleModule = (module: ModuleConfig) => {
    const apiName = module.apiName;
    const isCurrentlySelected = selectedModules.includes(apiName);

    setSelectedModules((prev) => {
      let updated = [...prev];

      if (isCurrentlySelected) {
        // Deselect main module AND all its sub-modules
        updated = updated.filter((m) => m !== apiName);
        if (module.subModules) {
          module.subModules.forEach((sub) => {
            updated = updated.filter((m) => m !== sub.apiName);
          });
        }
      } else {
        // Select main module AND all its sub-modules
        updated.push(apiName);
        if (module.subModules) {
          module.subModules.forEach((sub) => {
            if (!updated.includes(sub.apiName)) {
              updated.push(sub.apiName);
            }
          });
        }
      }

      return updated;
    });
  };

  const toggleSubModule = (subModule: SubModuleConfig) => {
    setSelectedModules((prev) =>
      prev.includes(subModule.apiName)
        ? prev.filter((m) => m !== subModule.apiName)
        : [...prev, subModule.apiName]
    );
  };

  const selectAll = () => {
    // Select all main modules and their sub-modules
    const allApiNames: string[] = [];
    ALL_MODULES.forEach((m) => {
      allApiNames.push(m.apiName);
      if (m.subModules) {
        m.subModules.forEach((sub) => allApiNames.push(sub.apiName));
      }
    });
    setSelectedModules(allApiNames);
  };

  const deselectAll = () => {
    setSelectedModules([]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Send selected modules (will be collapsed to parents by parent component)
      await onSave(selectedModules);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        {/* Header */}
        <div className="mb-6 border-b border-slate-200 pb-4 dark:border-slate-700">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            Edit Module Access
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure module permissions for{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {role.role_name}
            </span>
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-4 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={selectAll}
            className="text-xs"
          >
            Select All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={deselectAll}
            className="text-xs"
          >
            Deselect All
          </Button>
          <span className="ml-auto text-sm text-slate-500">
            {selectedModules.length} of {ALL_MODULES.length} selected
          </span>
        </div>

        {/* Module List - Hierarchical display */}
        <div className="max-h-[400px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          {ALL_MODULES.map((module) => {
            const Icon = module.icon;
            const isMainSelected = selectedModules.includes(module.apiName);

            return (
              <div key={module.id} className="space-y-1">
                {/* Main Module */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                    isMainSelected
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                      : 'border-transparent bg-white hover:border-slate-300 dark:bg-slate-800 dark:hover:border-slate-600'
                  }`}
                >
                  <Checkbox
                    checked={isMainSelected}
                    onChange={() => toggleModule(module)}
                    className="h-5 w-5"
                  />
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    isMainSelected
                      ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${
                      isMainSelected
                        ? 'text-blue-900 dark:text-blue-100'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      {module.name}
                      {module.subModules && module.subModules.length > 0 && (
                        <span className="ml-2 text-xs text-slate-400">
                          ({module.subModules.length} sub-modules)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {module.description}
                    </div>
                  </div>
                </label>

                {/* Sub-Modules (indented) */}
                {module.subModules && module.subModules.length > 0 && (
                  <div className="ml-12 space-y-1">
                    {module.subModules.map((subModule) => {
                      const SubIcon = SUB_MODULE_ICONS[subModule.apiName] || PiCubeDuotone;
                      const isSubSelected = selectedModules.includes(subModule.apiName);

                      return (
                        <label
                          key={subModule.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm transition-all ${
                            isSubSelected
                              ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20'
                              : 'border-transparent bg-white hover:border-slate-300 dark:bg-slate-800 dark:hover:border-slate-600'
                          }`}
                        >
                          <Checkbox
                            checked={isSubSelected}
                            onChange={() => toggleSubModule(subModule)}
                            className="h-4 w-4"
                          />
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                            isSubSelected
                              ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-800 dark:text-indigo-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          }`}>
                            <SubIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <div className={`font-medium ${
                              isSubSelected
                                ? 'text-indigo-900 dark:text-indigo-100'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}>
                              {subModule.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {subModule.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={handleSave}
            className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
