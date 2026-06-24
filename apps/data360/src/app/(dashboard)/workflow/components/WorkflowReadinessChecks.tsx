'use client';

/**
 * WorkflowReadinessChecks — two docked, in-panel verification surfaces that
 * close the workflow lifecycle test path:
 *
 *   <PreDeployChecks/>  — POST /workflow/{id}/pre-check  (preconditions BEFORE a
 *                         deploy: source objects exist, target schema writable,
 *                         warehouse available). Run it before submitting for
 *                         deployment approval.
 *   <PostRunVerify/>    — POST /workflow/{id}/post-verify (AFTER an execute:
 *                         per-target-block row counts + task outcome). This is
 *                         the "did each block actually produce data" gate that
 *                         makes otherwise-untested blocks verifiable.
 *
 * Both follow the established docked pattern in this module (BlockSqlPreview):
 * an explicit run button + an honest state machine
 * (idle / loading / ready / empty / unavailable / error). No popups, no
 * blocking modals. A 404/501 self-disables the surface ("not available on this
 * backend"); any other error surfaces the backend message verbatim.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  ListChecks,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/app/shared/ui/Tooltip';
import {
  preCheckWorkflow,
  postVerifyWorkflow,
  type ReadinessCheck,
  type WorkflowPreCheckResult,
  type WorkflowPostVerifyResult,
} from '@/app/services/workflow';

type RunState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';

function backendDetail(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function isGap(e: any): boolean {
  const s = e?.response?.status;
  return s === 404 || s === 501;
}

/** Pass / fail / unknown badge for one check line. */
function CheckBadge({ ok }: { ok: boolean | null }) {
  if (ok === true) {
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />;
  }
  if (ok === false) {
    return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />;
  }
  return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />;
}

function RunButton({
  label,
  busyLabel,
  hasResult,
  state,
  onRun,
}: {
  label: string;
  busyLabel: string;
  hasResult: boolean;
  state: RunState;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={state === 'loading' || state === 'unavailable'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
        state === 'unavailable'
          ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-700'
          : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
      )}
    >
      {state === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ShieldCheck className="h-3.5 w-3.5" />
      )}
      {state === 'loading' ? busyLabel : hasResult ? `Re-run ${label.toLowerCase()}` : label}
    </button>
  );
}

function StateNote({ state, errMsg, emptyText }: { state: RunState; errMsg: string; emptyText: string }) {
  if (state === 'unavailable') {
    return (
      <p className="mt-2 text-[11px] italic text-slate-400 dark:text-slate-500">
        Not available on this backend.
      </p>
    );
  }
  if (state === 'empty') {
    return <p className="mt-2 text-[11px] italic text-slate-400 dark:text-slate-500">{emptyText}</p>;
  }
  if (state === 'error') {
    return (
      <div className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 dark:bg-red-900/20">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
        <span className="text-[11px] text-red-600 dark:text-red-400">{errMsg}</span>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pre-deploy preconditions
// ---------------------------------------------------------------------------

export function PreDeployChecks({
  workflowId,
  isReadOnly,
}: {
  workflowId: string | null;
  isReadOnly: boolean;
}) {
  const [state, setState] = useState<RunState>('idle');
  const [result, setResult] = useState<WorkflowPreCheckResult | null>(null);
  const [errMsg, setErrMsg] = useState('');

  // A stale result from another workflow would be misleading.
  useEffect(() => {
    setState('idle');
    setResult(null);
    setErrMsg('');
  }, [workflowId]);

  const run = useCallback(async () => {
    if (!workflowId) return;
    setState('loading');
    setErrMsg('');
    try {
      const r = await preCheckWorkflow(workflowId);
      setResult(r);
      setState(r.checks.length === 0 ? 'empty' : 'ready');
    } catch (e: any) {
      if (isGap(e)) {
        setState('unavailable');
        return;
      }
      setErrMsg(backendDetail(e, 'Pre-deployment check failed'));
      setState('error');
    }
  }, [workflowId]);

  const checks: ReadinessCheck[] = result?.checks ?? [];
  const failing = checks.filter((c) => c.ok === false).length;

  return (
    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Pre-deploy checks
        </div>
        <Tooltip
          label="Verify preconditions (source objects, target schema writable, warehouse available) before requesting deployment"
          side="left"
        >
          <span>
            <RunButton
              label="Run checks"
              busyLabel="Checking..."
              hasResult={state === 'ready' || state === 'empty' || state === 'error'}
              state={state}
              onRun={run}
            />
          </span>
        </Tooltip>
      </div>

      {state === 'idle' && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          {isReadOnly
            ? 'Run readiness checks before this workflow is deployed.'
            : 'Confirm this workflow can deploy before you submit it for approval.'}
        </p>
      )}

      <StateNote state={state} errMsg={errMsg} emptyText="No preconditions were reported." />

      {state === 'ready' && (
        <div className="mt-2 space-y-1.5">
          <div
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-medium',
              result?.ok === false || failing > 0
                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                : result?.ok === true
                  ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
            )}
          >
            {failing > 0
              ? `${failing} of ${checks.length} precondition${checks.length === 1 ? '' : 's'} not met`
              : result?.ok === true
                ? 'Ready to deploy'
                : `${checks.length} precondition${checks.length === 1 ? '' : 's'} checked`}
          </div>
          <ul className="space-y-1">
            {checks.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="flex items-start gap-1.5 rounded-md border border-slate-100 px-2 py-1 text-[11px] dark:border-slate-800"
              >
                <CheckBadge ok={c.ok} />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-700 dark:text-slate-300">{c.name}</span>
                  {c.message && (
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                      {c.message}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post-execute block verification
// ---------------------------------------------------------------------------

export function PostRunVerify({ workflowId }: { workflowId: string | null }) {
  const [state, setState] = useState<RunState>('idle');
  const [result, setResult] = useState<WorkflowPostVerifyResult | null>(null);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    setState('idle');
    setResult(null);
    setErrMsg('');
  }, [workflowId]);

  const run = useCallback(async () => {
    if (!workflowId) return;
    setState('loading');
    setErrMsg('');
    try {
      const r = await postVerifyWorkflow(workflowId, 1);
      setResult(r);
      setState(r.blocks.length === 0 ? 'empty' : 'ready');
    } catch (e: any) {
      if (isGap(e)) {
        setState('unavailable');
        return;
      }
      setErrMsg(backendDetail(e, 'Post-run verification failed'));
      setState('error');
    }
  }, [workflowId]);

  const blocks = result?.blocks ?? [];
  const failing = blocks.filter((b) => b.ok === false).length;

  return (
    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <ListChecks className="h-3.5 w-3.5" />
          Verify block outputs
        </div>
        <Tooltip
          label="After a run: check each target block's row counts and the task outcome"
          side="left"
        >
          <span>
            <RunButton
              label="Verify outputs"
              busyLabel="Verifying..."
              hasResult={state === 'ready' || state === 'empty' || state === 'error'}
              state={state}
              onRun={run}
            />
          </span>
        </Tooltip>
      </div>

      {state === 'idle' && (
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          After running this workflow, confirm each block actually wrote rows.
        </p>
      )}

      <StateNote
        state={state}
        errMsg={errMsg}
        emptyText="No target blocks to verify, or no runs recorded yet."
      />

      {state === 'ready' && (
        <div className="mt-2 space-y-1.5">
          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] font-medium',
              result?.ok === false || failing > 0
                ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                : result?.ok === true
                  ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
            )}
          >
            <span>
              {failing > 0
                ? `${failing} of ${blocks.length} block${blocks.length === 1 ? '' : 's'} failed verification`
                : result?.ok === true
                  ? 'All blocks verified'
                  : `${blocks.length} block${blocks.length === 1 ? '' : 's'} verified`}
            </span>
            {result?.task_outcome && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                task: {result.task_outcome}
              </span>
            )}
          </div>
          <ul className="space-y-1">
            {blocks.map((b, i) => (
              <li
                key={`${b.block}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1 text-[11px] dark:border-slate-800"
              >
                <span className="flex min-w-0 items-start gap-1.5">
                  <CheckBadge ok={b.ok} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-700 dark:text-slate-300">
                      {b.block}
                    </span>
                    {b.message && (
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                        {b.message}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                  {b.rows == null ? '—' : `${b.rows.toLocaleString()} rows`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PreDeployChecks;
