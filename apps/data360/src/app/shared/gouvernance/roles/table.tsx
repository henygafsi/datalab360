// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\roles\table.tsx

'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters'; // Assuming filters for roles is similar to users
import { roleListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { exportToCSV } from '@core/utils/export-to-csv';
import { useEffect, useState, useCallback } from 'react';
import { getRoles, deleteRole, deleteMultipleRoles } from '@/app/services/gouvernance/fetch_roles';
import AddRoleButton from './add-role-button';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from 'react-hot-toast';

export type RoleTableDataType = {
  id: string; // Changed to string for role name as ID
  role: string;
  numberOfGrants: number;
  comment: string;
  createdOn: string;
  owner?: string;         // Role owner from Snowflake metadata
  assignedUsers?: number; // Number of users with this role
};

// Protected system roles that cannot be deleted
const PROTECTED_SYSTEM_ROLES = [
  'ACCOUNTADMIN',
  'SYSADMIN',
  'SECURITYADMIN',
  'USERADMIN',
  'PUBLIC',
  'ORGADMIN',
];

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function RolesTable() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, title: '', message: '', onConfirm: () => {} });

  const fetchRolesData = useCallback(() => getRoles(), []);
  const { data, loading, error, refetch, isStale } = useCacheAwareQuery<RoleTableDataType[]>(
    fetchRolesData,
    { cacheKeys: [CACHE_KEYS.ROLES], initialData: [] }
  );


  const { table, setData: setTableData } = useTanStackTable<RoleTableDataType>({
    tableData: data ?? [],
    columnConfig: roleListColumns,
    options: {
      initialState: {
        pagination: {
          pageIndex: 0,
          pageSize: 10,
        },
      },
      meta: {
        handleDeleteRow: async (row) => {
          // Check if role is protected
          if (PROTECTED_SYSTEM_ROLES.includes(row.role.toUpperCase())) {
            toast.error(`🔒 Impossible de supprimer le rôle système "${row.role}"`);
            return;
          }

          setConfirmState({
            open: true,
            title: 'Delete Role',
            message: `Are you sure you want to delete the role "${row.role}"? This will revoke the role from ALL users and is irreversible.`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, open: false }));
              try {
                const result = await deleteRole(row.role);
                const usersInfo = result.revoked_from_users ? ` - ${result.revoked_from_users} utilisateur(s) affecté(s)` : '';
                const grantsInfo = result.revoked_grants ? ` - ${result.revoked_grants} grants révoqués` : '';
                toast.success(`✅ Rôle ${row.role} supprimé avec succès${usersInfo}${grantsInfo}`);
                await refetch();
              } catch (error: any) {
                console.error('Error deleting role:', error);
                const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
                toast.error(`❌ Erreur lors de la suppression du rôle: ${errorMessage}`);
                await refetch();
              }
            },
          });
        },
        handleMultipleDelete: async (rows) => {
          // Filter out protected system roles
          const roleNames = rows.map((r: any) => r.role);
          const protectedRoles = roleNames.filter((name: string) =>
            PROTECTED_SYSTEM_ROLES.includes(name.toUpperCase())
          );
          const deletableRoles = roleNames.filter((name: string) =>
            !PROTECTED_SYSTEM_ROLES.includes(name.toUpperCase())
          );

          if (protectedRoles.length > 0) {
            toast.error(`🔒 Impossible de supprimer les rôles système: ${protectedRoles.join(', ')}`);
            if (deletableRoles.length === 0) return;
          }

          setConfirmState({
            open: true,
            title: `Delete ${deletableRoles.length} Role(s)`,
            message: `Are you sure you want to delete ${deletableRoles.length} role(s)? This will revoke them from ALL users and is irreversible.\n\nRoles: ${deletableRoles.join(', ')}`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, open: false }));
              try {
            const result = await deleteMultipleRoles(deletableRoles);
            const successCount = result.deleted || 0;
            const failedCount = result.failed?.length || 0;

            if (successCount > 0 && failedCount === 0) {
              toast.success(`✅ ${successCount} rôle(s) supprimé(s) avec succès`);
            } else if (successCount > 0 && failedCount > 0) {
              toast.success(`⚠️ ${successCount} rôle(s) supprimé(s), ${failedCount} échec(s)`);
              console.warn('Failed deletions:', result.failed);
            } else {
              toast.error(`❌ Échec de la suppression de tous les rôles`);
            }
            await refetch();
              } catch (error: any) {
                console.error('Error deleting multiple roles:', error);
                const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
                toast.error(`❌ Erreur lors de la suppression multiple: ${errorMessage}`);
                await refetch();
              }
            },
          });
        },
      },
      enableColumnResizing: false,
    },
  });

  useEffect(() => {
    setTableData(data ?? []);
  }, [data, setTableData]);

  const selectedData = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  function handleExportData() {
    exportToCSV(
      selectedData,
      'ID,Role,Number of Grants,CreatedOn,Grants,Status', // Adjust headers as per RoleTableDataType
      `roles_data_${selectedData.length}`
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-40 animate-pulse rounded-lg bg-emerald-200 dark:bg-emerald-900/30" />
        </div>
        <TableSkeleton rows={10} columns={5} />
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error?.message} onRetry={() => refetch()} context="roles" />;
  }

  if ((!data || data.length === 0) && !loading && !error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <svg className="h-10 w-10 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Aucun rôle trouvé</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Commencez par créer votre premier rôle pour gérer les permissions.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Filters table={table} />
          {isStale && (
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
        classNames={{
          container: 'border border-muted rounded-md',
          rowClassName: 'last:border-0',
        }}
      />
      <TableFooter table={table} onExport={handleExportData} />
      <TablePagination table={table} className="py-4" />
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Delete"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(s => ({ ...s, open: false }))}
      />
    </>
  );
}
