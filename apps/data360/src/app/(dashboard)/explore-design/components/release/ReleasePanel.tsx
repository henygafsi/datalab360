'use client';

/**
 * ReleasePanel — the Release tab of the redesigned right-bar (spec §4).
 * One in-panel mini-stepper with the 7 steps (Changes · Readiness · Impact ·
 * Approval · Deploy · Verify · Recovery). Zero popups. No second deploy
 * button: the header DeployStateButton only OPENS this panel at the right step.
 *
 * Verify renders only from `deploying` onward; Recovery only after a deploy
 * outcome (deployed / verified / failed / rolled_back). Steps are mounted
 * lazily — only the active step fetches its feeders.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PackageOpen, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import { deriveDeployButton, useReleaseState } from './useReleaseState';
import {
  RELEASE_STATUS_LABEL,
  RELEASE_STEPS,
  type ReleaseStatus,
  type ReleaseStepId,
} from './types';
import { ErrorNote, fmtCount } from './ui';
import StepChanges from './StepChanges';
import StepReadiness from './StepReadiness';
import StepImpact from './StepImpact';
import StepApproval from './StepApproval';
import StepDeploy from './StepDeploy';
import StepVerify from './StepVerify';
import StepRecovery from './StepRecovery';

const VERIFY_STATUSES: ReadonlySet<ReleaseStatus> = new Set<ReleaseStatus>([
  'deploying',
  'deployed',
  'verified',
  'failed',
]);
const RECOVERY_STATUSES: ReadonlySet<ReleaseStatus> = new Set<ReleaseStatus>([
  'deployed',
  'verified',
  'failed',
  'rolled_back',
]);

const STATUS_PILL_CLASS: Partial<Record<ReleaseStatus, string>> = {
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  rolled_back: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  deployed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  awaiting_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export interface ReleasePanelProps {
  projectId: string | null;
  /** Step to open on (e.g. the Deploy button's targetStep). */
  initialStep?: ReleaseStepId;
  className?: string;
}

export default function ReleasePanel({ projectId, initialStep, className }: ReleasePanelProps) {
  const { state, deployments, loading, error, degraded, refresh } = useReleaseState(projectId);

  const status = state?.status ?? null;
  const showVerify = status !== null && VERIFY_STATUSES.has(status);
  const showRecovery = status !== null && RECOVERY_STATUSES.has(status);

  const visibleSteps = useMemo(
    () =>
      RELEASE_STEPS.filter((s) => {
        if (s.id === 'verify') return showVerify;
        if (s.id === 'recovery') return showRecovery;
        return true;
      }),
    [showVerify, showRecovery],
  );

  const [activeStep, setActiveStep] = useState<ReleaseStepId>(initialStep ?? 'changes');
  const userNavigatedRef = useRef(false);

  // Follow an explicit caller navigation (e.g. Deploy button re-targeting).
  useEffect(() => {
    if (initialStep) {
      setActiveStep(initialStep);
      userNavigatedRef.current = true;
    }
  }, [initialStep]);

  // First state load (no caller target, no user click yet) → open the step the
  // lifecycle points at.
  useEffect(() => {
    if (!state || userNavigatedRef.current || initialStep) return;
    setActiveStep(deriveDeployButton(state).targetStep);
    userNavigatedRef.current = true;
  }, [state, initialStep]);

  // If the active step becomes hidden (e.g. status left the deploy phase),
  // fall back to the lifecycle target.
  useEffect(() => {
    if (!visibleSteps.some((s) => s.id === activeStep)) {
      setActiveStep(deriveDeployButton(state).targetStep);
    }
  }, [visibleSteps, activeStep, state]);

  if (!projectId) {
    return (
      <div className={className}>
        <EmptyState
          compact
          icon={PackageOpen}
          title="No project selected"
          description="Select a project to prepare and ship a release."
        />
      </div>
    );
  }

  const counts = state?.counts;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* ── Status header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              (status && STATUS_PILL_CLASS[status]) ??
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {state?.label ?? (status ? RELEASE_STATUS_LABEL[status] : 'State unknown')}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {fmtCount(counts?.changes)} changes · {fmtCount(counts?.blockers)} blockers ·{' '}
            {fmtCount(counts?.warnings)} warnings · {fmtCount(counts?.pending_approvals)} pending
            approvals
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh release state"
          title="Refresh release state"
          className="shrink-0 rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
        </button>
      </div>

      {state?.next_action && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Next: {state.next_action}
        </p>
      )}

      {degraded && (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
          Live release-state is not available yet — showing a state derived from
          this project&apos;s deployments.
        </p>
      )}

      {error && <ErrorNote message={error} onRetry={refresh} />}

      {/* ── Mini-stepper ── */}
      <nav aria-label="Release steps" className="flex flex-wrap gap-1">
        {visibleSteps.map((s, i) => {
          const active = s.id === activeStep;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                userNavigatedRef.current = true;
                setActiveStep(s.id);
              }}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
              )}
            >
              {i + 1}. {s.label}
            </button>
          );
        })}
      </nav>

      {/* ── Active step (lazy: only the mounted step fetches) ── */}
      {activeStep === 'changes' && <StepChanges projectId={projectId} />}
      {activeStep === 'readiness' && (
        <StepReadiness projectId={projectId} onValidated={refresh} />
      )}
      {activeStep === 'impact' && <StepImpact projectId={projectId} />}
      {activeStep === 'approval' && (
        <StepApproval projectId={projectId} deployments={deployments} onMutated={refresh} />
      )}
      {activeStep === 'deploy' && (
        <StepDeploy
          projectId={projectId}
          status={status}
          deployments={deployments}
          onMutated={refresh}
          onGoToStep={(step) => {
            userNavigatedRef.current = true;
            setActiveStep(step);
          }}
        />
      )}
      {activeStep === 'verify' && showVerify && <StepVerify projectId={projectId} />}
      {activeStep === 'recovery' && showRecovery && <StepRecovery projectId={projectId} />}
    </div>
  );
}
