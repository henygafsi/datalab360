'use client';

/**
 * ProjectCollaborationPanel — the per-project collaborative detail (Data360 G11).
 *
 * Mounted lazily inside the governance Projects page when a project row is
 * expanded (one at a time → no N× fan-out). Composes, for a single project:
 *   · lock indicator            (GET /projects/{id} → locked_by/locked_at)
 *   · runs-health digest        (derived from GET /projects/{id}/runs)
 *   · deploy / approval badge    (GET /projects/{id}/deployments)
 *   · activity feed              (GET /projects/{id}/events — PROJECT_EVENTS)
 *   · embedded G6 <ScoreCards>   (account-level — see note below)
 *   · comments / @mention / presence placeholder (BACKEND GAP — see note)
 *
 * ScoreCards note: <ScoreCards> fetches ACCOUNT-level /command-center/kpis/*
 * (no project_id param exists on the component or the backend). It is rendered
 * here as account-health context and is LABELLED as such — it is deliberately
 * NOT presented as per-project data, because per-project scoring is a backend
 * gap (would need /command-center/kpis/{dim}?project_id= + a ScoreCards prop).
 */
import React, { useEffect, useState } from 'react';
import {
  Lock, Unlock, Activity, Rocket, CheckCircle2, XCircle, Clock,
  PlayCircle, AlertTriangle, GaugeCircle, MessageSquare, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import ScoreCards from '@/app/shared/score-cards/ScoreCards';
import {
  loadProjectCollaboration,
  type ProjectCollaboration,
  type CollabDeployment,
} from '@/app/services/projects/collaboration';

// ── Deployment status → badge style ──────────────────────────────────────────

function deployBadge(status: string): { cls: string; label: string; Icon: React.ElementType } {
  const s = status.toLowerCase();
  if (s === 'deployed')
    return { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Deployed', Icon: CheckCircle2 };
  if (s === 'rejected')
    return { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Rejected', Icon: XCircle };
  if (s === 'failed')
    return { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Failed', Icon: AlertTriangle };
  if (s === 'approved')
    return { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Approved', Icon: CheckCircle2 };
  if (s === 'cancelled')
    return { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', label: 'Cancelled', Icon: XCircle };
  // pending / pending_approval / requested
  return { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Pending approval', Icon: Clock };
}

function DeployBadgeChip({ d }: { d: CollabDeployment }) {
  const { cls, label, Icon } = deployBadge(String(d.status));
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', cls)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
      {d.environment ? <span className="opacity-70">· {d.environment}</span> : null}
    </span>
  );
}

// ── Section helper ───────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, accent, children,
}: { icon: React.ElementType; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn('h-3.5 w-3.5', accent)} />
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function safeDistance(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function ProjectCollaborationPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectCollaboration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(false);
    loadProjectCollaboration(projectId)
      .then((res) => { if (!ignore) setData(res); })
      .catch(() => { if (!ignore) setError(true); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading collaboration view…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        Couldn’t load the collaboration view for this project.
      </div>
    );
  }

  const { lock, runsHealth, events, latestDeployment, deployments, pendingDeployment } = data;

  return (
    <div className="px-4 py-3 space-y-3 bg-slate-50/60 dark:bg-slate-900/30">
      {/* Status strip: lock + deploy badge */}
      <div className="flex flex-wrap items-center gap-2">
        {lock.locked ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            <Lock className="h-2.5 w-2.5" />
            Locked by {lock.locked_by}
            {safeDistance(lock.locked_at) ? <span className="opacity-70">· {safeDistance(lock.locked_at)}</span> : null}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <Unlock className="h-2.5 w-2.5" />
            Unlocked
          </span>
        )}
        {latestDeployment ? (
          <DeployBadgeChip d={latestDeployment} />
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <Rocket className="h-2.5 w-2.5" />
            No deployments
          </span>
        )}
        {pendingDeployment && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="h-2.5 w-2.5" />
            Awaiting approval — act in the banner above
          </span>
        )}
      </div>

      {/* Two-column: runs health + activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Runs health */}
        <Section icon={Activity} title="Runs health" accent="text-indigo-500">
          {runsHealth.total === 0 ? (
            <p className="text-xs text-slate-400">No runs recorded yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> {runsHealth.completed}
                </span>
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <XCircle className="h-3 w-3" /> {runsHealth.failed}
                </span>
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <PlayCircle className="h-3 w-3" /> {runsHealth.running}
                </span>
                {runsHealth.success_rate != null && (
                  <span className="ml-auto inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                    <GaugeCircle className="h-3 w-3" /> {runsHealth.success_rate}% success
                  </span>
                )}
              </div>
              {/* Success-rate bar */}
              {runsHealth.success_rate != null && (
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', runsHealth.success_rate >= 80 ? 'bg-emerald-500' : runsHealth.success_rate >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${runsHealth.success_rate}%` }}
                  />
                </div>
              )}
              {runsHealth.last_run_at && (
                <p className="text-[11px] text-slate-400">
                  Last run {safeDistance(runsHealth.last_run_at)} · {runsHealth.last_status}
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Activity feed (PROJECT_EVENTS) */}
        <Section icon={Activity} title="Activity feed" accent="text-violet-500">
          {events.length === 0 ? (
            <p className="text-xs text-slate-400">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {events.slice(0, 12).map((e) => {
                const ok = String(e.status).toLowerCase() === 'success';
                return (
                  <li key={e.event_id} className="flex items-start gap-2 text-[11px]">
                    <span className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', ok ? 'bg-emerald-500' : 'bg-red-500')} />
                    <div className="min-w-0">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {e.event_type.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      <span className="text-slate-400">
                        {' '}· {e.username}
                        {safeDistance(e.timestamp) ? ` · ${safeDistance(e.timestamp)}` : ''}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      {/* Recent deployments list */}
      {deployments.length > 0 && (
        <Section icon={Rocket} title="Deployments" accent="text-amber-500">
          <ul className="space-y-1.5">
            {deployments.slice(0, 5).map((d) => (
              <li key={d.deployment_id} className="flex items-center gap-2 text-[11px]">
                <DeployBadgeChip d={d} />
                <span className="text-slate-400 truncate">
                  {d.requested_by ? `by ${d.requested_by}` : ''}
                  {safeDistance(d.requested_at) ? ` · ${safeDistance(d.requested_at)}` : ''}
                  {d.approved_by ? ` · approved by ${d.approved_by}` : ''}
                  {d.rejected_by ? ` · rejected by ${d.rejected_by}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* G6 Score Cards — account-level health context */}
      <Section icon={GaugeCircle} title="Health score cards (G6)" accent="text-emerald-500">
        <p className="text-[10px] text-slate-400 mb-2 italic">
          Account-level health — per-project scoring is not yet available from the backend.
        </p>
        <ScoreCards dimensions={['dq', 'cost', 'perf']} />
      </Section>

      {/* Comments / @mention / presence — BACKEND GAP placeholder */}
      <Section icon={MessageSquare} title="Comments & presence" accent="text-sky-500">
        <p className="text-xs text-slate-400">
          Threaded comments, @mentions and live presence are not yet available.
          They require a new <code className="text-[11px] px-1 rounded bg-slate-100 dark:bg-slate-700">PROJECT_COMMENTS</code> table
          and <code className="text-[11px] px-1 rounded bg-slate-100 dark:bg-slate-700">GET/POST /projects/{'{id}'}/comments</code> endpoints
          (plus a presence channel) on the backend.
        </p>
      </Section>
    </div>
  );
}
