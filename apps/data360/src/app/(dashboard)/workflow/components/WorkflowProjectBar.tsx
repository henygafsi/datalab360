'use client';

/**
 * WorkflowProjectBar — the per-project right rail for a workflow.
 *
 * Built on the unified glass `ContextBar` (2026 design system). Surfaces the
 * project's operational context as tabs — **Runs · Usage · History · Cost ·
 * Governance** — instead of cramming them into the old header. All five tabs
 * are live: Cost reads `GET /workflow/{id}/cost-summary` (attributed vs total
 * credits, transparently), Governance reads the per-project scorecards from
 * `GET /command-center/projects/{id}/scores` with honest scope labels. When an
 * endpoint isn't deployed on an environment (404/501), the tab degrades to a
 * graceful "coming soon" panel — never a crash, never a faked number.
 *
 * See the Obsidian `_ux-unification` (workflow header → right bar) +
 * `_design-system-2026`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Clock,
  DollarSign,
  GitBranch,
  History,
  Shield,
  Users,
  Lock,
  Crown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { ContextBar, type ContextBarTab } from '@/app/shared/context-bar';
import { ProjectScoreBadges } from '@/app/shared/project-badges';
import {
  getRunSummary,
  getWorkflowCostSummary,
  listRuns,
  listVersions,
} from '@/app/services/api/workflowApi';
import type {
  WorkflowCostSummary,
  WorkflowRun,
  WorkflowRunSummary,
  WorkflowVersion,
} from '@/app/services/api/types';
import {
  getProjectScoreCards,
  type ScoreCard,
} from '@/app/services/command-center/score-cards';
import {
  getWorkflowOutputAccess,
  type OutputAccess,
} from '@/app/services/workflow/output-access';
import CostSummaryCard from '@/app/shared/score-cards/CostSummaryCard';
import { useWorkflowSectionQuery } from './useWorkflowSectionCache';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

/** HTTP status of a failed apiClient call (axios error shape), if any. */
function getErrorStatus(err: unknown): number | null {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Tiny fetch helper matching the codebase idle/running/done/error pattern.
 *
 * When a `cacheKey` is supplied it delegates to the module-level
 * `useWorkflowSectionQuery` cache so re-activating a tab serves cached data
 * instead of refetching from scratch (the panel unmounts inactive sections).
 * Without a `cacheKey` it keeps the original per-instance behaviour, so callers
 * that don't pass one (the now-unused Runs/History tabs) compile untouched.
 */
function useFetch<T>(fn: () => Promise<T>, enabled: boolean, cacheKey?: string | null) {
  const cached = useWorkflowSectionQuery<T>(cacheKey ?? null, fn, { enabled });

  const [state, setState] = useState<AsyncState>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setState('running');
    setError(null);
    setErrorStatus(null);
    try {
      setData(await fn());
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setErrorStatus(getErrorStatus(err));
      setState('error');
    }
    // fn is recreated per render by callers; we intentionally depend only on `enabled`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cacheKey) return; // cached path drives itself
    if (enabled) void reload();
  }, [enabled, reload, cacheKey]);

  if (cacheKey) {
    const mapped: AsyncState =
      cached.state === 'loading'
        ? 'running'
        : cached.state === 'done'
          ? 'done'
          : cached.state === 'error'
            ? 'error'
            : 'idle';
    return {
      state: mapped,
      data: cached.data,
      error: cached.error,
      errorStatus: cached.errorStatus,
      reload: cached.reload,
    };
  }

  return { state, data, error, errorStatus, reload };
}

function Loading() {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="flex-1">
        <span className="break-words">{message}</span>{' '}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

/** Honest panel for capabilities whose backend route isn't deployed (404/501). */
function BackendGap({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{note}</p>
    </div>
  );
}

/** True when a failed call means "route not deployed here yet" (graceful, not an error). */
function isUnavailable(status: number | null): boolean {
  return status === 404 || status === 501;
}

const RUN_TINT: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-600 dark:text-red-400',
  error: 'text-red-600 dark:text-red-400',
  running: 'text-blue-600 dark:text-blue-400',
};

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function RunsTab({ workflowId, enabled }: { workflowId: string; enabled: boolean }) {
  const { state, data, error, reload } = useFetch<{ runs: WorkflowRun[] }>(
    () => listRuns(workflowId, { limit: 25 }),
    enabled,
  );
  if (state === 'running' || state === 'idle') return <Loading />;
  if (state === 'error') return <ErrorRow message={error ?? 'Failed to load runs'} onRetry={reload} />;
  const runs = data?.runs ?? [];
  if (runs.length === 0) return <EmptyState icon={History} compact title="No runs yet" />;
  return (
    <ul className="space-y-1.5">
      {runs.map((r) => {
        const tint = RUN_TINT[r.status?.toLowerCase()] ?? 'text-slate-500';
        return (
          <li
            key={r.run_id}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-[11px] font-semibold capitalize', tint)}>{r.status}</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="h-3 w-3" />
                {fmtDuration(r.duration_seconds)}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              {fmtWhen(r.started_at)} · {r.triggered_by || '—'}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {r.steps_executed}/{r.steps_total} steps
              {r.steps_failed > 0 && <span className="text-red-500"> · {r.steps_failed} failed</span>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function UsageTab({ workflowId, enabled }: { workflowId: string; enabled: boolean }) {
  const { state, data, error, reload } = useFetch<WorkflowRunSummary>(
    () => getRunSummary(workflowId),
    enabled,
    `wf:${workflowId}:usage`,
  );
  if (state === 'running' || state === 'idle') return <Loading />;
  if (state === 'error') return <ErrorRow message={error ?? 'Failed to load usage'} onRetry={reload} />;
  if (!data || data.total_runs === 0) return <EmptyState icon={BarChart3} compact title="No usage yet" />;
  const stat = (label: string, value: string, tint?: string) => (
    <div className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
      <p className={cn('text-base font-semibold', tint ?? 'text-slate-800 dark:text-slate-100')}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {stat('Total runs', String(data.total_runs))}
        {stat('Avg duration', fmtDuration(data.avg_duration_seconds))}
        {stat('Completed', String(data.completed), 'text-emerald-600 dark:text-emerald-400')}
        {stat('Failed', String(data.failed), 'text-red-600 dark:text-red-400')}
      </div>
      <p className="text-[10px] text-slate-400">Last run: {fmtWhen(data.last_run_at)}</p>
    </div>
  );
}

function HistoryTab({ workflowId, enabled }: { workflowId: string; enabled: boolean }) {
  const { state, data, error, reload } = useFetch<{ versions: WorkflowVersion[] }>(
    () => listVersions(workflowId, { limit: 25 }),
    enabled,
  );
  if (state === 'running' || state === 'idle') return <Loading />;
  if (state === 'error') return <ErrorRow message={error ?? 'Failed to load history'} onRetry={reload} />;
  const versions = data?.versions ?? [];
  if (versions.length === 0) return <EmptyState icon={GitBranch} compact title="No versions yet" />;
  return (
    <ul className="space-y-1.5">
      {versions.map((v) => (
        <li key={v.version_id} className="rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              v{v.version_number}
              {v.version_name ? ` · ${v.version_name}` : ''}
            </span>
            <span className="text-[10px] text-slate-400">{fmtWhen(v.created_at)}</span>
          </div>
          {v.description && (
            <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500 dark:text-slate-400">{v.description}</p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-400">by {v.created_by}</p>
        </li>
      ))}
    </ul>
  );
}

// ── Cost tab ────────────────────────────────────────────────────────────────

function fmtCredits(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function shortQueryId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function CostTab({ workflowId, enabled }: { workflowId: string; enabled: boolean }) {
  const { state, data, error, errorStatus, reload } = useFetch<WorkflowCostSummary>(
    () => getWorkflowCostSummary(workflowId),
    enabled,
    `wf:${workflowId}:cost`,
  );
  if (state === 'running' || state === 'idle') return <Loading />;
  if (state === 'error') {
    if (isUnavailable(errorStatus)) {
      return (
        <BackendGap
          title="Cost summary coming soon"
          note="The per-workflow cost endpoint isn't deployed on this environment yet. Run credits will appear here automatically once it ships."
        />
      );
    }
    return <ErrorRow message={error ?? 'Failed to load cost summary'} onRetry={reload} />;
  }
  if (!data) return <EmptyState icon={DollarSign} compact title="No cost data yet" />;

  const byRun = data.by_run ?? [];
  const byWarehouse = data.by_warehouse ?? [];

  return (
    <div className="space-y-2.5">
      {/* Headline (attributed credits + est. USD) · attributed-vs-account-total
          badges · warnings — the ONE shared cost card. The by-run / by-warehouse
          breakdowns below are workflow-specific detail it doesn't carry, so they
          stay to preserve behavior. */}
      <CostSummaryCard data={data} compact />

      {/* Per-run credit breakdown */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          By run
        </p>
        {byRun.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[10px] text-slate-400 dark:border-slate-700">
            No attributed runs in the lookback window.
          </p>
        ) : (
          <ul className="space-y-1">
            {byRun.map((r, i) => {
              const tint = RUN_TINT[(r.state ?? '').toLowerCase()] ?? 'text-slate-500';
              return (
                <li
                  key={r.query_id ?? i}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[10px] text-slate-600 dark:text-slate-300" title={r.query_id ?? undefined}>
                      {shortQueryId(r.query_id)}
                    </p>
                    <p className={cn('text-[10px] font-semibold capitalize', tint)}>
                      {r.state?.toLowerCase() || '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      {fmtCredits(r.credits)} cr
                    </p>
                    <p className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {fmtDuration(r.duration ?? null)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Per-warehouse credit breakdown */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          By warehouse
        </p>
        {byWarehouse.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[10px] text-slate-400 dark:border-slate-700">
            No warehouse credits attributed in the lookback window.
          </p>
        ) : (
          <ul className="space-y-1">
            {byWarehouse.map((w, i) => (
              <li
                key={w.warehouse ?? w.warehouse_name ?? i}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700"
              >
                <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                  {w.warehouse ?? w.warehouse_name ?? '—'}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  {fmtCredits(w.credits)} cr
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Governance tab ──────────────────────────────────────────────────────────

/** Honest scope chip — per-project value vs account-level fallback. */
function ScopeBadge({ scope }: { scope: 'project' | 'account' }) {
  const isProject = scope === 'project';
  return (
    <span
      title={
        isProject
          ? 'Scored from this project’s own data'
          : 'Account-level — no per-project attribution for this dimension yet'
      }
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        isProject
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      )}
    >
      {isProject ? 'project' : 'account-level'}
    </span>
  );
}

export interface OutputTableRef {
  database: string;
  schema: string;
  table: string;
}

const POLICY_LABEL: Record<string, string> = {
  MASKING_POLICY: 'Masking',
  ROW_ACCESS_POLICY: 'Row access (RLS)',
  AGGREGATION_POLICY: 'Aggregation',
  PROJECTION_POLICY: 'Projection',
};

/**
 * Data Access — who can read this workflow's OUTPUT table and under what
 * governance. Real SHOW GRANTS + POLICY_REFERENCES via /workflow/output-access.
 * Answers the "governance of data viewers of outputs" question in-context.
 */
function DataAccessSection({ output, enabled }: { output: OutputTableRef | null; enabled: boolean }) {
  const key = output ? `${output.database}.${output.schema}.${output.table}` : null;
  const { state, data, error, reload } = useFetch<OutputAccess>(
    () => getWorkflowOutputAccess(output!.database, output!.schema, output!.table),
    enabled && !!output,
    key ? `wf:outaccess:${key}` : null,
  );

  if (!output) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-2.5 py-2 dark:border-slate-700">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Users className="h-3.5 w-3.5" /> Data Access
        </div>
        <p className="mt-0.5 text-[10px] text-slate-400">
          Select an output (destination) block to see which roles can read its data and the policies governing it.
        </p>
      </div>
    );
  }
  if (state === 'running' || state === 'idle') return <Loading />;
  if (state === 'error') {
    return <ErrorRow message={error ?? 'Failed to load data access'} onRetry={reload} />;
  }

  const a = data;
  const viewers = a?.viewer_roles ?? [];
  const users = a?.viewer_users ?? [];
  const policies = a?.policies ?? [];
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <Users className="h-3.5 w-3.5" /> Data Access
        </span>
        <span className="truncate text-[9px] text-slate-400" title={a?.table}>{output.table}</span>
      </div>

      {a?.owner && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <Crown className="h-3 w-3 text-amber-500" /> Owner: <span className="font-medium">{a.owner}</span>
        </div>
      )}

      <div className="mt-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Viewer roles ({viewers.length})
        </div>
        {viewers.length === 0 ? (
          <p className="mt-0.5 text-[10px] italic text-slate-400">
            No roles granted read access yet — only the owner can see this output.
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {viewers.map((v) => (
              <span
                key={v.role}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                title={`${v.privilege} on ${a?.table}${v.members?.length ? ' · members: ' + v.members.join(', ') : ''}`}
              >
                <Users className="h-2.5 w-2.5" /> {v.role}
                {v.member_count ? <span className="opacity-60">·{v.member_count}</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>

      {users.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Users with access ({users.length})
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {users.map((u) => (
              <span
                key={u.user}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                title={`via role ${u.via_role}`}
              >
                {u.user}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Governing policies ({policies.length})
        </div>
        {policies.length === 0 ? (
          <p className="mt-0.5 text-[10px] italic text-slate-400">No masking / RLS / aggregation policy on this output.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {policies.map((p, i) => (
              <span
                key={`${p.policy_name}-${i}`}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                title={`${p.policy_name}${p.column ? ' on ' + p.column : ''}`}
              >
                <Lock className="h-2.5 w-2.5" /> {POLICY_LABEL[p.policy_kind] ?? p.policy_kind}
                {p.column ? `: ${p.column}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
      {a?.degraded && (
        <p className="mt-1 text-[9px] italic text-amber-500">Partial: {a.degraded_reasons.join(', ')}</p>
      )}
    </div>
  );
}

export function GovernanceTab({
  workflowId,
  enabled,
  output = null,
}: {
  workflowId: string;
  enabled: boolean;
  output?: OutputTableRef | null;
}) {
  const { state, data, error, errorStatus, reload } = useFetch<ScoreCard[]>(
    () => getProjectScoreCards(workflowId),
    enabled,
    `wf:${workflowId}:scores`,
  );
  // Data Access renders independently of the scorecard fetch state — always show
  // "who can read this output + its governance" when an output block is selected.
  const cards = data ?? [];
  let scoresBody: React.ReactNode;
  if (state === 'running' || state === 'idle') {
    scoresBody = <Loading />;
  } else if (state === 'error') {
    scoresBody = isUnavailable(errorStatus) ? (
      <BackendGap
        title="Project scorecards coming soon"
        note="Per-project DQ / Cost / Performance / Governance scores aren't deployed on this environment yet. They'll appear here automatically once the endpoint ships."
      />
    ) : (
      <ErrorRow message={error ?? 'Failed to load project scores'} onRetry={reload} />
    );
  } else if (cards.length === 0) {
    scoresBody = <EmptyState icon={Shield} compact title="No scores yet" />;
  } else {
    scoresBody = (
      <div className="space-y-1.5">
        {cards.map((card) => (
        <div
          key={card.dimension}
          className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {card.label}
            </span>
            <ScopeBadge scope={card.scope ?? 'account'} />
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span
              className={cn(
                'text-base font-semibold',
                card.value != null
                  ? 'text-slate-800 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {card.value != null
                ? typeof card.value === 'number'
                  ? card.value.toLocaleString()
                  : card.value
                : '—'}
            </span>
            {card.unit && card.value != null && (
              <span className="text-[10px] text-slate-400">{card.unit}</span>
            )}
          </div>
          {card.note && (
            <p className="mt-0.5 text-[10px] italic leading-tight text-slate-400 dark:text-slate-500">
              {card.note}
            </p>
          )}
        </div>
      ))}
        <p className="text-[10px] text-slate-400">
          “account-level” = no per-project attribution for that dimension yet — shown
          honestly, never as project data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <DataAccessSection output={output} enabled={enabled} />
      {scoresBody}
    </div>
  );
}

export interface WorkflowProjectBarProps {
  /** The active workflow/project id; when null the bar shows an empty prompt. */
  workflowId: string | null;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Shown in the panel header (e.g. the workflow name). */
  entityLabel?: string;
  className?: string;
}

export default function WorkflowProjectBar({
  workflowId,
  open,
  defaultOpen,
  onOpenChange,
  entityLabel,
  className,
}: WorkflowProjectBarProps) {
  // Track the panel's open state even when uncontrolled (ContextBar owns it
  // internally then) so tab fetches fire when the user opens the panel.
  const [openInternal, setOpenInternal] = useState(defaultOpen ?? false);
  const isOpen = open ?? openInternal;
  const ready = Boolean(workflowId) && isOpen;
  const id = workflowId ?? '';

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpenInternal(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const tabs: ContextBarTab[] = [
    {
      key: 'runs',
      icon: History,
      label: 'Runs',
      content: workflowId ? (
        <RunsTab workflowId={id} enabled={ready} />
      ) : (
        <EmptyState icon={History} compact title="Open a workflow" />
      ),
    },
    {
      key: 'usage',
      icon: BarChart3,
      label: 'Usage',
      content: workflowId ? (
        <UsageTab workflowId={id} enabled={ready} />
      ) : (
        <EmptyState icon={BarChart3} compact title="Open a workflow" />
      ),
    },
    {
      key: 'history',
      icon: GitBranch,
      label: 'History',
      content: workflowId ? (
        <HistoryTab workflowId={id} enabled={ready} />
      ) : (
        <EmptyState icon={GitBranch} compact title="Open a workflow" />
      ),
    },
    {
      key: 'cost',
      icon: DollarSign,
      label: 'Cost',
      content: workflowId ? (
        <CostTab workflowId={id} enabled={ready} />
      ) : (
        <EmptyState icon={DollarSign} compact title="Open a workflow" />
      ),
    },
    {
      key: 'governance',
      icon: Shield,
      label: 'Governance',
      content: workflowId ? (
        <GovernanceTab workflowId={id} enabled={ready} />
      ) : (
        <EmptyState icon={Shield} compact title="Open a workflow" />
      ),
    },
  ];

  // Header context: workflow name + the compact per-project health badges
  // (Cost $est · DQ · Storage · Perf · Gov). Inline spans only — the ContextBar
  // header renders this inside a <p>.
  const headerLabel = workflowId ? (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {entityLabel && <span className="truncate">{entityLabel}</span>}
      <ProjectScoreBadges projectId={workflowId} includeWorkflowCost />
    </span>
  ) : (
    entityLabel
  );

  return (
    <ContextBar
      className={className}
      tabs={tabs}
      defaultActiveKey="runs"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      entityLabel={headerLabel}
    />
  );
}
