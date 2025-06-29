'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters';
import { userListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { usersData } from '@/data/users-data';
import { useEffect, useState } from 'react';
import { getUsers } from '@/app/services/gouvernance/fetch_users';

//export type UserTableDataType = (typeof usersData)[number];
export type UserTableDataType = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
  createdOn: string;
};



export default function UsersTable() {
  const [data, setData] = useState<UserTableDataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  

  useEffect(() => {
    const fetchData = async () => {
      try {
        const users = await getUsers();
        console.log('Fetched users:', users);
        setData(users);
      } catch (err) {
        console.error('Failed to load users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  
  const { table, setData: setTableData } = useTanStackTable<UserTableDataType>({
    
    tableData: data,
    columnConfig: userListColumns,
    options: {
      initialState: {
        pagination: {
          pageIndex: 0,
          pageSize: 10,
        },
      },
      meta: {
        handleDeleteRow: (row) => {
          setTableData((prev) => prev.filter((r) => r.id !== row.id));
        },
        handleMultipleDelete: (rows) => {
          setTableData((prev) => prev.filter((r) => !rows.includes(r)));
        },
      },
      enableColumnResizing: false,
    },
  });
  useEffect(() => {
    setTableData(data);
  }, [data, setTableData]);
  
  if (loading || data.length === 0) return <div className="p-4">Loading users...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;
  return (
    <>
      <Filters table={table} />
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

