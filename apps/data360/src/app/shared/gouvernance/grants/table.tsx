'use client';

/* import { grantsData } from '@/data/grants-data'; */
import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
/* import Filters from './Filters'; */
import { grantListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { exportToCSV } from '@core/utils/export-to-csv';
import { useEffect, useState } from 'react';
import { getPermissions } from '@/app/services/gouvernance/fetch_grants';
import AddGrantButton from './add-grant-button';
import EditGrantsButton from './edit-grants-button';
import Filters from './filters';


export type GrantTableDataType ={
  id: number;
  name: string;
  roles: string[];
}

export default function GrantsTable() {
  const [data, setData] = useState<GrantTableDataType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
  
    useEffect(() => {
        const fetchData = async () => {
          try {
            const users = await getPermissions();
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
      
  const { table, setData: setTableData } = useTanStackTable<GrantTableDataType>({
    tableData: data,
    columnConfig: grantListColumns,
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
      'ID,Role,Number of Grants,CreatedOn,Permissions,Status',
      `grants_data_${selectedData.length}`
    );
  }
  useEffect(() => {
      setTableData(data);
    }, [data, setTableData]);
  
    if (loading || data.length === 0) return <div className="p-4">Loading permissions...</div>;
    if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <>
      <div className="mb-4 flex space-x-3">
       {/* <AddGrantButton />
        <EditGrantsButton />*/ }
      </div>
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
