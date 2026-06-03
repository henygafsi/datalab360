'use client';

/**
 * WorkflowProjectBar — the per-project right rail for a workflow.
 *
 * Built on the unified glass `ContextBar` (2026 design system). Surfaces the
 * project's operational context as tabs — **Runs · Usage · History · Cost ·
 * Governance** — instead of cramming them into the old header. Live tabs read
 * the existing workflow services; Cost and project-scoped Governance have no
 * backend endpoint yet, so they show an honest "not available" panel (never a
 * faked number) and light up when the route ships.
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { ContextBar, type ContextBarTab } from '@/app/shared/context-bar';
import {
  getRunSummary,
  listRuns,
  listVersions,
} from '@/app/services/api/workflowApi';
import type {
  WorkflowRun,
  WorkflowRunSummary,
  WorkflowVersion,
} from '@/app/services/api/types';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

/** Tiny fetch helper matching the codebase idle/running/done/error pattern. */
function useFetch<T>(fn: () => Promise<T>, enabled: boolean) {
  const [state, setState] = useState<AsyncState>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState('running');
    setError(null);
    try {
      setData(await fn());
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
    // fn is recreated per render by callers; we intentionally depend only on `enabled`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { state, data, error, reload };
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

/** Honest panel for capabilities with no backend route yet. */
function BackendGap({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{note}</p>
    </div>
  );
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

function UsageTab({ workflowId, enabled }: { workflowId: string; enabled: boolean }) {
  const { state, data, error, reload } = useFetch<WorkflowRunSummary>(
    () => getRunSummary(workflowId),
    enabled,
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
  const isOpen = open ?? defaultOpen ?? false;
  const ready = Boolean(workflowId) && isOpen;
  const id = workflowId ?? '';

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
      content: (
        <BackendGap
          title="Per-run cost not available yet"
          note="A precise /workflow/{id}/cost-summary endpoint is a backend ask. Run credits will appear here once it ships."
        />
      ),
    },
    {
      key: 'governance',
      icon: Shield,
      label: 'Governance',
      content: (
        <BackendGap
          title="Workflow-scoped governance not available yet"
          note="Grants for this workflow's objects are managed in the Governance module; a per-workflow rollup is a backend ask."
        />
      ),
    },
  ];

  return (
    <ContextBar
      className={className}
      tabs={tabs}
      defaultActiveKey="runs"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      entityLabel={entityLabel}
    />
  );
}
