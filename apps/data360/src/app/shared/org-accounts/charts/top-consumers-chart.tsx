'use client';

import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import { safeNum, safeLocale } from '@/lib/format-number';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface TopConsumersChartProps {
  data: { account_name: string; total_credits: number }[];
  loading?: boolean;
  className?: string;
}

const COLORS = [
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#22c55e', // green
];

export default function TopConsumersChart({
  data,
  loading = false,
  className,
}: TopConsumersChartProps) {
  // Ensure data is always a valid array
  const chartData = Array.isArray(data) ? data : [];

  const formatCredits = (value: number | string | null | undefined) => {
    const n = safeNum(value);
    if (n == null) return '—';
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return n.toFixed(0);
  };

  // Truncate account names for display
  const formatAccountName = (name: string) => {
    if (name.length > 15) {
      return name.substring(0, 12) + '...';
    }
    return name;
  };

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
      <Text className="font-semibold text-gray-900 dark:text-white mb-4">
        Top 10 Credit Consumers
      </Text>

      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickFormatter={formatCredits}
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="account_name"
                tickFormatter={formatAccountName}
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={75}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {item.account_name}
                        </Text>
                        <Text className="text-sm text-gray-600 dark:text-gray-300">
                          Credits: <span className="font-semibold text-amber-600">{safeLocale(item.total_credits)}</span>
                        </Text>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="total_credits" radius={[0, 4, 4, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
