// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\roles\columns.tsx

'use client';

// import AvatarCard from '@core/ui/avatar-card'; // Removed as avatar is not in RoleTableDataType
import DateCell from '@core/ui/date-cell';
import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Text } from 'rizzui';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';
import { RoleTableDataType } from './table';

const columnHelper = createColumnHelper<RoleTableDataType>();

export const roleListColumns = [
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
  columnHelper.accessor('role', {
    id: 'role',
    size: 250,
    header: 'Role',
    cell: ({ row }) => (
      // If you have an avatar for roles, re-enable AvatarCard and ensure 'avatar' exists in RoleTableDataType
      // <AvatarCard src={row.original.avatar} name={row.original.role} />
      <Text className="text-sm">{row.original.role || 'N/A'}</Text>
    ),
  }),
  columnHelper.accessor('owner', {
    id: 'owner',
    size: 130,
    header: 'Owner',
    cell: ({ row }) => (
      <Text className="text-sm text-gray-600 dark:text-gray-400">{row.original.owner || '-'}</Text>
    ),
  }),
  columnHelper.accessor('numberOfGrants', {
    id: 'numberOfGrants',
    size: 120,
    header: 'Grants',
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        {row.original.numberOfGrants ?? 0}
      </span>
    ),
  }),
  columnHelper.display({
    id: 'assignedUsers',
    size: 100,
    header: 'Users',
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        {row.original.assignedUsers ?? 0}
      </span>
    ),
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
  columnHelper.accessor('comment', {
    id: 'comment',
    size: 150,
    header: 'Comment',
    cell: ({ row }) => (
      <Text className="text-sm text-gray-500 dark:text-gray-400">{row.original.comment || '-'}</Text>
    ),
  }),
  columnHelper.display({
    id: 'actions',
    size: 120,
    cell: ({
      row,
      table: {
        options: { meta },
      },
    }) => (
      <TableRowActionGroup
        editUrl={`/gouvernance/roles/edit/${row.original.id}`}
        viewUrl={`/gouvernance/roles/view/${row.original.id}`}
        onDelete={() => {
          if (row.original && row.original.id) {
            meta?.handleDeleteRow?.(row.original);
          }
        }}
      />
    ),
  }),
];