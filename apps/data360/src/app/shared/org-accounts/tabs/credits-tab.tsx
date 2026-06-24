'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import { ShieldPlus } from 'lucide-react';
import { PiWarningCircleDuotone } from 'react-icons/pi';
import { useCanPerform } from '@/hooks/useCanPerform';
import ResourceMonitorCreateRail from '../ResourceMonitorCreateRail';
import AiComputeCostPanel from '../AiComputeCostPanel';
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
import { PiCoinsDuotone, PiChartBarDuotone, PiSparkleDuotone, PiInfoDuotone, PiTrendUpDuotone, PiWarehouseDuotone } from 'react-icons/pi';
import { useAiMonthly } from '@/app/(dashboard)/intelligent/store/ai-store';
import {
  getCredits,
  getTopConsumers,
  getCreditsTrend,
  getMetering,
  getMeteringTrend,
  getCreditForecast,
  getWarehouseCredits,
  getUsageAnalytics,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, extractApiError } from '@/app/services/org-accounts/utils';
import { safeToFixed } from '@/lib/format-number';
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
  const [forecast, setForecast] = useState<any>(null);
  const [warehouseCredits, setWarehouseCredits] = useState<any>(null);
  const [usageAnalytics, setUsageAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  // Bumped after a spend-cap monitor is created so the forecast re-pulls.
  const [localRefresh, setLocalRefresh] = useState(0);

  // detect -> act: when the forecast flags budget-at-risk, offer a one-click
  // "set a spending cap" (resource monitor create). Parent owns the gate; the
  // rail is presentation-only. Fail-open while the allow-set loads.
  const { allowed: canCreateRm, loading: rmPermLoading } = useCanPerform('org_accounts', 'create');
  const rmCreateDenied = !canCreateRm && !rmPermLoading;
  const [rmCreateOpen, setRmCreateOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    // Capture the first failure so we can surface an inline error distinct
    // from a genuine empty result, rather than swallowing it into null.
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e) => { firstError = firstError ?? extractApiError(e, 'Failed to load credits'); return null; });

    Promise.all([
      guard(getCredits(days)),
      guard(getTopConsumers(days, 10)),
      guard(getCreditsTrend(days)),
      guard(getMetering(days)),
      guard(getMeteringTrend(days)),
      guard(getCreditForecast(days)),
      guard(getWarehouseCredits(days)),
      guard(getUsageAnalytics(days)),
    ]).then(([creditsData, topData, trendData, meteringData, mTrendData, forecastData, whCreditsData, usageData]) => {
      if (creditsData) {
        setCredits(Array.isArray(creditsData.accounts) ? creditsData.accounts : []);
        setTotalCredits(creditsData.total_credits || 0);
      }
      if (topData) setTopConsumers(Array.isArray(topData.top_consumers) ? topData.top_consumers : []);
      if (trendData) setCreditTrend(Array.isArray(trendData.trend) ? trendData.trend : []);
      if (meteringData) setMetering(Array.isArray(meteringData.metering) ? meteringData.metering : []);
      if (mTrendData) setMeteringTrend(Array.isArray(mTrendData.trend) ? mTrendData.trend : []);
      setForecast(forecastData);
      setWarehouseCredits(whCreditsData);
      setUsageAnalytics(usageData);
      setError(firstError);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange, localRefresh]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Derived forecast values
  const forecastHistory = Array.isArray(forecast?.history) ? forecast.history : [];
  const dailyAvg = forecast?.daily_avg ?? 0;
  const projected30d = forecast?.projected_30d_total ?? 0;
  const trendDirection = forecast?.trend_direction ?? 'stable';
  const budgetAtRisk = forecast?.budget_at_risk ?? false;

  // Derived warehouse credits values (Snowflake returns UPPERCASE keys)
  const warehouses = Array.isArray(warehouseCredits?.warehouses) ? warehouseCredits.warehouses : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
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
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Some credits data could not be loaded</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}
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

      {/* Credit Forecast + Warehouse Credits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Credit Forecast */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PiTrendUpDuotone className="h-5 w-5 text-emerald-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Credit Forecast</Text>
            {budgetAtRisk && (
              <Badge variant="flat" color="danger" className="text-xs ml-auto">Budget at Risk</Badge>
            )}
            <button
              type="button"
              disabled={rmCreateDenied}
              title={rmCreateDenied ? 'You lack the "create" permission on Client Accounts. Ask an administrator to grant it.' : 'Create a resource monitor to cap spend'}
              onClick={() => { if (!rmCreateDenied) setRmCreateOpen(true); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                budgetAtRisk
                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30',
                budgetAtRisk ? '' : 'ml-auto',
              )}
            >
              <ShieldPlus className="h-3.5 w-3.5" /> Set spending cap
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
              <Text className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Daily Avg</Text>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {formatCredits(dailyAvg)}
              </div>
              <Text className="text-xs text-gray-500">credits/day</Text>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
              <Text className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Projected 30d</Text>
              <div className={cn(
                'mt-1 text-2xl font-bold',
                budgetAtRisk ? 'text-red-600' : 'text-gray-900 dark:text-white'
              )}>
                {formatCredits(projected30d)}
              </div>
              <Text className="text-xs text-gray-500">
                Trend: <span className={cn(
                  'font-medium',
                  trendDirection === 'increasing' ? 'text-red-500' :
                  trendDirection === 'decreasing' ? 'text-green-500' : 'text-gray-500'
                )}>{trendDirection}</span>
              </Text>
            </div>
          </div>

          {/* Mini line chart of historical usage */}
          <div className="h-40">
            {forecastHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">No forecast data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastHistory} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    stroke="#9ca3af"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{item.date}</Text>
                        <Text className="text-sm text-emerald-600">Credits: <span className="font-semibold">{Number(item.credits).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></Text>
                      </div>
                    );
                  }} />
                  <Line type="monotone" dataKey="credits" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Warehouse Credits */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" id="warehouse-credits">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <PiWarehouseDuotone className="h-5 w-5 text-blue-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Warehouse Credits</Text>
            {warehouses.length > 0 && (
              <Badge variant="flat" color="info" className="text-xs ml-auto">{warehouses.length} warehouses</Badge>
            )}
          </div>
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Total Credits</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Compute</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cloud Svc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {warehouses.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No warehouse credit data</td></tr>
                ) : warehouses.map((w: any, i: number) => (
                  <tr key={`${w.ACCOUNT_NAME || w.account_name}-${w.WAREHOUSE_NAME || w.warehouse_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <Text className="text-sm text-gray-900 dark:text-white">{w.ACCOUNT_NAME || w.account_name || '—'}</Text>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="flat" color="primary" className="text-xs">{(w.WAREHOUSE_NAME || w.warehouse_name || '—').replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatCredits(Number(w.TOTAL_CREDITS || w.total_credits || 0))}
                      </Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        {formatCredits(Number(w.COMPUTE_CREDITS || w.compute_credits || 0))}
                      </Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        {formatCredits(Number(w.CLOUD_CREDITS || w.cloud_credits || 0))}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                        <Text className="text-sm text-blue-600">Compute: {safeToFixed(item.compute_credits, 2)}</Text>
                        <Text className="text-sm text-green-600">Cloud: {safeToFixed(item.cloud_services_credits, 2)}</Text>
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">Billed: {safeToFixed(item.total_billed, 2)}</Text>
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" id="metering-by-service">
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

      {/* ─────────────────────────────────────────────────────────────────
          Usage Analytics — top users / queries by credits + warehouse
          utilization (GET /org-accounts/usage-analytics). Untyped backend
          rows are introspected generically so the panel adapts to whatever
          columns the endpoint returns and degrades to an honest empty state.
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DynamicTable
          title="Top Users by Credits"
          rows={Array.isArray(usageAnalytics?.top_users_by_credits) ? usageAnalytics.top_users_by_credits : []}
        />
        <DynamicTable
          title="Top Queries by Credits"
          rows={Array.isArray(usageAnalytics?.top_queries_by_credits) ? usageAnalytics.top_queries_by_credits : []}
        />
      </div>
      <DynamicTable
        title="Warehouse Utilization"
        rows={Array.isArray(usageAnalytics?.warehouse_utilization) ? usageAnalytics.warehouse_utilization : []}
      />

      {/* ─────────────────────────────────────────────────────────────────
          AI compute cost — LIVE server-side per-service spend
          (GET /org-accounts/cortex-costs). Self-fetching: degrades to an
          honest "not available" notice if the route is undeployed (404),
          without poisoning the rest of the tab.
          ───────────────────────────────────────────────────────────── */}
      <AiComputeCostPanel
        days={dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30}
        refreshKey={refreshKey}
      />

      {/* ─────────────────────────────────────────────────────────────────
          AI consumption (per-feature) — client-side aggregation. Complements
          the live per-service totals above with per-feature detail the server
          rollup does not yet expose.
          ───────────────────────────────────────────────────────────── */}
      <AiConsumptionCard />

      {/* detect -> act: create a spend-cap resource monitor, seeded from the
          forecast's projected 30d total. Parent gates; rail is presentation-only. */}
      <ResourceMonitorCreateRail
        isOpen={rmCreateOpen}
        onClose={() => setRmCreateOpen(false)}
        onCreated={() => setLocalRefresh((v) => v + 1)}
        defaultQuota={Number(projected30d) > 0 ? Number(projected30d) : undefined}
        defaultName="MONTHLY_BUDGET_CAP"
      />
    </div>
  );
}

/**
 * DynamicTable — renders an array of untyped backend rows by introspecting the
 * keys of the first row. Numeric cells are localized; missing values render an
 * honest "—" (never a fabricated 0). Used for the usage-analytics sub-arrays
 * whose exact column set isn't typed.
 */
function DynamicTable({ title, rows }: { title: string; rows: any[] }) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const formatCell = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(v);
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <PiChartBarDuotone className="h-5 w-5 text-indigo-500" />
        <Text className="font-semibold text-gray-900 dark:text-white">{title}</Text>
        {rows.length > 0 && (
          <Badge variant="flat" color="info" className="text-xs ml-auto">{rows.length}</Badge>
        )}
      </div>
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">No data available</div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                    {c.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {columns.map((c) => (
                    <td key={c} className="px-4 py-2">
                      <Text className="text-sm text-gray-900 dark:text-white truncate max-w-xs" title={String(row[c] ?? '')}>
                        {formatCell(row[c])}
                      </Text>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * AiConsumptionCard — Surfaces client-side AI charge aggregation while the
 * `GET /account/{accountId}/ai-credits` backend rollup endpoint is missing.
 * Shows monthly total, top 5 features, a 30-day sparkline and a clear
 * Backend Gap card explaining what's not yet wired.
 */
function AiConsumptionCard() {
  const { total, byFeature, byDay } = useAiMonthly();

  const top5 = Object.entries(byFeature)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([feature, credits]) => ({ feature, credits }));

  // Real per-day rollup only — never synthesise placeholder values.
  const hasActivity = byDay.some((d) => d.credits > 0);
  const maxCredits = Math.max(...top5.map((t) => t.credits), 0.0001);

  return (
    <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/40 to-white p-6 dark:border-purple-900/40 dark:from-purple-900/10 dark:to-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiSparkleDuotone className="h-5 w-5 text-purple-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            AI consumption
          </Text>
        </div>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          Last 30 days · client-side rollup
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* KPI */}
        <div className="rounded-lg bg-white/70 p-4 dark:bg-gray-800/40">
          <Text className="text-xs uppercase tracking-wider text-gray-500">
            Monthly total
          </Text>
          <div className="mt-1 text-3xl font-bold text-purple-600">
            {total > 0 ? safeToFixed(total, 3) : '—'}
            <span className="ml-1 text-base font-medium text-gray-500">cr</span>
          </div>
          <Text className="mt-1 text-xs text-gray-500">
            Sum of all tracked AI charges
          </Text>
        </div>

        {/* Top 5 features */}
        <div className="rounded-lg bg-white/70 p-4 dark:bg-gray-800/40 md:col-span-2">
          <Text className="mb-3 text-xs uppercase tracking-wider text-gray-500">
            Top features by credits
          </Text>
          {top5.length === 0 ? (
            <Text className="text-sm text-gray-500">— no AI activity yet —</Text>
          ) : (
            <ul className="space-y-2">
              {top5.map((row) => (
                <li key={row.feature} className="flex items-center gap-3">
                  <span className="w-44 truncate text-xs font-medium text-gray-700 dark:text-gray-200">
                    {row.feature}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500"
                      style={{ width: `${Math.max(4, (row.credits / maxCredits) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
                    {safeToFixed(row.credits, 3)} cr
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 30-day sparkline — only when there is real tracked activity */}
      <div className="mt-6 rounded-lg bg-white/70 p-4 dark:bg-gray-800/40">
        <Text className="mb-2 text-xs uppercase tracking-wider text-gray-500">
          30-day trend
        </Text>
        {hasActivity ? (
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <Line
                  type="monotone"
                  dataKey="credits"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { date: string; credits: number };
                    return (
                      <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-gray-700 dark:bg-gray-800">
                        <div className="font-medium">{p.date}</div>
                        <div className="text-purple-600">{safeToFixed(p.credits, 4)} cr</div>
                      </div>
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center text-xs text-gray-500 dark:text-gray-400">
            No AI activity tracked yet
          </div>
        )}
      </div>

      {/* Backend Gap card */}
      <div className="mt-6 rounded-lg border-l-4 border-amber-400 bg-amber-50/70 p-4 dark:bg-amber-900/20">
        <div className="flex gap-3">
          <PiInfoDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="space-y-1">
            <Text className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Backend Gap — per-feature AI rollup endpoint missing
            </Text>
            <Text className="text-xs text-amber-700 dark:text-amber-200/80">
              Live per-service AI spend is shown above (server rollup). This card
              adds per-feature detail, aggregated in the browser (localStorage,
              rolling 30 days) — the per-feature server endpoint is not yet
              exposed. Expected shape:
            </Text>
            <pre className="mt-1 overflow-x-auto rounded bg-amber-100/70 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
{`GET /account/{accountId}/ai-credits?period=30d
→ {
    "total": 12.345,
    "by_feature": [{ "feature": "cortex_complete", "credits": 8.21 }, ...],
    "by_day":     [{ "date": "2026-04-19", "credits": 0.41 }, ...]
  }`}
            </pre>
            <Text className="text-xs text-amber-700 dark:text-amber-200/80">
              Pair with <code className="rounded bg-amber-100/70 px-1 dark:bg-amber-950/40">POST /ai/estimate</code> so
              the per-call cost chips switch from local heuristic to live
              estimate. Until then, the chips render with "(estimate)" tag.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
