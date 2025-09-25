'use client';

import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import Filters from './filters';
import { maskingListColumns } from './columns';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';
import { exportToCSV } from '@core/utils/export-to-csv';
import { useEffect, useState, useCallback } from 'react';
import { listMaskingPolicies } from '@/app/services/gouvernance/masking';

export type MaskingTableDataType = {
  policy_name: string;
  data_type?: string;
  return_type?: string;
  role_name?: string;
  replace_with?: string;
};

export default function MaskingAdvancedTable() {
  const [data, setData] = useState<MaskingTableDataType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMaskingPolicies();
      const arr = Array.isArray(res) ? res : (res?.policies || []);
      const normalized: MaskingTableDataType[] = arr.map((p: any) => ({
        policy_name: p.policy_name || p.name || '',
        data_type: p.data_type,
        return_type: p.return_type,
        role_name: p.role_name,
        replace_with: p.replace_with,
      })).filter(p => p.policy_name);
      setData(normalized);
    } catch (err: any) {
      setError(err.message || 'Failed to load policies');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const { table, setData: setTableData } = useTanStackTable<MaskingTableDataType>({
    tableData: data,
    columnConfig: maskingListColumns,
    options: {
      initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
      meta: {
        handleDeleteRow: (row) => setTableData(prev => prev.filter(r => r.policy_name !== row.policy_name)),
        handleMultipleDelete: (rows) => setTableData(prev => prev.filter(r => !rows.includes(r))),
      },
      enableColumnResizing: false,
    },
  });

  useEffect(() => { setTableData(data); }, [data, setTableData]);

  const selectedData = table.getSelectedRowModel().rows.map(r => r.original);
  function handleExportData() {
    exportToCSV(selectedData, 'Policy,Data Type,Return Type,Role,Replace With', `masking_policies_${selectedData.length}`);
  }

  if (loading) return <div className="p-4 text-center text-gray-600">Loading policies...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  if (data.length === 0 && !loading && !error) return <div className="p-4 text-center text-gray-500">No policies found.</div>;

  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <Filters table={table} />
      </div>
      <Table
        table={table}
        variant="modern"
        classNames={{ container: 'border border-muted rounded-md', rowClassName: 'last:border-0' }}
      />
      <TableFooter table={table} onExport={handleExportData} />
      <TablePagination table={table} className="py-4" />
    </>
  );
}


