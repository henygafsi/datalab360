'use client';

import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiWarningDuotone,
  PiWarningCircleDuotone,
  PiInfoDuotone,
  PiShieldWarningDuotone,
  PiBellRingingDuotone,
} from 'react-icons/pi';
import type { Alert, AlertType } from '@/app/services/org-accounts/types';

interface AlertsPanelProps {
  alerts: Alert[];
  loading?: boolean;
  maxItems?: number;
  className?: string;
}

const alertConfig: Record<AlertType, { icon: React.ElementType; color: string; bgColor: string; badgeColor: 'warning' | 'danger' | 'info' | 'secondary' }> = {
  warning: {
    icon: PiWarningDuotone,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    badgeColor: 'warning',
  },
  critical: {
    icon: PiWarningCircleDuotone,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    badgeColor: 'danger',
  },
  info: {
    icon: PiInfoDuotone,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    badgeColor: 'info',
  },
  security: {
    icon: PiShieldWarningDuotone,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    badgeColor: 'secondary',
  },
};

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}

export default function AlertsPanel({
  alerts,
  loading = false,
  maxItems = 10,
  className,
}: AlertsPanelProps) {
  // Ensure alerts is always a valid array
  const alertsList = Array.isArray(alerts) ? alerts : [];

  const displayedAlerts = alertsList.slice(0, maxItems);

  // Count alerts by type
  const alertCounts = alertsList.reduce(
    (acc, alert) => {
      acc[alert.alert_type] = (acc[alert.alert_type] || 0) + 1;
      return acc;
    },
    {} as Record<AlertType, number>
  );

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800', className)}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PiBellRingingDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            <Text className="font-semibold text-gray-900 dark:text-white">
              Active Alerts
            </Text>
            {alertsList.length > 0 && (
              <Badge variant="flat" color="danger" className="text-xs">
                {alertsList.length}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {alertCounts.critical && (
              <Badge variant="flat" color="danger" size="sm">
                {alertCounts.critical} Critical
              </Badge>
            )}
            {alertCounts.warning && (
              <Badge variant="flat" color="warning" size="sm">
                {alertCounts.warning} Warning
              </Badge>
            )}
            {alertCounts.security && (
              <Badge variant="flat" color="secondary" size="sm">
                {alertCounts.security} Security
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[400px] overflow-y-auto">
        {displayedAlerts.length === 0 ? (
          <div className="p-8 text-center">
            <PiBellRingingDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <Text className="text-gray-500 dark:text-gray-400">
              No active alerts
            </Text>
            <Text className="text-sm text-gray-400 dark:text-gray-500">
              All systems are running normally
            </Text>
          </div>
        ) : (
          displayedAlerts.map((alert, index) => {
            const config = alertConfig[alert.alert_type];
            const Icon = config.icon;

            return (
              <div
                key={`${alert.account_name}-${alert.title}-${index}`}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex gap-3">
                  <div className={cn('flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center', config.bgColor)}>
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Text className="font-medium text-gray-900 dark:text-white text-sm">
                          {alert.title}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {alert.account_name}
                        </Text>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="flat" color={config.badgeColor} size="sm">
                          {alert.alert_type}
                        </Badge>
                        <Text className="text-xs text-gray-400">
                          {formatTimestamp(alert.timestamp)}
                        </Text>
                      </div>
                    </div>
                    <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {alert.message}
                    </Text>
                    {alert.metric_value !== null && alert.threshold !== null && (
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Value: <span className="font-medium">{alert.metric_value.toLocaleString()}</span> / Threshold: <span className="font-medium">{alert.threshold.toLocaleString()}</span>
                      </Text>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {alertsList.length > maxItems && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Showing {maxItems} of {alertsList.length} alerts
          </Text>
        </div>
      )}
    </div>
  );
}
