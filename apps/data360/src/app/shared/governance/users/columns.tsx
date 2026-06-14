// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\governance\users\columns.tsx

'use client';

import DateCell from '@core/ui/date-cell';
import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Text, Button, Tooltip } from 'rizzui';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';
import { UserTableDataType } from './table';
import { Power, PowerOff } from 'lucide-react';
import { useCanPerform } from '@/hooks/useCanPerform';

const columnHelper = createColumnHelper<UserTableDataType>();

/**
 * Row action group for a user. Delete is gated on System 2 Action-RBAC
 * (gouvernance:delete); when denied the trash control is disabled with a tooltip.
 * Extracted into a component so `useCanPerform` runs in a proper hook context.
 */
function UserRowActions({
  row,
  onDelete,
}: {
  row: UserTableDataType;
  onDelete: () => void;
}) {
  const { allowed, loading } = useCanPerform('gouvernance', 'delete');
  const canDelete = allowed || loading; // fail-open while the allow-set loads
  return (
    <TableRowActionGroup
      editUrl={`/governance/users/edit/${row.id}`}
      viewUrl={`/governance/users/view/${row.id}`}
      onDelete={onDelete}
      deleteDisabled={!canDelete}
      deleteDisabledReason={
        !canDelete
          ? 'You lack the "delete" permission on governance. Ask an administrator to grant it.'
          : undefined
      }
    />
  );
}

// Enable/disable a user is a destructive user-lifecycle admin action. There is
// no dedicated enable/disable action key in the gouvernance registry, so we gate
// it with the same `delete` permission that already gates the user row's
// destructive control (keeps user-management actions under one permission).
// Fail-open while the allow-set loads.
function UserStatusToggle({
  row,
  onToggle,
}: {
  row: UserTableDataType;
  onToggle: () => void;
}) {
  const { allowed, loading } = useCanPerform('gouvernance', 'delete');
  const canToggle = allowed || loading;
  const isDisabled = row.status === 'Disabled';
  return (
    <Tooltip
      content={
        !canToggle
          ? 'You lack the permission to change a user\'s status. Ask an administrator to grant it.'
          : isDisabled
            ? 'Activer l\'utilisateur'
            : 'Désactiver l\'utilisateur'
      }
      placement="top"
    >
      <Button
        size="sm"
        variant="outline"
        disabled={!canToggle}
        className={`px-2 disabled:opacity-40 disabled:cursor-not-allowed ${
          isDisabled
            ? 'border-green-500 text-green-600 hover:bg-green-50'
            : 'border-amber-500 text-amber-600 hover:bg-amber-50'
        }`}
        onClick={onToggle}
      >
        {isDisabled ? (
          <Power className="h-4 w-4" />
        ) : (
          <PowerOff className="h-4 w-4" />
        )}
      </Button>
    </Tooltip>
  );
}

export const userListColumns = [
  columnHelper.display({
    id: 'select',
    size: 50,
    header: ({ table }) => (
      <Checkbox
        className="ps-3"
        aria-label="Select All"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        className="ps-3"
        aria-label="Select Row"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  }),
  columnHelper.accessor('name', {
    id: 'name',
    size: 180,
    header: 'Full Name',
    cell: ({ row }) => (
      <Text className="text-sm font-medium">{row.original.name || 'N/A'}</Text>
    ),
  }),
  columnHelper.display({
    id: 'email',
    size: 240,
    header: 'Email',
    cell: ({ row }) => (
      <Text className="text-sm text-gray-600 dark:text-gray-400">
        {row.original.email?.toLowerCase() || 'N/A'}
      </Text>
    ),
  }),
  columnHelper.display({
    id: 'roles',
    size: 220,
    header: 'Roles',
    cell: ({ row }) => {
      const roles = row.original.roles || [];
      if (roles.length === 0) {
        return <Text className="text-sm italic text-gray-400">No roles</Text>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {roles.slice(0, 3).map((role) => (
            <span
              key={role}
              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >
              {role}
            </span>
          ))}
          {roles.length > 3 && (
            <Tooltip content={roles.slice(3).join(', ')} placement="top">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                +{roles.length - 3}
              </span>
            </Tooltip>
          )}
        </div>
      );
    },
  }),
  columnHelper.accessor('defaultRole', {
    id: 'defaultRole',
    size: 140,
    header: 'Default Role',
    cell: ({ row }) => {
      const role = row.original.defaultRole;
      if (!role) return <Text className="text-sm text-gray-400">-</Text>;
      return (
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
          {role}
        </span>
      );
    },
  }),
  columnHelper.accessor('createdOn', {
    id: 'createdOn',
    size: 150,
    header: 'Created On',
    cell: ({ row }) => {
      const dateValue = row.original.createdOn ? new Date(row.original.createdOn) : null;
      if (!dateValue || isNaN(dateValue.getTime())) {
        return <Text className="text-sm text-gray-500">-</Text>;
      }
      return <DateCell date={dateValue} />;
    },
  }),
  columnHelper.accessor('lastLogin', {
    id: 'lastLogin',
    size: 150,
    header: 'Last Login',
    cell: ({ row }) => {
      const dateStr = row.original.lastLogin;
      if (!dateStr) return <Text className="text-sm text-gray-400">Never</Text>;
      const dateValue = new Date(dateStr);
      if (isNaN(dateValue.getTime())) return <Text className="text-sm text-gray-400">-</Text>;
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - dateValue.getTime()) / (1000 * 60 * 60 * 24));
      const color = diffDays > 30 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
      return (
        <Text className={`text-sm ${color}`}>
          {diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`}
        </Text>
      );
    },
  }),
  columnHelper.accessor('status', {
    id: 'status',
    size: 120,
    header: 'Status',
    cell: ({ row }) => (
      <Text
        className={`text-sm font-medium ${row.original.status === 'Active' ? 'text-green-600' : 'text-red-600'}`}
      >
        {row.original.status || 'N/A'}
      </Text>
    ),
  }),
  columnHelper.display({
    id: 'actions',
    size: 180,
    header: 'Actions',
    cell: ({
      row,
      table: {
        options: { meta },
      },
    }) => {
      return (
        <div className="flex items-center gap-2">
          <UserStatusToggle
            row={row.original}
            onToggle={() => {
              (meta as { handleToggleDisabled?: (r: UserTableDataType) => void })?.handleToggleDisabled?.(row.original);
            }}
          />
          <UserRowActions
            row={row.original}
            onDelete={() => {
              meta?.handleDeleteRow?.(row.original);
            }}
          />
        </div>
      );
    },
  }),
];