'use client';

import AvatarCard from '@core/ui/avatar-card';
import DateCell from '@core/ui/date-cell';
import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Text } from 'rizzui';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';

const columnHelper = createColumnHelper<any>();

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
      <AvatarCard src={row.original.avatar} name={row.original.role} />
    ),
  }),
  columnHelper.accessor('numberOfGrants', {
    id: 'numberOfGrants',
    size: 150,
    header: 'Number of Grants',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.numberOfGrants}</Text>
    ),
  }),
  columnHelper.accessor('createdOn', {
    id: 'createdOn',
    size: 200,
    header: 'Created On',
    cell: ({ row }) => <DateCell date={new Date(row.original.createdOn)} />,
  }),
  columnHelper.accessor('comment', {
    id: 'comment',
    size: 150,
    header: 'Comment',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.comment}</Text>
    ),
  }),
  /*columnHelper.accessor('grants', {
    id: 'grants',
    size: 200,
    header: 'Grants',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.grants.join(', ')}</Text>
    ),
  }),
  columnHelper.accessor('status', {
    id: 'status',
    size: 150,
    header: 'Status',
    cell: ({ row }) => (
      <Text
        className={`text-sm font-medium ${
          row.original.status === 'Enabled' ? 'text-green-600' : 'text-red-600'
        }`}
      >
        {row.original.status}
      </Text>
    ),
  }),*/
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
        editUrl={`/roles/edit/${row.original.id}`}
        viewUrl={`/roles/view/${row.original.id}`}
        onDelete={() => {
          if (row.original && row.original.id) {
            meta?.handleDeleteRow?.(row.original);
          }
        }}
      />
    ),
  }),
];
