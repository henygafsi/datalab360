'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from 'rizzui';
import toast from 'react-hot-toast';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { getQueryHistory, type AuditQueryRow } from '@/app/services/audit';
import { safeToFixed } from '@/lib/format-number';

const STATUS_COLORS: Record<string, string> = {
  SUCCEEDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  QUEUED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const COLUMNS: DataTableColumn[] = [
  { key: 'query_id', label: 'Query ID', sortable: true, filterable: true, width: 'w-28',
    render: (v: string) => <span className="font-mono text-xs">{v?.slice(0, 12)}...</span> },
  { key: 'query_text', label: 'Query', sortable: false, filterable: true, width: 'max-w-[200px]',
    render: (v: string) => <span className="block truncate max-w-[200px]" title={v}>{v?.slice(0, 80)}{v?.length > 80 ? '...' : ''}</span> },
  { key: 'user_name', label: 'User', sortable: true, filterable: true },
  { key: 'warehouse_name', label: 'Warehouse', sortable: true, filterable: true },
  { key: 'execution_status', label: 'Status', sortable: true, filterable: true,
    render: (v: string) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{v}</span> },
  { key: 'total_elapsed_time', label: 'Elapsed', sortable: true, format: 'duration', align: 'right' },
  { key: 'rows_produced', label: 'Rows', sortable: true, format: 'number', align: 'right' },
  { key: 'bytes_scanned', label: 'Scanned', sortable: true, format: 'bytes', align: 'right' },
  { key: 'credits_used_cloud_services', label: 'Credits', sortable: true, align: 'right',
    render: (v: number) => <span>{safeToFixed(v, 4, '-')}</span> },
  { key: 'start_time', label: 'Start Time', sortable: true, format: 'date' },
];

interface Props {
  days?: number;
  user?: string;
  warehouse?: string;
  status?: string;
  limit?: number;
  className?: string;
}

export default function QueryHistoryTable({ days = 7, user, warehouse, status, limit = 200, className }: Props) {
  const [data, setData] = useState<AuditQueryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getQueryHistory({ days, user, warehouse, status, limit });
      setData(res.data || []);
    } catch (err) {
      toast.error('Failed to load query history');
      console.error('[QueryHistoryTable]', err);
    } finally {
      setLoading(false);
    }
  }, [days, user, warehouse, status, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DataTable
      data={data}
      columns={COLUMNS}
      loading={loading}
      title="Query History Audit"
      emptyMessage="No query history found for the selected period"
      pageSize={25}
      className={className}
    />
  );
}
