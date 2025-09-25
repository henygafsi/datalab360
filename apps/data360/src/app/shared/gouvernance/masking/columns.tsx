'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Text } from 'rizzui';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';
import { MaskingTableDataType } from './table-advanced';

const columnHelper = createColumnHelper<MaskingTableDataType>();

export const maskingListColumns = [
  columnHelper.display({
    id: 'select',
    size: 50,
    header: ({ table }) => (
      <Checkbox className="ps-3" aria-label="Select All" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />
    ),
    cell: ({ row }) => (
      <Checkbox className="ps-3" aria-label="Select Row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
    ),
  }),
  columnHelper.accessor('policy_name', {
    id: 'policy_name',
    size: 240,
    header: 'Policy Name',
    cell: ({ row }) => <Text className="text-sm">{row.original.policy_name || 'N/A'}</Text>,
  }),
  columnHelper.accessor('data_type', {
    id: 'data_type',
    header: 'Data Type',
    cell: ({ row }) => <Text className="text-sm">{row.original.data_type || '-'}</Text>,
  }),
  columnHelper.accessor('return_type', {
    id: 'return_type',
    header: 'Return Type',
    cell: ({ row }) => <Text className="text-sm">{row.original.return_type || '-'}</Text>,
  }),
  columnHelper.accessor('role_name', {
    id: 'role_name',
    header: 'Role',
    cell: ({ row }) => <Text className="text-sm">{row.original.role_name || '-'}</Text>,
  }),
  columnHelper.accessor('replace_with', {
    id: 'replace_with',
    header: 'Replace With',
    cell: ({ row }) => <Text className="text-sm">{row.original.replace_with || '-'}</Text>,
  }),
  columnHelper.display({
    id: 'actions',
    size: 120,
    cell: ({ row, table: { options: { meta } } }) => (
      <TableRowActionGroup
        editUrl={`/gouvernance/masking/${row.original.policy_name}`}
        viewUrl={`/gouvernance/masking/${row.original.policy_name}`}
        onDelete={() => meta?.handleDeleteRow?.(row.original)}
      />
    ),
  }),
];


