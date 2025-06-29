'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters';
import { roleListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { exportToCSV } from '@core/utils/export-to-csv';
import { rolesData } from '@/data/roles-data';
import { useEffect, useState } from 'react';
import { getRoles } from '@/app/services/gouvernance/fetch_roles';

//export type RoleTableDataType = (typeof rolesData)[number];
export type RoleTableDataType = {
  id: number;
  role: any;
  numberOfGrants: any;
  comment: any;
  createdOn: any;
}

export default function RolesTable() {
  const [data, setData] = useState<RoleTableDataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
      const fetchData = async () => {
        try {
          const users = await getRoles();
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
  
    
  const { table, setData: setTableData } = useTanStackTable<RoleTableDataType>({
    tableData: data,
    columnConfig: roleListColumns,
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
 

  const selectedData = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  function handleExportData() {
    exportToCSV(
      selectedData,
      'ID,Role,Number of Grants,CreatedOn,Grants,Status',
      `roles_data_${selectedData.length}`
    );
  }
  useEffect(() => {
    setTableData(data);
  }, [data, setTableData]);

  if (loading || data.length === 0) return <div className="p-4">Loading roles...</div>;
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
      <TableFooter table={table} onExport={handleExportData} />
      <TablePagination table={table} className="py-4" />
    </>
  );
}
