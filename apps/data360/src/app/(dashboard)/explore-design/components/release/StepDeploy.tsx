'use client';

/**
 * Release ▸ Step 5 — Deploy: unlocked only when the release is approved.
 * Feeders (WIRED): POST deployments/{id}/execute · GET /ddl-actions (Copy SQL).
 * "Schedule deploy" (scheduled-deployments spine) is not live yet → honest
 * disabled gap. Rollback stays a DISCREET link to Recovery, not a primary CTA.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ClipboardCopy, Clock3, Rocket } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  executeDeployment,
  listDDLActions,
} from '@/app/services/api/exploreDesignApi';
import type { ExploreDeployment } from '@/app/services/api/types';
import type { ReleaseStatus, ReleaseStepId } from './types';
import {
  StepButton,
  StepSection,
  fmtCount,
  relativeTime,
  useGatedAction,
} from './ui';

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
  const [deploying, setDeploying] = useState(false);
  const [copying, setCopying] = useState(false);

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
      toast.error(getApiErrorMessage(err));
    } finally {
      setDeploying(false);
    }
  }, [projectId, approvedDeployment, onMutated]);

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
              deploying || !unlocked || !approvedDeployment || !canDeploy.allowed
            }
            title={
              canDeploy.deniedTitle ??
              (!unlocked
                ? 'Complete validation and approvals first'
                : !approvedDeployment
                  ? 'No approved deployment request to execute'
                  : undefined)
            }
          >
            <Rocket className="h-3 w-3" aria-hidden="true" />
            {deploying ? 'Deploying…' : 'Deploy now'}
          </StepButton>
          <StepButton
            disabled
            title="Scheduled deployments are not available yet on this environment"
          >
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            Schedule deploy
          </StepButton>
        </div>

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
