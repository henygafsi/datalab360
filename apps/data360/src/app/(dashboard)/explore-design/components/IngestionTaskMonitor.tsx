'use client';

/**
 * Ingestion Task Monitor — the missing visibility over the project's scheduled
 * Snowflake tasks (INGESTION_ and DEPLOY_ families). Shows live state, schedule,
 * last-run outcome, next run and auto-suspend reason, with rights-gated pause /
 * resume / run-now. Backs GET /explore-design/{id}/ingestion/tasks. Data-first:
 * skeleton until the monitor lands; honest empty + degraded states.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Pause, Play, RefreshCw, XCircle, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  getIngestionTaskMonitor, resumeIngestionTask, runIngestionTaskNow,
  suspendIngestionTask, type IngestionTask,
} from '@/app/services/explore-design';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATE_STYLE: Record<string, string> = {
  started: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};
const RUN_ICON: Record<string, React.ElementType> = {
  SUCCEEDED: CheckCircle2, FAILED: XCircle, FAILED_AND_AUTO_SUSPENDED: XCircle,
  CANCELLED: XCircle, SKIPPED: Clock, EXECUTING: Loader2, SCHEDULED: Clock,
};

export default function IngestionTaskMonitor({ projectId }: { projectId: string | null }) {
  const [tasks, setTasks] = useState<IngestionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // action in flight per task name

  // Operate rights: same gate the backend enforces (design/canvas/deploy).
  const operatePerm = useCanPerform('explore_design', 'deploy', projectId);
  const canOperate = operatePerm.allowed || operatePerm.loading;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getIngestionTaskMonitor(projectId);
      setTasks(res.tasks ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(
    async (task: IngestionTask, kind: 'suspend' | 'resume' | 'run') => {
      if (!projectId) return;
      setBusy(task.name);
      try {
        if (kind === 'suspend') await suspendIngestionTask(projectId);
        else if (kind === 'resume') await resumeIngestionTask(projectId);
        else await runIngestionTaskNow(projectId);
        toast.success(
          kind === 'run' ? `${task.name}: run requested` : `${task.name} ${kind}d`,
        );
        await load();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [projectId, load],
  );

  if (!projectId) {
    return <p className="p-4 text-[11px] text-slate-500 dark:text-slate-400">Select a project to monitor its ingestion tasks.</p>;
  }
  if (loading) {
    return (
      <div className="space-y-2 p-1" aria-busy="true">
        {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Task monitor unavailable: {error}
        <button onClick={load} className="ml-2 underline">Retry</button>
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-4 text-center dark:border-slate-600">
        <Clock className="mx-auto mb-2 h-5 w-5 text-slate-400" aria-hidden="true" />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">No scheduled tasks</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Schedule an ingestion or a deployment and its Snowflake task will appear here with live state and controls.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Scheduled tasks ({tasks.length})
        </span>
        <button onClick={load} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <RefreshCw className="h-3 w-3" aria-hidden="true" /> Refresh
        </button>
      </div>
      {tasks.map((t) => {
        const RunIcon = t.last_run ? (RUN_ICON[t.last_run.state] ?? Clock) : Clock;
        const runFailed = t.last_run && t.last_run.state.startsWith('FAIL');
        const isBusy = busy === t.name;
        return (
          <div key={t.name} className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={t.fqn}>{t.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  {t.kind} · {t.schedule || 'no schedule'} · {t.warehouse || 'serverless'}
                </p>
              </div>
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                STATE_STYLE[t.state] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')}>
                {t.state || 'unknown'}
              </span>
            </div>

            {t.last_suspended_reason && t.state === 'suspended' && (
              <p className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                {t.last_suspended_reason.replace(/_/g, ' ').toLowerCase()}
              </p>
            )}

            <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <RunIcon className={cn('h-3 w-3', runFailed ? 'text-red-500' : 'text-slate-400')} aria-hidden="true" />
                Last: {t.last_run ? `${t.last_run.state} · ${fmt(t.last_run.completed_time)}` : 'never'}
              </div>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" /> Next: {fmt(t.next_run)}
              </div>
            </div>
            {runFailed && t.last_run?.error_message && (
              <p className="mt-1 truncate text-[10px] text-red-600 dark:text-red-400" title={t.last_run.error_message}>
                {t.last_run.error_code ? `${t.last_run.error_code}: ` : ''}{t.last_run.error_message}
              </p>
            )}

            {t.kind === 'ingestion' && (
              <div className="mt-2 flex items-center gap-1.5">
                {t.state === 'started' ? (
                  <button disabled={!canOperate || isBusy} onClick={() => act(t, 'suspend')}
                    title={canOperate ? 'Pause the schedule' : 'Requires deploy permission'}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-900/20">
                    <Pause className="h-3 w-3" aria-hidden="true" /> Pause
                  </button>
                ) : (
                  <button disabled={!canOperate || isBusy} onClick={() => act(t, 'resume')}
                    title={canOperate ? 'Resume the schedule' : 'Requires deploy permission'}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                    <Play className="h-3 w-3" aria-hidden="true" /> Resume
                  </button>
                )}
                <button disabled={!canOperate || isBusy} onClick={() => act(t, 'run')}
                  title={canOperate ? 'Run now (EXECUTE TASK)' : 'Requires deploy permission'}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-900/20">
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Zap className="h-3 w-3" aria-hidden="true" />} Run now
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
