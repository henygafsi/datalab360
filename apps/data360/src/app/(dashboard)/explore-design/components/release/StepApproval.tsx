'use client';

/**
 * Release ▸ Step 4 — Approval: required NAMED approvers (spec §4.4).
 * Submit-for-approval lives ONLY here (never on the header Deploy button).
 *
 * Feeders: POST deployments (WIRED, submit) · GET/POST …/approvers +
 * …/approvers/{username}/decision (NEW contract — degrades to the legacy
 * one-shot approve/reject, which is WIRED, when the named-approver endpoints
 * are not live yet).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Send, ThumbsDown, ThumbsUp, UserPlus, Undo2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { useAuth } from '@/hooks/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import {
  approveDeployment,
  rejectDeployment,
  requestDeployment,
} from '@/app/services/api/exploreDesignApi';
import type { ExploreDeployment } from '@/app/services/api/types';
import {
  addDeploymentApprover,
  getDeploymentApprovers,
  postApproverDecision,
} from './api';
import type { ApproverDecision, ApproversResponse } from './types';
import {
  ErrorNote,
  SkeletonRows,
  StepButton,
  StepSection,
  UnavailableNote,
  fmtCount,
  relativeTime,
  useGatedAction,
} from './ui';

const OPEN_STATUSES = new Set(['pending_review', 'pending', 'requested', 'approved']);

const APPROVER_STATUS_CLASS: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  changes_requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  pending: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function StepApproval({
  projectId,
  deployments,
  onMutated,
}: {
  projectId: string;
  /** Deployments list shared from useReleaseState (newest may be anywhere). */
  deployments: ExploreDeployment[];
  /** Called after any approval mutation so the panel refreshes release state. */
  onMutated: () => void;
}) {
  const { username } = useAuth();
  const canSubmit = useGatedAction('create', projectId);
  const canApprove = useGatedAction('approve', projectId);

  // The deployment this step operates on: newest still-open one.
  const activeDeployment = useMemo(() => {
    const sorted = [...deployments].sort((a, b) => {
      const ta = Date.parse(a.requested_at ?? a.created_at ?? '') || 0;
      const tb = Date.parse(b.requested_at ?? b.created_at ?? '') || 0;
      return tb - ta;
    });
    return sorted.find((d) => OPEN_STATUSES.has(String(d.status ?? '').toLowerCase())) ?? null;
  }, [deployments]);

  // ── Submit for approval ────────────────────────────────────────────────────
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      await requestDeployment(projectId, {
        deployment_type: 'with_approval',
        description: note || undefined,
        note: note || undefined,
      });
      toast.success('Release submitted for approval');
      setNote('');
      onMutated();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [projectId, note, onMutated]);

  // ── Named approvers (new contract, degrades to legacy approve/reject) ─────
  const [approvers, setApprovers] = useState<ApproversResponse | null>(null);
  const [approversLoading, setApproversLoading] = useState(false);
  const [approversError, setApproversError] = useState<string | null>(null);
  const [approversUnavailable, setApproversUnavailable] = useState(false);

  const loadApprovers = useCallback(async () => {
    if (!activeDeployment) return;
    setApproversLoading(true);
    setApproversError(null);
    setApproversUnavailable(false);
    try {
      const res = await getDeploymentApprovers(projectId, activeDeployment.deployment_id);
      setApprovers(res);
    } catch (err) {
      if (isUnavailable(err)) setApproversUnavailable(true);
      else setApproversError(getApiErrorMessage(err));
    } finally {
      setApproversLoading(false);
    }
  }, [projectId, activeDeployment]);

  useEffect(() => {
    setApprovers(null);
    void loadApprovers();
  }, [loadApprovers]);

  // Add reviewer mini-form
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRequired, setNewRequired] = useState(true);
  const [adding, setAdding] = useState(false);

  const addReviewer = useCallback(async () => {
    if (!activeDeployment || !newUsername.trim()) return;
    setAdding(true);
    try {
      await addDeploymentApprover(projectId, activeDeployment.deployment_id, {
        username: newUsername.trim(),
        role_label: newRoleLabel.trim() || undefined,
        required: newRequired,
      });
      toast.success(`Reviewer ${newUsername.trim()} added`);
      setNewUsername('');
      setNewRoleLabel('');
      setShowAdd(false);
      void loadApprovers();
      onMutated();
    } catch (err) {
      if (isUnavailable(err)) setApproversUnavailable(true);
      else toast.error(getApiErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }, [projectId, activeDeployment, newUsername, newRoleLabel, newRequired, loadApprovers, onMutated]);

  // My decision (named model) / legacy approve-reject fallback
  const [comment, setComment] = useState('');
  const [deciding, setDeciding] = useState(false);

  const decide = useCallback(
    async (decision: ApproverDecision) => {
      if (!activeDeployment) return;
      if (!approversUnavailable && !username) {
        toast.error('Your session username could not be resolved — sign in again to record a decision.');
        return;
      }
      setDeciding(true);
      try {
        if (!approversUnavailable) {
          await postApproverDecision(
            projectId,
            activeDeployment.deployment_id,
            username,
            { decision, comment: comment || undefined },
          );
        } else if (decision === 'approve') {
          await approveDeployment(projectId, activeDeployment.deployment_id);
        } else {
          await rejectDeployment(projectId, activeDeployment.deployment_id, {
            reason: comment || null,
          });
        }
        toast.success(
          decision === 'approve'
            ? 'Approval recorded'
            : decision === 'reject'
              ? 'Rejection recorded'
              : 'Change request recorded',
        );
        setComment('');
        void loadApprovers();
        onMutated();
      } catch (err) {
        if (isUnavailable(err)) {
          setApproversUnavailable(true);
          toast.error('Named-approver decisions are not available yet — use approve/reject.');
        } else {
          toast.error(getApiErrorMessage(err));
        }
      } finally {
        setDeciding(false);
      }
    },
    [projectId, activeDeployment, approversUnavailable, username, comment, loadApprovers, onMutated],
  );

  const policy = approvers?.policy;
  const inputClass =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

  return (
    <StepSection
      title="Approval"
      subtitle="Required named approvers must sign off before deploy"
    >
      {!activeDeployment ? (
        // ── No open deployment → submit-for-approval lives HERE (only here) ──
        <div className="space-y-2">
          <EmptyState
            compact
            icon={Send}
            title="No approval request open"
            description="Submit this release to route it to its required approvers."
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for approvers…"
            rows={2}
            className={inputClass}
          />
          <StepButton
            variant="primary"
            onClick={submit}
            disabled={submitting || !canSubmit.allowed}
            title={canSubmit.deniedTitle}
            className="w-full justify-center"
          >
            <Send className="h-3 w-3" aria-hidden="true" />
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </StepButton>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="truncate">
              Request {activeDeployment.deployment_id.slice(0, 8)} ·{' '}
              {activeDeployment.requested_by ?? '—'} · {relativeTime(activeDeployment.requested_at)}
            </span>
            <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {String(activeDeployment.status)}
            </span>
          </div>

          {policy && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Requires {fmtCount(policy.required_count)} approval(s)
              {policy.mandatory_roles?.length
                ? ` · mandatory roles: ${policy.mandatory_roles.join(', ')}`
                : ''}
            </p>
          )}

          {approversLoading ? (
            <SkeletonRows rows={3} />
          ) : approversError ? (
            <ErrorNote message={approversError} onRetry={loadApprovers} />
          ) : approversUnavailable ? (
            <UnavailableNote what="The named-approver list" />
          ) : approvers && approvers.approvers.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700/60 dark:border-slate-700">
              {approvers.approvers.map((a) => {
                const status = String(a.status ?? 'pending');
                return (
                  <li key={a.approver_username} className="px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {a.approver_username}
                        {a.approver_role_label && (
                          <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                            · {a.approver_role_label}
                          </span>
                        )}
                        {a.required && (
                          <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            required
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${APPROVER_STATUS_CLASS[status] ?? APPROVER_STATUS_CLASS.pending}`}
                      >
                        {status.replace(/_/g, ' ')}
                        {a.decided_at ? ` · ${relativeTime(a.decided_at)}` : ''}
                      </span>
                    </div>
                    {a.comment && (
                      <p className="mt-0.5 text-[11px] italic text-slate-500 dark:text-slate-400">
                        “{a.comment}”
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={UserPlus}
              title="No approvers assigned yet"
              description="Add the required reviewers for this release."
            />
          )}

          {/* Add reviewer */}
          {!approversUnavailable && (
            <div>
              {showAdd ? (
                <div className="space-y-1.5 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Username"
                    className={inputClass}
                  />
                  <input
                    value={newRoleLabel}
                    onChange={(e) => setNewRoleLabel(e.target.value)}
                    placeholder="Role label (e.g. Data owner)"
                    className={inputClass}
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={newRequired}
                      onChange={(e) => setNewRequired(e.target.checked)}
                    />
                    Required approver
                  </label>
                  <div className="flex gap-1.5">
                    <StepButton
                      variant="primary"
                      onClick={addReviewer}
                      disabled={adding || !newUsername.trim() || !canApprove.allowed}
                      title={canApprove.deniedTitle}
                    >
                      {adding ? 'Adding…' : 'Add reviewer'}
                    </StepButton>
                    <StepButton onClick={() => setShowAdd(false)}>Cancel</StepButton>
                  </div>
                </div>
              ) : (
                <StepButton
                  onClick={() => setShowAdd(true)}
                  disabled={!canApprove.allowed}
                  title={canApprove.deniedTitle}
                >
                  <UserPlus className="h-3 w-3" aria-hidden="true" />
                  Add reviewer
                </StepButton>
              )}
            </div>
          )}

          {/* My decision */}
          <div className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-700/60">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comment (visible to the release history)…"
              rows={2}
              className={inputClass}
            />
            <div className="flex flex-wrap gap-1.5">
              <StepButton
                variant="primary"
                onClick={() => decide('approve')}
                disabled={deciding || !canApprove.allowed}
                title={canApprove.deniedTitle}
              >
                <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                Approve
              </StepButton>
              <StepButton
                onClick={() => decide('request-changes')}
                disabled={deciding || !canApprove.allowed || approversUnavailable}
                title={
                  canApprove.deniedTitle ??
                  (approversUnavailable
                    ? 'Change requests are not available yet on this environment'
                    : undefined)
                }
              >
                <Undo2 className="h-3 w-3" aria-hidden="true" />
                Request changes
              </StepButton>
              <StepButton
                variant="danger"
                onClick={() => decide('reject')}
                disabled={deciding || !canApprove.allowed}
                title={canApprove.deniedTitle}
              >
                <ThumbsDown className="h-3 w-3" aria-hidden="true" />
                Reject
              </StepButton>
            </div>
          </div>
        </div>
      )}
    </StepSection>
  );
}
