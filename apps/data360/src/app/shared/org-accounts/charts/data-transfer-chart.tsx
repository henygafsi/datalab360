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
  Cell,
  Legend,
} from 'recharts';
import { PiCloudArrowUpDuotone } from 'react-icons/pi';
import type { DataTransferUsage } from '@/app/services/org-accounts/types';

interface DataTransferChartProps {
  data: DataTransferUsage[];
  totalBytes: number;
  loading?: boolean;
  className?: string;
}

const CLOUD_COLORS: Record<string, string> = {
  aws: '#ff9900',
  azure: '#0078d4',
  gcp: '#4285f4',
};

const TRANSFER_TYPE_COLORS: Record<string, string> = {
  COPY: '#3b82f6',
  COPY_FILES: '#10b981',
  SNOWSERVICES: '#8b5cf6',
  REPLICATION: '#f59e0b',
  FAILOVER: '#ef4444',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function DataTransferChart({
  data,
  totalBytes,
  loading = false,
  className,
}: DataTransferChartProps) {
  // Aggregate data by account
  const chartData = useMemo(() => {
    if (!Array.isArray(data)) return [];

    const byAccount: Record<string, { account_name: string; total_bytes: number; target_cloud: string }> = {};

    data.forEach((transfer) => {
      if (!byAccount[transfer.account_name]) {
        byAccount[transfer.account_name] = {
          account_name: transfer.account_name,
          total_bytes: 0,
          target_cloud: transfer.target_cloud,
        };
      }
      byAccount[transfer.account_name].total_bytes += transfer.total_bytes;
    });

    return Object.values(byAccount)
      .sort((a, b) => b.total_bytes - a.total_bytes)
      .slice(0, 10);
  }, [data]);

  // Aggregate by transfer type for summary
  const byTransferType = useMemo(() => {
    if (!Array.isArray(data)) return [];

    const types: Record<string, number> = {};
    data.forEach((transfer) => {
      types[transfer.transfer_type] = (types[transfer.transfer_type] || 0) + transfer.total_bytes;
    });

    return Object.entries(types)
      .map(([type, bytes]) => ({ type, bytes }))
      .sort((a, b) => b.bytes - a.bytes);
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
          <PiCloudArrowUpDuotone className="h-5 w-5 text-blue-500" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Data Transfer by Account
          </Text>
        </div>
        <Text className="text-sm text-gray-500">
          Total: <span className="font-semibold text-blue-600">{formatBytes(totalBytes)}</span>
        </Text>
      </div>

      {/* Transfer Type Summary */}
      {byTransferType.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {byTransferType.map(({ type, bytes }) => (
            <div
              key={type}
              className="flex items-center gap-2 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: TRANSFER_TYPE_COLORS[type] || '#6b7280' }}
              />
              <Text className="text-xs text-gray-600 dark:text-gray-300">
                {type}: <span className="font-medium">{formatBytes(bytes)}</span>
              </Text>
            </div>
          ))}
        </div>
      )}

      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No data transfer recorded
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
                tickFormatter={(value) => formatBytes(value)}
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="account_name"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={75}
                tickFormatter={(value) => value.length > 12 ? value.substring(0, 10) + '...' : value}
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
                          Transfer: <span className="font-semibold text-blue-600">{formatBytes(item.total_bytes)}</span>
                        </Text>
                        <Text className="text-xs text-gray-500 mt-1">
                          Target: {item.target_cloud?.toUpperCase()}
                        </Text>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="total_bytes" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CLOUD_COLORS[entry.target_cloud] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
