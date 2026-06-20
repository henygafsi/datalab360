'use client';

import cn from '@core/utils/class-names';
import { Text, Title, Badge } from 'rizzui';
import { PiCurrencyDollarDuotone, PiDatabaseDuotone, PiCpuDuotone, PiCalendarDuotone } from 'react-icons/pi';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import type { WarehouseUsageSummary, StorageMetrics, DailyCreditUsage } from '@/app/services/observability/types';
import FreshnessDisclaimer from './freshness-disclaimer';

interface CostOverviewCardProps {
  warehouseData: WarehouseUsageSummary | null;
  storageData: StorageMetrics | null;
  dailyCredits: DailyCreditUsage[] | null;
  isLoading?: boolean;
  className?: string;
}

// Backend sends numeric fields as strings ("1234.5") → the declared `number`
// type is a lie at runtime. Coerce + guard so .toFixed never crashes; a
// missing/non-numeric value renders "—" (no fake $0).
function formatCurrency(value: number | string | undefined | null): string {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return '—';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatCredits(value: number | string | undefined | null): string {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
}

function formatStorage(gb: number | string | undefined | null): string {
  const n = Number(gb);
  if (gb == null || gb === '' || !Number.isFinite(n)) return '—';
  if (n >= 1024) return `${(n / 1024).toFixed(2)} TB`;
  return `${n.toFixed(2)} GB`;
}

export default function CostOverviewCard({
  warehouseData,
  storageData,
  dailyCredits,
  isLoading,
  className,
}: CostOverviewCardProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <div className="animate-pulse">
          <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="h-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="mt-4 h-48 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = dailyCredits?.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    credits: item.credits_used,
  })) || [];

  // Calculate total storage in GB
  const totalStorageGb = (storageData?.current_storage_gb ?? 0) +
                         (storageData?.current_stage_gb ?? 0) +
                         (storageData?.current_failsafe_gb ?? 0);

  // Dollar figure is computed by the backend from Snowflake's per-credit rate
  // for this account — the FE applies NO hardcoded credit→USD assumption.
  // When the backend doesn't return an estimate we render "—", never a fake $0.
  const computeCost = warehouseData?.estimated_cost_usd ?? warehouseData?.total_cost_estimate ?? null;

  return (
    <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
      <div className="flex items-center justify-between">
        <Title as="h3" className="text-base font-semibold">Cost Overview</Title>
        {warehouseData?.period_days && (
          <Badge variant="flat" color="primary">
            Last {warehouseData.period_days} days
          </Badge>
        )}
      </div>

      <FreshnessDisclaimer className="mt-3" />

      {/* Cost Summary */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <PiCpuDuotone className="h-5 w-5 text-blue-600" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">Compute Cost</Text>
          </div>
          <Text className="mt-2 text-2xl font-bold text-blue-600">
            {formatCurrency(computeCost)}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">
            {formatCredits(warehouseData?.total_credits)} credits used
          </Text>
        </div>

        <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
          <div className="flex items-center gap-2">
            <PiDatabaseDuotone className="h-5 w-5 text-purple-600" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">Storage</Text>
          </div>
          <Text className="mt-2 text-2xl font-bold text-purple-600">
            {formatStorage(totalStorageGb)}
          </Text>
          <Text className="mt-1 text-xs text-gray-500">
            {formatStorage(storageData?.current_failsafe_gb)} failsafe
          </Text>
        </div>
      </div>

      {/* Total Estimated Cost */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PiCurrencyDollarDuotone className="h-6 w-6 text-green-600" />
            <Text className="font-medium text-gray-700 dark:text-gray-300">
              Total Estimated Cost ({warehouseData?.period_days ?? 30} days)
            </Text>
          </div>
          <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(computeCost)}
          </Text>
        </div>
        <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Estimated from this account&apos;s Snowflake per-credit rate (computed server-side). Credits consumed are the source of truth.
        </Text>
      </div>

      {/* Daily Credits Chart */}
      {chartData.length > 0 && (
        <div className="mt-6">
          <Text className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">
            Daily Credit Usage
          </Text>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCredits(value)}
                />
                <Tooltip
                  formatter={(value: number) => [formatCredits(value), 'Credits']}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#creditGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Warehouse Breakdown */}
      {warehouseData?.warehouses && warehouseData.warehouses.length > 0 && (
        <div className="mt-6">
          <Text className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">
            Warehouses
          </Text>
          <div className="space-y-2">
            {warehouseData.warehouses.slice(0, 5).map((warehouse) => (
              <div
                key={warehouse.warehouse_name || 'unknown'}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/30"
              >
                <div>
                  <Text className="font-medium">{warehouse.warehouse_name || 'Unknown'}</Text>
                  {warehouse.active_days && (
                    <Text className="text-xs text-gray-500">
                      <PiCalendarDuotone className="mr-1 inline h-3 w-3" />
                      {warehouse.active_days} active days
                    </Text>
                  )}
                </div>
                <div className="text-right">
                  <Text className="text-sm font-semibold">
                    {formatCredits(warehouse.total_credits || warehouse.credits_used)} credits
                  </Text>
                  {warehouse.compute_credits !== undefined && (
                    <Text className="text-xs text-gray-500">
                      {formatCredits(warehouse.compute_credits)} compute
                    </Text>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
