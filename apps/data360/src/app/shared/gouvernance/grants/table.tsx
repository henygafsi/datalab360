'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
} from '@tanstack/react-table';
import { exportToCSV } from '@core/utils/export-to-csv';
import { getRoles, updateGrants } from '@/app/services/gouvernance/grants';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import Filters from './filters';
import Table from '@core/components/table';
import { toast } from 'react-hot-toast';
import { Checkbox, Button } from 'rizzui';
import { MODULES } from '@/config/modules';
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
} from 'react-icons/pi';
import { IconType } from 'react-icons/lib';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw } from 'lucide-react';

type RoleGrant = { role_name: string; modules: string[] };

// Type used by columns.tsx - represents module with associated roles
export type GrantTableDataType = {
  id: string;
  name: string;
  roles: string[];
};

// Module icons mapping
const MODULE_ICONS: Record<number, IconType> = {
  1: PiUserCircleDuotone,
  2: PiMapPinLineDuotone,
  3: PiShootingStarDuotone,
  4: PiChartBarDuotone,
  5: PiCheckCircleDuotone,
  6: PiUserGearDuotone,
  7: PiStorefrontDuotone,
  8: PiShootingStarDuotone,
  9: PiBinocularsDuotone,
  10: PiBrainDuotone,
};

// Extend MODULES with icons for this component
const ALL_MODULES = MODULES.map((m) => ({
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
      const roles = await getRoles();
      if (mountedRef.current) {
        setTableData(roles);
      }
    } catch (err) {
      console.error(err);
      if (mountedRef.current) {
        setError('Failed to load roles and modules');
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
              return (
                <div className="flex flex-wrap gap-1.5">
                  {modules.map((m) => {
                    const moduleInfo = ALL_MODULES.find(mod => mod.name === m);
                    return (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {moduleInfo?.icon && <moduleInfo.icon className="h-3 w-3" />}
                        {m}
                      </span>
                    );
                  })}
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
  }, [fetchGrantsData]);

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] Grants cache invalidated - refreshing data...');
      fetchGrantsData(true);
    }
  }, [wasInvalidated, loading, fetchGrantsData]);

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

  if (loading) return <div className="p-4">Loading roles…</div>;
  if (error)   return <div className="p-4 text-red-500">{error}</div>;

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
              await updateGrants(modal.role!.role_name, newModules);
              // optimistic update UI
              setTableData((prev) =>
                prev.map((r) =>
                  r.role_name === modal.role!.role_name ? { ...r, modules: newModules } : r
                )
              );
              toast.success(`Updated modules for ${modal.role!.role_name}`);
              setModal({ open: false });
            } catch (err: any) {
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
  const [selectedModules, setSelectedModules] = useState<string[]>(role.modules || []);
  const [saving, setSaving] = useState(false);

  const toggleModule = (moduleName: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleName)
        ? prev.filter((m) => m !== moduleName)
        : [...prev, moduleName]
    );
  };

  const selectAll = () => {
    setSelectedModules(ALL_MODULES.map((m) => m.name));
  };

  const deselectAll = () => {
    setSelectedModules([]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
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

        {/* Module List */}
        <div className="max-h-[400px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          {ALL_MODULES.map((module) => {
            const Icon = module.icon;
            const isSelected = selectedModules.includes(module.name);
            return (
              <label
                key={module.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                    : 'border-transparent bg-white hover:border-slate-300 dark:bg-slate-800 dark:hover:border-slate-600'
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleModule(module.name)}
                  className="h-5 w-5"
                />
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${
                    isSelected
                      ? 'text-blue-900 dark:text-blue-100'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {module.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {module.description}
                  </div>
                </div>
              </label>
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
