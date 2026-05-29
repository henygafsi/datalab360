'use client';

import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import { PiTrendUpBold, PiTrendDownBold, PiMinusBold } from 'react-icons/pi';

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: {
    value: number;
    trend: 'up' | 'down' | 'stable';
    label?: string;
  };
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'indigo';
  loading?: boolean;
  className?: string;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-lighter/70',
    icon: 'text-blue',
    trend: 'text-blue',
  },
  green: {
    bg: 'bg-green-lighter/70',
    icon: 'text-green',
    trend: 'text-green',
  },
  amber: {
    bg: 'bg-orange-lighter/70',
    icon: 'text-orange',
    trend: 'text-orange',
  },
  red: {
    bg: 'bg-red-lighter/70',
    icon: 'text-red',
    trend: 'text-red',
  },
  purple: {
    bg: 'bg-purple-lighter/70',
    icon: 'text-purple',
    trend: 'text-purple',
  },
  indigo: {
    bg: 'bg-indigo-lighter/70',
    icon: 'text-indigo',
    trend: 'text-indigo',
  },
};

export default function KPICard({
  title,
  value,
  subtitle,
  change,
  icon,
  color = 'blue',
  loading = false,
  className,
}: KPICardProps) {
  const colors = colorClasses[color];

  if (loading) {
    return (
      <div
        className={cn(
          'border border-muted bg-gray-0 p-5 dark:bg-gray-800 lg:p-6 rounded-xl',
          'animate-pulse',
          className
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            {subtitle && <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />}
          </div>
          {icon && (
            <div className="h-11 w-11 bg-gray-200 dark:bg-gray-700 rounded-lg lg:h-12 lg:w-12" />
          )}
        </div>
      </div>
    );
  }

  const getTrendIcon = () => {
    if (!change) return null;

    switch (change.trend) {
      case 'up':
        return <PiTrendUpBold className="h-4 w-4 me-1" />;
      case 'down':
        return <PiTrendDownBold className="h-4 w-4 me-1" />;
      case 'stable':
        return <PiMinusBold className="h-4 w-4 me-1" />;
      default:
        return null;
    }
  };

  const getTrendColor = () => {
    if (!change) return '';

    switch (change.trend) {
      case 'up':
        return 'text-green';
      case 'down':
        return 'text-red';
      case 'stable':
        return 'text-gray-500';
      default:
        return '';
    }
  };

  return (
    <div
      className={cn(
        'border border-muted bg-gray-0 p-5 dark:bg-gray-800 lg:p-6 rounded-xl',
        'transition-all duration-200 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Text className="mb-2 text-sm text-gray-500 font-medium">
            {title}
          </Text>
          <Text className="font-lexend text-2xl font-bold text-gray-900 dark:text-gray-700 mb-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Text>

          {subtitle && (
            <Text className="text-xs text-gray-500 mt-1">
              {subtitle}
            </Text>
          )}

          {change && (
            <div className="mt-3 flex items-center">
              <Text
                as="span"
                className={cn(
                  'inline-flex items-center text-sm font-semibold',
                  getTrendColor()
                )}
              >
                {getTrendIcon()}
                {change.value > 0 ? '+' : ''}
                {change.value}%
              </Text>
              {change.label && (
                <Text className="ms-2 text-xs text-gray-500">
                  {change.label}
                </Text>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-lg lg:h-12 lg:w-12',
              colors.bg,
              colors.icon
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
