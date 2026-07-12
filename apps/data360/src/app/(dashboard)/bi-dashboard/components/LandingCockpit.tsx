'use client';

/**
 * BiLandingCockpit — the BI landing (dashboard list) right cockpit + KPI strip.
 *
 * Mounts the UNIFIED AxisCockpit primitive on the landing's right edge with
 * five axes, each backed ONLY by endpoints that are already wired:
 *   overview   — counts / status straight from the already-fetched unified list
 *   cost       — GET /bi-dashboard/{id}/cost, fetched LAZILY for the top (most
 *                recently updated) dashboards the first time the axis opens,
 *                so the landing load pays nothing for it
 *   governance — GET /bi-dashboard/{id}/status (+ GET /shares where the status
 *                reports shares), lazily on first open. A dashboard that is
 *                shared but still draft is flagged 'warn' (grantees can't see it)
 *   history    — honest recency feed derived from the list payload; no BI event
 *                feed is wired on the landing, so the axis severity stays 'idle'
 *   ai         — embedded entries into the EXISTING docked AI flows (AI Build
 *                describe / from-source, NL-to-chart inside the editor). No popups.
 *
 * The lazily-fetched signals live in useBiLandingSignals so the KpiStrip under
 * the landing header reuses the exact same data — values render "—" until they
 * are genuinely known (never fake 0s).
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Clock,
  Coins,
  GitBranch,
  Layers,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
  Wand2,
} from 'lucide-react';
import AxisCockpit, {
  type AxisDef,
  type AxisSeverity,
} from '@/app/shared/cockpit/AxisCockpit';
import KpiStrip, { type KpiItem } from '@/app/shared/cockpit/KpiStrip';
import type { UnifiedProject } from '@/app/services/api/projectsApi';
import {
  getDashboardCost,
  getDashboardStatus,
  listDashboardShares,
  isBiRouteUnavailable,
  type DashboardCost,
  type DashboardLiveStatus,
  type DashboardShare,
} from '@/app/services/api/biDashboardApi';

// How many dashboards the lazy axes probe (most recently updated first).
// Bounded so opening an axis costs at most TOP_N status/cost calls.
const TOP_N = 6;

type SignalState = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error';

export interface BiGovRow {
  projectId: string;
  name: string;
  status: DashboardLiveStatus;
  shareCount: number;
  /** Fetched only when shareCount > 0; null = not fetched / fetch failed. */
  shares: DashboardShare[] | null;
  publishedBy: string | null;
  publishedAt: string | null;
}

export interface BiCostRow {
  projectId: string;
  name: string;
  cost: DashboardCost;
}

export interface BiLandingSignals {
  gov: { state: SignalState; rows: BiGovRow[]; failed: number };
  cost: { state: SignalState; rows: BiCostRow[]; failed: number };
  /** Idempotent: no-ops when already loading/loaded. `force` re-fetches. */
  loadGov: (force?: boolean) => void;
  loadCost: (force?: boolean) => void;
}

export function useBiLandingSignals(
  projects: UnifiedProject[],
  listLoading: boolean,
): BiLandingSignals {
  const [gov, setGov] = useState<BiLandingSignals['gov']>({
    state: 'idle',
    rows: [],
    failed: 0,
  });
  const [cost, setCost] = useState<BiLandingSignals['cost']>({
    state: 'idle',
    rows: [],
    failed: 0,
  });

  // The loaders read the freshest list through a ref so their identity stays
  // stable (callers keep them in effect/callback deps without refetch loops).
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  // While the list itself is loading a probe would run against an empty list
  // and freeze as "loaded, 0 rows" — a dishonest 0. Loaders no-op (stay idle)
  // until the list is in; the page re-triggers them once it lands.
  const listLoadingRef = useRef(listLoading);
  listLoadingRef.current = listLoading;
  const govStateRef = useRef<SignalState>('idle');
  const costStateRef = useRef<SignalState>('idle');

  const topTargets = () =>
    [...projectsRef.current]
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
      .slice(0, TOP_N);

  const loadGov = useCallback(async (force = false) => {
    if (listLoadingRef.current) return; // list not in yet — stay honest-idle
    const s = govStateRef.current;
    if (s === 'loading' || (!force && s !== 'idle' && s !== 'error')) return;
    const targets = topTargets();
    if (targets.length === 0) {
      govStateRef.current = 'loaded';
      setGov({ state: 'loaded', rows: [], failed: 0 });
      return;
    }
    govStateRef.current = 'loading';
    setGov((g) => ({ ...g, state: 'loading' }));
    const settled = await Promise.allSettled(
      targets.map((p) => getDashboardStatus(p.project_id)),
    );
    const rows: BiGovRow[] = [];
    let failed = 0;
    let unavailable = 0;
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        rows.push({
          projectId: targets[i].project_id,
          name: res.value.name ?? targets[i].name,
          status: res.value.status === 'live' ? 'live' : 'draft',
          shareCount: res.value.share_count ?? 0,
          shares: null,
          publishedBy: res.value.published_by ?? null,
          publishedAt: res.value.published_at ?? null,
        });
      } else {
        failed += 1;
        if (isBiRouteUnavailable(res.reason)) unavailable += 1;
      }
    });
    // Every probe 404/501 → the status route isn't provisioned on this backend
    // yet. Honest 'unavailable' (feature absent), not an error.
    if (rows.length === 0 && unavailable === settled.length) {
      govStateRef.current = 'unavailable';
      setGov({ state: 'unavailable', rows: [], failed });
      return;
    }
    if (rows.length === 0) {
      govStateRef.current = 'error';
      setGov({ state: 'error', rows: [], failed });
      return;
    }
    // Shares detail only where the status says there is something to list.
    const withShares = rows.filter((r) => r.shareCount > 0);
    if (withShares.length > 0) {
      const shareSettled = await Promise.allSettled(
        withShares.map((r) => listDashboardShares(r.projectId)),
      );
      shareSettled.forEach((res, i) => {
        if (res.status === 'fulfilled') withShares[i].shares = res.value;
      });
    }
    govStateRef.current = 'loaded';
    setGov({ state: 'loaded', rows, failed });
  }, []);

  const loadCost = useCallback(async (force = false) => {
    if (listLoadingRef.current) return; // list not in yet — stay honest-idle
    const s = costStateRef.current;
    if (s === 'loading' || (!force && s !== 'idle' && s !== 'error')) return;
    const targets = topTargets();
    if (targets.length === 0) {
      costStateRef.current = 'loaded';
      setCost({ state: 'loaded', rows: [], failed: 0 });
      return;
    }
    costStateRef.current = 'loading';
    setCost((c) => ({ ...c, state: 'loading' }));
    const settled = await Promise.allSettled(
      targets.map((p) => getDashboardCost(p.project_id)),
    );
    const rows: BiCostRow[] = [];
    let failed = 0;
    let unavailable = 0;
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        rows.push({
          projectId: targets[i].project_id,
          name: res.value.name ?? targets[i].name,
          cost: res.value,
        });
      } else {
        failed += 1;
        if (isBiRouteUnavailable(res.reason)) unavailable += 1;
      }
    });
    if (rows.length === 0 && unavailable === settled.length) {
      costStateRef.current = 'unavailable';
      setCost({ state: 'unavailable', rows: [], failed });
      return;
    }
    if (rows.length === 0) {
      costStateRef.current = 'error';
      setCost({ state: 'error', rows: [], failed });
      return;
    }
    costStateRef.current = 'loaded';
    setCost({ state: 'loaded', rows, failed });
  }, []);

  return { gov, cost, loadGov, loadCost };
}

// ---------------------------------------------------------------------------
// Derived stats shared by the KPI strip and the axes (honest: null = unknown)
// ---------------------------------------------------------------------------

interface BiLandingStats {
  total: number | null;
  live: number | null;
  shareTotal: number | null;
  /** Dashboards that are shared but still draft (grantees can't see them). */
  warnRows: BiGovRow[];
  scanned: number;
  credits: number | null;
  bytesScanned: number | null;
  costKnown: boolean;
  govKnown: boolean;
}

function computeStats(
  projects: UnifiedProject[],
  listLoading: boolean,
  signals: BiLandingSignals,
): BiLandingStats {
  const ids = new Set(projects.map((p) => p.project_id));
  // Join lazily-fetched rows to the live list so deleted dashboards drop out.
  const govRows = signals.gov.rows.filter((r) => ids.has(r.projectId));
  const costRows = signals.cost.rows.filter((r) => ids.has(r.projectId));
  const govKnown = signals.gov.state === 'loaded';
  const costKnown = signals.cost.state === 'loaded';

  let credits: number | null = null;
  let bytesScanned: number | null = null;
  if (costKnown) {
    const c = costRows
      .map((r) => r.cost.credits)
      .filter((v): v is number => typeof v === 'number');
    credits = c.length > 0 ? c.reduce((a, b) => a + b, 0) : null;
    const b = costRows
      .map((r) => r.cost.bytes_scanned)
      .filter((v): v is number => typeof v === 'number');
    bytesScanned = b.length > 0 ? b.reduce((a, b2) => a + b2, 0) : null;
  }

  return {
    total: listLoading ? null : projects.length,
    live: govKnown ? govRows.filter((r) => r.status === 'live').length : null,
    shareTotal: govKnown
      ? govRows.reduce((sum, r) => sum + r.shareCount, 0)
      : null,
    warnRows: govKnown
      ? govRows.filter((r) => r.status === 'draft' && r.shareCount > 0)
      : [],
    scanned: govRows.length,
    credits,
    bytesScanned,
    costKnown,
    govKnown,
  };
}

function fmtBytes(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : '—';
}

// ---------------------------------------------------------------------------
// KPI strip (under the landing header)
// ---------------------------------------------------------------------------

export function BiLandingKpis({
  projects,
  listLoading,
  signals,
  onJumpAxis,
}: {
  projects: UnifiedProject[];
  listLoading: boolean;
  signals: BiLandingSignals;
  onJumpAxis: (axis: string) => void;
}) {
  const stats = useMemo(
    () => computeStats(projects, listLoading, signals),
    [projects, listLoading, signals],
  );

  const partialNote =
    stats.govKnown && stats.total != null && stats.scanned < stats.total
      ? `top ${stats.scanned} checked`
      : undefined;

  const items: KpiItem[] = [
    {
      label: 'Dashboards',
      value: stats.total,
      onClick: () => onJumpAxis('overview'),
      title: 'All BI dashboard projects in this account — open Overview',
    },
    {
      label: 'Published',
      value: stats.live,
      dot:
        stats.warnRows.length > 0 ? 'warn' : stats.live != null ? 'ok' : undefined,
      sub:
        stats.warnRows.length > 0
          ? `${stats.warnRows.length} shared but draft`
          : partialNote,
      onClick: () => onJumpAxis('governance'),
      title:
        stats.live == null
          ? 'Publish state loads when the Governance axis opens'
          : 'Live (published) dashboards — open Governance',
    },
    {
      label: 'Shares',
      value: stats.shareTotal,
      sub: partialNote,
      onClick: () => onJumpAxis('governance'),
      title:
        stats.shareTotal == null
          ? 'Share grants load when the Governance axis opens'
          : 'Share grants across dashboards — open Governance',
    },
    {
      label: 'Est. cost',
      value:
        stats.credits != null
          ? `${stats.credits.toFixed(2)} cr`
          : stats.costKnown && stats.bytesScanned != null
            ? fmtBytes(stats.bytesScanned)
            : null,
      sub:
        stats.costKnown && stats.credits == null
          ? stats.bytesScanned != null
            ? 'bytes scanned — credits not attributable'
            : 'not attributable'
          : undefined,
      onClick: () => onJumpAxis('cost'),
      title:
        'Per-dashboard usage loads when the Cost axis opens. Credits on a shared warehouse are only attributable when instrumented.',
    },
    {
      label: 'Recos',
      value: null,
      title: 'No recommendations feed is wired for BI dashboards yet.',
    },
  ];

  return <KpiStrip items={items} />;
}

// ---------------------------------------------------------------------------
// Axis body building blocks
// ---------------------------------------------------------------------------

function AxisNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
      {children}
    </p>
  );
}

function AxisLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-xs text-slate-500 dark:text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

function DashRow({
  href,
  title,
  meta,
  right,
}: {
  href: string;
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-cyan-400 dark:border-slate-700 dark:hover:border-cyan-500"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </div>
        {meta && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
            {meta}
          </div>
        )}
      </div>
      {right}
      <ArrowUpRight
        className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-cyan-500 dark:text-slate-600"
        aria-hidden
      />
    </Link>
  );
}

/**
 * Per-axis highlight chip (Overview axis) — a compact jump-off summarizing one
 * axis from the SAME lazily-fetched signals the axes render (no new endpoints).
 * Honest "—" until the axis' data is genuinely known.
 */
function AxisChip({
  icon: Icon,
  label,
  value,
  tone,
  title,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'idle';
  title: string;
  onClick: () => void;
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300'
      : tone === 'ok'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors hover:brightness-95 dark:hover:brightness-110 ${toneClass}`}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </button>
  );
}

function LivePill({ status }: { status: DashboardLiveStatus }) {
  return status === 'live' ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
      <ShieldCheck className="h-3 w-3" aria-hidden /> Live
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      Draft
    </span>
  );
}

// ---------------------------------------------------------------------------
// The cockpit (right edge of the landing)
// ---------------------------------------------------------------------------

export interface BiLandingCockpitProps {
  projects: UnifiedProject[];
  listLoading: boolean;
  listError: string | null;
  signals: BiLandingSignals;
  open: boolean;
  activeAxis: string | null;
  onOpenAxis: (id: string) => void;
  onClose: () => void;
  /** bi_reporting 'create' gate resolved by the page (fail-open while loading). */
  canCreate: boolean;
  createDeniedReason: string;
  onNewDashboard: () => void;
  onAiBuild: () => void;
  className?: string;
}

export function BiLandingCockpit({
  projects,
  listLoading,
  listError,
  signals,
  open,
  activeAxis,
  onOpenAxis,
  onClose,
  canCreate,
  createDeniedReason,
  onNewDashboard,
  onAiBuild,
  className,
}: BiLandingCockpitProps) {
  const stats = useMemo(
    () => computeStats(projects, listLoading, signals),
    [projects, listLoading, signals],
  );

  const recent = useMemo(
    () =>
      [...projects].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      ),
    [projects],
  );

  const nameOf = (projectId: string, fallback: string) =>
    projects.find((p) => p.project_id === projectId)?.name ?? fallback;
  const liveIds = new Set(projects.map((p) => p.project_id));
  const govRows = signals.gov.rows.filter((r) => liveIds.has(r.projectId));
  const costRows = signals.cost.rows.filter((r) => liveIds.has(r.projectId));

  // --- severities (mission contract: unpublished-with-shares → warn) --------
  const overviewSeverity: AxisSeverity = listError
    ? 'warn'
    : listLoading
      ? 'idle'
      : 'ok';
  const govSeverity: AxisSeverity = stats.govKnown
    ? stats.warnRows.length > 0
      ? 'warn'
      : 'ok'
    : 'idle';
  const costSeverity: AxisSeverity = stats.costKnown ? 'ok' : 'idle';

  const statusBreakdown = useMemo(() => {
    const by = new Map<string, number>();
    projects.forEach((p) => {
      const k = (p.status || 'unknown').toLowerCase();
      by.set(k, (by.get(k) ?? 0) + 1);
    });
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  }, [projects]);

  const axes: AxisDef[] = [
    {
      id: 'overview',
      label: 'Overview',
      railLabel: 'Overview',
      icon: Layers,
      severity: overviewSeverity,
      badge: stats.total != null ? `${stats.total}` : undefined,
      primaryCta: {
        label: 'New Dashboard',
        onClick: onNewDashboard,
        disabled: !canCreate,
        title: !canCreate ? createDeniedReason : undefined,
      },
      render: () => (
        <div className="space-y-4">
          {listLoading && <AxisLoading label="Loading dashboards…" />}
          {!listLoading && listError && (
            <AxisNote>
              The dashboard list failed to load — use Retry in the main area.
              Axis data stays blank rather than showing stale numbers.
            </AxisNote>
          )}
          {!listLoading && !listError && (
            <>
              {/* Per-axis highlight chips — same lazily-fetched signals the
                  axes use; "—" until an axis' probe has genuinely loaded. */}
              <div className="flex flex-wrap gap-1.5" data-testid="bi-axis-chips">
                <AxisChip
                  icon={ShieldCheck}
                  label="Gov"
                  value={
                    stats.govKnown
                      ? stats.warnRows.length > 0
                        ? `${stats.warnRows.length} at risk`
                        : `${stats.live ?? 0} live`
                      : '—'
                  }
                  tone={stats.govKnown ? (stats.warnRows.length > 0 ? 'warn' : 'ok') : 'idle'}
                  title={
                    stats.govKnown
                      ? 'Publish/share posture — open the Governance axis'
                      : 'Loads when the Governance axis opens'
                  }
                  onClick={() => onOpenAxis('governance')}
                />
                <AxisChip
                  icon={Coins}
                  label="Cost"
                  value={
                    stats.credits != null
                      ? `${stats.credits.toFixed(2)} cr`
                      : stats.costKnown && stats.bytesScanned != null
                        ? fmtBytes(stats.bytesScanned)
                        : '—'
                  }
                  tone={stats.costKnown ? 'ok' : 'idle'}
                  title={
                    stats.costKnown
                      ? 'Per-dashboard usage — open the Cost & usage axis'
                      : 'Loads when the Cost axis opens'
                  }
                  onClick={() => onOpenAxis('cost')}
                />
                <AxisChip
                  icon={Clock}
                  label="Activity"
                  value={recent.length > 0 ? fmtDate(recent[0].updated_at) : '—'}
                  tone="idle"
                  title="Most recent dashboard update — open the History axis"
                  onClick={() => onOpenAxis('history')}
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Dashboards
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.total ?? '—'}
                </div>
                {statusBreakdown.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {statusBreakdown.map(([k, n]) => (
                      <span
                        key={k}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      >
                        {k} · {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {recent.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Recently updated
                  </div>
                  {recent.slice(0, 5).map((p) => (
                    <DashRow
                      key={p.project_id}
                      href={`/bi-dashboard/${p.project_id}`}
                      title={p.name}
                      meta={
                        <>
                          <span>{fmtDate(p.updated_at)}</span>
                          {p.current_version_num != null && (
                            <span className="inline-flex items-center gap-0.5">
                              <GitBranch className="h-2.5 w-2.5" aria-hidden />v
                              {p.current_version_num}
                            </span>
                          )}
                        </>
                      }
                    />
                  ))}
                </div>
              ) : (
                <AxisNote>
                  No dashboards yet — create one manually or let AI build it from
                  a description or a source table.
                </AxisNote>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'cost',
      label: 'Cost & usage',
      railLabel: 'Cost',
      icon: Coins,
      severity: costSeverity,
      badge:
        signals.cost.state === 'loaded' ? `top ${costRows.length}` : undefined,
      primaryCta:
        signals.cost.state === 'loaded' || signals.cost.state === 'error'
          ? {
              label: 'Refresh',
              onClick: () => signals.loadCost(true),
              tone: 'neutral',
            }
          : undefined,
      render: () => (
        <div className="space-y-3">
          {signals.cost.state === 'idle' && (
            <AxisNote>Fetching per-dashboard usage…</AxisNote>
          )}
          {signals.cost.state === 'loading' && (
            <AxisLoading label={`Fetching usage for the top ${TOP_N} dashboards…`} />
          )}
          {signals.cost.state === 'unavailable' && (
            <AxisNote>
              The per-dashboard cost route isn&apos;t provisioned on this backend
              yet — nothing to show (no estimates are invented).
            </AxisNote>
          )}
          {signals.cost.state === 'error' && (
            <AxisNote>
              Usage probes failed for all checked dashboards. Use Refresh to
              retry.
            </AxisNote>
          )}
          {signals.cost.state === 'loaded' && (
            <>
              {costRows.length === 0 && (
                <AxisNote>No dashboards to meter yet.</AxisNote>
              )}
              {costRows.map((r) => {
                const act = r.cost.render_activity;
                return (
                  <DashRow
                    key={r.projectId}
                    href={`/bi-dashboard/${r.projectId}`}
                    title={nameOf(r.projectId, r.name)}
                    meta={
                      <>
                        <span>
                          credits{' '}
                          {r.cost.credits != null
                            ? r.cost.credits.toFixed(2)
                            : '—'}
                        </span>
                        <span>
                          scanned{' '}
                          {r.cost.bytes_scanned != null
                            ? fmtBytes(r.cost.bytes_scanned)
                            : '—'}
                        </span>
                        <span>
                          renders{' '}
                          {act && act.render_count != null
                            ? act.render_count
                            : '—'}
                        </span>
                      </>
                    }
                  />
                );
              })}
              {costRows.some((r) => !r.cost.attributable) && (
                <AxisNote>
                  Credits run on a shared warehouse and aren&apos;t attributable
                  per dashboard — &quot;—&quot; is honest, not zero.
                </AxisNote>
              )}
              {signals.cost.failed > 0 && (
                <AxisNote>
                  {signals.cost.failed} of the checked dashboards didn&apos;t
                  return usage.
                </AxisNote>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'governance',
      label: 'Governance',
      railLabel: 'Gov',
      icon: ShieldCheck,
      severity: govSeverity,
      badge:
        stats.govKnown && stats.warnRows.length > 0
          ? `${stats.warnRows.length} at risk`
          : stats.live != null
            ? `${stats.live} live`
            : undefined,
      primaryCta:
        signals.gov.state === 'loaded' || signals.gov.state === 'error'
          ? {
              label: 'Refresh',
              onClick: () => signals.loadGov(true),
              tone: 'neutral',
            }
          : undefined,
      render: () => (
        <div className="space-y-3">
          {signals.gov.state === 'idle' && (
            <AxisNote>Fetching publish state…</AxisNote>
          )}
          {signals.gov.state === 'loading' && (
            <AxisLoading
              label={`Checking publish state for the top ${TOP_N} dashboards…`}
            />
          )}
          {signals.gov.state === 'unavailable' && (
            <AxisNote>
              Publish/share routes aren&apos;t provisioned on this backend yet.
              Dashboards keep working; state shows once the routes are live.
            </AxisNote>
          )}
          {signals.gov.state === 'error' && (
            <AxisNote>
              Status probes failed for all checked dashboards. Use Refresh to
              retry.
            </AxisNote>
          )}
          {signals.gov.state === 'loaded' && (
            <>
              {stats.warnRows.length > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                  {stats.warnRows.length} dashboard
                  {stats.warnRows.length === 1 ? ' is' : 's are'} shared but
                  still draft — grantees can&apos;t see them until published.
                </p>
              )}
              {govRows.length === 0 && (
                <AxisNote>No dashboards to govern yet.</AxisNote>
              )}
              {govRows.map((r) => (
                <div
                  key={r.projectId}
                  className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/bi-dashboard/${r.projectId}`}
                      className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 hover:text-cyan-600 dark:text-slate-100 dark:hover:text-cyan-400"
                    >
                      {nameOf(r.projectId, r.name)}
                    </Link>
                    <LivePill status={r.status} />
                    <span
                      className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-slate-400 dark:text-slate-500"
                      title="Share grants"
                    >
                      <Users className="h-3 w-3" aria-hidden />
                      {r.shareCount}
                    </span>
                  </div>
                  {r.status === 'live' && (r.publishedBy || r.publishedAt) && (
                    <div className="mt-1 text-[10.5px] text-slate-400 dark:text-slate-500">
                      published {r.publishedBy ? `by ${r.publishedBy} ` : ''}
                      {r.publishedAt ? `on ${fmtDate(r.publishedAt)}` : ''}
                    </div>
                  )}
                  {r.shares && r.shares.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {r.shares.map((sh) => (
                        <li
                          key={sh.share_id}
                          className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400"
                        >
                          <span className="rounded bg-slate-100 px-1 py-0.5 font-medium uppercase tracking-wide dark:bg-slate-800">
                            {sh.grantee_type}
                          </span>
                          <span className="truncate">{sh.grantee}</span>
                          <span className="ml-auto shrink-0 text-slate-400 dark:text-slate-500">
                            {sh.access_level}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.status === 'draft' && r.shareCount > 0 && (
                    <div className="mt-1 text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
                      Shared but unpublished — publish it from the editor to make
                      it visible.
                    </div>
                  )}
                </div>
              ))}
              {stats.total != null && govRows.length < stats.total && (
                <AxisNote>
                  Top {govRows.length} most recently updated dashboards checked.
                </AxisNote>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: 'history',
      label: 'History',
      railLabel: 'History',
      icon: Clock,
      severity: 'idle',
      render: () => (
        <div className="space-y-3">
          {listLoading && <AxisLoading label="Loading…" />}
          {!listLoading && recent.length === 0 && (
            <AxisNote>Nothing yet — activity appears as dashboards evolve.</AxisNote>
          )}
          {!listLoading &&
            recent.slice(0, 10).map((p) => (
              <DashRow
                key={p.project_id}
                href={`/bi-dashboard/${p.project_id}`}
                title={p.name}
                meta={
                  <>
                    <span>updated {fmtDate(p.updated_at)}</span>
                    {p.current_version_num != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <GitBranch className="h-2.5 w-2.5" aria-hidden />v
                        {p.current_version_num}
                      </span>
                    )}
                    {p.deployment_version != null && p.deployment_version > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <Rocket className="h-2.5 w-2.5" aria-hidden />
                        deployed v{p.deployment_version}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          {!listLoading && recent.length > 0 && (
            <AxisNote>
              A per-dashboard event feed isn&apos;t wired on the landing yet —
              this is registry recency (create / update / deploy), not a full
              audit trail.
            </AxisNote>
          )}
        </div>
      ),
    },
    {
      id: 'ai',
      label: 'AI',
      railLabel: 'AI',
      icon: Sparkles,
      severity: 'idle',
      primaryCta: {
        label: 'AI Build',
        onClick: onAiBuild,
        disabled: !canCreate,
        title: !canCreate ? createDeniedReason : undefined,
      },
      render: () => (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onAiBuild}
            disabled={!canCreate}
            title={!canCreate ? createDeniedReason : undefined}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-purple-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:border-purple-500"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <Wand2 className="h-3.5 w-3.5 text-purple-500" aria-hidden />
              Describe a dashboard
            </span>
            <span className="mt-0.5 block text-[10.5px] text-slate-500 dark:text-slate-400">
              AI creates the shell, then builds the charts straight onto the
              grid in the editor. Opens the docked AI Build rail.
            </span>
          </button>
          <button
            type="button"
            onClick={onAiBuild}
            disabled={!canCreate}
            title={!canCreate ? createDeniedReason : undefined}
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-purple-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:border-purple-500"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <Table2 className="h-3.5 w-3.5 text-purple-500" aria-hidden />
              Auto-create from a source table
            </span>
            <span className="mt-0.5 block text-[10.5px] text-slate-500 dark:text-slate-400">
              Point AI at a table and get a starter dashboard — switch the rail
              to &quot;From source&quot;.
            </span>
          </button>
          {recent.length > 0 ? (
            <Link
              href={`/bi-dashboard/${recent[0].project_id}`}
              className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-purple-400 dark:border-slate-700 dark:hover:border-purple-500"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <Sparkles className="h-3.5 w-3.5 text-purple-500" aria-hidden />
                Question → chart (NL-to-chart)
              </span>
              <span className="mt-0.5 block text-[10.5px] text-slate-500 dark:text-slate-400">
                Opens &quot;{recent[0].name}&quot; — use the editor&apos;s AI
                Build section to turn a plain-language question into a widget.
              </span>
            </Link>
          ) : (
            <AxisNote>
              NL-to-chart lives inside a dashboard&apos;s editor — create a
              dashboard first.
            </AxisNote>
          )}
        </div>
      ),
    },
  ];

  return (
    <AxisCockpit
      axes={axes}
      open={open}
      activeAxis={activeAxis}
      onOpenAxis={onOpenAxis}
      onClose={onClose}
      widthClassName="w-[360px]"
      className={className}
    />
  );
}
