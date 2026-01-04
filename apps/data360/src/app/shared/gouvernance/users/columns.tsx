// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\users\columns.tsx

'use client';

import DateCell from '@core/ui/date-cell';
import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Text, Button, Tooltip } from 'rizzui';
import TableRowActionGroup from '@core/components/table-utils/table-row-action-group';
import { UserTableDataType } from './table';
import { Power, PowerOff } from 'lucide-react';

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
    size: 200,
    header: 'Full Name', // Changed to Full Name for clarity
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.name || 'N/A'}</Text> // Display N/A if null/empty
    ),
  }),
  columnHelper.display({
    id: 'email',
    size: 280,
    header: 'Email',
    cell: ({ row }) => row.original.email.toLowerCase() || 'N/A', // Display N/A if null/empty
  }),
  columnHelper.accessor('createdOn', {
    id: 'createdOn',
    size: 200,
    header: 'Created On',
    cell: ({ row }) => {
      // Attempt to create a Date object only if createdOn string exists
      const dateValue = row.original.createdOn ? new Date(row.original.createdOn) : null;
      // Check if the date is valid before passing to DateCell
      if (!dateValue || isNaN(dateValue.getTime())) {
        return <Text className="text-sm text-gray-500">Invalid Date</Text>; // Or 'N/A'
      }
      return <DateCell date={dateValue} />;
    },
  }),
  columnHelper.accessor('status', {
    id: 'status',
    size: 150,
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
      const isDisabled = row.original.status === 'Disabled';
      return (
        <div className="flex items-center gap-2">
          <Tooltip
            content={isDisabled ? 'Activer l\'utilisateur' : 'Désactiver l\'utilisateur'}
            placement="top"
          >
            <Button
              size="sm"
              variant="outline"
              className={`px-2 ${
                isDisabled
                  ? 'border-green-500 text-green-600 hover:bg-green-50'
                  : 'border-amber-500 text-amber-600 hover:bg-amber-50'
              }`}
              onClick={() => {
                meta?.handleToggleDisabled?.(row.original);
              }}
            >
              {isDisabled ? (
                <Power className="h-4 w-4" />
              ) : (
                <PowerOff className="h-4 w-4" />
              )}
            </Button>
          </Tooltip>
          <TableRowActionGroup
            editUrl={`/gouvernance/users/edit/${row.original.id}`}
            viewUrl={`/gouvernance/users/view/${row.original.id}`}
            onDelete={() => {
              meta?.handleDeleteRow?.(row.original);
            }}
          />
        </div>
      );
    },
  }),
];