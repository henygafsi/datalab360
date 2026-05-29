'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { getLoginHistory, type AuditLoginRow } from '@/app/services/audit';

const COLUMNS: DataTableColumn[] = [
  { key: 'event_timestamp', label: 'Time', sortable: true, format: 'date' },
  { key: 'user_name', label: 'User', sortable: true, filterable: true },
  { key: 'is_success', label: 'Status', sortable: true, filterable: true,
    render: (v: string) => {
      const ok = v === 'YES' || v === 'SUCCESS';
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {ok ? 'Success' : 'Failed'}
        </span>
      );
    },
  },
  { key: 'client_ip', label: 'IP Address', sortable: true, filterable: true,
    render: (v: string) => <span className="font-mono text-xs">{v || '-'}</span> },
  { key: 'reported_client_type', label: 'Client', sortable: true, filterable: true },
  { key: 'first_authentication_factor', label: 'Auth Factor', sortable: true, filterable: true },
  { key: 'second_authentication_factor', label: 'MFA', sortable: true, filterable: true,
    render: (v: string) => v ? <span className="text-green-600 dark:text-green-400">{v}</span> : <span className="text-gray-400">None</span> },
  { key: 'error_code', label: 'Error Code', sortable: true, filterable: true,
    render: (v: string | null) => v ? <span className="font-mono text-xs text-red-600 dark:text-red-400">{v}</span> : <span className="text-gray-400">-</span> },
  { key: 'error_message', label: 'Error Message', sortable: false, filterable: true,
    render: (v: string | null) => v ? <span className="text-xs text-red-500 dark:text-red-400 truncate block max-w-[200px]" title={v}>{v}</span> : <span className="text-gray-400">-</span> },
];

interface Props {
  days?: number;
  user?: string;
  status?: string;
  limit?: number;
  className?: string;
}

export default function LoginHistoryTable({ days = 7, user, status, limit = 200, className }: Props) {
  const [data, setData] = useState<AuditLoginRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLoginHistory({ days, user, status, limit });
      setData(res.data || []);
    } catch (err) {
      toast.error('Failed to load login history');
      console.error('[LoginHistoryTable]', err);
    } finally {
      setLoading(false);
    }
  }, [days, user, status, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DataTable
      data={data}
      columns={COLUMNS}
      loading={loading}
      title="Login History Audit"
      emptyMessage="No login events found for the selected period"
      pageSize={25}
      className={className}
    />
  );
}
