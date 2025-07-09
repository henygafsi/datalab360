// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\roles\table.tsx

'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters'; // Assuming filters for roles is similar to users
import { roleListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { exportToCSV } from '@core/utils/export-to-csv';
import { useEffect, useState, useCallback } from 'react';
import { getRoles } from '@/app/services/gouvernance/fetch_roles';
import AddRoleButton from './add-role-button';

export type RoleTableDataType = {
  id: string; // Changed to string for role name as ID
  role: string;
  numberOfGrants: number;
  comment: string;
  createdOn: string;
};

export default function RolesTable() {
  const [data, setData] = useState<RoleTableDataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRolesData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const roles = await getRoles(); // getRoles now handles token internally
      console.log('Fetched roles for table:', roles);
      setData(roles);
    } catch (err: any) {
      console.error('Failed to load roles:', err);
      setError(err.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []); // No dependency on accessToken here

  useEffect(() => {
    fetchRolesData();
  }, [fetchRolesData]);


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
          // TODO: Implement actual delete API call here
          setTableData((prev) => prev.filter((r) => r.id !== row.id));
        },
        handleMultipleDelete: (rows) => {
          // TODO: Implement actual multiple delete API call here
          setTableData((prev) => prev.filter((r) => !rows.includes(r)));
        },
      },
      enableColumnResizing: false,
    },
  });

  useEffect(() => {
    setTableData(data);
  }, [data, setTableData]);

  const selectedData = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  function handleExportData() {
    exportToCSV(
      selectedData,
      'ID,Role,Number of Grants,CreatedOn,Grants,Status', // Adjust headers as per RoleTableDataType
      `roles_data_${selectedData.length}`
    );
  }

  if (loading) return <div className="p-4 text-center text-gray-600">Loading roles...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  if (data.length === 0 && !loading && !error) return <div className="p-4 text-center text-gray-500">No roles found.</div>;

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <Filters table={table} />
      </div>
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