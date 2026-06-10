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
 *   · embedded G6 <ScoreCards>   (per-project via projectId — see note below)
 *   · comments / @mention / presence placeholder (BACKEND GAP — see note)
 *
 * ScoreCards note: <ScoreCards projectId={...}> now fetches per-project scores
 * from GET /command-center/projects/{id}/scores. PERF (PROJECT_RUNS) and GOV
 * (contributors + RLS bindings) are REAL per-project; DQ is per-project when the
 * project's deployed objects are DMF-monitored, else account-level; COST stays
 * account-level (no per-project cost attribution — G8 gap). Each card carries a
 * `scope` chip so account-level fallbacks are labelled honestly, never faked.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Lock, Unlock, Activity, Rocket, CheckCircle2, XCircle, Clock,
  PlayCircle, AlertTriangle, GaugeCircle, MessageSquare, Loader2,
  Send, Trash2, CornerDownRight, Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import ScoreCards from '@/app/shared/score-cards/ScoreCards';
import {
  loadProjectCollaboration,
  type ProjectCollaboration,
  type CollabDeployment,
} from '@/app/services/projects/collaboration';
import {
  listComments,
  addComment,
  deleteComment,
  type ProjectComment,
} from '@/app/services/projects/comments';
import { useAuth } from '@/hooks/useAuth';

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

// ── Comments thread (G11) ─────────────────────────────────────────────────────

/** Render a comment body with @mentions highlighted. */
function renderBody(body: string): React.ReactNode {
  const parts = body.split(/(@[A-Za-z0-9_.\-]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="font-semibold text-sky-600 dark:text-sky-400">{part}</span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

function CommentRow({
  comment, isReply, canDelete, onReply, onDelete, deleting,
}: {
  comment: ProjectComment;
  isReply: boolean;
  canDelete: boolean;
  onReply: (c: ProjectComment) => void;
  onDelete: (c: ProjectComment) => void;
  deleting: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-2 text-[11px]', isReply && 'ml-5')}>
      {isReply && <CornerDownRight className="h-3 w-3 mt-1 shrink-0 text-slate-300 dark:text-slate-600" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{comment.author}</span>
          {safeDistance(comment.created_at) && (
            <span className="text-slate-400">· {safeDistance(comment.created_at)}</span>
          )}
        </div>
        <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
          {renderBody(comment.body)}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          {!isReply && (
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="text-[10px] text-slate-400 hover:text-sky-500"
            >
              Reply
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              disabled={deleting}
              className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-2.5 w-2.5" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentsThread({ projectId }: { projectId: string }) {
  const { username, role } = useAuth();
  const me = (username || '').toUpperCase();
  // Delete affordance: authors can always delete their own; account-admins get
  // the button too. NOTE this is an approximation — the backend authoritatively
  // gates on author-or-PROJECT-owner (CREATED_BY), which the panel doesn't fetch,
  // so a non-admin project owner only sees Delete on their own comments.
  const isAdminRole = ['ACCOUNTADMIN', 'ORGADMIN', 'SECURITYADMIN', 'SYSADMIN'].includes(
    (role || '').toUpperCase(),
  );

  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ProjectComment | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let ignore = false;
    setLoading(true);
    listComments(projectId)
      .then((rows) => { if (!ignore) setComments(rows); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [projectId]);

  useEffect(() => refresh(), [refresh]);

  const handlePost = useCallback(async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setPostError(false);
    try {
      await addComment(projectId, body, replyTo?.comment_id ?? null);
      setDraft('');
      setReplyTo(null);
      const rows = await listComments(projectId);
      setComments(rows);
    } catch {
      setPostError(true);
    } finally {
      setPosting(false);
    }
  }, [draft, posting, projectId, replyTo]);

  const handleDelete = useCallback(async (c: ProjectComment) => {
    setDeletingId(c.comment_id);
    try {
      await deleteComment(projectId, c.comment_id);
      // Backend soft-deletes only this comment (no cascade); mirror that locally
      // so replies stay until they're individually deleted, matching a reload.
      setComments((prev) => prev.filter((x) => x.comment_id !== c.comment_id));
    } catch {
      // leave the row in place on failure
    } finally {
      setDeletingId(null);
    }
  }, [projectId]);

  const canDelete = (c: ProjectComment) => c.author === me || isAdminRole;

  // Build a top-level → replies map (flat list, ordered chronologically).
  const tops = comments.filter((c) => !c.parent_comment_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_comment_id === id);

  return (
    <div className="space-y-3">
      {/* Composer */}
      <div className="space-y-1.5">
        {replyTo && (
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CornerDownRight className="h-2.5 w-2.5" /> Replying to {replyTo.author}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="hover:text-slate-600">Cancel</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void handlePost(); }
            }}
            rows={2}
            placeholder="Add a comment… use @username to mention"
            className="flex-1 resize-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
          <button
            type="button"
            onClick={() => void handlePost()}
            disabled={posting || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-sky-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
          >
            {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Post
          </button>
        </div>
        {postError && (
          <p className="text-[10px] text-red-500">Couldn’t post your comment. Please retry.</p>
        )}
      </div>

      {/* Thread */}
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading comments…
        </div>
      ) : tops.length === 0 ? (
        <p className="text-xs text-slate-400">No comments yet — start the conversation.</p>
      ) : (
        <ul className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {tops.map((c) => (
            <li key={c.comment_id} className="space-y-2">
              <CommentRow
                comment={c}
                isReply={false}
                canDelete={canDelete(c)}
                onReply={setReplyTo}
                onDelete={handleDelete}
                deleting={deletingId === c.comment_id}
              />
              {repliesOf(c.comment_id).map((r) => (
                <CommentRow
                  key={r.comment_id}
                  comment={r}
                  isReply
                  canDelete={canDelete(r)}
                  onReply={setReplyTo}
                  onDelete={handleDelete}
                  deleting={deletingId === r.comment_id}
                />
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

      {/* G6 Score Cards — now per-project where a real source exists.
          PERF (PROJECT_RUNS) + GOV (contributors/RLS) are real per-project; DQ
          is per-project when the project's deployed objects are DMF-monitored,
          else account-level; COST stays account-level (no per-project cost
          attribution). Each card is flagged with its scope so the labelling is
          honest — no disclaimer needed, the chips tell the truth per dimension. */}
      <Section icon={GaugeCircle} title="Health score cards (G6)" accent="text-emerald-500">
        <ScoreCards projectId={projectId} dimensions={['dq', 'cost', 'perf', 'gov']} />
      </Section>

      {/* Comments & @mentions — wired to PROJECT_COMMENTS (G11) */}
      <Section icon={MessageSquare} title="Comments & @mentions" accent="text-sky-500">
        <CommentsThread projectId={projectId} />
      </Section>

      {/* Live presence — still a labelled placeholder (no presence backend yet) */}
      <Section icon={Wifi} title="Live presence" accent="text-slate-400">
        <p className="text-[11px] text-slate-400">
          Real-time presence (who’s viewing/editing now) is not yet available —
          it needs a presence channel on the backend. Comments and @mentions above
          are live.
        </p>
      </Section>
    </div>
  );
}
