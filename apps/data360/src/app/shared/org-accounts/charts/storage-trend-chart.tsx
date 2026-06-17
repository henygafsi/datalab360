'use client';

import { Text } from 'rizzui';
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
import type { StorageTrend, DateRange } from '@/app/services/org-accounts/types';
import { safeNum, safeToFixed } from '@/lib/format-number';

interface StorageTrendChartProps {
  data: StorageTrend[];
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  loading?: boolean;
  className?: string;
}

const dateRangeOptions: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

export default function StorageTrendChart({
  data,
  dateRange,
  onDateRangeChange,
  loading = false,
  className,
}: StorageTrendChartProps) {
  // Ensure data is always a valid array
  const chartData = Array.isArray(data) ? data : [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatStorage = (value: number | string | null | undefined) => {
    const n = safeNum(value);
    if (n == null) return '—';
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)} PB`;
    }
    return `${n.toFixed(1)} TB`;
  };

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6', className)}>
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <Text className="font-semibold text-gray-900 dark:text-white">
          Storage Trend
        </Text>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {dateRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onDateRangeChange(option.value)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                dateRange === option.value
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="usage_date"
                tickFormatter={formatDate}
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value) => `${safeToFixed(value, 1)}`}
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {new Date(item.usage_date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                        <Text className="text-sm text-gray-600 dark:text-gray-300">
                          Storage: <span className="font-semibold text-purple-600">{formatStorage(Number(payload[0].value))}</span>
                        </Text>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="total_tb"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#storageGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
