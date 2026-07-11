'use client';

/**
 * CommandCenterCockpit — Account Overview's adoption of the shared cockpit
 * primitives (`AxisCockpit` + `KpiStrip`, 2026-07-02 unified redesign).
 *
 * One hook — `useCommandCenterCockpit` — owns:
 *   - the cockpit `open` / `activeAxis` state (controlled, deep-linkable),
 *   - a lazy per-axis data cache: an axis fetches ONLY the first time it is
 *     opened, and shell-fetched state (summary / module-health / activity-feed
 *     / cost-breakdown) is REUSED instead of refetched when already loaded,
 *   - the KPI-strip items (honest "—" for anything not yet known — never fake
 *     zeros; each KPI deep-links into its owning axis).
 *
 * Every read goes through already-wired command-center service fns — no new
 * endpoint strings. This is a read-only surface (stats + navigation links),
 * so no `useCanPerform` gating is needed; failures toast + render an inline
 * Retry. Zero popups: everything docked.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  DollarSign,
  Gauge,
  HeartPulse,
  History,
  LayoutDashboard,
  Lock,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { getApiErrorMessage } from '@/lib/api-client';
import { routes } from '@/config/routes';
import {
  getActivityFeed,
  getCostBreakdown,
  getModuleHealth,
  getOverviewKpis,
  getSecurityAudit,
  getWarehousePerformance,
  type OverviewKpiPayload,
  type OverviewRange,
} from '@/app/services/command-center';
import type {
  ActivityFeedResponse,
  CostBreakdownResponse,
  ModuleHealthResponse,
  SecurityAuditResponse,
  SummaryResponse,
  WarehousePerformanceResponse,
} from '@/app/services/command-center/types';
import {
  getCommandCenterRecommendations,
  type CommandCenterRecommendations,
  type RecommendationSeverity,
} from '@/app/services/command-center/recommendations';
import type { AxisDef, AxisSeverity } from '@/app/shared/cockpit/AxisCockpit';
import type { KpiItem } from '@/app/shared/cockpit/KpiStrip';

// Access-requests review surface (same target the Access Requests widget on
// the account-overview page links to; not in the typed route registry yet).
const ACCESS_REVIEW_ROUTE = '/administration/access-center';

// ─── Small helpers (honest formatting: null/unknown → "—", real 0 kept) ─────

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fmtNum(v: number | null | undefined, digits = 0): string {
  return v == null
    ? '—'
    : v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPct(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

function fmtMs(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 60_000) return `${(v / 60_000).toFixed(1)} min`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} s`;
  return `${Math.round(v)} ms`;
}

function relativeTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function daysToRange(d: number): OverviewRange {
  if (d <= 1) return '24h';
  if (d <= 7) return '7d';
  if (d <= 30) return '30d';
  return '90d';
}

// Purge-safe literal class maps (never build class names dynamically).
const MODULE_STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  needs_setup: 'bg-slate-300 dark:bg-slate-600',
  inactive: 'bg-slate-300 dark:bg-slate-600',
};
const NEUTRAL_DOT = 'bg-slate-300 dark:bg-slate-600';

function moduleStatusDot(status: string | undefined): string {
  return MODULE_STATUS_DOT[(status ?? '').toLowerCase()] ?? NEUTRAL_DOT;
}

function eventStatusDot(status: string | undefined): string {
  const s = (status ?? '').toUpperCase();
  if (s.includes('FAIL') || s.includes('ERROR') || s === 'DENIED') {
    return 'bg-red-500';
  }
  if (s.includes('SUCCESS') || s === 'OK' || s === 'COMPLETED') {
    return 'bg-emerald-500';
  }
  return NEUTRAL_DOT;
}

const SEVERITY_RANK: Record<RecommendationSeverity, number> = {
  critical: 0,
  high: 1,
  warning: 2,
  info: 3,
};
const SEVERITY_DOT: Record<RecommendationSeverity, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  warning: 'bg-amber-400',
  info: 'bg-blue-500',
};

// ─── Lazy per-axis fetch state ───────────────────────────────────────────────

type AxisFetchStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AxisFetchState<T> {
  status: AxisFetchStatus;
  data: T | null;
}

const IDLE = { status: 'idle', data: null } as const;

// ─── Shared body building blocks ─────────────────────────────────────────────

function AxisSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading axis data">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={`axis-skeleton-${i}`}
          className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}

function AxisError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Couldn&apos;t load this data right now.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <RefreshCw className="h-3 w-3" aria-hidden />
        Retry
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0 dark:text-slate-500">
      {children}
    </h4>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'warn' | 'blocker';
}) {
  const toneCls =
    tone === 'blocker'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-900 dark:text-white';
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-xs font-semibold ${toneCls}`}>{value}</span>
    </div>
  );
}

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {children}
    </Link>
  );
}

// ─── Axis bodies ─────────────────────────────────────────────────────────────

function OverviewAxisBody({
  state,
  summary,
  onRetry,
}: {
  state: AxisFetchState<OverviewKpiPayload>;
  summary: SummaryResponse | null;
  onRetry: () => void;
}) {
  if (state.status === 'loading' && !state.data) return <AxisSkeleton />;
  // Hard failure with no rollup fallback either → inline retry.
  if (state.status === 'error' && !state.data && !summary) {
    return <AxisError onRetry={onRetry} />;
  }
  // `_provisioned === false` is the synthetic empty payload — don't read
  // fabricated zeros from it; fall back to the live summary rollup.
  const k = state.data && state.data._provisioned !== false ? state.data : null;
  const openAlerts = num(k?.open_alerts);
  return (
    <div>
      {state.data?._provisioned === false && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          The overview KPI cache isn&apos;t provisioned yet — showing the live
          rollup instead.
        </p>
      )}
      <SectionLabel>Scores</SectionLabel>
      <StatRow
        label="Workspace health"
        value={fmtPct(num(k?.workspace_health_pct) ?? num(summary?.quality?.health_score))}
      />
      <StatRow label="Data warehouse health" value={fmtPct(num(k?.snowflake_health_pct))} />
      <StatRow label="Optimization score" value={fmtPct(num(k?.optimization_score_pct))} />
      <StatRow
        label="Open alerts"
        value={fmtNum(openAlerts)}
        tone={(openAlerts ?? 0) > 0 ? 'warn' : undefined}
      />
      <SectionLabel>Account</SectionLabel>
      <StatRow
        label="Users"
        value={fmtNum(num(k?.data360_users) ?? num(summary?.platform?.total_users))}
      />
      <StatRow
        label="Active projects"
        value={fmtNum(num(k?.active_projects) ?? num(summary?.platform?.total_projects))}
      />
      <StatRow
        label="Modules active"
        value={
          k
            ? `${fmtNum(num(k.modules_active))} / ${fmtNum(num(k.modules_total))}`
            : '—'
        }
      />
      <StatRow
        label="Credits used"
        value={fmtNum(num(k?.credits_used) ?? num(summary?.cost?.credits_30d), 1)}
      />
      {k?.computed_at && (
        <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
          Computed {relativeTime(k.computed_at)}
        </p>
      )}
    </div>
  );
}

function CostAxisBody({
  eff,
  state,
  days,
  onRetry,
}: {
  eff: CostBreakdownResponse | null;
  state: AxisFetchState<CostBreakdownResponse>;
  days: number;
  onRetry: () => void;
}) {
  if (!eff) {
    if (state.status === 'error') return <AxisError onRetry={onRetry} />;
    return <AxisSkeleton />;
  }
  const trend = num(eff.credit_trend_pct);
  const top = (eff.top_warehouses ?? []).slice(0, 5);
  return (
    <div>
      <SectionLabel>Total spend ({days}d)</SectionLabel>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-bold leading-tight text-slate-900 dark:text-white">
          {fmtNum(num(eff.total_credits), 1)}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">credits</span>
        {trend != null && (
          <span
            className={`text-[11px] font-bold ${
              trend > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {trend > 0 ? '+' : ''}
            {trend.toFixed(1)}% vs previous
          </span>
        )}
      </div>
      <SectionLabel>Top warehouses</SectionLabel>
      {top.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No warehouse spend in this window.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {top.map((w) => (
            <li
              key={w.name}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span
                className="min-w-0 truncate font-mono text-[11px] text-slate-600 dark:text-slate-300"
                title={w.name}
              >
                {w.name}
              </span>
              <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                {fmtNum(num(w.credits), 1)} cr
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IngestionAxisBody() {
  // Self-contained (fetches on first mount) — the 8th standardized axis.
  // Binds the SAME data-operations overview the Usage & Performance tab uses.
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; summary?: Record<string, unknown> }>({ status: 'loading' });
  const load = useCallback(() => {
    setState({ status: 'loading' });
    import('@/app/services/org-accounts/hooks')
      .then((m) => m.getDataOperationsOverview({ days: 30 }))
      .then((d: any) => setState({ status: 'ready', summary: d?.summary ?? {} }))
      .catch(() => setState({ status: 'error' }));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (state.status === 'loading') return <AxisSkeleton />;
  if (state.status === 'error') return <AxisError onRetry={load} />;
  const g = (k: string) => num((state.summary as any)?.[k]);
  return (
    <div>
      <SectionLabel>Loading (30d)</SectionLabel>
      <StatRow label="Files loaded" value={fmtNum(g('total_files_loaded'))} />
      <StatRow label="Rows loaded" value={fmtNum(g('total_rows_loaded'))} />
      <StatRow label="Load success" value={g('load_success_rate') != null ? `${g('load_success_rate')}%` : '—'} />
      <StatRow label="Load errors" value={fmtNum(g('load_error_count'))} />
      <SectionLabel>Automation</SectionLabel>
      <StatRow label="Task runs" value={fmtNum(g('total_task_runs'))} />
      <StatRow label="Task failures" value={fmtNum(g('task_failure_count'))} />
      <StatRow label="Active tasks" value={fmtNum(g('active_tasks'))} />
      <StatRow label="Pipes" value={fmtNum(g('pipe_count'))} />
      <StatRow label="Dynamic tables" value={fmtNum(g('dynamic_tables'))} />
    </div>
  );
}

function PerfAxisBody({
  state,
  onRetry,
}: {
  state: AxisFetchState<WarehousePerformanceResponse>;
  onRetry: () => void;
}) {
  const eff = state.data;
  if (!eff) {
    if (state.status === 'error') return <AxisError onRetry={onRetry} />;
    return <AxisSkeleton />;
  }
  const qp = eff.query_performance;
  const failed = num(qp?.failed_queries_7d);
  const topWh = [...(eff.warehouses ?? [])]
    .sort((a, b) => (num(b.utilization_pct) ?? 0) - (num(a.utilization_pct) ?? 0))
    .slice(0, 5);
  return (
    <div>
      <SectionLabel>Queries (7d)</SectionLabel>
      <StatRow label="Total queries" value={fmtNum(num(qp?.total_queries_7d))} />
      <StatRow label="Avg execution" value={fmtMs(num(qp?.avg_execution_ms))} />
      <StatRow label="p95 execution" value={fmtMs(num(qp?.p95_execution_ms))} />
      <StatRow
        label="Failed"
        value={fmtNum(failed)}
        tone={(failed ?? 0) > 0 ? 'warn' : undefined}
      />
      <StatRow label="Queued" value={fmtNum(num(qp?.queued_queries_7d))} />
      <SectionLabel>Busiest warehouses</SectionLabel>
      {topWh.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No warehouse activity in this window.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {topWh.map((w) => (
            <li key={w.name} className="flex items-baseline gap-3 text-xs">
              <span
                className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600 dark:text-slate-300"
                title={w.name}
              >
                {w.name}
              </span>
              <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                {fmtNum(num(w.credits_used), 1)} cr
              </span>
              <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                {fmtPct(num(w.utilization_pct))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QualityAxisBody({
  summary,
  eff,
  state,
  onRetry,
}: {
  summary: SummaryResponse | null;
  eff: ModuleHealthResponse | null;
  state: AxisFetchState<ModuleHealthResponse>;
  onRetry: () => void;
}) {
  const q = summary?.quality;
  if (!eff && !q) {
    if (state.status === 'error') return <AxisError onRetry={onRetry} />;
    return <AxisSkeleton />;
  }
  const freshness = num(q?.freshness_violations);
  const mods = eff?.modules ?? [];
  return (
    <div>
      <SectionLabel>Data quality</SectionLabel>
      <StatRow label="Health score" value={fmtPct(num(q?.health_score))} />
      <StatRow
        label="Freshness violations"
        value={fmtNum(freshness)}
        tone={(freshness ?? 0) > 0 ? 'warn' : undefined}
      />
      <StatRow label="Tables monitored" value={fmtNum(num(q?.total_tables))} />
      <SectionLabel>Module health</SectionLabel>
      {mods.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {state.status === 'loading'
            ? 'Loading module health…'
            : 'Module health data is unavailable right now.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {mods.slice(0, 12).map((m) => (
            <li
              key={m.module_key || m.module}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${moduleStatusDot(m.status)}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                {m.module || '—'}
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {m.status || '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiAxisBody({
  state,
  onOpenPlan,
  onRetry,
}: {
  state: AxisFetchState<CommandCenterRecommendations>;
  onOpenPlan: () => void;
  onRetry: () => void;
}) {
  const eff = state.data;
  if (!eff) {
    if (state.status === 'error') return <AxisError onRetry={onRetry} />;
    return <AxisSkeleton />;
  }
  const critical = num(eff.total_critical);
  const top = [...(eff.recommendations ?? [])]
    .sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    )
    .slice(0, 3);
  return (
    <div>
      <SectionLabel>Recommendations</SectionLabel>
      <StatRow label="Open" value={fmtNum(num(eff.total_open))} />
      <StatRow
        label="Critical"
        value={fmtNum(critical)}
        tone={(critical ?? 0) > 0 ? 'warn' : undefined}
      />
      <SectionLabel>Top 3</SectionLabel>
      {top.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No open recommendations — nothing to fix right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {top.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[r.severity] ?? NEUTRAL_DOT}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-snug text-slate-800 dark:text-slate-200">
                    {r.title}
                  </p>
                  {r.detail && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {r.detail}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {r.cta?.action === 'navigate' && r.cta.target?.startsWith('/') ? (
                      <Link
                        href={r.cta.target}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {r.cta.label || 'Open'}
                      </Link>
                    ) : (
                      // install/refresh CTAs are mutations — they stay on the
                      // gated DWH Action Plan surface; deep-link there instead.
                      <button
                        type="button"
                        onClick={onOpenPlan}
                        className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Open action plan
                      </button>
                    )}
                    {r.roi?.estimate && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {r.roi.estimate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GovernanceAxisBody({
  state,
  onRetry,
}: {
  state: AxisFetchState<SecurityAuditResponse>;
  onRetry: () => void;
}) {
  const eff = state.data;
  if (!eff) {
    if (state.status === 'error') return <AxisError onRetry={onRetry} />;
    return <AxisSkeleton />;
  }
  const ls = eff.login_summary;
  const pc = eff.policy_coverage;
  const sd = eff.sensitive_data;
  const failed = num(ls?.failed_logins_7d);
  const unmasked = num(sd?.unmasked_pct);
  return (
    <div>
      <SectionLabel>Logins (7d)</SectionLabel>
      <StatRow label="Total logins" value={fmtNum(num(ls?.total_logins_7d))} />
      <StatRow
        label="Failed logins"
        value={fmtNum(failed)}
        tone={(failed ?? 0) > 0 ? 'blocker' : undefined}
      />
      <StatRow label="Unique users" value={fmtNum(num(ls?.unique_users_7d))} />
      <StatRow label="MFA coverage" value={fmtPct(num(ls?.mfa_enabled_pct))} />
      <SectionLabel>Policy coverage</SectionLabel>
      <StatRow label="Masking policies" value={fmtNum(num(pc?.masking_policies))} />
      <StatRow label="Row-access policies" value={fmtNum(num(pc?.rls_policies))} />
      <StatRow label="Tables covered" value={fmtPct(num(pc?.coverage_pct))} />
      <SectionLabel>Sensitive data</SectionLabel>
      <StatRow
        label="PII columns detected"
        value={fmtNum(num(sd?.pii_columns_detected))}
      />
      <StatRow
        label="Unmasked"
        value={fmtPct(unmasked)}
        tone={(unmasked ?? 0) > 0 ? 'warn' : undefined}
      />
      <SectionLabel>Manage</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <PillLink href={ACCESS_REVIEW_ROUTE}>Access review</PillLink>
        <PillLink href={routes.governance.users}>Users</PillLink>
        <PillLink href={routes.governance.roles}>Roles</PillLink>
        <PillLink href={routes.governance.accessMatrix}>Access matrix</PillLink>
      </div>
    </div>
  );
}

function HistoryAxisBody({
  eff,
  state,
  onRetry,
}: {
  eff: ActivityFeedResponse | null;
  state: AxisFetchState<ActivityFeedResponse>;
  onRetry: () => void;
}) {
  if (!eff) {
    if (state.status === 'error') return <AxisError onRetry={onRetry} />;
    return <AxisSkeleton />;
  }
  const events = (eff.events ?? []).slice(0, 8);
  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        No recent activity in this window.
      </p>
    );
  }
  return (
    <ul className="space-y-2.5">
      {events.map((e, i) => (
        <li
          key={`${e.timestamp ?? 'ts'}-${e.event_type ?? 'evt'}-${i}`}
          className="flex items-start gap-2 text-xs"
        >
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${eventStatusDot(e.status)}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-700 dark:text-slate-200">
              {e.event_type || '—'}
            </p>
            <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
              {e.username || '—'} · {e.module || '—'}
            </p>
          </div>
          <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
            {relativeTime(e.timestamp)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── The hook ────────────────────────────────────────────────────────────────

export interface CommandCenterCockpitArgs {
  /** Global time window (days) driving every axis fetch. */
  days: number;
  /** Shell-fetched state — reused instead of refetched when available. */
  summary: SummaryResponse | null;
  moduleHealth: ModuleHealthResponse | null;
  activityFeed: ActivityFeedResponse | null;
  costData: CostBreakdownResponse | null;
  /** In-page tab navigation (goToTab) for deep-links into owning tabs. */
  onNavigateTab: (tabId: string) => void;
}

export interface CommandCenterCockpit {
  axes: AxisDef[];
  open: boolean;
  activeAxis: string | null;
  openAxis: (id: string) => void;
  close: () => void;
  kpiItems: KpiItem[];
}

export function useCommandCenterCockpit({
  days,
  summary,
  moduleHealth,
  activityFeed,
  costData,
  onNavigateTab,
}: CommandCenterCockpitArgs): CommandCenterCockpit {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [activeAxis, setActiveAxis] = useState<string | null>(null);

  const openAxis = useCallback((id: string) => {
    setActiveAxis(id);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  // Lazy per-axis caches — populated the first time an axis is opened.
  const [overviewState, setOverviewState] =
    useState<AxisFetchState<OverviewKpiPayload>>(IDLE);
  const [costState, setCostState] =
    useState<AxisFetchState<CostBreakdownResponse>>(IDLE);
  const [perfState, setPerfState] =
    useState<AxisFetchState<WarehousePerformanceResponse>>(IDLE);
  const [qualityState, setQualityState] =
    useState<AxisFetchState<ModuleHealthResponse>>(IDLE);
  const [aiState, setAiState] =
    useState<AxisFetchState<CommandCenterRecommendations>>(IDLE);
  const [govState, setGovState] =
    useState<AxisFetchState<SecurityAuditResponse>>(IDLE);
  const [historyState, setHistoryState] =
    useState<AxisFetchState<ActivityFeedResponse>>(IDLE);

  // In-flight guard (also covers React 18 StrictMode double effects in dev).
  const inFlight = useRef<Set<string>>(new Set());

  const runFetch = useCallback(
    async <T,>(
      key: string,
      setState: React.Dispatch<React.SetStateAction<AxisFetchState<T>>>,
      fn: () => Promise<T>,
      label: string,
    ) => {
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      setState((s) => ({ ...s, status: 'loading' }));
      try {
        const data = await fn();
        setState({ status: 'ready', data });
      } catch (e) {
        setState((s) => ({ ...s, status: 'error' }));
        toast.error(getApiErrorMessage(e) || `Couldn't load ${label}`);
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
      ),
    [days, runFetch],
  );
  const loadCost = useCallback(
    () =>
      runFetch('cost', setCostState, () => getCostBreakdown(days), 'the cost breakdown'),
    [days, runFetch],
  );
  const loadPerf = useCallback(
    () =>
      runFetch(
        'perf',
        setPerfState,
        () => getWarehousePerformance({ days }),
        'warehouse performance',
      ),
    [days, runFetch],
  );
  const loadQuality = useCallback(
    () =>
      runFetch('quality', setQualityState, () => getModuleHealth({ days }), 'module health'),
    [days, runFetch],
  );
  const loadAi = useCallback(
    () =>
      runFetch(
        'ai',
        setAiState,
        () => getCommandCenterRecommendations(days),
        'AI recommendations',
      ),
    [days, runFetch],
  );
  const loadGov = useCallback(
    () =>
      runFetch('gov', setGovState, () => getSecurityAudit({ days }), 'the security audit'),
    [days, runFetch],
  );
  const loadHistory = useCallback(
    () =>
      runFetch(
        'history',
        setHistoryState,
        () => getActivityFeed(8, { days }),
        'the activity feed',
      ),
    [days, runFetch],
  );

  // Time-window change invalidates every lazy cache (refetched on next open).
  const prevDaysRef = useRef(days);
  useEffect(() => {
    if (prevDaysRef.current === days) return;
    prevDaysRef.current = days;
    setOverviewState(IDLE);
    setCostState(IDLE);
    setPerfState(IDLE);
    setQualityState(IDLE);
    setAiState(IDLE);
    setGovState(IDLE);
    setHistoryState(IDLE);
  }, [days]);

  // Lazy trigger: fetch an axis's data ONLY when it is opened, and only when
  // the shell hasn't already loaded an equivalent payload.
  useEffect(() => {
    if (!open || !activeAxis) return;
    switch (activeAxis) {
      case 'overview':
        if (overviewState.status === 'idle') void loadOverview();
        break;
      case 'cost':
        if (!costData && costState.status === 'idle') void loadCost();
        break;
      case 'perf':
        if (perfState.status === 'idle') void loadPerf();
        break;
      case 'quality':
        if (!moduleHealth && qualityState.status === 'idle') void loadQuality();
        break;
      case 'ai':
        if (aiState.status === 'idle') void loadAi();
        break;
      case 'governance':
        if (govState.status === 'idle') void loadGov();
        break;
      case 'history':
        if (!activityFeed && historyState.status === 'idle') void loadHistory();
        break;
    }
  }, [
    open,
    activeAxis,
    costData,
    moduleHealth,
    activityFeed,
    overviewState.status,
    costState.status,
    perfState.status,
    qualityState.status,
    aiState.status,
    govState.status,
    historyState.status,
    loadOverview,
    loadCost,
    loadPerf,
    loadQuality,
    loadAi,
    loadGov,
    loadHistory,
  ]);

  // Effective data: prefer what the shell already fetched.
  const costEff = costData ?? costState.data;
  const qualityEff = moduleHealth ?? qualityState.data;
  const historyEff = activityFeed ?? historyState.data;

  // ── Cheap severity derivations (rail dots + KPI dots) ──────────────────────

  const failedLogins =
    num(govState.data?.login_summary?.failed_logins_7d) ??
    num(summary?.security?.failed_logins_7d);
  const govSeverity: AxisSeverity =
    failedLogins == null ? 'idle' : failedLogins > 0 ? 'blocker' : 'ok';

  const aiCritical = num(aiState.data?.total_critical);
  const aiOpen = num(aiState.data?.total_open);
  const aiSeverity: AxisSeverity =
    aiState.data == null ? 'idle' : (aiCritical ?? 0) > 0 ? 'warn' : 'ok';

  let moduleCounts: {
    healthy: number;
    degraded: number;
    critical: number;
    total: number;
  } | null = null;
  const mods = qualityEff?.modules;
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

  const costTrend = num(costEff?.credit_trend_pct) ?? num(summary?.cost?.credit_trend_pct);
  const costKnown = costEff != null || summary != null;
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

  const historySeverity: AxisSeverity = historyEff ? 'ok' : 'idle';

  // ── Axes (render bodies stay lazy: only the active axis body is rendered) ──

  const axes: AxisDef[] = [
    {
      id: 'overview',
      label: 'Overview',
      railLabel: 'Overview',
      icon: LayoutDashboard,
      severity: overviewSeverity,
      badge:
        (openAlerts ?? 0) > 0 ? `${fmtNum(openAlerts)} alerts` : undefined,
      render: () => (
        <OverviewAxisBody state={overviewState} summary={summary} onRetry={loadOverview} />
      ),
    },
    {
      id: 'cost',
      label: 'Cost',
      railLabel: 'Cost',
      icon: DollarSign,
      severity: costSeverity,
      render: () => (
        <CostAxisBody eff={costEff} state={costState} days={days} onRetry={loadCost} />
      ),
      primaryCta: {
        label: 'Open FinOps',
        onClick: () => onNavigateTab('finops'),
        tone: 'neutral',
      },
    },
    {
      id: 'perf',
      label: 'Performance',
      railLabel: 'Perf',
      icon: Gauge,
      severity: perfSeverity,
      render: () => <PerfAxisBody state={perfState} onRetry={loadPerf} />,
    },
    {
      id: 'quality',
      label: 'Quality',
      railLabel: 'Quality',
      icon: HeartPulse,
      severity: qualitySeverity,
      badge:
        moduleCounts && moduleCounts.critical > 0
          ? `${moduleCounts.critical} critical`
          : undefined,
      render: () => (
        <QualityAxisBody
          summary={summary}
          eff={qualityEff}
          state={qualityState}
          onRetry={loadQuality}
        />
      ),
      primaryCta: {
        label: 'Modules',
        onClick: () => onNavigateTab('modules'),
        tone: 'neutral',
      },
    },
    {
      id: 'ingestion',
      label: 'Ingestion',
      railLabel: 'Ingest',
      icon: UploadCloud,
      severity: 'idle',
      render: () => <IngestionAxisBody />,
    },
    {
      id: 'ai',
      label: 'AI recommendations',
      railLabel: 'AI',
      icon: Sparkles,
      severity: aiSeverity,
      badge: aiOpen != null ? `${fmtNum(aiOpen)} open` : undefined,
      render: () => (
        <AiAxisBody
          state={aiState}
          onOpenPlan={() => onNavigateTab('dwh-plan')}
          onRetry={loadAi}
        />
      ),
      primaryCta: {
        label: 'Action plan',
        onClick: () => onNavigateTab('dwh-plan'),
      },
    },
    {
      id: 'governance',
      label: 'Governance',
      railLabel: 'Gov',
      icon: Lock,
      severity: govSeverity,
      badge:
        failedLogins != null && failedLogins > 0
          ? `${fmtNum(failedLogins)} failed logins`
          : undefined,
      render: () => <GovernanceAxisBody state={govState} onRetry={loadGov} />,
      primaryCta: {
        label: 'Access review',
        onClick: () => router.push(ACCESS_REVIEW_ROUTE),
      },
    },
    {
      id: 'history',
      label: 'History',
      railLabel: 'History',
      icon: History,
      severity: historySeverity,
      render: () => (
        <HistoryAxisBody eff={historyEff} state={historyState} onRetry={loadHistory} />
      ),
      primaryCta: {
        label: 'All activity',
        onClick: () => onNavigateTab('platform-activity'),
        tone: 'neutral',
      },
    },
  ];

  // ── KPI strip (honest "—" via undefined; every KPI opens its owning axis) ──

  const totalUsers = num(summary?.platform?.total_users);
  const activeUsers7d = num(summary?.platform?.active_users_7d);
  const credits =
    num(costEff?.total_credits) ??
    (days === 30 ? num(summary?.cost?.credits_30d) : null);
  const p95 = num(perfState.data?.query_performance?.p95_execution_ms);
  const healthScore = num(summary?.quality?.health_score);

  const kpiItems: KpiItem[] = [
    {
      label: 'Users',
      value: totalUsers != null ? fmtNum(totalUsers) : undefined,
      dot: totalUsers != null ? 'ok' : 'idle',
      sub: activeUsers7d != null ? `${fmtNum(activeUsers7d)} active (7d)` : undefined,
      onClick: () => openAxis('overview'),
      title: 'Platform users — open the Overview axis',
    },
    {
      label: `Cost (${days}d)`,
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
      onClick: () => openAxis('cost'),
      title: 'Credit spend — open the Cost axis',
    },
    {
      label: 'p95 latency',
      value: p95 != null ? fmtMs(p95) : undefined,
      dot: perfSeverity,
      sub:
        perfState.data != null
          ? `${fmtNum(num(perfState.data.query_performance?.total_queries_7d))} queries (7d)`
          : undefined,
      onClick: () => openAxis('perf'),
      title: 'Query p95 — open the Performance axis',
    },
    {
      label: 'Module health',
      // healthScore is summary.quality.health_score — the DATA-QUALITY score,
      // not module health. Using it as this tile's value produced
      // "Module health 24% · all modules healthy" (live-caught contradiction).
      // Value = the real module count; the DQ score rides the subtitle,
      // labeled as what it is.
      value: moduleCounts
        ? `${moduleCounts.healthy}/${moduleCounts.total}`
        : healthScore != null
          ? `${Math.round(healthScore)}%`
          : undefined,
      dot: qualitySeverity,
      sub: moduleCounts
        ? moduleCounts.critical > 0
          ? `${moduleCounts.critical} critical`
          : moduleCounts.degraded > 0
            ? `${moduleCounts.degraded} degraded`
            : healthScore != null
              ? `all healthy · DQ ${Math.round(healthScore)}%`
              : 'all modules healthy'
        : healthScore != null
          ? `DQ score ${Math.round(healthScore)}%`
          : undefined,
      onClick: () => openAxis('quality'),
      title: 'Quality & module health — open the Quality axis',
    },
    {
      label: 'Open recos',
      value: aiOpen != null ? fmtNum(aiOpen) : undefined,
      dot: aiSeverity,
      delta:
        (aiCritical ?? 0) > 0
          ? { text: `${fmtNum(aiCritical)} critical`, tone: 'warn' }
          : undefined,
      onClick: () => openAxis('ai'),
      title: 'AI recommendations — open the AI axis',
    },
    {
      label: 'Security alerts',
      value: failedLogins != null ? fmtNum(failedLogins) : undefined,
      dot: govSeverity,
      sub: 'failed logins (7d)',
      onClick: () => openAxis('governance'),
      title: 'Security posture — open the Governance axis',
    },
  ];

  return { axes, open, activeAxis, openAxis, close, kpiItems };
}
