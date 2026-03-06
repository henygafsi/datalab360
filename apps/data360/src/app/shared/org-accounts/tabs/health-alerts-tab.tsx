'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiWarningDuotone,
  PiTrendUpDuotone,
} from 'react-icons/pi';
import {
  getHealth,
  getAlerts,
  getAnomalies,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, formatDate } from '@/app/services/org-accounts/utils';
import type {
  HealthScore,
  Alert,
  AnomalyEntry,
  DateRange,
} from '@/app/services/org-accounts/types';

import HealthOverview from '../health-overview';
import AlertsPanel from '../alerts-panel';

interface HealthAlertsTabProps {
  refreshKey: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export default function HealthAlertsTab({ refreshKey }: HealthAlertsTabProps) {
  const [healthScores, setHealthScores] = useState<HealthScore[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;

    Promise.all([
      getHealth().catch(() => null),
      getAlerts(days).catch(() => null),
      getAnomalies(days).catch(() => null),
    ]).then(([healthData, alertsData, anomalyData]) => {
      if (healthData) setHealthScores(Array.isArray(healthData.health_scores) ? healthData.health_scores : []);
      if (alertsData) setAlerts(Array.isArray(alertsData.alerts) ? alertsData.alerts : []);
      if (anomalyData) setAnomalies(Array.isArray(anomalyData.anomalies) ? anomalyData.anomalies : []);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center justify-end">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['7d', '30d', '90d'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                dateRange === r
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              )}
            >
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Health + Alerts side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HealthOverview healthScores={healthScores} />
        <AlertsPanel alerts={alerts} />
      </div>

      {/* Anomalies */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiTrendUpDuotone className="h-5 w-5 text-red-500" />
              <Text className="font-semibold text-gray-900 dark:text-white">Cost Anomalies</Text>
              {anomalies.length > 0 && (
                <Badge variant="flat" color="danger" className="text-xs">{anomalies.length}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          {anomalies.length === 0 ? (
            <div className="p-8 text-center">
              <PiWarningDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <Text className="text-gray-500">No anomalies detected</Text>
              <Text className="text-sm text-gray-400">All spending is within expected ranges</Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actual</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Expected</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Upper Bound</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {anomalies.map((a, i) => {
                  const overSpend = a.actual_value - a.upper_bound;
                  const severity = overSpend > a.forecasted_value ? 'critical' : 'warning';
                  return (
                    <tr key={`${a.account_name}-${a.date}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3"><Text className="text-sm text-gray-900 dark:text-white">{formatDate(a.date)}</Text></td>
                      <td className="px-4 py-3"><Text className="text-sm font-medium text-gray-900 dark:text-white">{a.account_name}</Text></td>
                      <td className="px-4 py-3 text-right"><Text className="text-sm font-bold text-red-600">{a.currency} {a.actual_value.toFixed(2)}</Text></td>
                      <td className="px-4 py-3 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{a.currency} {a.forecasted_value.toFixed(2)}</Text></td>
                      <td className="px-4 py-3 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{a.currency} {a.upper_bound.toFixed(2)}</Text></td>
                      <td className="px-4 py-3">
                        <Badge variant="flat" color={severity === 'critical' ? 'danger' : 'warning'} className="text-xs">
                          {severity}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
