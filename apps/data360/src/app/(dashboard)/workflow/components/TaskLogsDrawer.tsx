'use client';

/**
 * TaskLogsDrawer.tsx
 *
 * Read-only side drawer that shows the backend log lines for a single workflow
 * run/task. Wired to GET /workflow/{workflow_id}/tasks/{task_id}/logs via
 * `getTaskLogs` (the run id fills the {task_id} segment).
 *
 * States are handled honestly — never fabricated data:
 *   • loading      — spinner while the request is in flight
 *   • unavailable  — 404/501 means the backend has no logs for this run
 *   • error        — any other transport error, with a Retry affordance
 *   • empty        — request succeeded but returned zero lines ("—")
 *   • loaded       — timestamped, level-coloured lines (+ optional SQL)
 *
 * No gating beyond page access (read-only).
 */

import * as React from 'react';
import {
  X,
  ScrollText,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Info,
  Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import { getTaskLogs, type TaskLogLine } from '@/app/services/workflow';

interface TaskLogsDrawerProps {
  open: boolean;
  workflowId: string | null;
  runId: string | null;
  onClose: () => void;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'error' | 'unavailable';

function levelClasses(level?: string): string {
  switch ((level ?? '').toLowerCase()) {
    case 'error':
      return 'text-red-300 bg-red-900/20';
    case 'warning':
    case 'warn':
      return 'text-amber-300 bg-amber-900/20';
    case 'info':
      return 'text-sky-300';
    default:
      return 'text-slate-300';
  }
}

const TaskLogsDrawer: React.FC<TaskLogsDrawerProps> = ({
  open,
  workflowId,
  runId,
  onClose,
}) => {
  const [state, setState] = React.useState<LoadState>('idle');
  const [logs, setLogs] = React.useState<TaskLogLine[]>([]);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!workflowId || !runId) return;
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await getTaskLogs(workflowId, runId);
      setLogs(res.logs);
      setState('loaded');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 501) {
        setLogs([]);
        setState('unavailable');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMsg(msg);
      setState('error');
    }
  }, [workflowId, runId]);

  // Fetch whenever the drawer opens for a (new) run.
  React.useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Esc to close.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleCopyAll = React.useCallback(async () => {
    const text = logs
      .map((l) => `${l.timestamp ? `[${l.timestamp}] ` : ''}${l.level ? `${l.level.toUpperCase()} ` : ''}${l.message}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Logs copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, [logs]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Run logs"
      className="fixed inset-0 z-[70] flex bg-slate-900/40"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-2">
            <ScrollText className="h-4 w-4 shrink-0 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Run logs
            </h2>
            {runId && (
              <code className="truncate font-mono text-[11px] text-slate-500">
                #{runId.slice(-8)}
              </code>
            )}
          </div>
          <div className="flex items-center gap-1">
            {state === 'loaded' && logs.length > 0 && (
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                aria-label="Copy all logs"
                title="Copy all logs"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Copy className="h-4 w-4 text-slate-500" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={state === 'loading'}
              aria-label="Refresh logs"
              title="Refresh logs"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4 text-slate-500', state === 'loading' && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {state === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              Loading logs…
            </div>
          )}

          {state === 'error' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-start justify-between gap-2 text-red-700 dark:text-red-400">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Could not load logs</p>
                    <p className="mt-0.5 break-words text-xs text-red-600 dark:text-red-300">
                      {errorMsg}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {state === 'unavailable' && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-500 dark:text-slate-400">
              <Info className="h-8 w-8 opacity-50" />
              <p className="text-sm">Logs are not available for this run.</p>
              <p className="max-w-sm text-xs">
                This run did not emit collectable task logs, or log capture is not
                enabled on this backend.
              </p>
            </div>
          )}

          {state === 'loaded' && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-500 dark:text-slate-400">
              <ScrollText className="h-8 w-8 opacity-50" />
              <p className="text-sm">—</p>
              <p className="text-xs">No log lines were recorded for this run.</p>
            </div>
          )}

          {state === 'loaded' && logs.length > 0 && (
            <div className="space-y-2">
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed">
                {logs.map((l, idx) => (
                  <div key={idx} className={cn('whitespace-pre-wrap', levelClasses(l.level))}>
                    {l.timestamp && (
                      <span className="select-none text-slate-500">{l.timestamp} </span>
                    )}
                    {l.level && (
                      <span className="select-none font-semibold uppercase">
                        {l.level}{' '}
                      </span>
                    )}
                    {l.message || ' '}
                    {l.sql_executed && (
                      <span className="mt-0.5 block border-l-2 border-slate-700 pl-2 text-slate-400">
                        {l.sql_executed}
                      </span>
                    )}
                  </div>
                ))}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskLogsDrawer;
