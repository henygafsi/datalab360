'use client';

import AvatarCard from '@core/ui/avatar-card';
import DateCell from '@core/ui/date-cell';
import { createColumnHelper } from '@tanstack/react-table';
import { Badge, Checkbox, Flex } from 'rizzui';
import { UsersTableDataType } from '.';
import { getStatusBadge } from '@core/components/table-utils/get-status-badge';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';

const columnHelper = createColumnHelper<UsersTableDataType>();

export const usersColumns = [
  columnHelper.display({
    id: 'select',
    size: 50,
    header: ({ table }) => (
      <Checkbox
        className="ps-3.5"
        aria-label="Select all Rows"
        checked={table.getIsAllPageRowsSelected()}
        onChange={() => table.toggleAllPageRowsSelected()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        className="ps-3.5"
        aria-label="Select Row"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  }),
  columnHelper.display({
    id: 'id',
    size: 100,
    header: 'User ID',
    cell: ({ row }) => <>#{row.original.id}</>,
  }),
  columnHelper.accessor('name', {
    id: 'name',
    size: 300,
    header: 'Name',
    enableSorting: false,
    cell: ({ row }) => (
      <AvatarCard
        src="https://isomorphic-furyroad.s3.amazonaws.com/public/avatars/avatar-11.webp"
        name={row.original.name}
        description={row.original.email}
      />
    ),
  }),
  columnHelper.accessor('roles', {
    id: 'roles',
    size: 150,
    header: 'Role',
    cell: ({ row }) => row.original.roles.join(', '),
  }),
  columnHelper.accessor('createdOn', {
    id: 'createdOn',
    size: 200,
    header: 'Created',
    cell: ({ row }) => <DateCell date={new Date(row.original.createdOn)} />,
  }),
  columnHelper.accessor('status', {
    id: 'status',
    size: 150,
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => getStatusBadge(row.original.status),
  }),
  columnHelper.display({
    id: 'action',
    size: 140,
    cell: ({
      row,
      table: {
        options: { meta },
      },
    }) => (
      <TableRowActionGroup
        deletePopoverTitle={`Delete this user`}
        deletePopoverDescription={`Are you sure you want to delete this #${row.original.id} user?`}
        onDelete={() => meta?.handleDeleteRow?.(row.original)}
      />
    ),
  }),
];
