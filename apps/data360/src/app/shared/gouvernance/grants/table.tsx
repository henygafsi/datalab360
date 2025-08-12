'use client';

import { useEffect, useState } from 'react';
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
import ModuleMultiSelect from './ModuleMultiSelect';

type RoleGrant = { role_name: string; modules: string[] };

export default function GrantsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [tableData, setTableData] = useState<RoleGrant[]>([]);
  const [allModules, setAllModules] = useState<string[]>([]);
  const [modal, setModal] = useState<{ open: boolean; role?: RoleGrant }>(
    { open: false }
  );

  /* ------------------------------------------------------------------ */
  /* 1. Fetch                                                            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    (async () => {
      try {
        const roles = await getRoles();
        setTableData(roles);
        setAllModules(               // collect the distinct module names
          Array.from(new Set(roles.flatMap((r: any) => r.modules))).sort()
        );
        setColumns([
          { header: 'Role', accessorKey: 'role_name' },
          {
            header: 'Modules',
            accessorKey: 'modules',
            cell: ({ getValue }: any) => {
              const modules = getValue() as string[];
              return modules.length ? (
                <div className="flex flex-wrap gap-1">
                  {modules.map((m) => (
                    <span
                      key={m}
                      className="rounded bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="italic text-gray-400">No access</span>
              );
            },
          },
          {
            header: '',
            id: 'actions',
            cell: ({ row }: any) => (
              <button
                className="rounded bg-primary px-2 py-1 text-xs text-white"
                onClick={() => setModal({ open: true, role: row.original })}
              >
                Edit
              </button>
            ),
          },
        ]);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('Failed to load roles and modules');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        <Filters table={table} />
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
          allModules={allModules}
          onClose={() => setModal({ open: false })}
          onSave={async (newModules) => {
            await updateGrants(modal.role!.role_name, newModules);
            // optimistic update UI
            setTableData((prev) =>
              prev.map((r) =>
                r.role_name === modal.role!.role_name ? { ...r, modules: newModules } : r
              )
            );
            setModal({ open: false });
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
  allModules,
  onClose,
  onSave,
}: {
  role: RoleGrant;
  allModules: string[];
  onClose: () => void;
  onSave: (mods: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string[]>(role.modules);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold">
          Edit modules for <span className="text-primary">{role.role_name}</span>
        </h3>

        <ModuleMultiSelect
          allModules={allModules}
          value={draft}
          onChange={setDraft}
        />

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded border px-4 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(draft);
            }}
            className="rounded bg-primary px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
