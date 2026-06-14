'use client';

import cn from '@core/utils/class-names';
import { Text, Title, Badge } from 'rizzui';
import { PiUsersDuotone, PiClockDuotone, PiCheckCircleDuotone, PiDatabaseDuotone } from 'react-icons/pi';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import type { UserActivitySummary } from '@/app/services/observability/types';
import { dash, EM_DASH } from '@/app/shared/ui/format';

interface ActivitySummaryCardProps {
  data: UserActivitySummary | null;
  isLoading?: boolean;
  className?: string;
}

function formatNumber(num: number | undefined | null): string {
  if (num == null) return EM_DASH;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null) return EM_DASH;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default function ActivitySummaryCard({ data, isLoading, className }: ActivitySummaryCardProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <div className="animate-pulse">
          <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
          <div className="mt-6 h-40 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  // Check if we have data with users array
  const hasUsers = data?.users && data.users.length > 0;

  if (!data || (!hasUsers && data.total_users === 0)) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <Title as="h3" className="text-base font-semibold">User Activity Summary</Title>
        <Badge variant="flat" color="secondary" className="mt-2">Last 7 days</Badge>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <PiUsersDuotone className="h-12 w-12 text-gray-400" />
          <Text className="mt-2 text-sm text-gray-500">No activity data available for this period</Text>
          <Text className="mt-1 text-xs text-gray-400">Query history may be empty or not accessible</Text>
        </div>
      </div>
    );
  }

  // Calculate aggregated stats from users array
  const users = data.users || [];
  const totalQueries = users.reduce((sum, u) => sum + (u.total_queries || 0), 0);
  const successfulQueries = users.reduce((sum, u) => sum + (u.successful_queries || 0), 0);
  const totalExecutionTime = users.reduce((sum, u) => sum + (u.total_execution_time_sec || 0), 0);
  const totalGbScanned = users.reduce((sum, u) => sum + (u.total_gb_scanned || 0), 0);

  const successRate = totalQueries > 0
    ? ((successfulQueries / totalQueries) * 100).toFixed(1)
    : '0';

  const avgExecutionTime = totalQueries > 0
    ? totalExecutionTime / totalQueries
    : 0;

  // Prepare chart data from users
  const chartData = users
    .sort((a, b) => (b.total_queries || 0) - (a.total_queries || 0))
    .slice(0, 5)
    .map((user) => ({
      name: user.user_name || 'Unknown',
      queries: user.total_queries || 0,
    }));

  return (
    <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
      <div className="flex items-center justify-between">
        <Title as="h3" className="text-base font-semibold">User Activity Summary</Title>
        <Badge variant="flat" color="primary">Last {data.period_days || 7} days</Badge>
      </div>

      {/* Stats Grid */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <PiUsersDuotone className="h-5 w-5 text-blue-600" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">Active Users</Text>
          </div>
          <Text className="mt-2 text-2xl font-bold text-blue-600">
            {formatNumber(data.total_users)}
          </Text>
        </div>

        <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
          <div className="flex items-center gap-2">
            <PiClockDuotone className="h-5 w-5 text-purple-600" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">Total Queries</Text>
          </div>
          <Text className="mt-2 text-2xl font-bold text-purple-600">
            {formatNumber(totalQueries)}
          </Text>
        </div>

        <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <div className="flex items-center gap-2">
            <PiCheckCircleDuotone className="h-5 w-5 text-green-600" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">Success Rate</Text>
          </div>
          <Text className="mt-2 text-2xl font-bold text-green-600">
            {successRate}%
          </Text>
        </div>

        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
          <div className="flex items-center gap-2">
            <PiDatabaseDuotone className="h-5 w-5 text-amber-600" />
            <Text className="text-sm text-gray-600 dark:text-gray-400">Data Scanned</Text>
          </div>
          <Text className="mt-2 text-2xl font-bold text-amber-600">
            {totalGbScanned.toFixed(1)} GB
          </Text>
        </div>
      </div>

      {/* Queries by User Chart */}
      {chartData.length > 0 && (
        <div className="mt-6">
          <Text className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">
            Queries by User
          </Text>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <Tooltip
                  formatter={(value: number) => [formatNumber(value), 'Queries']}
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Bar
                  dataKey="queries"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Users List */}
      {users.length > 0 && (
        <div className="mt-6">
          <Text className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">
            User Details
          </Text>
          <div className="space-y-2">
            {users.slice(0, 5).map((user, index) => (
              <div
                key={user.user_name || index}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                    {index + 1}
                  </span>
                  <div>
                    <Text className="font-medium">{user.user_name || 'Unknown'}</Text>
                    <Text className="text-xs text-gray-500">
                      {dash(user.databases_accessed)} databases, {dash(user.warehouses_used)} warehouses
                    </Text>
                  </div>
                </div>
                <div className="text-right">
                  <Text className="text-sm font-semibold">{formatNumber(user.total_queries)} queries</Text>
                  <Text className="text-xs text-gray-500">
                    {formatDuration(user.total_execution_time_sec)} total
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
