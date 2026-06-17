'use client';

/**
 * ActivityDashboard — consumes GET /analytics/user-activity/summary.
 *
 * The endpoint is live (gated on `business_reporting`) but had zero front
 * consumers. This self-contained panel surfaces per-module success rates and
 * the most active users over a selectable time window. Mounted as the
 * "Activity" tab of the Data360 Admin Console.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, Users, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';
import EmptyState from '@/components/ui/EmptyState';
import { getApiErrorMessage } from '@/lib/api-client';
import { safeLocale } from '@/lib/format-number';
import {
  getUserActivitySummary,
  type UserActivitySummaryResponse,
  type ModuleActivityStat,
  type ActivityTopUser,
} from '@/app/services/analytics';

const DAY_WINDOWS = [1, 7, 30, 90, 365] as const;
type DayWindow = (typeof DAY_WINDOWS)[number];

// `success_rate` is a 0-100 percentage (backend computes round(x * 100, n),
// and every other consumer renders it as `${success_rate}%`). Do NOT scale.
function successRateColor(rate: number): string {
  if (rate >= 95) return 'text-emerald-600 dark:text-emerald-400';
  if (rate >= 80) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export default function ActivityDashboard() {
  const [days, setDays] = useState<DayWindow>(7);
  const [data, setData] = useState<UserActivitySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUserActivitySummary(days);
      setData(res);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const moduleStats: ModuleActivityStat[] = data?.module_stats ?? [];
  const topUsers: ActivityTopUser[] = data?.top_users ?? [];
  const isEmpty = !loading && !error && moduleStats.length === 0 && topUsers.length === 0;

  return (
    <div className="space-y-3">
      {/* Header + day-window selector */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Activity className="h-4 w-4 text-[hsl(var(--primary))]" />
            Platform usage
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Per-module success rates and most active users.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Time window"
            className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
          >
            {DAY_WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={days === w}
                onClick={() => setDays(w)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  days === w
                    ? 'bg-white text-[hsl(var(--primary))] shadow-sm dark:bg-slate-900'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {w === 1 ? '24h' : `${w}d`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <GlassPanel depth={1} radius="xl" className="p-4">
          <div role="alert" className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Could not load activity
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      )}

      {/* Empty */}
      {isEmpty && (
        <GlassPanel depth={1} radius="xl" className="p-6">
          <EmptyState icon={Activity} compact title="No activity in this window" />
        </GlassPanel>
      )}

      {/* Data */}
      {!loading && !error && !isEmpty && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Module success rates */}
          <GlassPanel depth={1} radius="xl" className="overflow-hidden lg:col-span-2">
            <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Layers className="h-3.5 w-3.5" /> Module activity
              </p>
              <p className="text-[10px] text-slate-400">{moduleStats.length} modules</p>
            </div>
            {moduleStats.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Layers} compact title="No module activity" />
              </div>
            ) : (
              <div className="scrollbar-thin max-h-[440px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                {moduleStats.map((m) => (
                  <div
                    key={m.module_name}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {m.module_name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {safeLocale(m.event_count)} events · {m.unique_users} users
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <span className="text-[10px] text-slate-400">
                        {safeLocale(m.failure_count)} failed
                      </span>
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          successRateColor(m.success_rate),
                        )}
                      >
                        {Math.round(m.success_rate)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>

          {/* Top users */}
          <GlassPanel depth={1} radius="xl" className="overflow-hidden">
            <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Users className="h-3.5 w-3.5" /> Most active users
              </p>
            </div>
            {topUsers.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Users} compact title="No users" />
              </div>
            ) : (
              <div className="scrollbar-thin max-h-[440px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                {topUsers.map((u) => (
                  <div
                    key={u.username}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {u.username}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {u.modules_used} modules
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {safeLocale(u.total_actions)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
