'use client';

/**
 * useCommandCenterCockpit — the Account tab's hero KPI-strip source.
 *
 * 2026-07-12 rationalization (user directive): the docked AxisCockpit overlay
 * (Overview/Cost/Perf/Quality/Ingest… side panel) is DELETED. It duplicated
 * the tabs' own content behind a second navigation and re-fetched data the
 * shell already had. The KPI strip stays; every tile now deep-links straight
 * to the OWNING SECTION whose audit tables explain the number and host the
 * actions — never a popup.
 *
 * The hook keeps exactly two eager fetches of its own (silent, once per time
 * window): overview-kpis (Open alerts) and warehouse-performance (Query
 * fail % / p95) — the two strip figures no shell fetch covers. Everything
 * else reuses the shell-fetched summary / module-health / cost payloads.
 * Honest "—" for anything unknown — never fake zeros.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { getApiErrorMessage } from '@/lib/api-client';
import {
  getOverviewKpis,
  getWarehousePerformance,
  type OverviewKpiPayload,
  type OverviewRange,
} from '@/app/services/command-center';
import type {
  CostBreakdownResponse,
  ModuleHealthResponse,
  SummaryResponse,
  WarehousePerformanceResponse,
} from '@/app/services/command-center/types';
import type { AxisSeverity } from '@/app/shared/cockpit/AxisCockpit';
import type { KpiItem } from '@/app/shared/cockpit/KpiStrip';

// ─── Small helpers (honest formatting: null/unknown → "—", real 0 kept) ─────

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—';
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtMs(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 60_000) return `${(v / 60_000).toFixed(1)}m`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

function daysToRange(d: number): OverviewRange {
  if (d <= 1) return '24h';
  if (d <= 7) return '7d';
  if (d <= 30) return '30d';
  return '90d';
}

// ─── Lazy fetch plumbing (kept for the two strip-only sources) ───────────────

type AxisFetchStatus = 'idle' | 'loading' | 'ready' | 'error';
interface AxisFetchState<T> {
  status: AxisFetchStatus;
  data: T | null;
}
const IDLE = { status: 'idle', data: null } as const;

// ─── The hook ────────────────────────────────────────────────────────────────

export interface CommandCenterCockpitArgs {
  /** Global time window (days) driving the strip's own fetches. */
  days: number;
  /** Fetch gate — false while the consuming strip is not rendered (any tab
   *  other than `account`). Fetches fire lazily when it flips true. */
  enabled?: boolean;
  /** Shell-fetched state — reused instead of refetched when available. */
  summary: SummaryResponse | null;
  moduleHealth: ModuleHealthResponse | null;
  costData: CostBreakdownResponse | null;
  /** In-page tab navigation (goToTab) — every tile deep-links to its owner. */
  onNavigateTab: (tabId: string) => void;
}

export interface CommandCenterCockpit {
  kpiItems: KpiItem[];
}

export function useCommandCenterCockpit({
  days,
  enabled = true,
  summary,
  moduleHealth,
  costData,
  onNavigateTab,
}: CommandCenterCockpitArgs): CommandCenterCockpit {
  // Strip-only sources: overview-kpis (Open alerts) + warehouse performance
  // (Query fail % / p95). Silent eager pre-load, once per time window.
  const [overviewState, setOverviewState] =
    useState<AxisFetchState<OverviewKpiPayload>>(IDLE);
  const [perfState, setPerfState] =
    useState<AxisFetchState<WarehousePerformanceResponse>>(IDLE);

  // In-flight guard (also covers React 18 StrictMode double effects in dev).
  const inFlight = useRef<Set<string>>(new Set());

  const runFetch = useCallback(
    async <T,>(
      key: string,
      setState: React.Dispatch<React.SetStateAction<AxisFetchState<T>>>,
      fn: () => Promise<T>,
      label: string,
      /** Silent mode: degrade to "—" without a toast (page-load pre-fetches
       *  must not toast without a user action — the honest "—" is the signal). */
      silent = false,
    ) => {
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      setState((s) => ({ ...s, status: 'loading' }));
      try {
        const data = await fn();
        setState({ status: 'ready', data });
      } catch (e) {
        setState((s) => ({ ...s, status: 'error' }));
        if (!silent) toast.error(getApiErrorMessage(e) || `Couldn't load ${label}`);
      } finally {
        inFlight.current.delete(key);
      }
    },
    [],
  );

  const loadOverview = useCallback(
    () =>
      runFetch(
        'overview',
        setOverviewState,
        () => getOverviewKpis(daysToRange(days)),
        'the overview KPIs',
        true,
      ),
    [days, runFetch],
  );
  const loadPerf = useCallback(
    () =>
      runFetch(
        'perf',
        setPerfState,
        () => getWarehousePerformance({ days }),
        'warehouse performance',
        true,
      ),
    [days, runFetch],
  );

  // Time-window change invalidates both strip caches (refetched by the eager
  // effect below when their status returns to 'idle').
  const prevDaysRef = useRef(days);
  useEffect(() => {
    if (prevDaysRef.current === days) return;
    prevDaysRef.current = days;
    setOverviewState(IDLE);
    setPerfState(IDLE);
  }, [days]);

  // Pre-load, gated on `enabled` (strip visible). 'error' is sticky, so a
  // failing backend is hit at most once per time window.
  useEffect(() => {
    if (!enabled) return;
    if (overviewState.status === 'idle') void loadOverview();
    if (perfState.status === 'idle') void loadPerf();
  }, [enabled, overviewState.status, perfState.status, loadOverview, loadPerf]);

  // ── Severity derivations (KPI dots) — shell data first ─────────────────────

  const failedLogins = num(summary?.security?.failed_logins_7d);
  const govSeverity: AxisSeverity =
    failedLogins == null ? 'idle' : failedLogins > 0 ? 'blocker' : 'ok';

  let moduleCounts: {
    healthy: number;
    degraded: number;
    critical: number;
    total: number;
  } | null = null;
  const mods = moduleHealth?.modules;
  if (mods && mods.length > 0) {
    let healthy = 0;
    let degraded = 0;
    let critical = 0;
    for (const m of mods) {
      const s = (m.status || '').toLowerCase();
      if (s === 'healthy') healthy += 1;
      else if (s === 'critical') critical += 1;
      else if (s === 'degraded' || s === 'warning') degraded += 1;
    }
    moduleCounts = { healthy, degraded, critical, total: mods.length };
  }

  const freshnessViolations = num(summary?.quality?.freshness_violations);
  const qualitySeverity: AxisSeverity =
    moduleCounts == null && freshnessViolations == null
      ? 'idle'
      : (moduleCounts?.critical ?? 0) > 0 || (freshnessViolations ?? 0) > 0
        ? 'warn'
        : 'ok';

  const costTrend =
    num(costData?.credit_trend_pct) ?? num(summary?.cost?.credit_trend_pct);
  const costKnown = costData != null || summary != null;
  const costSeverity: AxisSeverity = !costKnown
    ? 'idle'
    : (costTrend ?? 0) > 25
      ? 'warn'
      : 'ok';

  const perfFailed = num(perfState.data?.query_performance?.failed_queries_7d);
  const perfSeverity: AxisSeverity =
    perfState.data == null ? 'idle' : (perfFailed ?? 0) > 0 ? 'warn' : 'ok';

  const openAlerts = num(overviewState.data?.open_alerts);
  const overviewSeverity: AxisSeverity =
    overviewState.data != null && overviewState.data._provisioned !== false
      ? (openAlerts ?? 0) > 0
        ? 'warn'
        : 'ok'
      : summary
        ? 'ok'
        : 'idle';

  // ── KPI strip — the ONE hero band of the Account tab (density mandate
  //    2026-07: ≤8 tiles, a metric appears here ONCE, honest "—" via
  //    undefined). Every tile deep-links to the SECTION whose audit tables
  //    explain the figure — the old cockpit-axis popup is gone. ──

  const totalUsers = num(summary?.platform?.total_users);
  const activeUsers7d = num(summary?.platform?.active_users_7d);
  const credits =
    num(costData?.total_credits) ??
    (days === 30 ? num(summary?.cost?.credits_30d) : null);
  const p95 = num(perfState.data?.query_performance?.p95_execution_ms);
  const perfTotal7d = num(perfState.data?.query_performance?.total_queries_7d);
  // Real ratio only — no rate when the denominator is unknown or zero.
  const queryFailPct =
    perfTotal7d != null && perfTotal7d > 0 && perfFailed != null
      ? (perfFailed / perfTotal7d) * 100
      : null;
  const storageTb = num(summary?.cost?.storage_tb);
  const activeProjects = num(summary?.platform?.total_projects);
  // Honest open-alerts: the synthetic unprovisioned payload carries fake 0s.
  const openAlertsHonest =
    overviewState.data?._provisioned !== false ? openAlerts : null;

  const kpiItems: KpiItem[] = [
    {
      label: 'Active users',
      value: activeUsers7d != null ? fmtNum(activeUsers7d) : undefined,
      dot: activeUsers7d != null ? 'ok' : 'idle',
      sub: totalUsers != null ? `of ${fmtNum(totalUsers)} total (7d)` : '7d',
      onClick: () => onNavigateTab('platform-activity'),
      title: 'Active platform users (7d) — open Platform Activity (audit table)',
    },
    {
      label: `Credits (${days}d)`,
      value: credits != null ? fmtNum(credits, 1) : undefined,
      dot: costSeverity,
      sub: 'credits',
      delta:
        costTrend != null
          ? {
              text: `${costTrend > 0 ? '+' : ''}${costTrend.toFixed(1)}%`,
              tone: costTrend > 0 ? 'warn' : 'up',
            }
          : undefined,
      onClick: () => onNavigateTab('finops'),
      title: 'Credit spend — open FinOps (cost drivers + audit tables)',
    },
    {
      label: 'Query fail %',
      value: queryFailPct != null ? `${queryFailPct.toFixed(1)}%` : undefined,
      dot: perfSeverity,
      sub: p95 != null ? `p95 ${fmtMs(p95)} (7d)` : '7d',
      onClick: () => onNavigateTab('usage-performance'),
      title: 'Failed / total queries (7d) — open Usage & Performance (slowest/failed queries)',
    },
    {
      label: 'Failed logins',
      value: failedLogins != null ? fmtNum(failedLogins) : undefined,
      dot: govSeverity,
      sub: '7d',
      onClick: () => onNavigateTab('security'),
      title: 'Failed logins (7d) — open Security & Governance (audit table)',
    },
    {
      label: 'Storage',
      // Sub-TB accounts render in GB — `0 TB` for a 6 GB account reads as a
      // fake zero, which the strip's honesty contract forbids.
      value:
        storageTb != null
          ? storageTb >= 1
            ? `${fmtNum(storageTb, storageTb < 10 ? 2 : 1)} TB`
            : `${fmtNum(storageTb * 1024, storageTb * 1024 < 10 ? 2 : 0)} GB`
          : undefined,
      dot: storageTb != null ? 'ok' : 'idle',
      sub: 'incl. time-travel & fail-safe',
      onClick: () => onNavigateTab('finops'),
      title: 'Total storage — open FinOps (storage split axis)',
    },
    {
      label: 'Active projects',
      value: activeProjects != null ? fmtNum(activeProjects) : undefined,
      dot: activeProjects != null ? 'ok' : 'idle',
      onClick: () => onNavigateTab('projects'),
      title: 'Data360 projects — open the Projects tab',
    },
    {
      label: 'Modules healthy',
      // The real module count — NOT summary.quality.health_score, which is
      // the DATA-QUALITY score (using it here once produced "Module health
      // 24% · all modules healthy", a live-caught contradiction).
      value: moduleCounts
        ? `${moduleCounts.healthy}/${moduleCounts.total}`
        : undefined,
      dot: qualitySeverity,
      sub: moduleCounts
        ? moduleCounts.critical > 0
          ? `${moduleCounts.critical} critical`
          : moduleCounts.degraded > 0
            ? `${moduleCounts.degraded} degraded`
            : 'all healthy'
        : undefined,
      onClick: () => onNavigateTab('modules'),
      title: 'Module health — open the module health audit',
    },
    {
      label: 'Open alerts',
      value: openAlertsHonest != null ? fmtNum(openAlertsHonest) : undefined,
      dot: overviewSeverity,
      onClick: () => onNavigateTab('security'),
      title: 'Open alerts — open Security & Governance',
    },
  ];

  return { kpiItems };
}
