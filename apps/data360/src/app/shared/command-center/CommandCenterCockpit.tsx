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
  isPreparing,
  type OverviewKpiPayload,
  type OverviewRange,
} from '@/app/services/command-center';
import {
  extractAvailability,
  availabilitySummary,
} from '@/app/services/command-center/availability';
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
        async () => {
          const r = await getWarehousePerformance({ days });
          // B2: a 'preparing' envelope is not strip data — degrade to '—'
          // (silent error path); the next window change re-reads the cache.
          if (isPreparing(r)) throw new Error('preparing');
          return r;
        },
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

  // Honest open-alerts: the synthetic unprovisioned payload carries fake 0s.
  const openAlertsHonest =
    overviewState.data?._provisioned !== false ? openAlerts : null;

  // 2026-08-24 KPI-ownership refactor: the Account strip carries ONLY the
  // health composites this tab OWNS (mission §3 — Account = health roll-up,
  // never a mini-dashboard of FinOps/Usage/Security detail). The old raw
  // tiles (Active users, Credits, Query fail %, Failed logins, Storage,
  // Active projects) live in their canonical tabs; each health tile still
  // deep-links to the tab that explains it.
  const provisioned = overviewState.data?._provisioned !== false;
  const workspaceHealth = provisioned
    ? num(overviewState.data?.workspace_health_pct)
    : null;
  const warehouseHealth = provisioned
    ? num(overviewState.data?.snowflake_health_pct)
    : null;
  const optimizationScore = provisioned
    ? num(overviewState.data?.optimization_score_pct)
    : null;
  const pctDot = (v: number | null): AxisSeverity =>
    v == null ? 'idle' : v < 50 ? 'blocker' : v < 80 ? 'warn' : 'ok';

  // B1 availability block rides the same overview-kpis payload — the coverage
  // tile costs zero extra requests. worst→dot: ready ok · preparing pending ·
  // blocked warn · unknown idle (never green unless everything is ready).
  const avBlock = extractAvailability(overviewState.data);
  const avSummary = availabilitySummary(avBlock);
  const domainsDot: AxisSeverity =
    avBlock == null
      ? 'idle'
      : avSummary.worst === 'ready'
        ? 'ok'
        : avSummary.worst === 'preparing'
          ? 'pending'
          : avSummary.worst === 'blocked'
            ? 'warn'
            : 'idle';

  const kpiItems: KpiItem[] = [
    {
      label: 'Domains ready',
      value: avBlock ? `${avSummary.ready}/${avSummary.total}` : undefined,
      dot: domainsDot,
      sub: avBlock
        ? avSummary.blocked > 0
          ? `${avSummary.blocked} need setup`
          : avSummary.preparing > 0
            ? `${avSummary.preparing} preparing`
            : 'all ready'
        : undefined,
      title: 'Data readiness by domain — details in the readiness matrix below',
    },
    {
      label: 'Workspace health',
      value: workspaceHealth != null ? `${fmtNum(workspaceHealth)}%` : undefined,
      dot: pctDot(workspaceHealth),
      sub: 'Data360 platform composite',
      onClick: () => onNavigateTab('platform-activity'),
      title:
        'Data360 workspace health composite — open Platform Activity for the evidence',
    },
    {
      label: 'Warehouse health',
      value: warehouseHealth != null ? `${fmtNum(warehouseHealth)}%` : undefined,
      dot: pctDot(warehouseHealth),
      sub: 'warehouse & query composite',
      onClick: () => onNavigateTab('usage-performance'),
      title: 'Warehouse & query health composite — open Usage & Performance',
    },
    {
      label: 'Optimization',
      value:
        optimizationScore != null ? `${fmtNum(optimizationScore)}%` : undefined,
      dot: pctDot(optimizationScore),
      sub: 'sizing · monitors posture',
      delta:
        costTrend != null && costTrend > 25
          ? { text: `spend +${costTrend.toFixed(0)}%`, tone: 'warn' }
          : undefined,
      onClick: () => onNavigateTab('finops'),
      title:
        'Resource-efficiency posture (warehouse sizing, resource monitors) — open FinOps',
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
      // "all healthy" ONLY when every module counts as healthy — 6/7 with one
      // inactive module must say so, never "all healthy" (live-caught lie).
      sub: moduleCounts
        ? moduleCounts.critical > 0
          ? `${moduleCounts.critical} critical`
          : moduleCounts.degraded > 0
            ? `${moduleCounts.degraded} degraded`
            : moduleCounts.healthy < moduleCounts.total
              ? `${moduleCounts.total - moduleCounts.healthy} inactive`
              : 'all healthy'
        : undefined,
      onClick: () => onNavigateTab('platform-activity'),
      title: 'Module health — open Platform Activity (modules adoption)',
    },
    {
      label: 'Open alerts',
      value: openAlertsHonest != null ? fmtNum(openAlertsHonest) : undefined,
      dot: overviewSeverity,
      sub: 'across all domains',
      onClick: () => onNavigateTab('security'),
      title: 'Open alerts — open Security & Governance',
    },
  ];

  return { kpiItems };
}
