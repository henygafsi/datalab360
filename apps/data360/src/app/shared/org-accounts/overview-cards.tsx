'use client';

import { Text } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiUsersDuotone,
  PiCoinsDuotone,
  PiDatabaseDuotone,
  PiCheckCircleDuotone,
  PiWarehouseDuotone,
  PiArrowsLeftRightDuotone,
  PiBellDuotone,
  PiHeartbeatDuotone,
} from 'react-icons/pi';
import { formatCredits, formatStorage, formatBytes } from '@/app/services/org-accounts/utils';
import type {
  DashboardOverviewResponse,
  DashboardUsageResponse,
  AlertsResponse,
  HealthScore,
} from '@/app/services/org-accounts/types';

interface OverviewCardsProps {
  // /dashboard/overview
  overview: DashboardOverviewResponse['overview'] | null;
  overviewLoading?: boolean;
  // /dashboard/usage (credits + storage combined)
  usage: DashboardUsageResponse | null;
  usageLoading?: boolean;
  // /warehouses
  warehouses: { warehouses: { total_credits: number }[]; total_credits?: number } | null;
  warehousesLoading?: boolean;
  // /data-transfer
  dataTransfer: { total_bytes: number; transfers: unknown[] } | null;
  dataTransferLoading?: boolean;
  // /alerts
  alerts: AlertsResponse | null;
  alertsLoading?: boolean;
  // /health
  healthScores: HealthScore[];
  healthLoading?: boolean;
  className?: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'amber' | 'purple' | 'indigo' | 'cyan' | 'red' | 'emerald';
  loading?: boolean;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    icon: 'text-green-600 dark:text-green-400',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: 'text-red-600 dark:text-red-400',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
};

function StatCard({ title, value, subtitle, icon, color, loading }: StatCardProps) {
  const colors = colorClasses[color];

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Text className="mb-2 text-sm text-gray-500 dark:text-gray-400 font-medium">
            {title}
          </Text>
          <Text className="font-lexend text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Text>
          {subtitle && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </Text>
          )}
        </div>
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-lg',
            colors.bg,
            colors.icon
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function OverviewCards({
  overview,
  usage,
  warehouses,
  dataTransfer,
  alerts,
  healthScores,
  overviewLoading = false,
  usageLoading = false,
  warehousesLoading = false,
  dataTransferLoading = false,
  alertsLoading = false,
  healthLoading = false,
  className,
}: OverviewCardsProps) {
  // Calculate warehouse total credits
  const warehousesList = Array.isArray(warehouses?.warehouses) ? warehouses.warehouses : [];
  const warehouseTotalCredits = warehousesList.reduce(
    (sum, wh) => sum + (wh.total_credits || 0),
    0
  );

  // Calculate health summary
  const healthList = Array.isArray(healthScores) ? healthScores : [];
  const healthySummary = healthList.reduce(
    (acc, h) => {
      if (h.status === 'healthy') acc.healthy++;
      else if (h.status === 'warning') acc.warning++;
      else if (h.status === 'critical') acc.critical++;
      return acc;
    },
    { healthy: 0, warning: 0, critical: 0 }
  );

  // Count alerts by type
  const alertsList = Array.isArray(alerts?.alerts) ? alerts.alerts : [];
  const alertCounts = alertsList.reduce(
    (acc, a) => {
      if (a.alert_type === 'critical') acc.critical++;
      else if (a.alert_type === 'warning') acc.warning++;
      return acc;
    },
    { critical: 0, warning: 0 }
  );

  // Honest display: a missing feed renders "—", never a fabricated 0 / "0.00 TB".
  // True zeros (payload present, count genuinely 0) still render as 0.
  const num = (v: number | null | undefined): string | number => (v == null ? '—' : v);

  const stats = [
    // Row 1: Account metrics (from /dashboard/overview)
    {
      title: 'Total Accounts',
      value: num(overview?.total_client_accounts),
      subtitle: overview
        ? `${num(overview.active_accounts)} active, ${num(overview.inactive_accounts)} inactive`
        : undefined,
      icon: <PiUsersDuotone className="h-6 w-6" />,
      color: 'blue' as const,
      loading: overviewLoading,
    },
    {
      title: 'Active Accounts',
      value: num(overview?.active_accounts),
      subtitle: 'Currently active',
      icon: <PiCheckCircleDuotone className="h-6 w-6" />,
      color: 'green' as const,
      loading: overviewLoading,
    },
    // Credits (from /dashboard/usage)
    {
      title: 'Credits (30d)',
      value: usage?.total_credits_30d == null ? '—' : formatCredits(usage.total_credits_30d),
      subtitle: usage ? `${num(usage.credit_account_count)} accounts` : undefined,
      icon: <PiCoinsDuotone className="h-6 w-6" />,
      color: 'amber' as const,
      loading: usageLoading,
    },
    // Storage (from /dashboard/usage)
    {
      title: 'Total Storage',
      value: usage?.total_storage_tb == null ? '—' : formatStorage(usage.total_storage_tb),
      subtitle: usage ? `${num(usage.storage_account_count)} accounts` : undefined,
      icon: <PiDatabaseDuotone className="h-6 w-6" />,
      color: 'purple' as const,
      loading: usageLoading,
    },
    // Row 2: Operations metrics
    // Warehouses (from /warehouses)
    {
      title: 'Warehouse Credits',
      value: warehouses ? formatCredits(warehouseTotalCredits) : '—',
      subtitle: warehouses ? `${warehousesList.length} warehouses` : undefined,
      icon: <PiWarehouseDuotone className="h-6 w-6" />,
      color: 'indigo' as const,
      loading: warehousesLoading,
    },
    // Data Transfer (from /data-transfer)
    {
      title: 'Data Transfer',
      value: dataTransfer?.total_bytes == null ? '—' : formatBytes(dataTransfer.total_bytes),
      subtitle: dataTransfer ? `${dataTransfer.transfers?.length ?? 0} transfers` : undefined,
      icon: <PiArrowsLeftRightDuotone className="h-6 w-6" />,
      color: 'cyan' as const,
      loading: dataTransferLoading,
    },
    // Alerts (from /alerts)
    {
      title: 'Active Alerts',
      value: num(alerts?.count),
      subtitle: !alerts
        ? undefined
        : alertCounts.critical > 0
          ? `${alertCounts.critical} critical, ${alertCounts.warning} warning`
          : alertCounts.warning > 0
            ? `${alertCounts.warning} warnings`
            : 'No issues',
      icon: <PiBellDuotone className="h-6 w-6" />,
      color: 'red' as const,
      loading: alertsLoading,
    },
    // Health (from /health)
    {
      title: 'Account Health',
      value: healthList.length > 0 ? `${healthySummary.healthy}/${healthList.length}` : '—',
      subtitle: healthList.length === 0
        ? undefined
        : healthySummary.critical > 0
          ? `${healthySummary.critical} critical, ${healthySummary.warning} warning`
          : healthySummary.warning > 0
            ? `${healthySummary.warning} need attention`
            : 'All healthy',
      icon: <PiHeartbeatDuotone className="h-6 w-6" />,
      color: 'emerald' as const,
      loading: healthLoading,
    },
  ];

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {stats.map((stat) => (
        <StatCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          subtitle={stat.subtitle}
          icon={stat.icon}
          color={stat.color}
          loading={stat.loading}
        />
      ))}
    </div>
  );
}
