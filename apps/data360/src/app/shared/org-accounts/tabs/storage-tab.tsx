'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PiDatabaseDuotone, PiHardDrivesDuotone } from 'react-icons/pi';
import {
  getStorage,
  getStorageTrend,
  getStorageDatabases,
  getStorageStages,
} from '@/app/services/org-accounts/hooks';
import { formatStorage, formatBytes } from '@/app/services/org-accounts/utils';
import type {
  AccountStorage,
  StorageTrendPoint,
  DatabaseStorage,
  StageStorage,
  DateRange,
} from '@/app/services/org-accounts/types';

interface StorageTabProps {
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

export default function StorageTab({ refreshKey }: StorageTabProps) {
  const [storageAccounts, setStorageAccounts] = useState<AccountStorage[]>([]);
  const [totalTb, setTotalTb] = useState(0);
  const [storageTrend, setStorageTrend] = useState<StorageTrendPoint[]>([]);
  const [databases, setDatabases] = useState<DatabaseStorage[]>([]);
  const [stages, setStages] = useState<StageStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;

    Promise.all([
      getStorage().catch(() => null),
      getStorageTrend(days).catch(() => null),
      getStorageDatabases().catch(() => null),
      getStorageStages().catch(() => null),
    ]).then(([storageData, trendData, dbData, stagesData]) => {
      if (storageData) {
        setStorageAccounts(Array.isArray(storageData.accounts) ? storageData.accounts : []);
        setTotalTb(storageData.total_storage_tb || 0);
      }
      if (trendData) setStorageTrend(Array.isArray(trendData.trend) ? trendData.trend : []);
      if (dbData) setDatabases(Array.isArray(dbData.databases) ? dbData.databases : []);
      if (stagesData) setStages(Array.isArray(stagesData.stages) ? stagesData.stages : []);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiDatabaseDuotone className="h-5 w-5 text-purple-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Total Storage: <span className="text-purple-600">{formatStorage(totalTb)}</span>
          </Text>
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

      {/* Storage Trend */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <Text className="font-semibold text-gray-900 dark:text-white mb-4">Storage Trend</Text>
        <div className="h-64">
          {storageTrend.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={storageTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="storageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="usage_date" tickFormatter={formatDate} stroke="#9ca3af" fontSize={12} tickLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(1)} TB`} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(item.usage_date)}</Text>
                      <Text className="text-sm text-purple-600">Storage: {formatStorage(item.total_tb)}</Text>
                      <Text className="text-xs text-gray-500">Credits: {item.total_credits?.toFixed(2)}</Text>
                    </div>
                  );
                }} />
                <Area type="monotone" dataKey="total_tb" stroke="#8b5cf6" strokeWidth={2} fill="url(#storageFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Storage by Account + Stages */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Storage by Account */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <Text className="font-semibold text-gray-900 dark:text-white">Storage by Account</Text>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Storage</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {storageAccounts.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No data</td></tr>
                ) : storageAccounts.map((acc) => (
                  <tr key={acc.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3"><Text className="font-medium text-gray-900 dark:text-white">{acc.account_name}</Text></td>
                    <td className="px-4 py-3 text-right"><Text className="text-gray-900 dark:text-white">{formatStorage(acc.total_tb)}</Text></td>
                    <td className="px-4 py-3 text-right"><Text className="text-gray-600 dark:text-gray-300">{acc.storage_credits.toFixed(2)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stage Storage */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <PiHardDrivesDuotone className="h-5 w-5 text-cyan-500" />
              <Text className="font-semibold text-gray-900 dark:text-white">Stage Storage</Text>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Stage Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {stages.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-500">No stage data</td></tr>
                ) : stages.map((s) => (
                  <tr key={s.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3"><Text className="font-medium text-gray-900 dark:text-white">{s.account_name}</Text></td>
                    <td className="px-4 py-3 text-right"><Text className="text-gray-900 dark:text-white">{formatBytes(s.stage_bytes)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Database Storage */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Text className="font-semibold text-gray-900 dark:text-white">Database Storage Breakdown</Text>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Database</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Size</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Failsafe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {databases.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No database storage data</td></tr>
              ) : databases.map((db, i) => (
                <tr key={`${db.account_name}-${db.database_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{db.account_name}</Text></td>
                  <td className="px-4 py-2"><Badge variant="flat" color="primary" className="text-xs">{db.database_name}</Badge></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-900 dark:text-white">{formatBytes(db.database_bytes)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatBytes(db.failsafe_bytes)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
