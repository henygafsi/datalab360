'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiShareNetworkDuotone,
  PiUsersDuotone,
  PiCloudArrowUpDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import {
  getReaderAccounts,
  getShares,
  getReplication,
} from '@/app/services/org-accounts/hooks';
import { formatDate, formatBytes, formatCredits, extractApiError } from '@/app/services/org-accounts/utils';
import type {
  ReaderAccount,
  Share,
  ReplicationEntry,
  DateRange,
} from '@/app/services/org-accounts/types';

interface DataSharingTabProps {
  refreshKey: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export default function DataSharingTab({ refreshKey }: DataSharingTabProps) {
  const [readerAccounts, setReaderAccounts] = useState<ReaderAccount[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [replication, setReplication] = useState<ReplicationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e) => { firstError = firstError ?? extractApiError(e, 'Failed to load data sharing'); return null; });

    Promise.all([
      guard(getReaderAccounts()),
      guard(getShares()),
      guard(getReplication(days)),
    ]).then(([readerData, sharesData, replData]) => {
      if (readerData) setReaderAccounts(Array.isArray(readerData.reader_accounts) ? readerData.reader_accounts : []);
      if (sharesData) setShares(Array.isArray(sharesData.shares) ? sharesData.shares : []);
      if (replData) setReplication(Array.isArray(replData.replication) ? replData.replication : []);
      setError(firstError);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Some data sharing info could not be loaded</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiShareNetworkDuotone className="h-5 w-5 text-teal-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">Data Sharing & Replication</Text>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['7d', '30d', '90d'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                dateRange === r
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              )}
            >
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-sm text-gray-500 mb-2">Data Shares</Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">{shares.length}</Text>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-900/20">
              <PiShareNetworkDuotone className="h-5 w-5 text-teal-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-sm text-gray-500 mb-2">Reader Accounts</Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">{readerAccounts.length}</Text>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <PiUsersDuotone className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-sm text-gray-500 mb-2">Replication Credits</Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCredits(replication.reduce((s, r) => s + r.total_credits, 0))}
              </Text>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <PiCloudArrowUpDuotone className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Shares + Reader Accounts side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Data Shares */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <Text className="font-semibold text-gray-900 dark:text-white">Data Shares</Text>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Database</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Kind</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {shares.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No shares</td></tr>
                ) : shares.map((s) => (
                  <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</Text></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{s.database_name}</Text></td>
                    <td className="px-4 py-2"><Badge variant="flat" color={s.kind === 'OUTBOUND' ? 'success' : 'info'} className="text-xs">{s.kind}</Badge></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatDate(s.created_on)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reader Accounts */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <Text className="font-semibold text-gray-900 dark:text-white">Reader Accounts</Text>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cloud</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Region</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {readerAccounts.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No reader accounts</td></tr>
                ) : readerAccounts.map((r) => (
                  <tr key={r.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</Text></td>
                    <td className="px-4 py-2"><Badge variant="flat" color="info" className="text-xs">{r.cloud}</Badge></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{r.region}</Text></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatDate(r.created_on)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Replication */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PiCloudArrowUpDuotone className="h-5 w-5 text-purple-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Replication Usage</Text>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Bytes Transferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {replication.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No replication data</td></tr>
              ) : replication.map((r) => (
                <tr key={r.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3"><Text className="font-medium text-gray-900 dark:text-white">{r.account_name}</Text></td>
                  <td className="px-4 py-3 text-right"><Text className="font-medium text-purple-600">{formatCredits(r.total_credits)}</Text></td>
                  <td className="px-4 py-3 text-right"><Text className="text-gray-600 dark:text-gray-300">{formatBytes(r.total_bytes_transferred)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
