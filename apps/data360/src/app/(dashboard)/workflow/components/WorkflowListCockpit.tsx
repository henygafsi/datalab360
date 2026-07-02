'use client';

/**
 * WorkflowListCockpit — the unified AxisCockpit + KpiStrip for the workflow
 * LIST/landing view (the project gate, where no workflow is open yet).
 *
 * IMPORTANT: the BUILDER view keeps its approved docked right bar
 * (WorkflowSmartPanel with the AI BUILD section). This cockpit mounts ONLY on
 * the list view, so the two right bars never coexist or duplicate. The "AI"
 * axis here is a pure entry point that hands off to that existing bar.
 *
 * Axes (all fed by already-wired endpoints — nothing invented):
 *  - deployment  GET /workflow/{id}/deployments (+ approve / execute actions)
 *  - runs        GET /workflow/{id}/runs (links into ETLExecutionHistory,
 *                where the "View logs" TaskLogsDrawer lives)
 *  - perf        computed client-side from the runs data (honest "—")
 *  - cost        GET /workflow/{id}/cost-summary (lazy, on axis open)
 *  - history     GET /workflow/{id}/versions (lazy, on axis open)
 *  - ai          entry-point card → "Build with AI — on the canvas"
 *
 * The list view has no single workflow, so the cockpit scans the most recent
 * SCAN_LIMIT workflows (Promise.allSettled — one slow/failed workflow never
 * blocks the rest) and is explicit about that scope in the copy. Honest by
 * design: unknown values render "—", never fake 0s.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Circle,
  Coins,
  Gauge,
  History,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';

import AxisCockpit, { type AxisDef, type AxisSeverity } from '@/app/shared/cockpit/AxisCockpit';
import KpiStrip, { type KpiItem } from '@/app/shared/cockpit/KpiStrip';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import * as workflowApi from '@/app/services/api/workflowApi';
import { formatDuration } from '@/app/services/workflow';
import type { WorkflowDeployment, WorkflowRun, WorkflowVersion } from '@/app/services/api/types';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';

// ============================================================================
// Public contract
// ============================================================================

export interface CockpitWorkflowItem {
  id: string;
  name: string;
  created_at?: string | null;
}

/** Builder sections the cockpit can deep-link into (subset of `activeTab`). */
export type CockpitOpenSection = 'runs' | 'deploy' | 'ai' | 'cost';

export interface WorkflowListCockpitProps {
  workflows: CockpitWorkflowItem[];
  /** True while the workflow list itself is still loading (KPIs render "—"). */
  workflowsLoading: boolean;
  /** Open a workflow in the builder, optionally focused on a right-bar section. */
  onOpenWorkflow: (wf: CockpitWorkflowItem, section?: CockpitOpenSection) => void | Promise<void>;
  /** Hand off to the existing docked AI BUILD bar on a fresh canvas. */
  onBuildWithAi: () => void;
  /** The list view content (scan prefill + project gate panel). */
  children: React.ReactNode;
}

// ============================================================================
// Constants + small helpers
// ============================================================================

/** How many recent workflows the aggregate scan covers (fan-out cap). */
const SCAN_LIMIT = 8;
/** How many workflows the lazy cost axis queries (cost-summary is heavier). */
const COST_SCAN_LIMIT = 5;
const RUNS_PER_WORKFLOW = 20;
const DEPLOYMENTS_PER_WORKFLOW = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function httpStatus(e: unknown): number | null {
  const s = (e as { response?: { status?: number } })?.response?.status;
  return typeof s === 'number' ? s : null;
}

function isGapStatus(s: number | null): boolean {
  return s === 404 || s === 501;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Relative time — honest "—" when the timestamp is missing/invalid. */
function timeAgo(iso: string | null | undefined): string {
  const t = parseTime(iso);
  if (t == null) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

/** Credits formatter — never renders a misleading fake 0 for tiny values. */
function fmtCredits(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return '—';
  if (c === 0) return '0';
  if (Math.abs(c) < 0.01) return '<0.01';
  return c.toFixed(2);
}

type RunKind = 'ok' | 'failed' | 'running' | 'other';

/** Backend run status is loose on the wire ('completed' | 'success' | …). */
function runKind(status: string | null | undefined): RunKind {
  const s = String(status ?? '').toLowerCase();
  if (s === 'completed' || s === 'success' || s === 'succeeded') return 'ok';
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'running' || s === 'in_progress') return 'running';
  return 'other';
}

function RunStatusIcon({ status }: { status: string | null | undefined }) {
  const kind = runKind(status);
  if (kind === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="succeeded" />;
  if (kind === 'failed') return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="failed" />;
  if (kind === 'running') return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" aria-label="running" />;
  return <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" aria-label={String(status ?? 'unknown')} />;
}

/** Purge-safe literal class map for deployment status chips. */
const DEP_CHIP: Record<string, string> = {
  pending_approval: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  scheduled: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  deployed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  rolled_back: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function DeploymentStatusChip({ status }: { status: string }) {
  const cls = DEP_CHIP[status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ============================================================================
// Shared micro-states (skeleton / error / empty) — honest, no fake data
// ============================================================================

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-red-100 dark:border-red-900/40 dark:hover:bg-red-900/30"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-xs italic text-slate-400 dark:text-slate-500">{text}</p>;
}

/** Scope note so aggregate numbers are never mistaken for account-wide truth. */
function ScopeNote({ scanned, total }: { scanned: number; total: number }) {
  if (total <= scanned) return null;
  return (
    <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
      Scanned the {scanned} most recent of {total} workflows.
    </p>
  );
}

// ============================================================================
// Aggregate scan types
// ============================================================================

interface ScanRun extends WorkflowRun {
  workflowId: string;
  workflowName: string;
}

interface ScanDeployment extends WorkflowDeployment {
  workflowId: string;
  workflowName: string;
}

interface ScanResult {
  runs: ScanRun[];
  deployments: ScanDeployment[];
  /** # of scanned workflows whose runs / deployments call succeeded. */
  runsFetched: number;
  depsFetched: number;
  scannedCount: number;
}

interface CostRow {
  workflowId: string;
  workflowName: string;
  credits: number | null;
  estimatedUsd: number | null;
  estimate: boolean;
  lookbackDays: number | null;
}

type CostState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** Route missing (404/501) on every scanned workflow — feature not provisioned. */
  | { status: 'unavailable' }
  | { status: 'ready'; rows: CostRow[]; totalCredits: number | null; totalUsd: number | null; anyEstimate: boolean };

type HistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; versions: WorkflowVersion[]; forId: string };

// ============================================================================
// Component
// ============================================================================

export default function WorkflowListCockpit({
  workflows,
  workflowsLoading,
  onOpenWorkflow,
  onBuildWithAi,
  children,
}: WorkflowListCockpitProps) {
  const { trackFeatureClick } = useTrackEvent();
  // Account-global gates (list view has no per-workflow contributor role yet).
  const deployPerm = useCanPerform('workflow', 'deploy');
  const createPerm = useCanPerform('workflow', 'create');

  // ── Cockpit shell state ───────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [activeAxis, setActiveAxis] = useState<string | null>(null);

  // ── Scan scope: the most recent SCAN_LIMIT workflows ─────────────────────
  const scanTargets = useMemo<CockpitWorkflowItem[]>(() => {
    const sorted = [...workflows].sort(
      (a, b) => (parseTime(b.created_at) ?? 0) - (parseTime(a.created_at) ?? 0),
    );
    return sorted.slice(0, SCAN_LIMIT);
  }, [workflows]);
  // Ref mirror so lazy loaders (cost/history) never capture a stale scope.
  const scanTargetsRef = useRef(scanTargets);
  scanTargetsRef.current = scanTargets;

  // ── Aggregate scan (runs + deployments) — feeds KPI strip + 3 axes ───────
  const scanFn = useCallback(async (): Promise<ScanResult> => {
    const targets = scanTargetsRef.current;
    const [runsSettled, depsSettled] = await Promise.all([
      Promise.allSettled(targets.map((w) => workflowApi.listRuns(w.id, { limit: RUNS_PER_WORKFLOW }))),
      Promise.allSettled(
        targets.map((w) => workflowApi.listDeployments(w.id, { limit: DEPLOYMENTS_PER_WORKFLOW })),
      ),
    ]);
    const runs: ScanRun[] = [];
    let runsFetched = 0;
    runsSettled.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      runsFetched += 1;
      (r.value?.runs ?? []).forEach((run) =>
        runs.push({ ...run, workflowId: targets[i].id, workflowName: targets[i].name }),
      );
    });
    const deployments: ScanDeployment[] = [];
    let depsFetched = 0;
    depsSettled.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      depsFetched += 1;
      (r.value?.deployments ?? []).forEach((d) =>
        deployments.push({ ...d, workflowId: targets[i].id, workflowName: targets[i].name }),
      );
    });
    runs.sort((a, b) => (parseTime(b.started_at) ?? 0) - (parseTime(a.started_at) ?? 0));
    deployments.sort(
      (a, b) =>
        (parseTime(b.created_at ?? b.deployed_at) ?? 0) - (parseTime(a.created_at ?? a.deployed_at) ?? 0),
    );
    return { runs, deployments, runsFetched, depsFetched, scannedCount: targets.length };
  }, []);

  const scan = useCacheAwareQuery<ScanResult>(scanFn, {
    cacheKeys: [CACHE_KEYS.WORKFLOWS, CACHE_KEYS.RUNS, CACHE_KEYS.DEPLOYMENTS, CACHE_KEYS.APPROVALS],
    enabled: scanTargets.length > 0,
  });

  const scanData = scan.data;
  /** Scan produced nothing usable at all (every per-workflow call failed). */
  const scanDead =
    !!scanData && scanData.scannedCount > 0 && scanData.runsFetched === 0 && scanData.depsFetched === 0;
  const scanReady = !!scanData && !scanDead;
  const noWorkflows = !workflowsLoading && workflows.length === 0;

  // ── Derived aggregates (client-side, honest) ──────────────────────────────
  const agg = useMemo(() => {
    if (noWorkflows) {
      // Vacuously true zeros — there is nothing to run or approve.
      return { runs24h: 0, failures24h: 0, avgDurationSec: null as number | null, pendingApprovals: 0, lastRuns: [] as ScanRun[] };
    }
    if (!scanReady || !scanData) {
      return { runs24h: null, failures24h: null, avgDurationSec: null, pendingApprovals: null, lastRuns: [] as ScanRun[] };
    }
    const cutoff = Date.now() - DAY_MS;
    let runs24h = 0;
    let failures24h = 0;
    const durations: number[] = [];
    scanData.runs.forEach((r) => {
      const t = parseTime(r.started_at);
      if (t != null && t >= cutoff) {
        runs24h += 1;
        if (runKind(r.status) === 'failed') failures24h += 1;
      }
      if (r.duration_seconds != null && Number.isFinite(Number(r.duration_seconds)) && runKind(r.status) !== 'running') {
        durations.push(Number(r.duration_seconds));
      }
    });
    const avgDurationSec = durations.length
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : null;
    const pendingApprovals = scanData.depsFetched > 0
      ? scanData.deployments.filter((d) => d.status === 'pending_approval').length
      : null;
    return { runs24h, failures24h, avgDurationSec, pendingApprovals, lastRuns: scanData.runs };
  }, [noWorkflows, scanReady, scanData]);

  // ── Lazy cost axis state ──────────────────────────────────────────────────
  const [costState, setCostState] = useState<CostState>({ status: 'idle' });
  const costSeqRef = useRef(0);
  const loadCost = useCallback(async () => {
    const targets = scanTargetsRef.current.slice(0, COST_SCAN_LIMIT);
    if (targets.length === 0) {
      setCostState({ status: 'ready', rows: [], totalCredits: null, totalUsd: null, anyEstimate: false });
      return;
    }
    const seq = ++costSeqRef.current;
    setCostState({ status: 'loading' });
    const settled = await Promise.allSettled(targets.map((w) => workflowApi.getWorkflowCostSummary(w.id)));
    if (seq !== costSeqRef.current) return; // superseded
    const rows: CostRow[] = [];
    let gaps = 0;
    let hardErrors = 0;
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const s = r.value;
        rows.push({
          workflowId: targets[i].id,
          workflowName: targets[i].name,
          credits: s.attributed_credits ?? s.credits ?? s.total_credits ?? null,
          estimatedUsd: s.estimated_cost_usd ?? null,
          estimate: s.estimate !== false,
          lookbackDays: s.lookback_days ?? null,
        });
      } else if (isGapStatus(httpStatus(r.reason))) {
        gaps += 1;
      } else {
        hardErrors += 1;
      }
    });
    if (rows.length === 0 && gaps > 0 && hardErrors === 0) {
      setCostState({ status: 'unavailable' });
      return;
    }
    if (rows.length === 0 && hardErrors > 0) {
      setCostState({ status: 'error', message: 'Could not load cost attribution for the scanned workflows.' });
      return;
    }
    const creditVals = rows.map((r) => r.credits).filter((c): c is number => c != null);
    const usdVals = rows.map((r) => r.estimatedUsd).filter((c): c is number => c != null);
    setCostState({
      status: 'ready',
      rows,
      totalCredits: creditVals.length ? creditVals.reduce((s, c) => s + c, 0) : null,
      totalUsd: usdVals.length ? usdVals.reduce((s, c) => s + c, 0) : null,
      anyEstimate: rows.some((r) => r.estimate),
    });
  }, []);

  // ── Lazy history (versions) axis state ────────────────────────────────────
  const [historyScopeId, setHistoryScopeId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'idle' });
  const historySeqRef = useRef(0);
  const loadHistory = useCallback(async (workflowId: string) => {
    const seq = ++historySeqRef.current;
    setHistoryState({ status: 'loading' });
    try {
      const res = await workflowApi.listVersions(workflowId, { limit: 10 });
      if (seq !== historySeqRef.current) return;
      setHistoryState({ status: 'ready', versions: res?.versions ?? [], forId: workflowId });
    } catch (e) {
      if (seq !== historySeqRef.current) return;
      if (isGapStatus(httpStatus(e))) setHistoryState({ status: 'unavailable' });
      else setHistoryState({ status: 'error', message: 'Could not load version history.' });
    }
  }, []);

  const changeHistoryScope = useCallback(
    (id: string) => {
      setHistoryScopeId(id);
      void loadHistory(id);
    },
    [loadHistory],
  );

  // ── Axis open orchestration (lazy per-axis fetch happens HERE, not in render)
  const openAxis = useCallback(
    (id: string) => {
      setActiveAxis(id);
      setOpen(true);
      trackFeatureClick('workflow_cockpit_axis', { axis: id });
      if (id === 'cost' && (costState.status === 'idle' || costState.status === 'error')) {
        void loadCost();
      }
      if (id === 'history') {
        const scope = historyScopeId ?? scanTargetsRef.current[0]?.id ?? null;
        if (scope && (historyState.status === 'idle' || historyState.status === 'error' || historyScopeId == null)) {
          setHistoryScopeId(scope);
          void loadHistory(scope);
        }
      }
    },
    [trackFeatureClick, costState.status, historyState.status, historyScopeId, loadCost, loadHistory],
  );

  // ── Auto-open once with a purposeful default (platform right-bar pass):
  //    blockers → runs · pending approvals → deployment · else runs overview.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || open) return;
    if (!scanReady) return;
    autoOpenedRef.current = true;
    const failures = agg.failures24h ?? 0;
    const pending = agg.pendingApprovals ?? 0;
    setActiveAxis(failures > 0 ? 'runs' : pending > 0 ? 'deployment' : 'runs');
    setOpen(true);
  }, [scanReady, agg.failures24h, agg.pendingApprovals, open]);

  // ── Severities ────────────────────────────────────────────────────────────
  const runsSeverity: AxisSeverity = !scanReady
    ? 'idle'
    : (agg.failures24h ?? 0) > 0
      ? 'blocker'
      : 'ok';
  const deploymentSeverity: AxisSeverity = !scanReady
    ? 'idle'
    : (agg.pendingApprovals ?? 0) > 0
      ? 'pending'
      : 'ok';
  const perfSeverity: AxisSeverity = scanReady && agg.avgDurationSec != null ? 'ok' : 'idle';
  const costSeverity: AxisSeverity = costState.status === 'ready' ? 'ok' : 'idle';
  const historySeverity: AxisSeverity = historyState.status === 'ready' ? 'ok' : 'idle';

  // ── KPI strip (click deep-links into the matching axis) ───────────────────
  const kpis = useMemo<KpiItem[]>(() => {
    const scannedNote =
      scanData && workflows.length > scanData.scannedCount
        ? `${scanData.scannedCount} recent scanned`
        : undefined;
    return [
      {
        label: 'Workflows',
        value: workflowsLoading ? null : workflows.length,
        sub: scannedNote,
        onClick: () => openAxis('runs'),
        title: 'Open recent activity',
      },
      {
        label: 'Runs (24h)',
        value: agg.runs24h,
        dot: scanReady && (agg.runs24h ?? 0) > 0 ? 'ok' : undefined,
        onClick: () => openAxis('runs'),
        title: 'Open recent runs',
      },
      {
        label: 'Failures',
        value: agg.failures24h,
        dot: (agg.failures24h ?? 0) > 0 ? 'blocker' : undefined,
        sub: 'last 24h',
        onClick: () => openAxis('runs'),
        title: 'Open recent runs',
      },
      {
        label: 'Avg duration',
        value: agg.avgDurationSec != null ? formatDuration(Math.round(agg.avgDurationSec)) : null,
        sub: 'recent runs',
        onClick: () => openAxis('perf'),
        title: 'Open performance',
      },
      {
        label: 'Pending approvals',
        value: agg.pendingApprovals,
        dot: (agg.pendingApprovals ?? 0) > 0 ? 'pending' : undefined,
        onClick: () => openAxis('deployment'),
        title: 'Open deployments',
      },
    ];
  }, [workflows.length, workflowsLoading, agg, scanReady, scanData, openAxis]);

  // ── Axis bodies ───────────────────────────────────────────────────────────

  const scanScope = scanData
    ? { scanned: scanData.scannedCount, total: workflows.length }
    : { scanned: 0, total: workflows.length };

  const renderScanGate = (): React.ReactNode | null => {
    if (noWorkflows) return <EmptyNote text="No workflows yet — build your first one with AI or from a blank canvas." />;
    if (scan.loading && !scanData) return <SkeletonRows />;
    if (scan.error || scanDead) {
      return (
        <ErrorNote
          message="Could not scan recent workflows."
          onRetry={() => void scan.refetch()}
        />
      );
    }
    return null;
  };

  const renderDeploymentAxis = (): React.ReactNode => {
    const gate = renderScanGate();
    if (gate) return gate;
    const deployments = (scanData?.deployments ?? []).slice(0, 10);
    return (
      <div className="space-y-3">
        <ScopeNote {...scanScope} />
        {scanData && scanData.depsFetched === 0 ? (
          <EmptyNote text="Deployment status isn't available for the scanned workflows." />
        ) : deployments.length === 0 ? (
          <EmptyNote text="No deployments yet across the scanned workflows." />
        ) : (
          <ul className="space-y-2">
            {deployments.map((d) => {
              const wf: CockpitWorkflowItem = { id: d.workflowId, name: d.workflowName };
              return (
                <li
                  key={`${d.workflowId}-${d.deployment_id}`}
                  className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {d.workflowName}
                    </span>
                    <DeploymentStatusChip status={String(d.status)} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{d.deployment_type ? String(d.deployment_type).replace(/_/g, ' ') : 'deployment'}</span>
                    <span>By {d.requested_by || '—'}</span>
                    <span>{timeAgo(d.created_at ?? d.deployed_at)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {d.status === 'pending_approval' && deployPerm.allowed && (
                      <InsightActionButton
                        label="Approve"
                        icon={CheckCircle2}
                        variant="subtle"
                        size="sm"
                        onAction={() => workflowApi.approveDeployment(d.workflowId, d.deployment_id)}
                        successToast="Deployment approved"
                        pingBell
                        onDone={() => void scan.refetch()}
                        unavailableHint="Approve is not available on this backend"
                        confirm={{
                          title: 'Approve this deployment?',
                          body: `Approving lets "${d.workflowName}" be executed in production.`,
                        }}
                      />
                    )}
                    {d.status === 'approved' && deployPerm.allowed && (
                      <InsightActionButton
                        label="Execute"
                        icon={Rocket}
                        variant="subtle"
                        size="sm"
                        onAction={() => workflowApi.executeDeployment(d.workflowId, d.deployment_id)}
                        successToast="Deployment executed"
                        pingBell
                        onDone={() => void scan.refetch()}
                        unavailableHint="Deployment execute isn't available on this backend"
                        confirm={{
                          title: 'Execute this deployment?',
                          body: `Runs the approved deployment of "${d.workflowName}" now.`,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => void onOpenWorkflow(wf, 'deploy')}
                      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                    >
                      Open deploy panel
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const renderRunsAxis = (): React.ReactNode => {
    const gate = renderScanGate();
    if (gate) return gate;
    const runs = agg.lastRuns.slice(0, 12);
    return (
      <div className="space-y-3">
        <ScopeNote {...scanScope} />
        {scanData && scanData.runsFetched === 0 ? (
          <EmptyNote text="Run history isn't available for the scanned workflows." />
        ) : runs.length === 0 ? (
          <EmptyNote text="No runs yet across the scanned workflows." />
        ) : (
          <ul className="space-y-1.5">
            {runs.map((r) => {
              const wf: CockpitWorkflowItem = { id: r.workflowId, name: r.workflowName };
              return (
                <li
                  key={`${r.workflowId}-${r.run_id}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-700"
                >
                  <RunStatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {r.workflowName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {timeAgo(r.started_at)} · {formatDuration(r.duration_seconds)} · {r.trigger_type || '—'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onOpenWorkflow(wf, 'runs')}
                    title="Open run history and the per-run View logs drawer"
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                  >
                    History &amp; logs
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
          "History &amp; logs" opens the workflow's execution history, where each run has a
          View logs drawer.
        </p>
      </div>
    );
  };

  const renderPerfAxis = (): React.ReactNode => {
    const gate = renderScanGate();
    if (gate) return gate;
    const finished = agg.lastRuns.filter(
      (r) => r.duration_seconds != null && Number.isFinite(Number(r.duration_seconds)) && runKind(r.status) !== 'running',
    );
    if (finished.length === 0) {
      return (
        <div className="space-y-3">
          <ScopeNote {...scanScope} />
          <EmptyNote text="No finished runs with a recorded duration yet." />
        </div>
      );
    }
    const lastRun = finished[0];
    // Trend: newest 5 vs the previous 5 (needs ≥2 in each window to be honest).
    const newer = finished.slice(0, 5).map((r) => Number(r.duration_seconds));
    const older = finished.slice(5, 10).map((r) => Number(r.duration_seconds));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    let trend: { pct: number; slower: boolean } | null = null;
    if (newer.length >= 2 && older.length >= 2 && mean(older) > 0) {
      const pct = ((mean(newer) - mean(older)) / mean(older)) * 100;
      trend = { pct: Math.abs(pct), slower: pct > 0 };
    }
    // Per-workflow rollup.
    const byWf = new Map<string, { name: string; durations: number[]; last: number }>();
    finished.forEach((r) => {
      const d = Number(r.duration_seconds);
      const e = byWf.get(r.workflowId);
      if (e) e.durations.push(d);
      else byWf.set(r.workflowId, { name: r.workflowName, durations: [d], last: d });
    });
    return (
      <div className="space-y-4">
        <ScopeNote {...scanScope} />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
            <div className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">Avg duration</div>
            <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {agg.avgDurationSec != null ? formatDuration(Math.round(agg.avgDurationSec)) : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
            <div className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">Last run</div>
            <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {formatDuration(lastRun.duration_seconds)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          {trend == null ? (
            <span className="text-slate-400 dark:text-slate-500">Not enough runs for a trend yet.</span>
          ) : trend.pct < 5 ? (
            <span>Durations are steady across recent runs.</span>
          ) : trend.slower ? (
            <>
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" aria-hidden />
              <span>
                Recent runs are ~{Math.round(trend.pct)}% slower than the previous batch.
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              <span>
                Recent runs are ~{Math.round(trend.pct)}% faster than the previous batch.
              </span>
            </>
          )}
        </div>
        <div>
          <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            By workflow
          </h4>
          <ul className="space-y-1.5">
            {Array.from(byWf.entries()).map(([id, w]) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700"
              >
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">{w.name}</span>
                <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                  avg {formatDuration(Math.round(mean(w.durations)))} · last {formatDuration(w.last)} ·{' '}
                  {w.durations.length} runs
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const renderCostAxis = (): React.ReactNode => {
    if (noWorkflows) return <EmptyNote text="No workflows yet — nothing has consumed compute." />;
    if (costState.status === 'idle' || costState.status === 'loading') return <SkeletonRows rows={3} />;
    if (costState.status === 'unavailable') {
      return <EmptyNote text="Cost attribution isn't available on this backend yet." />;
    }
    if (costState.status === 'error') {
      return <ErrorNote message={costState.message} onRetry={() => void loadCost()} />;
    }
    const { rows, totalCredits, totalUsd, anyEstimate } = costState;
    const lookback = rows.find((r) => r.lookbackDays != null)?.lookbackDays ?? null;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
            <div className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
              Attributed credits
            </div>
            <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {fmtCredits(totalCredits)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
            <div className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">Cost (USD)</div>
            <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {totalUsd != null ? `$${totalUsd.toFixed(2)}` : '—'}
              {totalUsd != null && anyEstimate && (
                <span className="ml-1 text-[10px] font-semibold text-slate-400">est.</span>
              )}
            </div>
          </div>
        </div>
        {lookback != null && (
          <p className="text-[10.5px] text-slate-400 dark:text-slate-500">Last {lookback} days.</p>
        )}
        <ScopeNote scanned={rows.length} total={workflows.length} />
        {rows.length === 0 ? (
          <EmptyNote text="No cost data reported for the scanned workflows." />
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li
                key={r.workflowId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700"
              >
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {r.workflowName}
                </span>
                <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                  {fmtCredits(r.credits)} credits
                  {r.estimatedUsd != null ? ` · $${r.estimatedUsd.toFixed(2)}${r.estimate ? ' est.' : ''}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderHistoryAxis = (): React.ReactNode => {
    if (noWorkflows) return <EmptyNote text="No workflows yet — version history appears after the first save." />;
    const scopeId = historyScopeId ?? scanTargets[0]?.id ?? '';
    const scopeWf = workflows.find((w) => w.id === scopeId) ?? scanTargets[0] ?? null;
    return (
      <div className="space-y-3">
        <label className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Workflow
          <select
            value={scopeId}
            onChange={(e) => changeHistoryScope(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {historyState.status === 'idle' || historyState.status === 'loading' ? (
          <SkeletonRows rows={3} />
        ) : historyState.status === 'unavailable' ? (
          <EmptyNote text="Version history isn't available on this backend yet." />
        ) : historyState.status === 'error' ? (
          <ErrorNote message={historyState.message} onRetry={() => scopeId && void loadHistory(scopeId)} />
        ) : historyState.versions.length === 0 ? (
          <EmptyNote text="No versions yet — versions are captured when the workflow is saved." />
        ) : (
          <ul className="space-y-1.5">
            {historyState.versions.map((v) => (
              <li
                key={v.version_id}
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                    v{v.version_number}
                    {v.version_name ? ` — ${v.version_name}` : ''}
                  </span>
                  {v.status && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {String(v.status).replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {v.created_by || '—'} · {timeAgo(v.created_at)}
                  {v.changes_summary?.steps_count != null ? ` · ${v.changes_summary.steps_count} steps` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
        {scopeWf && (
          <button
            type="button"
            onClick={() => void onOpenWorkflow(scopeWf, 'runs')}
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
          >
            Open execution history
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const renderAiAxis = (): React.ReactNode => (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/40">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            Build with AI — on the canvas
          </h4>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Describe the pipeline you need and the blocks land directly on the canvas as a
          reviewable draft — accept, undo or refine from the docked AI Build bar. No wizard,
          no popups.
        </p>
        <button
          type="button"
          disabled={!createPerm.allowed}
          title={createPerm.allowed ? undefined : 'You do not have permission to create workflows'}
          onClick={() => {
            trackFeatureClick('workflow_cockpit_ai_entry', {});
            onBuildWithAi();
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 dark:disabled:bg-indigo-900"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Start building with AI
        </button>
      </div>
      <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
        Opening an existing workflow gives you the same AI Build bar to refine it — no new
        AI is run from this panel.
      </p>
    </div>
  );

  // ── Axis registry ─────────────────────────────────────────────────────────
  const axes: AxisDef[] = [
    {
      id: 'deployment',
      label: 'Deployments',
      railLabel: 'Deploy',
      icon: Rocket,
      severity: deploymentSeverity,
      badge:
        (agg.pendingApprovals ?? 0) > 0 ? `${agg.pendingApprovals} pending` : undefined,
      render: renderDeploymentAxis,
    },
    {
      id: 'runs',
      label: 'Recent runs',
      railLabel: 'Runs',
      icon: Activity,
      severity: runsSeverity,
      badge: (agg.failures24h ?? 0) > 0 ? `${agg.failures24h} failed (24h)` : undefined,
      render: renderRunsAxis,
    },
    {
      id: 'perf',
      label: 'Performance',
      railLabel: 'Perf',
      icon: Gauge,
      severity: perfSeverity,
      render: renderPerfAxis,
    },
    {
      id: 'cost',
      label: 'Cost',
      railLabel: 'Cost',
      icon: Coins,
      severity: costSeverity,
      render: renderCostAxis,
    },
    {
      id: 'history',
      label: 'Version history',
      railLabel: 'History',
      icon: History,
      severity: historySeverity,
      render: renderHistoryAxis,
    },
    {
      id: 'ai',
      label: 'AI Build',
      railLabel: 'AI',
      icon: Sparkles,
      severity: 'idle',
      render: renderAiAxis,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <KpiStrip items={kpis} className="shrink-0" />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
        <AxisCockpit
          axes={axes}
          open={open}
          activeAxis={activeAxis}
          onOpenAxis={openAxis}
          onClose={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
