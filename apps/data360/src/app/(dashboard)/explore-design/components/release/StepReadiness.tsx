'use client';

/**
 * Release ▸ Step 2 — Readiness: acceptability KPIs + validation run.
 * Feeders (WIRED): GET /deployment-readiness (impact + cost),
 * POST /conflict-check (Run validation). "Ask AI to explain blockers" appends
 * a question to the AI analyst feed (new POST ai/history — degrades honestly).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Bot, PlayCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { isUnavailable } from '@/lib/http-status';
import { checkConflicts } from '@/app/services/api/exploreDesignApi';
import type { ConflictCheckResult } from '@/app/services/api/types';
import type { DeploymentReadiness } from '../../hooks/useDeploymentReadiness';
import { appendAiHistory } from './api';
import {
  ErrorNote,
  SkeletonRows,
  StepButton,
  StepSection,
  UnavailableNote,
  fmtCount,
  useGatedAction,
} from './ui';

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/40">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p
        className={
          tone === 'red'
            ? 'text-sm font-semibold text-red-600 dark:text-red-400'
            : tone === 'amber'
              ? 'text-sm font-semibold text-amber-600 dark:text-amber-400'
              : 'text-sm font-semibold text-slate-800 dark:text-slate-100'
        }
      >
        {value}
      </p>
    </div>
  );
}

export default function StepReadiness({
  projectId,
  onValidated,
}: {
  projectId: string;
  /** Called after a validation run completes (lets the panel refresh state). */
  onValidated?: () => void;
}) {
  const [readiness, setReadiness] = useState<DeploymentReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [conflicts, setConflicts] = useState<ConflictCheckResult | null>(null);
  const [validating, setValidating] = useState(false);

  const [aiAsked, setAiAsked] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const canAskAi = useGatedAction('edit', projectId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const { data } = await apiClient.get<DeploymentReadiness>(
        API.exploreDesign.deploymentReadiness(projectId),
      );
      setReadiness(data);
    } catch (err) {
      if (isUnavailable(err)) setUnavailable(true);
      else setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runValidation = useCallback(async () => {
    setValidating(true);
    try {
      const result = await checkConflicts(projectId, {});
      setConflicts(result);
      if (result.has_conflicts) {
        toast.error(`Validation found ${result.conflicts.length} conflict(s)`);
      } else {
        toast.success('Validation passed — no conflicts detected');
      }
      onValidated?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setValidating(false);
    }
  }, [projectId, onValidated]);

  const askAi = useCallback(async () => {
    try {
      await appendAiHistory(projectId, {
        // Backend enum is detection|suggestion|interview|outcome — 'question'
        // 422'd with INVALID_KIND (user screenshot #62). An ask-the-analyst
        // exchange is an 'interview' entry.
        kind: 'interview',
        axis: 'release',
        severity: 'info',
        message: 'Explain the current release blockers and how to fix them.',
      });
      setAiAsked(true);
      toast.success('Question sent to the AI change analyst');
    } catch (err) {
      if (isUnavailable(err)) setAiUnavailable(true);
      else toast.error(getApiErrorMessage(err));
    }
  }, [projectId]);

  const impact = readiness?.lineage_impact?.impact_summary;
  const cost = readiness?.cost_estimate;
  const blockerCount =
    conflicts?.conflicts.filter((c) => c.severity === 'error').length ?? null;
  const warningCount =
    conflicts?.conflicts.filter((c) => c.severity === 'warning').length ?? null;

  return (
    <StepSection
      title="Readiness"
      subtitle="Acceptability checks before this release can move forward"
      actions={
        <>
          <StepButton variant="primary" onClick={runValidation} disabled={validating}>
            <PlayCircle className="h-3 w-3" aria-hidden="true" />
            {validating ? 'Validating…' : 'Run validation'}
          </StepButton>
          <StepButton
            onClick={askAi}
            disabled={!canAskAi.allowed || aiAsked || aiUnavailable}
            title={
              canAskAi.deniedTitle ??
              (aiUnavailable
                ? 'The AI analyst feed is not available yet on this environment'
                : aiAsked
                  ? 'Question already sent — see the AI change analyst feed'
                  : undefined)
            }
          >
            <Bot className="h-3 w-3" aria-hidden="true" />
            Ask AI to explain blockers
          </StepButton>
        </>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <div className="space-y-3">
          {unavailable && <UnavailableNote what="Deployment readiness" />}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Impacted objects" value={fmtCount(impact?.total_affected_objects)} />
            <Kpi
              label="High risk"
              value={fmtCount(impact?.high_risk)}
              tone={impact && impact.high_risk > 0 ? 'red' : undefined}
            />
            <Kpi
              label="Est. credits"
              value={
                cost && cost.credits_estimate !== null
                  ? cost.credits_estimate.toFixed(2)
                  : '—'
              }
            />
            <Kpi
              label="Blockers"
              value={fmtCount(blockerCount)}
              tone={blockerCount && blockerCount > 0 ? 'red' : undefined}
            />
          </div>

          {cost?.warning && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">{cost.warning}</p>
          )}

          {conflicts && (
            <div className="rounded-md border border-slate-200 dark:border-slate-700">
              <div className="border-b border-slate-100 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-700/60 dark:text-slate-200">
                Validation result — {fmtCount(conflicts.total_checked)} event(s) checked,{' '}
                {fmtCount(blockerCount)} blocker(s), {fmtCount(warningCount)} warning(s)
              </div>
              {conflicts.conflicts.length === 0 ? (
                <p className="px-2 py-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  No conflicts — this release is clean to move to approval.
                </p>
              ) : (
                <ul className="max-h-40 divide-y divide-slate-100 overflow-auto dark:divide-slate-700/60">
                  {conflicts.conflicts.map((c, i) => (
                    <li key={`${c.event_id}-${i}`} className="px-2 py-1.5 text-[11px]">
                      <span
                        className={
                          c.severity === 'error'
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : 'font-medium text-amber-600 dark:text-amber-400'
                        }
                      >
                        {c.severity === 'error' ? 'Blocker' : 'Warning'}
                      </span>{' '}
                      <span className="text-slate-600 dark:text-slate-300">
                        {c.object_name}: {c.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </StepSection>
  );
}
