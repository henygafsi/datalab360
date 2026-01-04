// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\roles\table.tsx

'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters'; // Assuming filters for roles is similar to users
import { roleListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { exportToCSV } from '@core/utils/export-to-csv';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getRoles, deleteRole, deleteMultipleRoles } from '@/app/services/gouvernance/fetch_roles';
import AddRoleButton from './add-role-button';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { toast } from 'react-hot-toast';

export type RoleTableDataType = {
  id: string; // Changed to string for role name as ID
  role: string;
  numberOfGrants: number;
  comment: string;
  createdOn: string;
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

export default function RolesTable() {
  const [data, setData] = useState<RoleTableDataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Watch for SSE cache invalidation events on 'roles' key
  const { wasInvalidated } = useCacheInvalidationWatcher([CACHE_KEYS.ROLES]);
  const mountedRef = useRef(true);

  const fetchRolesData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const roles = await getRoles(); // getRoles now handles token internally
      if (mountedRef.current) {
        console.log('Fetched roles for table:', roles);
        setData(roles);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        console.error('Failed to load roles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load roles');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []); // No dependencies - stable callback

  useEffect(() => {
    mountedRef.current = true;
    fetchRolesData();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] Roles cache invalidated - refreshing data...');
      fetchRolesData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasInvalidated]); // Only depend on wasInvalidated, not loading or fetchRolesData


  const { table, setData: setTableData } = useTanStackTable<RoleTableDataType>({
    tableData: data,
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

          const confirmMessage = `⚠️ ATTENTION - Suppression de rôle\n\nÊtes-vous sûr de vouloir supprimer le rôle "${row.role}" ?\n\nCette action révoquera le rôle de TOUS les utilisateurs qui l'ont assigné.\n\nCette action est irréversible.`;
          if (!confirm(confirmMessage)) return;

          try {
            const result = await deleteRole(row.role);
            const usersInfo = result.revoked_from_users ? ` - ${result.revoked_from_users} utilisateur(s) affecté(s)` : '';
            const grantsInfo = result.revoked_grants ? ` - ${result.revoked_grants} grants révoqués` : '';
            toast.success(`✅ Rôle ${row.role} supprimé avec succès${usersInfo}${grantsInfo}`);
            await fetchRolesData();
          } catch (error: any) {
            console.error('Error deleting role:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
            toast.error(`❌ Erreur lors de la suppression du rôle: ${errorMessage}`);
            await fetchRolesData();
          }
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

          const confirmMessage = `⚠️ ATTENTION - Suppression multiple de rôles\n\nÊtes-vous sûr de vouloir supprimer ${deletableRoles.length} rôle(s) ?\n\nRôles: ${deletableRoles.join(', ')}\n\nCette action révoquera ces rôles de TOUS les utilisateurs.\n\nCette action est irréversible.`;
          if (!confirm(confirmMessage)) return;

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
            await fetchRolesData();
          } catch (error: any) {
            console.error('Error deleting multiple roles:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
            toast.error(`❌ Erreur lors de la suppression multiple: ${errorMessage}`);
            await fetchRolesData();
          }
        },
      },
      enableColumnResizing: false,
    },
  });

  useEffect(() => {
    setTableData(data);
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
    return <ErrorDisplay error={error} onRetry={() => fetchRolesData()} context="roles" />;
  }

  if (data.length === 0 && !loading && !error) {
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
        classNames={{
          container: 'border border-muted rounded-md',
          rowClassName: 'last:border-0',
        }}
      />
      <TableFooter table={table} onExport={handleExportData} />
      <TablePagination table={table} className="py-4" />
    </>
  );
}
