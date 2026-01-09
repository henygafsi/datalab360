'use client';

import { useState } from 'react';
import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

interface DistributionChartProps {
  byCloud: Record<string, number>;
  byRegion: Record<string, number>;
  byEdition: Record<string, number>;
  loading?: boolean;
  className?: string;
}

type ViewType = 'cloud' | 'region' | 'edition';

const CLOUD_COLORS: Record<string, string> = {
  AWS: '#ff9900',
  AZURE: '#0078d4',
  GCP: '#4285f4',
};

const EDITION_COLORS: Record<string, string> = {
  STANDARD: '#6b7280',
  ENTERPRISE: '#3b82f6',
  BUSINESS_CRITICAL: '#ef4444',
};

const REGION_COLORS = [
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f97316', // orange
];

export default function DistributionChart({
  byCloud,
  byRegion,
  byEdition,
  loading = false,
  className,
}: DistributionChartProps) {
  const [viewType, setViewType] = useState<ViewType>('cloud');

  const getData = () => {
    let source: Record<string, number> | undefined;
    let colorMap: Record<string, string> | null = null;

    switch (viewType) {
      case 'cloud':
        source = byCloud;
        colorMap = CLOUD_COLORS;
        break;
      case 'edition':
        source = byEdition;
        colorMap = EDITION_COLORS;
        break;
      case 'region':
        source = byRegion;
        break;
      default:
        source = byCloud;
        colorMap = CLOUD_COLORS;
    }

    if (!source) return [];

    return Object.entries(source)
      .filter(([, value]) => value > 0)
      .map(([name, value], index) => ({
        name: name.replace('_', ' '),
        value,
        color: colorMap?.[name] || REGION_COLORS[index % REGION_COLORS.length],
      }));
  };

  const data = getData();
  const total = data.reduce((sum, item) => sum + item.value, 0);

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
        <Text className="font-semibold text-gray-900 dark:text-white">
          Accounts Distribution
        </Text>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {[
            { value: 'cloud', label: 'Cloud' },
            { value: 'region', label: 'Region' },
            { value: 'edition', label: 'Edition' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setViewType(option.value as ViewType)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                viewType === option.value
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
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    const percentage = ((item.value / total) * 100).toFixed(1);
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {item.name}
                        </Text>
                        <Text className="text-sm text-gray-600 dark:text-gray-300">
                          {item.value} accounts ({percentage}%)
                        </Text>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                formatter={(value, entry: any) => (
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {value} ({entry.payload.value})
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
