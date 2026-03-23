'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { getAccessHistory, type AuditAccessRow } from '@/app/services/audit';

const OBJECT_TYPE_COLORS: Record<string, string> = {
  TABLE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  VIEW: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  STAGE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const COLUMNS: DataTableColumn[] = [
  { key: 'access_time', label: 'Access Time', sortable: true, format: 'date' },
  { key: 'user_name', label: 'User', sortable: true, filterable: true },
  { key: 'role_name', label: 'Role', sortable: true, filterable: true },
  { key: 'object_type', label: 'Object Type', sortable: true, filterable: true,
    render: (v: string) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OBJECT_TYPE_COLORS[v] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{v}</span> },
  { key: 'object_name', label: 'Object', sortable: true, filterable: true,
    render: (v: string) => <span className="font-mono text-xs" title={v}>{v?.length > 60 ? v.slice(0, 60) + '...' : v}</span> },
  { key: 'columns_accessed', label: 'Columns', sortable: false, filterable: true,
    render: (v: string) => <span className="text-xs text-gray-500 dark:text-gray-400" title={v}>{v?.length > 40 ? v.slice(0, 40) + '...' : (v || '-')}</span> },
  { key: 'query_id', label: 'Query ID', sortable: true, filterable: true,
    render: (v: string) => <span className="font-mono text-xs">{v?.slice(0, 12)}...</span> },
];

interface Props {
  days?: number;
  user?: string;
  objectType?: string;
  limit?: number;
  className?: string;
}

export default function AccessHistoryTable({ days = 7, user, objectType, limit = 200, className }: Props) {
  const [data, setData] = useState<AuditAccessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAccessHistory({ days, user, object_type: objectType, limit });
      setData(res.data || []);
    } catch (err) {
      toast.error('Failed to load access history');
      console.error('[AccessHistoryTable]', err);
    } finally {
      setLoading(false);
    }
  }, [days, user, objectType, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DataTable
      data={data}
      columns={COLUMNS}
      loading={loading}
      title="Data Access Audit Trail"
      emptyMessage="No access history found for the selected period"
      pageSize={25}
      className={className}
    />
  );
}
