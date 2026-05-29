'use client';

import { useState, useEffect, useMemo } from 'react';
import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { PiWarehouseDuotone } from 'react-icons/pi';
import { getWarehouses } from '@/app/services/org-accounts/hooks';
import { formatCredits } from '@/app/services/org-accounts/utils';
import type { Warehouse, DateRange } from '@/app/services/org-accounts/types';

interface WarehousesTabProps {
  refreshKey: number;
}

const COLORS = { compute: '#3b82f6', cloud: '#10b981' };

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export default function WarehousesTab({ refreshKey }: WarehousesTabProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    getWarehouses(days)
      .then((data) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch((e) => console.error('Failed to fetch warehouses:', e))
      .finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  const chartData = useMemo(() => {
    return [...warehouses]
      .sort((a, b) => b.total_credits - a.total_credits)
      .slice(0, 15)
      .map((wh) => ({
        name: wh.account_name ? `${wh.account_name}/${wh.warehouse_name}` : wh.warehouse_name,
        displayName: (() => {
          const full = wh.account_name ? `${wh.account_name}/${wh.warehouse_name}` : wh.warehouse_name;
          return full.length > 20 ? full.substring(0, 17) + '...' : full;
        })(),
        warehouse_name: wh.warehouse_name,
        account_name: wh.account_name || '',
        compute_credits: wh.compute_credits,
        cloud_credits: wh.cloud_credits,
        total_credits: wh.total_credits,
        metering_hours: wh.metering_hours,
      }));
  }, [warehouses]);

  const totals = useMemo(() => {
    return warehouses.reduce(
      (acc, wh) => ({
        total: acc.total + wh.total_credits,
        compute: acc.compute + wh.compute_credits,
        cloud: acc.cloud + wh.cloud_credits,
      }),
      { total: 0, compute: 0, cloud: 0 }
    );
  }, [warehouses]);

  if (loading) {
    return <div className="space-y-6"><SkeletonCard /><SkeletonCard /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiWarehouseDuotone className="h-5 w-5 text-indigo-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Total: <span className="text-indigo-600">{formatCredits(totals.total)}</span> credits
          </Text>
          <Text className="text-sm text-gray-500 ml-4">{warehouses.length} warehouses</Text>
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

      {/* Warehouse Chart */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.compute }} />
            <Text className="text-xs text-gray-600 dark:text-gray-300">Compute: {formatCredits(totals.compute)}</Text>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.cloud }} />
            <Text className="text-xs text-gray-600 dark:text-gray-300">Cloud Services: {formatCredits(totals.cloud)}</Text>
          </div>
        </div>
        <div className="h-96">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No warehouse data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal vertical={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="displayName" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={115} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{item.warehouse_name}</Text>
                      {item.account_name && <Text className="text-xs text-gray-500">Account: {item.account_name}</Text>}
                      <Text className="text-sm text-indigo-600">Total: {item.total_credits?.toFixed(3)}</Text>
                      <Text className="text-sm text-blue-600">Compute: {item.compute_credits?.toFixed(3)}</Text>
                      <Text className="text-sm text-green-600">Cloud: {item.cloud_credits?.toFixed(3)}</Text>
                    </div>
                  );
                }} />
                <Bar dataKey="compute_credits" stackId="a" fill={COLORS.compute} name="Compute" />
                <Bar dataKey="cloud_credits" stackId="a" fill={COLORS.cloud} name="Cloud Services" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Warehouse Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Text className="font-semibold text-gray-900 dark:text-white">All Warehouses</Text>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Warehouse</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Total Credits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Compute</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cloud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {warehouses.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No warehouses</td></tr>
              ) : [...warehouses].sort((a, b) => b.total_credits - a.total_credits).map((wh, i) => (
                <tr key={`${wh.account_name}-${wh.warehouse_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{wh.account_name || '-'}</Text></td>
                  <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{wh.warehouse_name}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm font-medium text-indigo-600">{wh.total_credits.toFixed(3)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{wh.compute_credits.toFixed(3)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{wh.cloud_credits.toFixed(3)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
