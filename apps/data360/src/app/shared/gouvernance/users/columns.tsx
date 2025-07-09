// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\users\columns.tsx

'use client';

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
    size: 200,
    header: 'Full Name', // Changed to Full Name for clarity
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.name || 'N/A'}</Text> // Display N/A if null/empty
    ),
  }),
  columnHelper.accessor('firstName', { // New: First Name column
    id: 'firstName',
    size: 150,
    header: 'First Name',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.firstName || 'N/A'}</Text> // Display N/A if null/empty
    ),
  }),
  columnHelper.accessor('lastName', { // New: Last Name column
    id: 'lastName',
    size: 150,
    header: 'Last Name',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.lastName || 'N/A'}</Text> // Display N/A if null/empty
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
  columnHelper.accessor('roles', {
    id: 'roles',
    size: 200,
    header: 'Roles',
    cell: ({ row }) => (
      <Text className="text-sm">{row.original.roles.join(', ') || 'N/A'}</Text> // Display N/A if no roles
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
        {row.original.status || 'N/A'}
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
        editUrl={`/users/edit/${row.original.id}`} // Placeholder URL
        viewUrl={`/users/view/${row.original.id}`} // Placeholder URL
        onDelete={() => {
          meta?.handleDeleteRow?.(row.original); // Calls the handleDeleteRow defined in UsersTable
        }}
      />
    ),
  }),
];