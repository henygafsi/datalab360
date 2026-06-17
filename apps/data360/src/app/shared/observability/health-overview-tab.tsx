'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Loader, Text } from 'rizzui';
import {
  PiArrowsClockwise,
  PiShieldCheckDuotone,
  PiCurrencyDollarDuotone,
  PiGaugeDuotone,
  PiUsersThreeDuotone,
  PiSealCheckDuotone,
  PiWarningCircleBold,
  PiPlugsConnectedDuotone,
} from 'react-icons/pi';
import type { IconType } from 'react-icons/lib';

import {
  getIntelligentKpis,
  getSecurityPosture,
  getPerformanceMetrics,
  getSlowQueries,
  getActivitySummary,
  isRouteNotDeployed,
} from '@/app/services/observability';
import type {
  IntelligentKpis,
  KpiCategory,
  SecurityPosture,
  PerformanceMetrics,
  SlowQuery,
  UserActivitySummary,
} from '@/app/services/observability/types';

import HealthScoreCard from './health-score-card';
import KpiCategoryCard from './kpi-category-card';
import RecommendationsCard from './recommendations-card';
import SecurityPostureCard from './security-posture-card';
import PerformanceMetricsCard from './performance-metrics-card';
import ActivitySummaryCard from './activity-summary-card';

/** Per-section async state so one undeployed/failed route never blanks the tab. */
interface SectionState<T> {
  loading: boolean;
  data: T | null;
  /** Error message for a genuine failure (not a missing route). */
  error: string | null;
  /** True when the backend route is 404/501 — degrade to a soft note. */
  notDeployed: boolean;
}

function initSection<T>(): SectionState<T> {
  return { loading: true, data: null, error: null, notDeployed: false };
}

function resolveSection<T>(result: PromiseSettledResult<T>): SectionState<T> {
  if (result.status === 'fulfilled') {
    return { loading: false, data: result.value, error: null, notDeployed: false };
  }
  const err = result.reason;
  if (isRouteNotDeployed(err)) {
    return { loading: false, data: null, error: null, notDeployed: true };
  }
  return {
    loading: false,
    data: null,
    error: err instanceof Error ? err.message : 'Failed to load',
    notDeployed: false,
  };
}

/** Inline note shown when a capability is not available on the connected backend yet. */
function NotDeployedNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
      <PiPlugsConnectedDuotone className="h-6 w-6 flex-shrink-0 text-gray-400" />
      <div>
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">{label} unavailable</Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          This capability is not available on the connected backend yet.
        </Text>
      </div>
    </div>
  );
}

/** Inline error with retry for a genuine section failure. */
function SectionError({ label, message, onRetry }: { label: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30">
      <div className="flex items-center gap-2">
        <PiWarningCircleBold className="h-5 w-5 flex-shrink-0 text-red-500" />
        <Text className="text-sm font-medium text-red-700 dark:text-red-400">Couldn&apos;t load {label}</Text>
      </div>
      <Text className="text-xs text-red-600 dark:text-red-400">{message}</Text>
      <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
        Retry
      </Button>
    </div>
  );
}

const CATEGORY_META: { key: keyof Pick<IntelligentKpis, 'governance' | 'cost' | 'performance' | 'usage' | 'compliance'>; title: string; icon: IconType }[] = [
  { key: 'governance', title: 'Governance', icon: PiShieldCheckDuotone },
  { key: 'cost', title: 'Cost', icon: PiCurrencyDollarDuotone },
  { key: 'performance', title: 'Performance', icon: PiGaugeDuotone },
  { key: 'usage', title: 'Usage', icon: PiUsersThreeDuotone },
  { key: 'compliance', title: 'Compliance', icon: PiSealCheckDuotone },
];

/**
 * Health & Insights hub — routes the previously-orphaned observability cards
 * (health score, KPI categories, recommendations, security posture,
 * performance/slow-queries, user activity) onto a single overview surface.
 *
 * Each section fetches independently (Promise.allSettled) so a missing route
 * degrades to a soft "unavailable" note rather than blanking the whole tab.
 */
export default function HealthOverviewTab() {
  const [kpis, setKpis] = useState<SectionState<IntelligentKpis>>(initSection);
  const [security, setSecurity] = useState<SectionState<SecurityPosture>>(initSection);
  const [performance, setPerformance] = useState<SectionState<{ metrics: PerformanceMetrics; slowQueries: SlowQuery[] }>>(initSection);
  const [activity, setActivity] = useState<SectionState<UserActivitySummary>>(initSection);

  const loadKpis = useCallback(async () => {
    setKpis((s) => ({ ...s, loading: true }));
    const [res] = await Promise.allSettled([getIntelligentKpis()]);
    setKpis(resolveSection(res));
  }, []);

  const loadSecurity = useCallback(async () => {
    setSecurity((s) => ({ ...s, loading: true }));
    const [res] = await Promise.allSettled([getSecurityPosture()]);
    setSecurity(resolveSection(res));
  }, []);

  const loadPerformance = useCallback(async () => {
    setPerformance((s) => ({ ...s, loading: true }));
    const [metricsRes, slowRes] = await Promise.allSettled([
      getPerformanceMetrics(7),
      getSlowQueries({ days: 7 }),
    ]);
    if (metricsRes.status === 'fulfilled') {
      const slowQueries = slowRes.status === 'fulfilled'
        ? (slowRes.value.slow_queries ?? [])
        : [];
      setPerformance({ loading: false, data: { metrics: metricsRes.value, slowQueries }, error: null, notDeployed: false });
    } else {
      setPerformance(resolveSection(metricsRes as PromiseSettledResult<never>));
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivity((s) => ({ ...s, loading: true }));
    const [res] = await Promise.allSettled([getActivitySummary(7)]);
    setActivity(resolveSection(res));
  }, []);

  const loadAll = useCallback(() => {
    void loadKpis();
    void loadSecurity();
    void loadPerformance();
    void loadActivity();
  }, [loadKpis, loadSecurity, loadPerformance, loadActivity]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const anyLoading = kpis.loading || security.loading || performance.loading || activity.loading;
  const kpiData = kpis.data;
  const categories: KpiCategory[] | null = kpiData
    ? CATEGORY_META.map((m) => kpiData[m.key])
    : null;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          Real-time health score, intelligent KPIs, security posture, performance and user activity.
        </Text>
        <Button size="sm" variant="outline" onClick={loadAll} disabled={anyLoading} className="gap-2">
          <PiArrowsClockwise className={anyLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </Button>
      </div>

      {/* Health score + recommendations row */}
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-3">
        <div className="@3xl:col-span-1">
          {kpis.loading ? (
            <div className="h-full min-h-[140px] animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
          ) : kpis.error ? (
            <SectionError label="health score" message={kpis.error} onRetry={loadKpis} />
          ) : kpis.notDeployed || !kpiData ? (
            <NotDeployedNote label="Health score" />
          ) : (
            <HealthScoreCard
              score={kpiData.overall_health_score != null ? Math.round(kpiData.overall_health_score) : null}
              status={kpiData.overall_status ?? 'warning'}
              className="h-full"
            />
          )}
        </div>
        <div className="@3xl:col-span-2">
          {kpis.loading ? (
            <div className="h-full min-h-[140px] animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
          ) : kpiData ? (
            <RecommendationsCard recommendations={kpiData.recommendations ?? []} className="h-full" />
          ) : null}
        </div>
      </div>

      {/* KPI categories */}
      {kpis.loading ? (
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3 @5xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
          ))}
        </div>
      ) : categories ? (
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3 @5xl:grid-cols-5">
          {CATEGORY_META.map((m, i) => {
            const cat = categories[i];
            if (!cat) return null;
            return (
              <KpiCategoryCard
                key={m.key}
                title={m.title}
                score={Math.round(cat.score ?? 0)}
                status={cat.status ?? 'warning'}
                icon={m.icon}
                metrics={cat.metrics ?? {}}
              />
            );
          })}
        </div>
      ) : null}

      {/* Security + performance */}
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
        <div>
          {security.error ? (
            <SectionError label="security posture" message={security.error} onRetry={loadSecurity} />
          ) : security.notDeployed && !security.loading ? (
            <NotDeployedNote label="Security posture" />
          ) : (
            <SecurityPostureCard data={security.data} isLoading={security.loading} />
          )}
        </div>
        <div>
          {performance.error ? (
            <SectionError label="performance metrics" message={performance.error} onRetry={loadPerformance} />
          ) : performance.notDeployed && !performance.loading ? (
            <NotDeployedNote label="Performance metrics" />
          ) : (
            <PerformanceMetricsCard
              metrics={performance.data?.metrics ?? null}
              slowQueries={performance.data?.slowQueries ?? null}
              isLoading={performance.loading}
            />
          )}
        </div>
      </div>

      {/* User activity */}
      <div>
        {activity.error ? (
          <SectionError label="user activity" message={activity.error} onRetry={loadActivity} />
        ) : activity.notDeployed && !activity.loading ? (
          <NotDeployedNote label="User activity" />
        ) : (
          <ActivitySummaryCard data={activity.data} isLoading={activity.loading} />
        )}
      </div>
    </div>
  );
}
