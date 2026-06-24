'use client';

import { useState, useEffect } from 'react';
import { Text, Badge, Tooltip } from 'rizzui';
import cn from '@core/utils/class-names';
import { Plus } from 'lucide-react';
import {
  PiWarningDuotone,
  PiTrendUpDuotone,
  PiShieldCheckDuotone,
  PiGaugeDuotone,
  PiLockKeyDuotone,
  PiWarningCircleDuotone,
  PiClockCounterClockwiseDuotone,
  PiMagnifyingGlassDuotone,
} from 'react-icons/pi';
import { useCanPerform } from '@/hooks/useCanPerform';
import ResourceMonitorCreateRail from '../ResourceMonitorCreateRail';
import {
  getHealth,
  getAlerts,
  getAnomalies,
  getResourceMonitors,
  getFailedLogins,
  getAccountHealthScore,
  getQueryAuditHistory,
  getLoginAuditHistory,
  getAccessAuditHistory,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, formatDate, extractApiError } from '@/app/services/org-accounts/utils';
import { safeToFixed } from '@/lib/format-number';
import type {
  HealthScore,
  Alert,
  AnomalyEntry,
  DateRange,
  FailedLogin,
  AccountHealthScoreResponse,
  QueryAuditResponse,
  LoginAuditResponse,
} from '@/app/services/org-accounts/types';

import HealthOverview from '../health-overview';
import AlertsPanel from '../alerts-panel';

// ---------------------------------------------------------------------------
// Types for resource monitors (matches backend response shape)
// ---------------------------------------------------------------------------
interface ResourceMonitor {
  name: string;
  credit_quota: number;
  used_credits: number;
  remaining_credits: number;
  usage_pct: number;
  frequency: string;
  start_time: string;
  end_time: string;
  notify_at: string;
  suspend_at: string;
  suspend_immediately_at: string;
  level: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface HealthAlertsTabProps {
  refreshKey: number;
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-100 dark:bg-green-900/20';
  if (score >= 50) return 'bg-amber-100 dark:bg-amber-900/20';
  return 'bg-red-100 dark:bg-red-900/20';
}

function scoreRingColor(score: number): string {
  if (score >= 80) return 'border-green-500';
  if (score >= 50) return 'border-amber-500';
  return 'border-red-500';
}

function monitorBarColor(pct: number): string {
  if (pct < 50) return 'bg-green-500';
  if (pct <= 80) return 'bg-amber-500';
  return 'bg-red-500';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function HealthAlertsTab({ refreshKey }: HealthAlertsTabProps) {
  const [healthScores, setHealthScores] = useState<HealthScore[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyEntry[]>([]);
  const [resourceMonitors, setResourceMonitors] = useState<ResourceMonitor[]>([]);
  const [failedLogins, setFailedLogins] = useState<FailedLogin[]>([]);
  const [compositeHealth, setCompositeHealth] = useState<AccountHealthScoreResponse | null>(null);
  const [queryAudit, setQueryAudit] = useState<QueryAuditResponse['queries']>([]);
  const [loginAudit, setLoginAudit] = useState<LoginAuditResponse['logins']>([]);
  const [accessAudit, setAccessAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  // Bumped after a resource monitor is created so the whole tab re-fetches and
  // the new monitor shows up immediately (no full page refresh needed).
  const [localRefresh, setLocalRefresh] = useState(0);

  // Resource-monitor create is an `org_accounts` create action. Parent owns the
  // permission gate; the rail itself is presentation-only. Fail-open while the
  // allow-set loads so the control doesn't flash disabled.
  const { allowed: canCreateRm, loading: rmPermLoading } = useCanPerform('org_accounts', 'create');
  const rmCreateDenied = !canCreateRm && !rmPermLoading;
  const [rmCreateOpen, setRmCreateOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e) => { firstError = firstError ?? extractApiError(e, 'Failed to load health & alerts'); return null; });

    Promise.all([
      guard(getHealth()),
      guard(getAlerts(days)),
      guard(getAnomalies(days)),
      guard(getResourceMonitors()),
      guard(getFailedLogins(days)),
      guard(getAccountHealthScore()),
      guard(getQueryAuditHistory({ days, limit: 100 })),
      guard(getLoginAuditHistory({ days, limit: 100 })),
      guard(getAccessAuditHistory({ days, limit: 100 })),
    ]).then(([healthData, alertsData, anomalyData, monitorData, failedData, healthScoreData, queryAuditData, loginAuditData, accessAuditData]) => {
      if (healthData) setHealthScores(Array.isArray(healthData.health_scores) ? healthData.health_scores : []);
      if (alertsData) setAlerts(Array.isArray(alertsData.alerts) ? alertsData.alerts : []);
      if (anomalyData) setAnomalies(Array.isArray(anomalyData.anomalies) ? anomalyData.anomalies : []);
      if (monitorData) setResourceMonitors(Array.isArray(monitorData.monitors) ? (monitorData.monitors as ResourceMonitor[]) : []);
      if (failedData) setFailedLogins(Array.isArray(failedData.failed_logins) ? failedData.failed_logins : []);
      if (healthScoreData && typeof healthScoreData.health_score === 'number') setCompositeHealth(healthScoreData);
      if (queryAuditData) setQueryAudit(Array.isArray(queryAuditData.queries) ? queryAuditData.queries : []);
      if (loginAuditData) setLoginAudit(Array.isArray(loginAuditData.logins) ? loginAuditData.logins : []);
      if (accessAuditData) setAccessAudit(Array.isArray(accessAuditData.access_records) ? accessAuditData.access_records : []);
      setError(firstError);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange, localRefresh]);

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Some health &amp; alerts data could not be loaded</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}
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

      {/* ================================================================ */}
      {/* Composite Health Score — prominent card                          */}
      {/* ================================================================ */}
      {compositeHealth && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <PiShieldCheckDuotone className="h-5 w-5 text-blue-500" />
              <Text className="font-semibold text-gray-900 dark:text-white">
                Composite Health Score
              </Text>
              <Badge variant="flat" color="info" size="sm">{compositeHealth.grade}</Badge>
            </div>
          </div>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              {/* Big score circle */}
              <div className="flex-shrink-0">
                <div
                  className={cn(
                    'w-28 h-28 rounded-full border-4 flex items-center justify-center',
                    scoreRingColor(compositeHealth.health_score),
                    scoreBg(compositeHealth.health_score),
                  )}
                >
                  <div className="text-center">
                    <Text className={cn('text-3xl font-bold', scoreColor(compositeHealth.health_score))}>
                      {compositeHealth.health_score}
                    </Text>
                    <Text className="text-xs text-gray-500">/ {compositeHealth.max_score}</Text>
                  </div>
                </div>
              </div>

              {/* Component breakdown */}
              <div className="flex-1 w-full">
                <Text className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">
                  Score Breakdown
                </Text>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(compositeHealth.breakdown).map(([key, value]) => {
                    const label = key
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    const pct = compositeHealth.max_score
                      ? Math.round((value / (compositeHealth.max_score / 4)) * 100)
                      : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <Text className="text-xs text-gray-500">{label}</Text>
                          <Text className={cn('text-xs font-semibold', scoreColor(pct))}>{value}</Text>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
                            )}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Key details */}
                {compositeHealth.details && (
                  <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <Tooltip content="Total users in the account">
                      <Text className="text-xs text-gray-500">
                        Users: <span className="font-medium text-gray-900 dark:text-white">{compositeHealth.details.total_users}</span>
                      </Text>
                    </Tooltip>
                    <Tooltip content="Percentage of users with MFA enabled">
                      <Text className="text-xs text-gray-500">
                        MFA Coverage: <span className="font-medium text-gray-900 dark:text-white">{compositeHealth.details.mfa_coverage_pct}%</span>
                      </Text>
                    </Tooltip>
                    <Tooltip content="Total network/auth policies">
                      <Text className="text-xs text-gray-500">
                        Policies: <span className="font-medium text-gray-900 dark:text-white">{compositeHealth.details.total_policies}</span>
                      </Text>
                    </Tooltip>
                    <Tooltip content="Total roles configured">
                      <Text className="text-xs text-gray-500">
                        Roles: <span className="font-medium text-gray-900 dark:text-white">{compositeHealth.details.total_roles}</span>
                      </Text>
                    </Tooltip>
                    <Tooltip content="Total warehouses">
                      <Text className="text-xs text-gray-500">
                        Warehouses: <span className="font-medium text-gray-900 dark:text-white">{compositeHealth.details.total_warehouses}</span>
                      </Text>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Health + Alerts side by side (existing)                          */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HealthOverview healthScores={healthScores} />
        <AlertsPanel alerts={alerts} />
      </div>

      {/* ================================================================ */}
      {/* Security: Failed Logins                                          */}
      {/* ================================================================ */}
      <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiLockKeyDuotone className="h-5 w-5 text-red-500" />
              <Text className="font-semibold text-gray-900 dark:text-white">Security: Failed Logins</Text>
              {failedLogins.length > 0 && (
                <Badge variant="flat" color="danger" className="text-xs">{failedLogins.length}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {failedLogins.length === 0 ? (
            <div className="p-8 text-center">
              <PiLockKeyDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <Text className="text-gray-500">No failed logins detected</Text>
              <Text className="text-sm text-gray-400">All authentication attempts succeeded in this period</Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-red-50 dark:bg-red-900/10">
                <tr className="border-b border-red-200 dark:border-red-900/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Username</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Client IP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-900/20">
                {failedLogins.map((fl, i) => (
                  <tr key={`${fl.user_name}-${fl.event_timestamp}-${i}`} className="hover:bg-red-50/50 dark:hover:bg-red-900/5">
                    <td className="px-4 py-3">
                      <Text className="text-sm text-gray-900 dark:text-white">{formatDate(fl.event_timestamp)}</Text>
                    </td>
                    <td className="px-4 py-3">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{fl.account_name}</Text>
                    </td>
                    <td className="px-4 py-3">
                      <Text className="text-sm text-gray-900 dark:text-white">{fl.user_name}</Text>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">
                        {fl.client_ip}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Text className="text-sm text-red-600 dark:text-red-400 truncate max-w-xs" title={fl.error_message}>
                        {fl.error_message || fl.error_code}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Resource Monitors                                                */}
      {/* ================================================================ */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiGaugeDuotone className="h-5 w-5 text-violet-500" />
              <Text className="font-semibold text-gray-900 dark:text-white">Resource Monitors</Text>
              {resourceMonitors.length > 0 && (
                <Badge variant="flat" color="secondary" className="text-xs">{resourceMonitors.length}</Badge>
              )}
            </div>
            <button
              type="button"
              disabled={rmCreateDenied}
              title={rmCreateDenied ? 'You lack the "create" permission on Client Accounts. Ask an administrator to grant it.' : 'Create a spend-cap resource monitor'}
              onClick={() => { if (!rmCreateDenied) setRmCreateOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              <Plus className="h-3.5 w-3.5" /> New monitor
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          {resourceMonitors.length === 0 ? (
            <div className="p-8 text-center">
              <PiGaugeDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <Text className="text-gray-500">No resource monitors configured</Text>
              <Text className="text-sm text-gray-400">Set up resource monitors in Snowflake to track credit usage</Text>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {resourceMonitors.map((rm) => {
                const usagePct = rm.usage_pct || (rm.credit_quota > 0 ? (rm.used_credits / rm.credit_quota) * 100 : 0);
                return (
                  <div
                    key={rm.name}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <Text className="font-medium text-gray-900 dark:text-white">{rm.name}</Text>
                        <div className="flex items-center gap-3 mt-0.5">
                          {rm.frequency && (
                            <Text className="text-xs text-gray-500">Frequency: {rm.frequency}</Text>
                          )}
                          {rm.level && (
                            <Text className="text-xs text-gray-500">Level: {rm.level}</Text>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant="flat"
                        color={usagePct < 50 ? 'success' : usagePct <= 80 ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {safeToFixed(usagePct, 1)}% used
                      </Badge>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                      <div
                        className={cn('h-full rounded-full transition-all', monitorBarColor(usagePct))}
                        style={{ width: `${Math.min(usagePct, 100)}%` }}
                      />
                    </div>

                    {/* Credits detail */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Text className="text-xs text-gray-500">Credit Quota</Text>
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCredits(rm.credit_quota)}
                        </Text>
                      </div>
                      <div>
                        <Text className="text-xs text-gray-500">Used Credits</Text>
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {formatCredits(rm.used_credits)}
                        </Text>
                      </div>
                      <div>
                        <Text className="text-xs text-gray-500">Remaining</Text>
                        <Text className={cn(
                          'text-sm font-semibold',
                          rm.remaining_credits > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                        )}>
                          {formatCredits(rm.remaining_credits)}
                        </Text>
                      </div>
                    </div>

                    {/* Threshold info */}
                    {(rm.notify_at || rm.suspend_at || rm.suspend_immediately_at) && (
                      <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                        {rm.notify_at && (
                          <Text className="text-xs text-gray-500">
                            Notify at: <span className="font-medium text-gray-700 dark:text-gray-300">{rm.notify_at}%</span>
                          </Text>
                        )}
                        {rm.suspend_at && (
                          <Text className="text-xs text-gray-500">
                            Suspend at: <span className="font-medium text-amber-600">{rm.suspend_at}%</span>
                          </Text>
                        )}
                        {rm.suspend_immediately_at && (
                          <Text className="text-xs text-gray-500">
                            Suspend immediately: <span className="font-medium text-red-600">{rm.suspend_immediately_at}%</span>
                          </Text>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Cost Anomalies (existing)                                        */}
      {/* ================================================================ */}
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
                      <td className="px-4 py-3 text-right"><Text className="text-sm font-bold text-red-600">{a.currency} {safeToFixed(a.actual_value, 2)}</Text></td>
                      <td className="px-4 py-3 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{a.currency} {safeToFixed(a.forecasted_value, 2)}</Text></td>
                      <td className="px-4 py-3 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{a.currency} {safeToFixed(a.upper_bound, 2)}</Text></td>
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

      {/* ================================================================ */}
      {/* Audit History — query + login audit trail (account-scoped)       */}
      {/* ================================================================ */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PiMagnifyingGlassDuotone className="h-5 w-5 text-blue-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Query Audit History</Text>
            {queryAudit.length > 0 && (
              <Badge variant="flat" color="info" className="text-xs">{queryAudit.length}</Badge>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {queryAudit.length === 0 ? (
            <div className="p-8 text-center">
              <PiMagnifyingGlassDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <Text className="text-gray-500">No query audit records</Text>
              <Text className="text-sm text-gray-400">No queries recorded in this period, or the audit endpoint is unavailable</Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {queryAudit.map((q, i) => (
                  <tr key={`${q.QUERY_ID}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{q.START_TIME ? formatDate(q.START_TIME) : '—'}</Text></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{q.USER_NAME || '—'}</Text></td>
                    <td className="px-4 py-2"><Badge variant="flat" color="primary" className="text-xs">{(q.QUERY_TYPE || 'OTHER').replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{q.WAREHOUSE_NAME || '—'}</Text></td>
                    <td className="px-4 py-2">
                      <Badge variant="flat" color={q.EXECUTION_STATUS === 'SUCCESS' ? 'success' : q.EXECUTION_STATUS === 'FAIL' ? 'danger' : 'secondary'} className="text-xs">
                        {q.EXECUTION_STATUS || '—'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{q.TOTAL_ELAPSED_TIME != null ? `${safeToFixed(q.TOTAL_ELAPSED_TIME / 1000, 2)}s` : '—'}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PiClockCounterClockwiseDuotone className="h-5 w-5 text-violet-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Login Audit History</Text>
            {loginAudit.length > 0 && (
              <Badge variant="flat" color="secondary" className="text-xs">{loginAudit.length}</Badge>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {loginAudit.length === 0 ? (
            <div className="p-8 text-center">
              <PiClockCounterClockwiseDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <Text className="text-gray-500">No login audit records</Text>
              <Text className="text-sm text-gray-400">No logins recorded in this period, or the audit endpoint is unavailable</Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Client IP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loginAudit.map((l, i) => {
                  const ok = String(l.IS_SUCCESS).toUpperCase() === 'YES' || String(l.IS_SUCCESS).toUpperCase() === 'TRUE';
                  return (
                    <tr key={`${l.USER_NAME}-${l.EVENT_TIMESTAMP}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{l.EVENT_TIMESTAMP ? formatDate(l.EVENT_TIMESTAMP) : '—'}</Text></td>
                      <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{l.USER_NAME || '—'}</Text></td>
                      <td className="px-4 py-2">
                        <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{l.CLIENT_IP || '—'}</code>
                      </td>
                      <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{l.REPORTED_CLIENT_TYPE || '—'}</Text></td>
                      <td className="px-4 py-2">
                        <Badge variant="flat" color={ok ? 'success' : 'danger'} className="text-xs">
                          {ok ? 'Success' : (l.ERROR_MESSAGE || 'Failed')}
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

      {/* Access audit — column set isn't typed (access_records: any[]), so the
          panel introspects the first row's keys and degrades to honest empty. */}
      <AccessAuditTable rows={accessAudit} />

      {/* Create resource monitor (spend cap). Parent gates the trigger; the rail
          is presentation-only and re-fetches the tab on success. */}
      <ResourceMonitorCreateRail
        isOpen={rmCreateOpen}
        onClose={() => setRmCreateOpen(false)}
        onCreated={() => setLocalRefresh((v) => v + 1)}
      />
    </div>
  );
}

/**
 * AccessAuditTable — renders the untyped /audit/access-history access_records
 * by introspecting the keys of the first row. Numeric cells are localized;
 * missing values render an honest "—" (never a fabricated 0).
 */
function AccessAuditTable({ rows }: { rows: any[] }) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const formatCell = (v: unknown): string => {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(v);
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <PiShieldCheckDuotone className="h-5 w-5 text-emerald-500" />
          <Text className="font-semibold text-gray-900 dark:text-white">Access Audit History</Text>
          {rows.length > 0 && (
            <Badge variant="flat" color="success" className="text-xs">{rows.length}</Badge>
          )}
        </div>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <PiShieldCheckDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <Text className="text-gray-500">No access audit records</Text>
            <Text className="text-sm text-gray-400">No object access recorded in this period, or the audit endpoint is unavailable</Text>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                    {c.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {columns.map((c) => (
                    <td key={c} className="px-4 py-2">
                      <Text className="text-sm text-gray-900 dark:text-white truncate max-w-xs" title={String(row[c] ?? '')}>
                        {formatCell(row[c])}
                      </Text>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
