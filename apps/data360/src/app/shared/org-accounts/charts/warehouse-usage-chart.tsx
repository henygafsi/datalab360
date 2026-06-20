'use client';

import { useMemo } from 'react';
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
import type { Warehouse } from '@/app/services/org-accounts/types';
import { safeToFixed } from '@/lib/format-number';

interface WarehouseUsageChartProps {
  data: Warehouse[];
  loading?: boolean;
  className?: string;
}

const COLORS = {
  compute: '#3b82f6', // blue
  cloud: '#10b981', // green
};

export default function WarehouseUsageChart({
  data,
  loading = false,
  className,
}: WarehouseUsageChartProps) {
  // Prepare chart data - aggregate by warehouse name
  const chartData = useMemo(() => {
    if (!Array.isArray(data)) return [];

    // Sort by total credits and take top 10
    return [...data]
      .sort((a, b) => b.total_credits - a.total_credits)
      .slice(0, 10)
      .map((wh) => {
        const displayName = wh.account_name
          ? `${wh.account_name}/${wh.warehouse_name}`
          : wh.warehouse_name;
        const truncatedName = displayName.length > 20
          ? `${displayName.substring(0, 17)}...`
          : displayName;

        return {
          name: truncatedName,
          fullName: wh.account_name ? `${wh.account_name} / ${wh.warehouse_name}` : wh.warehouse_name,
          account_name: wh.account_name || '',
          warehouse_name: wh.warehouse_name,
          compute_credits: wh.compute_credits,
          cloud_credits: wh.cloud_credits,
          total_credits: wh.total_credits,
          metering_hours: wh.metering_hours,
        };
      });
  }, [data]);

  // Calculate totals
  const totals = useMemo(() => {
    if (!Array.isArray(data)) return { total: 0, compute: 0, cloud: 0 };
    return data.reduce(
      (acc, wh) => ({
        total: acc.total + wh.total_credits,
        compute: acc.compute + wh.compute_credits,
        cloud: acc.cloud + wh.cloud_credits,
      }),
      { total: 0, compute: 0, cloud: 0 }
    );
  }, [data]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6', className)}>
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PiWarehouseDuotone className="h-5 w-5 text-indigo-500" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Warehouse Usage (Top 10)
          </Text>
        </div>
        <div className="flex items-center gap-4">
          <Text className="text-xs text-gray-500">
            Total: <span className="font-semibold text-indigo-600">{safeToFixed(totals.total, 2)}</span> credits
          </Text>
        </div>
      </div>

      {/* Legend summary */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.compute }} />
          <Text className="text-xs text-gray-600 dark:text-gray-300">
            Compute: <span className="font-medium">{safeToFixed(totals.compute, 2)}</span>
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.cloud }} />
          <Text className="text-xs text-gray-600 dark:text-gray-300">
            Cloud Services: <span className="font-medium">{safeToFixed(totals.cloud, 2)}</span>
          </Text>
        </div>
      </div>

      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No warehouse data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickFormatter={(value) => safeToFixed(value, 1)}
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#9ca3af"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={95}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {item.warehouse_name}
                        </Text>
                        {item.account_name && (
                          <Text className="text-xs text-gray-500 mb-2">
                            Account: {item.account_name}
                          </Text>
                        )}
                        <div className="space-y-1">
                          <Text className="text-sm text-gray-600 dark:text-gray-300">
                            Total: <span className="font-semibold text-indigo-600">{safeToFixed(item.total_credits, 3)}</span>
                          </Text>
                          <Text className="text-sm text-gray-600 dark:text-gray-300">
                            Compute: <span className="font-semibold text-blue-600">{safeToFixed(item.compute_credits, 3)}</span>
                          </Text>
                          <Text className="text-sm text-gray-600 dark:text-gray-300">
                            Cloud: <span className="font-semibold text-green-600">{safeToFixed(item.cloud_credits, 3)}</span>
                          </Text>
                          <Text className="text-xs text-gray-500 mt-1">
                            Metering Hours: {item.metering_hours}
                          </Text>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="compute_credits" stackId="a" fill={COLORS.compute} name="Compute" />
              <Bar dataKey="cloud_credits" stackId="a" fill={COLORS.cloud} name="Cloud Services" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
