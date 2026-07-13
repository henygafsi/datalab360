'use client';

/**
 * Release ▸ Step 5 — Deploy: unlocked only when the release is approved.
 * Feeders (WIRED): POST deployments/{id}/execute · GET /ddl-actions (Copy SQL).
 * Rights-aware fallback: when the user lacks deploy rights (role gate) OR the
 * execute call 403s, a "Request deployment approval" action files a SCHEDULED
 * deployment (POST /explore-design/{id}/schedule) that lands in the
 * scheduled-deployments approve/reject queue — honest "awaiting approver"
 * state after filing, never a silent dead end. Rollback stays a DISCREET link
 * to Recovery, not a primary CTA.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Clock3, Hourglass, Play, Rocket, Send, Wrench } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import {
  executeDeployment,
  listDDLActions,
} from '@/app/services/api/exploreDesignApi';
import { createScheduleV1, getDdlRemediation, applyDdlRemediation, type DdlFailureRemediation } from '@/app/services/explore-design';
import { cocoRunSql } from '@/app/services/cortex/agent';
import type { ExploreDeployment } from '@/app/services/api/types';
import type { ReleaseStatus, ReleaseStepId } from './types';
import {
  StepButton,
  StepSection,
  fmtCount,
  relativeTime,
  useGatedAction,
} from './ui';

// A single failed-DDL-action remediation: the error + a classified, GATED fix.
// The diagnostic SELECT runs inline (coco, read-only); the corrective DDL is
// PREVIEW-ONLY (routed through the normal dry-run → deploy path, never fired
// from here). Turns the deploy dead-end into an actionable next step.
function RemediationCard({ item, projectId, canDeploy, onApplied, onRequestApproval }: {
  item: DdlFailureRemediation;
  projectId: string;
  canDeploy: boolean;
  onApplied: () => void;
  onRequestApproval: () => void;
}) {
  const r = item.remediation;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // GOVERNED apply: queue the server-derived corrective DDL as an audited action
  // (dry-run → deploy/approval pipeline) — never raw SQL from the card. A 403
  // means no deploy rights → route the user to the approval path.
  const applyFix = async () => {
    if (applying) return;
    setApplying(true);
    try {
      const res = await applyDdlRemediation(projectId, item.event_id);
      setApplied(true);
      toast.success(res.message || 'Corrective DDL queued — deploy or request approval to apply it.');
      onApplied();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        toast.error('You lack deploy rights — file a deployment request so an approver applies the fix.');
        onRequestApproval();
      } else {
        toast.error(getApiErrorMessage(err));
      }
    } finally {
      setApplying(false);
    }
  };

  const runDiagnostic = async () => {
    if (!r.diagnostic_sql || running) return;
    setRunning(true); setRunErr(null); setResult(null);
    try {
      const res = await cocoRunSql(r.diagnostic_sql, 20);
      setResult({ columns: res.columns, rows: res.rows });
    } catch (err: any) {
      setRunErr(err?.message || 'Diagnostic failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 space-y-1.5 dark:border-amber-800 dark:bg-amber-900/10">
      <div className="flex items-start gap-1.5">
        <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-px" aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">{r.title}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.ddl_type} · {item.target_table ?? '—'}</p>
        </div>
      </div>
      {item.error_message && (
        <pre className="max-h-16 overflow-auto rounded bg-white/70 p-1.5 text-[9px] font-mono text-red-600 whitespace-pre-wrap dark:bg-slate-900/60 dark:text-red-400">{item.error_message}</pre>
      )}
      <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">{r.rationale}</p>

      {r.diagnostic_sql && (
        <div className="space-y-1">
          <button
            onClick={runDiagnostic}
            disabled={running}
            className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-2 py-0.5 text-[10px] font-medium text-white"
          >
            <Play className="h-2.5 w-2.5" /> {running ? 'Checking…' : 'Run diagnostic'}
          </button>
          {runErr && <p className="text-[9px] text-red-600">{runErr}</p>}
          {result && result.rows.length > 0 && (
            <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
              <table className="text-[9px]">
                <thead><tr>{result.columns.map((c) => <th key={c} className="px-1.5 py-0.5 text-left font-semibold text-slate-500 whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>{result.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>{result.columns.map((c) => <td key={c} className="px-1.5 py-0.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">{String(row[c] ?? '—')}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {r.corrective_sql && (
        <div className="rounded bg-white/70 p-1.5 dark:bg-slate-900/60 space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Proposed fix</p>
          <pre className="max-h-16 overflow-auto text-[9px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{r.corrective_sql}</pre>
          {applied ? (
            <p className="flex items-center gap-1 text-[9px] font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-2.5 w-2.5" aria-hidden /> Queued as a deployment action — deploy or request approval to apply.
            </p>
          ) : (
            <>
              <button
                onClick={applyFix}
                disabled={applying}
                title={canDeploy
                  ? 'Queue this corrective DDL as a governed deployment action'
                  : 'You lack deploy rights — this files a request for an approver'}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 px-2 py-0.5 text-[10px] font-medium text-white"
              >
                <Wrench className="h-2.5 w-2.5" /> {applying ? 'Queuing…' : (canDeploy ? 'Queue fix for deploy' : 'Request fix via approval')}
              </button>
              <p className="text-[9px] italic text-slate-400">
                Governed: the fix enters the audited dry-run → deploy pipeline (or approval queue) — it is not run as raw SQL from here.
              </p>
            </>
          )}
        </div>
      )}
      {r.can_retry && (
        <p className="text-[9px] text-slate-400">A plain re-deploy may clear this (runs actions in dependency order).</p>
      )}
    </div>
  );
}

export default function StepDeploy({
  projectId,
  status,
  deployments,
  onMutated,
  onGoToStep,
}: {
  projectId: string;
  status: ReleaseStatus | null;
  deployments: ExploreDeployment[];
  onMutated: () => void;
  onGoToStep: (step: ReleaseStepId) => void;
}) {
  const canDeploy = useGatedAction('approve', projectId);
  const { username } = useAuth();
  const [deploying, setDeploying] = useState(false);
  const [copying, setCopying] = useState(false);
  // FAILED DDL actions → proposed remediation (deploy error → fix action).
  const [remediations, setRemediations] = useState<DdlFailureRemediation[]>([]);
  const loadRemediation = useCallback(async () => {
    try {
      const res = await getDdlRemediation(projectId);
      setRemediations(res.remediations ?? []);
    } catch {
      // Non-blocking — the deploy panel still works without remediation.
      setRemediations([]);
    }
  }, [projectId]);
  // Surface any standing FAILED actions on open + whenever deployments change
  // (a just-aborted deploy leaves FAILED actions the user must remediate).
  useEffect(() => { void loadRemediation(); }, [loadRemediation, deployments]);
  // Rights-aware approval fallback state: `serverDenied` flips when the
  // execute call 403s (the role gate can be stale — the server is the truth);
  // `requesting` / `requestFiled` track the scheduled-deployment request.
  const [serverDenied, setServerDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestFiled, setRequestFiled] = useState(false);

  // Reset the fallback when the project changes (component persists across
  // project switches inside the docked panel).
  useEffect(() => {
    setServerDenied(false);
    setRequestFiled(false);
  }, [projectId]);

  const approvedDeployment = useMemo(
    () =>
      [...deployments]
        .sort((a, b) => {
          const ta = Date.parse(a.requested_at ?? a.created_at ?? '') || 0;
          const tb = Date.parse(b.requested_at ?? b.created_at ?? '') || 0;
          return tb - ta;
        })
        .find((d) => String(d.status ?? '').toLowerCase() === 'approved') ?? null,
    [deployments],
  );

  const unlocked = status === 'approved' || status === 'deploying';

  const deployNow = useCallback(async () => {
    if (!approvedDeployment) return;
    setDeploying(true);
    try {
      await executeDeployment(projectId, approvedDeployment.deployment_id);
      toast.success('Deployment started');
      onMutated();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        // Server says no deploy rights — offer the approval path instead of a
        // dead-end error.
        setServerDenied(true);
        toast.error('You lack deploy rights on this project — file a deployment request for an approver instead.');
      } else {
        toast.error(getApiErrorMessage(err));
        // A deploy that aborts on failed DDL leaves FAILED actions — pull the
        // proposed remediation so the error isn't a dead end.
        void loadRemediation();
      }
    } finally {
      setDeploying(false);
    }
  }, [projectId, approvedDeployment, onMutated, loadRemediation]);

  // ── Approval fallback: file a SCHEDULED deployment (one-shot, ~10 min out)
  // that lands in the scheduled-deployments approve/reject queue. An approver
  // approves + executes (or rejects) it from there.
  const requestApproval = useCallback(async () => {
    setRequesting(true);
    try {
      const when = new Date(Date.now() + 10 * 60 * 1000);
      // Backend wraps this as `USING CRON <expr> UTC` — bare 5-field cron.
      const cron = `${when.getUTCMinutes()} ${when.getUTCHours()} ${when.getUTCDate()} ${when.getUTCMonth() + 1} *`;
      await createScheduleV1(projectId, {
        cron_expression: cron,
        scheduled_date: when.toISOString(),
        description: `Deployment approval requested by ${username || 'unknown user'} from Explore & Design (no deploy rights)`,
      });
      setRequestFiled(true);
      toast.success('Deployment request filed — awaiting approver');
      onMutated();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setRequesting(false);
    }
  }, [projectId, username, onMutated]);

  // Role gate says no (and it's done loading) OR the server 403'd → the
  // request-approval path is the primary affordance.
  const needsApprovalPath = !canDeploy.allowed || serverDenied;

  const copySql = useCallback(async () => {
    setCopying(true);
    try {
      const res = await listDDLActions(projectId);
      const text = (res.actions ?? [])
        .map((a) => a.ddl_sql)
        .filter(Boolean)
        .join('\n\n');
      if (!text) {
        toast('No generated SQL for this release yet.');
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('Release SQL copied to clipboard');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setCopying(false);
    }
  }, [projectId]);

  return (
    <StepSection
      title="Deploy"
      subtitle="Ship the approved release to the target environment"
      actions={
        <StepButton onClick={copySql} disabled={copying}>
          <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
          {copying ? 'Copying…' : 'Copy SQL'}
        </StepButton>
      }
    >
      <div className="space-y-3">
        {!unlocked && (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            Deploy unlocks once validation shows no blockers and every required
            approval is complete.
          </p>
        )}

        {approvedDeployment && (
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <dt className="text-slate-400 dark:text-slate-500">Request</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {approvedDeployment.deployment_id.slice(0, 8)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 dark:text-slate-500">Environment</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {approvedDeployment.environment ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 dark:text-slate-500">Approved by</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {approvedDeployment.approved_by ?? '—'}
                {approvedDeployment.approved_at
                  ? ` · ${relativeTime(approvedDeployment.approved_at)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 dark:text-slate-500">Version</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {approvedDeployment.version_id ?? '—'}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <StepButton
            variant="primary"
            onClick={deployNow}
            disabled={
              deploying || !unlocked || !approvedDeployment || !canDeploy.allowed || serverDenied
            }
            title={
              canDeploy.deniedTitle ??
              (serverDenied
                ? 'The server rejected the deploy (no deploy rights) — request approval below'
                : !unlocked
                  ? 'Complete validation and approvals first'
                  : !approvedDeployment
                    ? 'No approved deployment request to execute'
                    : undefined)
            }
          >
            <Rocket className="h-3 w-3" aria-hidden="true" />
            {deploying ? 'Deploying…' : 'Deploy now'}
          </StepButton>
          {!needsApprovalPath && (
            <StepButton
              disabled
              title="Scheduled deployments are not available yet on this environment"
            >
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              Schedule deploy
            </StepButton>
          )}
        </div>

        {/* Rights-aware fallback — visible to read-only / non-deployer users
            (this tab renders for them too). Files a scheduled deployment into
            the approvals queue; honest awaiting state after filing. */}
        {needsApprovalPath && (
          requestFiled ? (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />
              Deployment request filed — awaiting approver. It appears in this
              project&apos;s scheduled deployments until someone approves or rejects it.
            </p>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You don&apos;t have deploy rights on this project. You can file a
                deployment request instead — an approver reviews it in the
                scheduled-deployments queue.
              </p>
              <div className="mt-1.5">
                <StepButton
                  variant="primary"
                  onClick={requestApproval}
                  disabled={requesting}
                  title="File a deployment request for an approver"
                >
                  <Send className="h-3 w-3" aria-hidden="true" />
                  {requesting ? 'Filing request…' : 'Request deployment approval'}
                </StepButton>
              </div>
            </div>
          )
        )}

        {/* Deploy error → remediation. When DDL actions have failed, don't dead-end
            at "fix or rollback" — show each failure with a classified, gated fix. */}
        {remediations.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/30 p-2.5 dark:border-amber-800 dark:bg-amber-900/10" data-testid="ddl-remediation">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {fmtCount(remediations.length)} failed action(s) — proposed remediation
            </p>
            {remediations.map((item) => (
              <RemediationCard
                key={item.event_id}
                item={item}
                projectId={projectId}
                canDeploy={!!canDeploy.allowed && !serverDenied}
                onApplied={() => { onMutated(); void loadRemediation(); }}
                onRequestApproval={() => { setServerDenied(true); }}
              />
            ))}
          </div>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {fmtCount(deployments.length)} deployment request(s) on this project.{' '}
          <button
            type="button"
            onClick={() => onGoToStep('recovery')}
            className="underline decoration-dotted underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Rollback &amp; recovery options
          </button>
        </p>
      </div>
    </StepSection>
  );
}
