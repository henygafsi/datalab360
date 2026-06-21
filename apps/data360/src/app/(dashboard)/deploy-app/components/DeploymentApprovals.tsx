'use client';

/**
 * DeploymentApprovals — the deployment-approval + tracking surface.
 *
 * Lists the caller's active deployments and the ones awaiting their approval
 * (GET /deployments/track?include_approvals_for_me=true), and drives the full
 * lifecycle against the canonical `@/app/services/deployments` service:
 *   - request  → start a deployment (requires_approval=true)
 *   - approve / reject / execute / rollback (approver-role gated → 403)
 *   - step / complete (tracking)
 *
 * State machine per action: Idle → Running → Completed/Error, with a visible
 * elapsed timer for the long Snowflake actions (execute / rollback). Every
 * failure degrades to an inline error (no crash, no fake data). Approver-only
 * actions that 403 surface the backend reason inline rather than hiding.
 *
 * Non-destructive flows (request a deployment) use the shared <ActionRail>; the
 * destructive confirm (reject / rollback) uses a small inline confirm row.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Rocket,
} from 'lucide-react';
import { useAtomValue } from 'jotai';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import { useCanPerform } from '@/hooks/useCanPerform';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import {
  approveDeployment,
  completeDeployment,
  executeDeployment,
  fmtDuration,
  isTerminal,
  listActiveDeployments,
  progressPct,
  rejectDeployment,
  rollbackDeployment,
  startDeployment,
  statusLabel,
  stepLabel,
  type DeploymentRow,
} from '@/app/services/deployments';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

/** A live elapsed-time counter for long Snowflake actions. */
function useElapsed(active: boolean): number {
  const [ms, setMs] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setMs(0);
      return;
    }
    startRef.current = Date.now();
    const id = window.setInterval(() => {
      if (startRef.current != null) setMs(Date.now() - startRef.current);
    }, 200);
    return () => window.clearInterval(id);
  }, [active]);
  return ms;
}

const STATUS_TINT: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  PENDING_APPROVAL:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SUCCEEDED:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function DeploymentApprovals() {
  const [rows, setRows] = useState<DeploymentRow[]>([]);
  const [loadState, setLoadState] = useState<AsyncState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoadState('running');
    setLoadError(null);
    try {
      const items = await listActiveDeployments({
        include_approvals_for_me: true,
      });
      setRows(items);
      setLoadState('done');
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Real-time refresh (SSE): every deployment lifecycle mutation
  // (request / approve / reject / execute / rollback / complete) fires
  // @invalidates_cache(DEPLOYMENTS) on the backend. The /deployments/track list
  // is itself uncached, so without this another approver's/owner's action stays
  // invisible until a manual Refresh. Re-pull when a DEPLOYMENTS invalidation
  // arrives over the shared SSE stream (DEPLOYMENTS alone catches every
  // lifecycle mutation; PROJECTS is intentionally not watched to avoid spurious
  // refetches on unrelated project edits).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    if (lastInvalidation.keys.includes(CACHE_KEYS.DEPLOYMENTS)) {
      void fetchRows();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  const rail = useActionPanel<'request'>();

  // System 2 Action-RBAC: requesting a deployment → explore_design:deploy
  // (aligns with the F1 ContextRightBar convention). Account-level entry point —
  // the per-project scope is chosen inside the rail, so no projectId here.
  // Fail-open while the allow-set loads (no flash of disabled).
  const requestPerm = useCanPerform('explore_design', 'deploy');
  const canRequestDeploy = requestPerm.allowed || requestPerm.loading;

  return (
    <section aria-label="Deployment approvals" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Deployments & approvals
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchRows()}
            disabled={loadState === 'running'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loadState === 'running' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => rail.open('request')}
            disabled={!canRequestDeploy}
            title={!canRequestDeploy ? 'You lack the "deploy" permission on deployments. Ask an administrator to grant it.' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:from-cyan-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Rocket className="h-3 w-3" />
            Request deployment
          </button>
        </div>
      </div>

      {loadState === 'running' && rows.length === 0 ? (
        <ul className="space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            />
          ))}
        </ul>
      ) : loadState === 'error' ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Could not load deployments</p>
            <p className="break-words">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchRows()}
            className="shrink-0 rounded-lg border border-red-300 px-2 py-1 text-[11px] font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/30"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Rocket}
          compact
          title="No active deployments"
          description="Requested and in-flight deployments — plus anything awaiting your approval — show up here."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <DeploymentCard key={row.deployment_id} row={row} onChanged={fetchRows} />
          ))}
        </ul>
      )}

      <RequestDeploymentRail
        isOpen={rail.isOpen}
        onClose={rail.close}
        onRequested={async () => {
          rail.close();
          await fetchRows();
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Per-deployment card with the full lifecycle action set.
// ---------------------------------------------------------------------------
function DeploymentCard({
  row,
  onChanged,
}: {
  row: DeploymentRow;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<null | string>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'reject' | 'rollback' | 'approve' | 'execute'>(null);
  const [reason, setReason] = useState('');
  const elapsed = useElapsed(busy === 'execute' || busy === 'rollback');

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setActionError(null);
      try {
        await fn();
        await onChanged();
      } catch (err) {
        // Approver-role gated actions 403 here — surface the backend reason
        // inline so the user understands why, rather than hiding the control.
        setActionError(getApiErrorMessage(err));
      } finally {
        setBusy(null);
        setConfirm(null);
        setReason('');
      }
    },
    [onChanged],
  );

  const terminal = isTerminal(row.status);
  const canApprove = row.status === 'PENDING_APPROVAL';
  const canExecute = row.status === 'RUNNING' || row.status === 'PENDING';
  const pct = progressPct(row);

  // System 2 Action-RBAC (module 'explore_design', project-scoped on row.project_id).
  // Registry actions: approve, reject, execute, rollback (all exist). Reject is
  // gated under the approver capability for approve/reject coherence. Fail-open
  // while the allow-set loads (no flash of disabled). These are the deployment
  // PERMISSION gates, layered on top of the status conditions above.
  const approveDeployPerm = useCanPerform('explore_design', 'approve', row.project_id);
  const executeDeployPerm = useCanPerform('explore_design', 'execute', row.project_id);
  const rollbackDeployPerm = useCanPerform('explore_design', 'rollback', row.project_id);
  const canApproveDeploy = approveDeployPerm.allowed || approveDeployPerm.loading;
  const canExecuteDeploy = executeDeployPerm.allowed || executeDeployPerm.loading;
  const canRollbackDeploy = rollbackDeployPerm.allowed || rollbackDeployPerm.loading;
  const approveDeniedReason = 'You lack the "approve" permission on deployments. Ask an administrator to grant it.';
  const executeDeniedReason = 'You lack the "execute" permission on deployments. Ask an administrator to grant it.';
  const rollbackDeniedReason = 'You lack the "rollback" permission on deployments. Ask an administrator to grant it.';

  const stepErrors = Object.values(row.errors_by_step || {})
    .flat()
    .filter(Boolean);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {row.project_name || row.project_id}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {row.owner_username}
            {row.approver_username ? ` · approver ${row.approver_username}` : ''}
            {' · '}
            {stepLabel(row.current_step)}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            STATUS_TINT[row.status] ?? STATUS_TINT.PENDING,
          )}
        >
          {statusLabel(row.status)}
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            row.status === 'FAILED'
              ? 'bg-red-500'
              : row.status === 'SUCCEEDED'
                ? 'bg-emerald-500'
                : 'bg-blue-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{pct}%</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {busy === 'execute' || busy === 'rollback'
            ? fmtDuration(elapsed)
            : fmtDuration(row.elapsed_ms)}
        </span>
      </div>

      {stepErrors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {stepErrors.slice(0, 3).map((e, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{e.message}</span>
            </li>
          ))}
        </ul>
      )}

      {actionError && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-words">{actionError}</span>
        </div>
      )}

      {/* Inline confirm for every lifecycle action — never a global modal.
          reject/rollback are destructive (red, reason input); approve/execute are
          high-impact-but-not-destructive (emerald/blue, no reason). */}
      {confirm ? (
        (() => {
          const destructive = confirm === 'reject' || confirm === 'rollback';
          const prompt =
            confirm === 'reject'
              ? 'Reject this deployment?'
              : confirm === 'rollback'
                ? 'Roll this deployment back to its prior version?'
                : confirm === 'approve'
                  ? 'Approve this deployment for execution?'
                  : 'Execute this deployment now? This applies changes to the target.';
          return (
            <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900/40 dark:bg-amber-900/20">
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">{prompt}</p>
              {destructive && (
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  aria-label="Reason"
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirm(null);
                    setReason('');
                  }}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    if (confirm === 'reject') {
                      void run('reject', () =>
                        rejectDeployment(row.deployment_id, { reason: reason || undefined }),
                      );
                    } else if (confirm === 'rollback') {
                      void run('rollback', () =>
                        rollbackDeployment(row.deployment_id, { reason: reason || undefined }),
                      );
                    } else if (confirm === 'approve') {
                      void run('approve', () => approveDeployment(row.deployment_id));
                    } else {
                      void run('execute', () => executeDeployment(row.deployment_id));
                    }
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60',
                    destructive
                      ? 'bg-red-600 hover:bg-red-700'
                      : confirm === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-blue-600 hover:bg-blue-700',
                  )}
                >
                  {busy != null && <Loader2 className="h-3 w-3 animate-spin" />}
                  Confirm
                </button>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canApprove && (
            <ActionButton
              busy={busy === 'approve'}
              disabled={busy != null || !canApproveDeploy}
              title={!canApproveDeploy ? approveDeniedReason : undefined}
              icon={ThumbsUp}
              label="Approve"
              tone="emerald"
              onClick={() => setConfirm('approve')}
            />
          )}
          {canApprove && (
            <ActionButton
              busy={busy === 'reject'}
              disabled={busy != null || !canApproveDeploy}
              title={!canApproveDeploy ? approveDeniedReason : undefined}
              icon={ThumbsDown}
              label="Reject"
              tone="red"
              onClick={() => setConfirm('reject')}
            />
          )}
          {canExecute && (
            <ActionButton
              busy={busy === 'execute'}
              disabled={busy != null || !canExecuteDeploy}
              title={!canExecuteDeploy ? executeDeniedReason : undefined}
              icon={Play}
              label="Execute"
              tone="blue"
              onClick={() => setConfirm('execute')}
            />
          )}
          {!terminal && (
            <ActionButton
              busy={busy === 'rollback'}
              disabled={busy != null || !canRollbackDeploy}
              title={!canRollbackDeploy ? rollbackDeniedReason : undefined}
              icon={RotateCcw}
              label="Rollback"
              tone="amber"
              onClick={() => setConfirm('rollback')}
            />
          )}
          {row.status === 'RUNNING' && (
            <ActionButton
              busy={busy === 'complete'}
              disabled={busy != null || !canExecuteDeploy}
              title={!canExecuteDeploy ? executeDeniedReason : undefined}
              icon={CheckCircle2}
              label="Mark complete"
              tone="slate"
              onClick={() =>
                void run('complete', () =>
                  completeDeployment(row.deployment_id, {
                    status: 'SUCCEEDED',
                  }),
                )
              }
            />
          )}
        </div>
      )}
    </li>
  );
}

const TONE: Record<string, string> = {
  emerald:
    'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/20',
  red: 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20',
  blue: 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20',
  amber:
    'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/20',
  slate:
    'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
};

function ActionButton({
  busy,
  disabled,
  icon: Icon,
  label,
  tone,
  onClick,
  title,
}: {
  busy: boolean;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: keyof typeof TONE;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900',
        TONE[tone],
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Request a deployment — non-destructive create, lives in the shared ActionRail.
// ---------------------------------------------------------------------------
function RequestDeploymentRail({
  isOpen,
  onClose,
  onRequested,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRequested: () => Promise<void>;
}) {
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [versionId, setVersionId] = useState('');
  const [approver, setApprover] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [state, setState] = useState<AsyncState>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!projectId.trim()) {
      setError('Project ID is required.');
      return;
    }
    setState('running');
    setError(null);
    try {
      await startDeployment({
        project_id: projectId.trim(),
        project_name: projectName.trim() || undefined,
        version_id: versionId.trim() || undefined,
        approver_username: approver.trim() || undefined,
        requires_approval: requiresApproval,
        ui_origin: 'deploy-app',
      });
      setState('done');
      setProjectId('');
      setProjectName('');
      setVersionId('');
      setApprover('');
      await onRequested();
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
  }, [projectId, projectName, versionId, approver, requiresApproval, onRequested]);

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

  return (
    <ActionRail
      isOpen={isOpen}
      onClose={onClose}
      title="Request deployment"
      description="Start a tracked deployment. With approval required, it waits in the approvers' queue before it can execute."
      accentClassName="bg-cyan-500"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={state === 'running'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:from-cyan-700 hover:to-blue-700 disabled:opacity-60"
          >
            {state === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Request
          </button>
        </>
      }
    >
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Project ID *
        </span>
        <input
          className={field}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="proj_..."
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Project name
        </span>
        <input
          className={field}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Optional display name"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Version ID
        </span>
        <input
          className={field}
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          placeholder="Optional"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Approver username
        </span>
        <input
          className={field}
          value={approver}
          onChange={(e) => setApprover(e.target.value)}
          placeholder="Optional — who should approve"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(e) => setRequiresApproval(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-cyan-600"
        />
        Requires approval before execution
      </label>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
    </ActionRail>
  );
}
