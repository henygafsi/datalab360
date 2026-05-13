// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\governance\users\table.tsx

'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import type { TableMeta } from '@tanstack/react-table';
import Filters from './filters';
import { userListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { useEffect, useState, useCallback } from 'react';
import { getUsers, deleteUser, deleteMultipleUsers, disableUser, enableUser } from '@/app/services/governance/fetch_users';
import AddUserButton from './add-user-button';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { RefreshCw } from 'lucide-react';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
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
  lastLogin?: string;     // Last successful login from Snowflake metadata
  defaultRole?: string;   // Default role from SHOW USERS
  owner?: string;         // Owner from Snowflake
};

type UsersTableProps = {
  onAddUserSuccess: () => void; // UsersTable receives this to pass to AddUserButton
}

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function UsersTable({ onAddUserSuccess }: UsersTableProps) {
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, title: '', message: '', onConfirm: () => {} });

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchUsers = useCallback(() => getUsers(), []);
  const { data, loading, error, refetch, isStale } = useCacheAwareQuery<UserTableDataType[]>(
    fetchUsers,
    { cacheKeys: [CACHE_KEYS.USERS], initialData: [] }
  );

  // Initialize TanStack Table
  const { table, setData: setTableData } = useTanStackTable<UserTableDataType>({
    tableData: data ?? [], // Use the fetched data
    columnConfig: userListColumns,
    options: {
      initialState: {
        pagination: {
          pageIndex: 0,
          pageSize: 10,
        },
      },
      meta: {
        handleDeleteRow: (row: UserTableDataType) => {
          setConfirmState({
            open: true,
            title: 'Delete User',
            message: `Are you sure you want to delete the user "${row.name}"? This action is irreversible and will remove the user from Snowflake.`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, open: false }));
              try {
                const result = await deleteUser(row.id);
                const grantsInfo = result.revoked_grants ? ` - ${result.revoked_grants} grants révoqués` : '';
                toast.success(`✅ Utilisateur ${row.name} supprimé avec succès${grantsInfo}`);
                await refetch();
              } catch (error: any) {
                // console.error('Error deleting user:', error);
                const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
                toast.error(`❌ Erreur lors de la suppression de l'utilisateur: ${errorMessage}`);
                await refetch();
              }
            },
          });
        },
        handleMultipleDelete: (rows) => {
          const usernames = rows.map((r: any) => r.id);
          setConfirmState({
            open: true,
            title: `Delete ${usernames.length} User(s)`,
            message: `Are you sure you want to delete ${usernames.length} user(s)? This action is irreversible.\n\nUsers: ${usernames.join(', ')}`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, open: false }));
              try {
                const result = await deleteMultipleUsers(usernames);
                const successCount = result.deleted || 0;
                const failedCount = result.failed?.length || 0;
                if (successCount > 0 && failedCount === 0) {
                  toast.success(`✅ ${successCount} utilisateur(s) supprimé(s) avec succès`);
                } else if (successCount > 0 && failedCount > 0) {
                  toast.success(`⚠️ ${successCount} utilisateur(s) supprimé(s), ${failedCount} échec(s)`);
                  // console.warn('Failed deletions:', result.failed);
                } else {
                  toast.error(`❌ Échec de la suppression de tous les utilisateurs`);
                }
                await refetch();
              } catch (error: any) {
                // console.error('Error deleting multiple users:', error);
                const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
                toast.error(`❌ Erreur lors de la suppression multiple: ${errorMessage}`);
                await refetch();
              }
            },
          });
        },
        handleToggleDisabled: (row: UserTableDataType) => {
          const isCurrentlyDisabled = row.status === 'Disabled';
          const action = isCurrentlyDisabled ? 'enable' : 'disable';
          setConfirmState({
            open: true,
            title: `${isCurrentlyDisabled ? 'Enable' : 'Disable'} User`,
            message: `Are you sure you want to ${action} the user "${row.name}"?`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, open: false }));
              try {
                if (isCurrentlyDisabled) {
                  await enableUser(row.id);
                  toast.success(`✅ Utilisateur ${row.name} activé avec succès`);
                } else {
                  await disableUser(row.id);
                  toast.success(`✅ Utilisateur ${row.name} désactivé avec succès`);
                }
                await refetch();
              } catch (error: any) {
                // console.error('Error toggling user status:', error);
                const errorMessage = error.response?.data?.detail || error.message || 'Erreur inconnue';
                toast.error(`❌ Erreur lors de l'opération: ${errorMessage}`);
                await refetch();
              }
            },
          });
        },
      } as TableMeta<UserTableDataType> & { handleToggleDisabled: (row: UserTableDataType) => void },
      enableColumnResizing: false,
    },
  });

  // Keep TanStack table data in sync with fetched data
  useEffect(() => {
    setTableData(data ?? []);
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
    return <ErrorDisplay error={error.message} onRetry={() => refetch()} context="users" />;
  }

  // Only show "No users found" if not loading and no error, but data is empty.
  if ((!data || data.length === 0) && !loading && !error) {
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
          {isStale && (
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