'use client';

import cn from '@core/utils/class-names';
import { Text, Title } from 'rizzui';
import { IconType } from 'react-icons/lib';

interface KpiCategoryCardProps {
  title: string;
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  icon: IconType;
  metrics: Record<string, number | string>;
  className?: string;
}

const statusColors = {
  healthy: {
    text: 'text-green-600',
    bg: 'bg-green-100 dark:bg-green-900/30',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400',
  },
  warning: {
    text: 'text-amber-600',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
  },
  critical: {
    text: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400',
  },
};

function formatMetricValue(value: number | string): string {
  if (typeof value === 'string') return value;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

function formatMetricLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function KpiCategoryCard({
  title,
  score,
  status,
  icon: Icon,
  metrics,
  className,
}: KpiCategoryCardProps) {
  const colors = statusColors[status];

  return (
    <div
      className={cn(
        'rounded-xl border bg-gray-0 p-5 dark:bg-gray-800',
        colors.border,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('rounded-lg p-2.5', colors.bg)}>
            <Icon className={cn('h-5 w-5', colors.text)} />
          </div>
          <div>
            <Title as="h4" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </Title>
            <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium', colors.badge)}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
        <div className="text-right">
          <Text className={cn('text-2xl font-bold', colors.text)}>{score}</Text>
          <Text className="text-xs text-gray-500">/100</Text>
        </div>
      </div>

      {/* Score progress bar */}
      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
            )}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Object.entries(metrics).slice(0, 4).map(([key, value]) => (
          <div key={key} className="rounded-lg bg-gray-50 p-2 dark:bg-gray-100/50">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {formatMetricLabel(key)}
            </Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatMetricValue(value)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
