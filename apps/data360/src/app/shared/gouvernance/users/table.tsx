// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\users\table.tsx

'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters';
import { userListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { useEffect, useState, useCallback } from 'react';
import { getUsers } from '@/app/services/gouvernance/fetch_users';
import AddUserButton from './add-user-button';

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

  // Callback to fetch users data, used for initial load and refreshing
  const fetchUsersData = useCallback(async () => {
    setLoading(true);
    setError(null); // Clear previous errors
    try {
      const users = await getUsers(); // getUsers now handles token internally
      console.log('Fetched users for table (in table.tsx):', users);
      setData(users);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []); // No dependency on accessToken here

  // Effect to run fetchData on component mount
  useEffect(() => {
    fetchUsersData();
  }, [fetchUsersData]);

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
        // Placeholder for delete functionality (implement API call here)
        handleDeleteRow: (row) => {
          console.log('Attempting to delete row:', row.id);
          // Example: call a deleteUser API then refetch data
          // deleteUser(accessToken, row.id).then(() => fetchUsersData());
          setTableData((prev) => prev.filter((r) => r.id !== row.id));
        },
        handleMultipleDelete: (rows) => {
          console.log('Attempting to delete multiple rows:', rows.map(r => r.id));
          // Example: call a deleteMultipleUsers API then refetch data
          // deleteMultipleUsers(accessToken, rows.map(r => r.id)).then(() => fetchUsersData());
          setTableData((prev) => prev.filter((r) => !rows.includes(r)));
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
  if (loading) return <div className="p-4 text-center text-gray-600">Loading users...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  // Only show "No users found" if not loading and no error, but data is empty.
  if (data.length === 0 && !loading && !error) return <div className="p-4 text-center text-gray-500">No users found.</div>;

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <Filters table={table} />
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