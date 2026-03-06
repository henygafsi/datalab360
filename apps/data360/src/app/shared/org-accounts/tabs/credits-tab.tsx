'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { PiCoinsDuotone, PiChartBarDuotone } from 'react-icons/pi';
import {
  getCredits,
  getTopConsumers,
  getCreditsTrend,
  getMetering,
  getMeteringTrend,
} from '@/app/services/org-accounts/hooks';
import { formatCredits } from '@/app/services/org-accounts/utils';
import type {
  AccountCredit,
  TopConsumer,
  CreditTrendPoint,
  MeteringEntry,
  MeteringTrendPoint,
  DateRange,
} from '@/app/services/org-accounts/types';

interface CreditsTabProps {
  refreshKey: number;
}

const COLORS = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e'];

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export default function CreditsTab({ refreshKey }: CreditsTabProps) {
  const [credits, setCredits] = useState<AccountCredit[]>([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([]);
  const [creditTrend, setCreditTrend] = useState<CreditTrendPoint[]>([]);
  const [metering, setMetering] = useState<MeteringEntry[]>([]);
  const [meteringTrend, setMeteringTrend] = useState<MeteringTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;

    Promise.all([
      getCredits(days).catch(() => null),
      getTopConsumers(days, 10).catch(() => null),
      getCreditsTrend(days).catch(() => null),
      getMetering(days).catch(() => null),
      getMeteringTrend(days).catch(() => null),
    ]).then(([creditsData, topData, trendData, meteringData, mTrendData]) => {
      if (creditsData) {
        setCredits(Array.isArray(creditsData.accounts) ? creditsData.accounts : []);
        setTotalCredits(creditsData.total_credits || 0);
      }
      if (topData) setTopConsumers(Array.isArray(topData.top_consumers) ? topData.top_consumers : []);
      if (trendData) setCreditTrend(Array.isArray(trendData.trend) ? trendData.trend : []);
      if (meteringData) setMetering(Array.isArray(meteringData.metering) ? meteringData.metering : []);
      if (mTrendData) setMeteringTrend(Array.isArray(mTrendData.trend) ? mTrendData.trend : []);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiCoinsDuotone className="h-5 w-5 text-amber-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Total Credits: <span className="text-amber-600">{formatCredits(totalCredits)}</span>
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

      {/* Credit Trend + Top Consumers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Credit Trend Chart */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <Text className="font-semibold text-gray-900 dark:text-white mb-4">Credit Usage Trend</Text>
          <div className="h-64">
            {creditTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={creditTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="usage_date" tickFormatter={formatDate} stroke="#9ca3af" fontSize={12} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(item.usage_date)}</Text>
                        <Text className="text-sm text-gray-600">Credits: <span className="font-semibold text-amber-600">{item.total_credits?.toLocaleString()}</span></Text>
                        <Text className="text-xs text-gray-500">Active accounts: {item.active_accounts}</Text>
                      </div>
                    );
                  }} />
                  <Line type="monotone" dataKey="total_credits" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Consumers */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <Text className="font-semibold text-gray-900 dark:text-white mb-4">Top 10 Credit Consumers</Text>
          <div className="h-64">
            {topConsumers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topConsumers} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal vertical={false} />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="account_name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={75} tickFormatter={(v: string) => v.length > 12 ? v.substring(0, 10) + '...' : v} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{item.account_name}</Text>
                        <Text className="text-sm text-gray-600">Credits: <span className="font-semibold text-amber-600">{item.total_credits?.toLocaleString()}</span></Text>
                      </div>
                    );
                  }} />
                  <Bar dataKey="total_credits" radius={[0, 4, 4, 0]}>
                    {topConsumers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Credits by Account Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Text className="font-semibold text-gray-900 dark:text-white">Credit Usage by Account</Text>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Total Credits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Compute</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cloud Services</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {credits.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No credit data</td></tr>
              ) : credits.map((acc) => (
                <tr key={acc.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Text className="font-medium text-gray-900 dark:text-white">{acc.account_name}</Text>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Text className="font-medium text-gray-900 dark:text-white">{formatCredits(acc.total_credits)}</Text>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Text className="text-gray-600 dark:text-gray-300">{formatCredits(acc.compute_credits)}</Text>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Text className="text-gray-600 dark:text-gray-300">{formatCredits(acc.cloud_services_credits)}</Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Metering Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Metering Trend */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PiChartBarDuotone className="h-5 w-5 text-indigo-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Metering Trend</Text>
          </div>
          <div className="h-64">
            {meteringTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">No metering data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={meteringTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="usage_date" tickFormatter={formatDate} stroke="#9ca3af" fontSize={12} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(item.usage_date)}</Text>
                        <Text className="text-sm text-blue-600">Compute: {item.compute_credits?.toFixed(2)}</Text>
                        <Text className="text-sm text-green-600">Cloud: {item.cloud_services_credits?.toFixed(2)}</Text>
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">Billed: {item.total_billed?.toFixed(2)}</Text>
                      </div>
                    );
                  }} />
                  <Legend />
                  <Bar dataKey="compute_credits" stackId="a" fill="#3b82f6" name="Compute" />
                  <Bar dataKey="cloud_services_credits" stackId="a" fill="#10b981" name="Cloud Services" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Metering by Service Table */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <Text className="font-semibold text-gray-900 dark:text-white">Metering by Service</Text>
          </div>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Service</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Total Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {metering.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No metering data</td></tr>
                ) : metering.map((m, i) => (
                  <tr key={`${m.account_name}-${m.service_type}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <Text className="text-sm text-gray-900 dark:text-white">{m.account_name}</Text>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="flat" color="primary" className="text-xs">{m.service_type.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatCredits(m.total_billed)}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
