'use client';

import AvatarCard from '@core/ui/avatar-card';
import DateCell from '@core/ui/date-cell';
import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Text } from 'rizzui';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';
import { UserTableDataType } from './table';

const columnHelper = createColumnHelper<UserTableDataType>();

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
    size: 250,
    header: 'Name',
    //cell: ({ row }) => (
      //<AvatarCard src={row.original.avatar} name={row.original.name} />
    //),
  }),
  columnHelper.display({
    id: 'email',
    size: 280,
    header: 'Email',
    cell: ({ row }) => row.original.email.toLowerCase(),
  }),
  columnHelper.accessor('createdOn', {
    id: 'createdOn',
    size: 200,
    header: 'Created On',
    cell: ({ row }) => <DateCell date={new Date(row.original.createdOn)} />,
  }),
  columnHelper.accessor('roles', {
    id: 'roles',
    size: 200,
    header: 'Roles',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.roles.join(', ')}</Text>
    ),
  }),
  columnHelper.accessor('status', {
    id: 'status',
    size: 150,
    header: 'Status',
    cell: ({ row }) => (
      <Text
        className={`text-sm font-medium ${row.original.status === 'Active' ? 'text-green-600' : 'text-red-600'}`}
      >
        {row.original.status}
      </Text>
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
        editUrl={`/users/edit/${row.original.id}`}
        viewUrl={`/users/view/${row.original.id}`}
        onDelete={() => {
          meta?.handleDeleteRow?.(row.original);
        }}
      />
    ),
  }),
];
