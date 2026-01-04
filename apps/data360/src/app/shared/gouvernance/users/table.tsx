// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\users\table.tsx

'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters';
import { userListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getUsers, deleteUser, deleteMultipleUsers, disableUser, enableUser } from '@/app/services/gouvernance/fetch_users';
import AddUserButton from './add-user-button';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { toast } from 'react-hot-toast';

// Define the UserTableDataType based on your frontend needs, including first and last name
export type UserTableDataType = {
  id: string;
  name: string; // Combined name (display_name or name from backend)
  firstName: string; // First Name from backend
  lastName: string;  // Last Name from backend
  email: string;
  roles: string[];
  status: string;
  createdOn: string;
};

type UsersTableProps = {
  onAddUserSuccess: () => void; // UsersTable receives this to pass to AddUserButton
}

export default function UsersTable({ onAddUserSuccess }: UsersTableProps) { // Removed accessToken from props
  const [data, setData] = useState<UserTableDataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Watch for SSE cache invalidation events on 'users' key
  const { wasInvalidated } = useCacheInvalidationWatcher([CACHE_KEYS.USERS]);
  const mountedRef = useRef(true);

  // Callback to fetch users data, used for initial load and refreshing
  const fetchUsersData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null); // Clear previous errors
    try {
      const users = await getUsers(); // getUsers now handles token internally
      if (mountedRef.current) {
        console.log('Fetched users for table (in table.tsx):', users);
        setData(users);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        console.error('Failed to load users:', err);
        setError(err instanceof Error ? err.message : 'Failed to load users');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []); // No dependencies - stable callback

  // Effect to run fetchData on component mount
  useEffect(() => {
    mountedRef.current = true;
    fetchUsersData();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] Users cache invalidated - refreshing data...');
      fetchUsersData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wasInvalidated]); // Only depend on wasInvalidated, not loading or fetchUsersData

  // Initialize TanStack Table
  const { table, setData: setTableData } = useTanStackTable<UserTableDataType>({
    tableData: data, // Use the fetched data
    columnConfig: userListColumns,
    options: {
      initialState: {
        pagination: {
          pageIndex: 0,
          pageSize: 10,
        },
      },
      meta: {
        handleDeleteRow: async (row) => {
          const confirmMessage = `⚠️ ATTENTION - Suppression définitive\n\nÊtes-vous sûr de vouloir supprimer l'utilisateur "${row.name}" ?\n\nCette action est irréversible et supprimera l'utilisateur de Snowflake.`;
          if (!confirm(confirmMessage)) return;

          try {
            const result = await deleteUser(row.id);
            const grantsInfo = result.revoked_grants ? ` - ${result.revoked_grants} grants révoqués` : '';
            toast.success(`✅ Utilisateur ${row.name} supprimé avec succès${grantsInfo}`);
            await fetchUsersData();
          } catch (error: any) {
            console.error('Error deleting user:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
            toast.error(`❌ Erreur lors de la suppression de l'utilisateur: ${errorMessage}`);
            await fetchUsersData();
          }
        },
        handleMultipleDelete: async (rows) => {
          const usernames = rows.map((r: any) => r.id);
          const confirmMessage = `⚠️ ATTENTION - Suppression multiple\n\nÊtes-vous sûr de vouloir supprimer ${usernames.length} utilisateur(s) ?\n\nUtilisateurs: ${usernames.join(', ')}\n\nCette action est irréversible.`;
          if (!confirm(confirmMessage)) return;

          try {
            const result = await deleteMultipleUsers(usernames);
            const successCount = result.deleted || 0;
            const failedCount = result.failed?.length || 0;

            if (successCount > 0 && failedCount === 0) {
              toast.success(`✅ ${successCount} utilisateur(s) supprimé(s) avec succès`);
            } else if (successCount > 0 && failedCount > 0) {
              toast.success(`⚠️ ${successCount} utilisateur(s) supprimé(s), ${failedCount} échec(s)`);
              console.warn('Failed deletions:', result.failed);
            } else {
              toast.error(`❌ Échec de la suppression de tous les utilisateurs`);
            }
            await fetchUsersData();
          } catch (error: any) {
            console.error('Error deleting multiple users:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
            toast.error(`❌ Erreur lors de la suppression multiple: ${errorMessage}`);
            await fetchUsersData();
          }
        },
        handleToggleDisabled: async (row) => {
          const isCurrentlyDisabled = row.status === 'Disabled';
          const action = isCurrentlyDisabled ? 'activer' : 'désactiver';
          const confirmMessage = `Êtes-vous sûr de vouloir ${action} l'utilisateur "${row.name}" ?`;
          if (!confirm(confirmMessage)) return;

          try {
            if (isCurrentlyDisabled) {
              await enableUser(row.id);
              toast.success(`✅ Utilisateur ${row.name} activé avec succès`);
            } else {
              await disableUser(row.id);
              toast.success(`✅ Utilisateur ${row.name} désactivé avec succès`);
            }
            await fetchUsersData();
          } catch (error: any) {
            console.error('Error toggling user status:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
            toast.error(`❌ Erreur lors de l'opération: ${errorMessage}`);
            await fetchUsersData();
          }
        },
      },
      enableColumnResizing: false,
    },
  });

  // Keep TanStack table data in sync with fetched data
  useEffect(() => {
    setTableData(data);
  }, [data, setTableData]);

  // Render loading, error, or empty states
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-40 animate-pulse rounded-lg bg-blue-200 dark:bg-blue-900/30" />
        </div>
        <TableSkeleton rows={10} columns={5} />
      </div>
    );
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => fetchUsersData()} context="users" />;
  }

  // Only show "No users found" if not loading and no error, but data is empty.
  if (data.length === 0 && !loading && !error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
          <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Aucun utilisateur trouvé</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Commencez par créer votre premier utilisateur pour gérer les accès.
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
        {/* AddUserButton is now rendered in TableLayout, not here */}
      </div>
      <Table
        table={table}
        variant="modern"
        classNames={{
          container: 'border border-muted rounded-md',
          rowClassName: 'last:border-0',
        }}
      />
      <TableFooter table={table} />
      <TablePagination table={table} className="py-4" />
    </>
  );
}