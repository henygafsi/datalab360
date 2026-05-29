'use client';

import cn from '@core/utils/class-names';
import { Text, Title, Badge } from 'rizzui';
import { PiTimerDuotone, PiChartLineDuotone, PiCheckCircleDuotone, PiXCircleDuotone, PiDatabaseDuotone } from 'react-icons/pi';
import type { PerformanceMetrics, SlowQuery } from '@/app/services/observability/types';

interface PerformanceMetricsCardProps {
  metrics: PerformanceMetrics | null;
  slowQueries: SlowQuery[] | null;
  isLoading?: boolean;
  className?: string;
}

function formatDuration(ms: number | undefined | null): string {
  if (ms == null) return '0ms';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDurationSec(sec: number | undefined | null): string {
  if (sec == null) return '0s';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function formatMB(mb: number | undefined | null): string {
  if (mb == null) return '0 MB';
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatNumber(num: number | undefined | null): string {
  if (num == null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

export default function PerformanceMetricsCard({
  metrics,
  slowQueries,
  isLoading,
  className,
}: PerformanceMetricsCardProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <div className="animate-pulse">
          <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
          <div className="mt-4 h-40 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <Title as="h3" className="text-base font-semibold">Query Performance</Title>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <PiChartLineDuotone className="h-12 w-12 text-gray-400" />
          <Text className="mt-2 text-sm text-gray-500">No performance data available</Text>
        </div>
      </div>
    );
  }

  // Use new API fields
  const totalQueries = metrics.total_queries ?? 0;
  const successfulQueries = metrics.successful_queries ?? 0;
  const failedQueries = metrics.failed_queries ?? 0;
  const successRate = totalQueries > 0 ? ((successfulQueries / totalQueries) * 100).toFixed(1) : '0';

  const performanceStats = [
    {
      icon: PiTimerDuotone,
      label: 'Avg Duration',
      value: formatDuration(metrics.avg_execution_time_ms),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: PiChartLineDuotone,
      label: 'P95 Duration',
      value: formatDuration(metrics.p95_execution_time_ms),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      icon: PiCheckCircleDuotone,
      label: 'Success Rate',
      value: `${successRate}%`,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      icon: PiDatabaseDuotone,
      label: 'Data Scanned',
      value: formatMB((metrics.total_bytes_scanned ?? 0) / (1024 * 1024)),
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    },
  ];

  return (
    <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
      <div className="flex items-center justify-between">
        <Title as="h3" className="text-base font-semibold">Query Performance</Title>
        <Badge variant="flat" color="primary">
          {formatNumber(totalQueries)} queries
        </Badge>
      </div>

      {/* Performance Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {performanceStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={cn('rounded-lg p-4', stat.bgColor)}>
              <div className="flex items-center gap-2">
                <Icon className={cn('h-5 w-5', stat.color)} />
                <Text className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</Text>
              </div>
              <Text className={cn('mt-2 text-xl font-bold', stat.color)}>
                {stat.value}
              </Text>
            </div>
          );
        })}
      </div>

      {/* Query Stats Summary */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-100/50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <Text className="text-xs text-gray-500">Total Queries</Text>
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatNumber(totalQueries)}
            </Text>
          </div>
          <div>
            <Text className="text-xs text-gray-500">Successful</Text>
            <Text className="text-lg font-bold text-green-600">
              {formatNumber(successfulQueries)}
            </Text>
          </div>
          <div>
            <Text className="text-xs text-gray-500">Failed</Text>
            <Text className="text-lg font-bold text-red-600">
              {formatNumber(failedQueries)}
            </Text>
          </div>
        </div>
        {/* Percentile breakdown */}
        {(metrics.p50_execution_time_ms || metrics.p99_execution_time_ms) && (
          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
            <Text className="mb-2 text-xs font-medium text-gray-500">Execution Time Percentiles</Text>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <Text className="text-xs text-gray-400">P50</Text>
                <Text className="text-sm font-semibold">{formatDuration(metrics.p50_execution_time_ms)}</Text>
              </div>
              <div>
                <Text className="text-xs text-gray-400">P95</Text>
                <Text className="text-sm font-semibold">{formatDuration(metrics.p95_execution_time_ms)}</Text>
              </div>
              <div>
                <Text className="text-xs text-gray-400">P99</Text>
                <Text className="text-sm font-semibold">{formatDuration(metrics.p99_execution_time_ms)}</Text>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Slow Queries */}
      {slowQueries && slowQueries.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <Text className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Recent Slow Queries
            </Text>
            <Badge variant="flat" color="danger" size="sm">
              {slowQueries.length} slow
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {slowQueries.slice(0, 5).map((query, index) => (
              <div
                key={query.query_id || index}
                className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Text className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {query.user_name || 'Unknown'}
                      </Text>
                      <Badge size="sm" variant="outline">
                        {query.warehouse_name || 'N/A'}
                      </Badge>
                      {query.query_type && (
                        <Badge size="sm" variant="flat" color="secondary">
                          {query.query_type}
                        </Badge>
                      )}
                    </div>
                    <Text className="mt-1 line-clamp-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {(query.query_text || 'No query text').substring(0, 100)}...
                    </Text>
                    {query.error_message && (
                      <Text className="mt-1 text-xs text-red-600">
                        Error: {query.error_message}
                      </Text>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <Text className="text-sm font-bold text-red-600">
                      {formatDurationSec(query.execution_time_sec)}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {formatMB(query.mb_scanned)} scanned
                    </Text>
                    {query.rows_produced !== undefined && (
                      <Text className="text-xs text-gray-500">
                        {formatNumber(query.rows_produced)} rows
                      </Text>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
