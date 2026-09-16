'use client';

/**
 * StudioWorkflowsPanel — the application's workflows as a PILOT TABLE.
 *
 * One row answers: what the workflow does (its phrase) / whether it is
 * activable / when it last ran / on which trigger. Everything else —
 * definition, steps, palette, AI edit, simulate, test-run, stop, history —
 * lives in StudioWorkflowEditor, which REPLACES the list on click (the
 * JobsPanel discipline). Needs-attention rows sort first; a missing
 * prerequisite shows as « N decision(s) to take », taken IN the editor,
 * never as a dead button.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  Database,
  type LucideIcon,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Undo2,
  Workflow as WorkflowIcon,
  Zap,
} from 'lucide-react';
import {
  getWorkflows,
  removeWorkflow,
  restoreWorkflow,
  type WorkflowItem,
} from '@/app/services/studio/studio-api';
import { useModelChanged } from '@/app/services/studio/studio-bus';
import StudioWorkflowEditor from '@/app/shared/studio/StudioWorkflowEditor';
import { QuietAction } from '@/app/shared/studio/PlainKit';

const STATE_CLS: Record<string, string> = {
  proposed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  simulated: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  delivered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  stopped: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

/* ── FUNCTIONAL families — the list reads as what the workflows DO for the
 *  business, grouped by the served `kind`; ten load-schedules stop drowning
 *  the three alerts. Family order is meaning, not the backend order. ── */
const FAMILIES: Array<{ id: string; label: string; hint: string; Icon: LucideIcon; test: (kind: string) => boolean }> = [
  { id: 'alerts', label: 'Alerts', hint: 'watch a condition, tell someone', Icon: Bell, test: (k) => k.startsWith('alert') },
  { id: 'reports', label: 'Periodic reports', hint: 'recurring summaries, delivered', Icon: BarChart3, test: (k) => k.includes('report') },
  { id: 'delivery', label: 'External hand-offs', hint: 'tickets, exports and webhooks to other systems', Icon: Send, test: (k) => /ticket|export|webhook/.test(k) },
  { id: 'schedules', label: 'Load schedules', hint: 'keep the data loaded on time', Icon: Database, test: (k) => /schedule/.test(k) },
];
const OTHER_FAMILY = { id: 'other', label: 'Other automations', hint: '', Icon: WorkflowIcon };
function familyOf(w: WorkflowItem): string {
  const k = String(w.kind ?? '').toLowerCase();
  return FAMILIES.find((f) => f.test(k))?.id ?? OTHER_FAMILY.id;
}

export default function StudioWorkflowsPanel({
  draftId,
  onOpenActivation,
}: {
  draftId: string;
  /** every « needs activation » word links to the ONE activation panel */
  onOpenActivation?: () => void;
}) {
  const [items, setItems] = useState<WorkflowItem[] | 'loading' | 'error'>('loading');
  /** the served roll-up (proposed/activable/delivered/stopped) — the KPI strip */
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  /** per-family open state — a family the user toggled wins over the default
   *  (small families open, a wall like ten load-schedules starts folded) */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [choices, setChoices] = useState<string[]>(['manual', 'hourly', 'daily', 'weekly', 'monthly']);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  /** the last-dismissed suggestion, kept so a Dismiss can be undone in place */
  const [dismissed, setDismissed] = useState<{ aid: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getWorkflows(draftId);
      setItems(r.items);
      setCounts(r.counts ?? null);
      if (r.trigger_choices?.length) setChoices(r.trigger_choices);
    } catch {
      setItems('error');
    }
  }, [draftId]);

  /** self-service: ask the AI to (re-)derive the workflows this application
   *  likely needs from its model — new candidates arrive as `proposed`. */
  const suggest = useCallback(async () => {
    setProposing(true);
    setError(null);
    try {
      const r = await getWorkflows(draftId, true);
      setItems(r.items);
      setCounts(r.counts ?? null);
      if (r.trigger_choices?.length) setChoices(r.trigger_choices);
    } catch {
      setError('Could not propose more workflows right now.');
    } finally {
      setProposing(false);
    }
  }, [draftId]);

  /** dismiss a proposal (never-run, not job-linked): DELETE → "dismissed";
   *  kept in `dismissed` so it can be restored without re-deriving. */
  const dismiss = useCallback(
    (aid: string, name: string) => {
      setRemoveArmed(null);
      setBusy(`rm:${aid}`);
      setError(null);
      void removeWorkflow(draftId, aid)
        .then((r) => {
          if (r.status === 'dismissed') setDismissed({ aid, name });
          return load();
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Dismiss failed.'))
        .finally(() => setBusy(null));
    },
    [draftId, load],
  );

  const undoDismiss = useCallback(() => {
    if (!dismissed) return;
    const { aid } = dismissed;
    setBusy(`restore:${aid}`);
    setError(null);
    void restoreWorkflow(draftId, aid)
      .then(() => {
        setDismissed(null);
        return load();
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Restore failed.'))
      .finally(() => setBusy(null));
  }, [draftId, dismissed, load]);

  useEffect(() => {
    setItems('loading');
    setOpenId(null);
    void load();
  }, [load]);

  /* a model edit (target/column/job change) can flip what a workflow may do —
     re-read so activability + impacts never lag the model. */
  useModelChanged(draftId, load);

  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  const rows = useMemo(() => {
    const needsAttention = (w: WorkflowItem) =>
      w.activable?.ok === false || w.state === 'stopped';
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? list.filter((w) =>
          `${w.name ?? ''} ${w.automation_id} ${w.phrase?.event ?? ''} ${w.phrase?.action ?? ''}`
            .toLowerCase()
            .includes(needle),
        )
      : list;
    return [...filtered].sort((a, b) => {
      const na = needsAttention(a) ? 0 : 1;
      const nb = needsAttention(b) ? 0 : 1;
      return na !== nb
        ? na - nb
        : String(a.name ?? a.automation_id).localeCompare(String(b.name ?? b.automation_id));
    });
  }, [list, q]);

  if (items === 'loading')
    return (
      <div role="status" className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the workflows…</span>
      </div>
    );
  if (items === 'error')
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        The workflows could not be read — jobs stay usable.{' '}
        <QuietAction label="Try again" icon={RefreshCw} onClick={() => { setItems('loading'); void load(); }} />
      </p>
    );

  const isSuggestion = (w: WorkflowItem) =>
    (w.state ?? 'proposed') === 'proposed' && (w.runs_summary?.count ?? 0) === 0;
  /** dismissible = a suggestion that never ran and is not a job's schedule */
  const canDismiss = (w: WorkflowItem) => isSuggestion(w) && !w.job_id;
  const suggestedCount = list.filter(isSuggestion).length;

  const open = openId ? list.find((w) => w.automation_id === openId) : null;
  if (open) {
    return (
      <StudioWorkflowEditor
        draftId={draftId}
        workflow={open}
        triggerChoices={choices}
        onClose={() => setOpenId(null)}
        onChanged={() => void load()}
        onOpenActivation={onOpenActivation}
      />
    );
  }

  /* one family's rows — the SAME pilot table, scoped to a functional group */
  const renderTable = (ws: WorkflowItem[]) => (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Workflow</th>
                  <th className="px-2 py-1.5 font-medium">Does</th>
                  <th className="px-2 py-1.5 font-medium">State</th>
                  <th className="px-2 py-1.5 font-medium">Last run</th>
                  <th className="px-2 py-1.5 font-medium">Trigger</th>
                  <th className="px-2 py-1.5 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ws.map((w) => {
                  const aid = w.automation_id;
                  const missing =
                    (w.prerequisites?.data?.missing?.length ?? 0) +
                    (w.prerequisites?.destination?.missing?.length ?? 0);
                  const last = w.runs_summary?.last;
                  const scheduleActive = Boolean((w.schedule as { active?: boolean } | undefined)?.active);
                  return (
                    <tr key={aid} className="group text-[13px] hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          data-workflow-id={aid}
                          onClick={() => setOpenId(aid)}
                          title="Open the workflow editor"
                          className="rounded font-medium text-slate-900 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-100 dark:hover:text-accent-400"
                        >
                          {w.name ?? aid}
                        </button>
                        {w.job_id && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="One definition — its trigger IS the job's trigger">
                            job
                          </span>
                        )}
                        {(w.advice_count ?? 0) > 0 && (
                          <span
                            className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-px text-xs tabular-nums text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                            title="Open the editor — each concerned step carries its note, with the run or fact it is based on"
                          >
                            {w.advice_count} suggestion{w.advice_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[360px] px-2 py-2">
                        <p className="truncate text-slate-600 dark:text-slate-300" title={`${w.phrase?.event ?? ''}${w.phrase?.condition ? ` when ${w.phrase.condition}` : ''} → ${w.phrase?.action ?? ''} → ${w.phrase?.destination ?? ''}`}>
                          {w.phrase?.event ?? '—'}
                          {w.phrase?.condition ? ` when ${w.phrase.condition}` : ''} → {w.phrase?.action ?? '—'}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLS[w.state ?? 'proposed'] ?? STATE_CLS.proposed}`}>
                          {w.state ?? 'proposed'}
                        </span>
                        {missing > 0 && (
                          <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" title={w.activable?.reason}>
                            {missing} decision(s) to take
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {(w.runs_summary?.count ?? 0) === 0 ? (
                          <span className="text-slate-400 dark:text-slate-500">never ran</span>
                        ) : (
                          <>
                            {last?.status ?? '—'}
                            {last?.at && (
                              <span className="text-slate-400 dark:text-slate-500">
                                {' '}· {new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {w.trigger?.cron_choice ?? 'manual'}
                        {scheduleActive ? (
                          <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-px text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">running</span>
                        ) : w.trigger?.cron_choice && w.trigger.cron_choice !== 'manual' ? (
                          onOpenActivation ? (
                            <button
                              type="button"
                              onClick={onOpenActivation}
                              className="ml-1.5 text-xs text-slate-400 underline decoration-dotted hover:text-accent-700 dark:text-slate-500 dark:hover:text-accent-400"
                            >
                              awaiting activation
                            </button>
                          ) : (
                            <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">awaiting activation</span>
                          )
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {/* the OPTIONS BAR slides in on hover / keyboard focus —
                            the row's data stays the page; actions come to the
                            mouse instead of sitting as a permanent column */}
                        <span className="inline-flex translate-x-1 items-center gap-1.5 opacity-0 transition-all duration-150 focus-within:translate-x-0 focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none">
                          <button
                            type="button"
                            onClick={() => setOpenId(aid)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                          >
                            {isSuggestion(w) ? 'Review' : 'Edit'}
                          </button>
                          {canDismiss(w) && (
                            <button
                              type="button"
                              disabled={busy === `rm:${aid}`}
                              onClick={() => {
                                if (removeArmed !== aid) {
                                  setRemoveArmed(aid);
                                  return;
                                }
                                dismiss(aid, String(w.name ?? aid));
                              }}
                              title="Dismiss this suggestion — it won’t be proposed again (you can undo)"
                              className={`rounded-lg px-2 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                                removeArmed === aid
                                  ? 'bg-amber-50 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'text-slate-500 hover:text-amber-700 dark:text-slate-400 dark:hover:text-amber-400'
                              }`}
                            >
                              {removeArmed === aid ? 'Dismiss it?' : 'Dismiss'}
                            </button>
                          )}
                          {w.state === 'stopped' && (
                            <button
                              type="button"
                              disabled={busy === `rm:${aid}`}
                              onClick={() => {
                                if (removeArmed !== aid) {
                                  setRemoveArmed(aid);
                                  return;
                                }
                                setRemoveArmed(null);
                                setBusy(`rm:${aid}`);
                                setError(null);
                                void removeWorkflow(draftId, aid)
                                  .then(() => load())
                                  .catch((e) => setError(e instanceof Error ? e.message : 'Remove failed.'))
                                  .finally(() => setBusy(null));
                              }}
                              className={`rounded-lg px-2 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                                removeArmed === aid
                                  ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : 'text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400'
                              }`}
                            >
                              {removeArmed === aid ? 'Remove for good?' : 'Remove'}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Workflows{list.length ? ` (${list.length})` : ''}
        </h3>
        {list.length > 6 && (
          <label className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workflows"
              aria-label="Search workflows"
              className="h-8 w-52 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={proposing}
          title="Ask the AI to propose the workflows this application likely needs, from its model"
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent-200 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-accent-500/40 dark:text-accent-300 dark:hover:bg-accent-900/20"
        >
          {proposing ? (
            <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
          )}
          {/* when proposals are already on screen the AI has spoken — the
              button is a secondary "more", not the way to wake it up */}
          {proposing ? 'Proposing…' : suggestedCount > 0 ? 'Propose more' : 'Suggest workflows'}
        </button>
        {onOpenActivation && (
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
            Schedules run once the application is activated —{' '}
            <button
              type="button"
              onClick={onOpenActivation}
              className="text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
            >
              open the activation panel
            </button>
          </span>
        )}
      </div>

      {dismissed && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-800/50">
          <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
            Dismissed « {dismissed.name} » — it won’t be proposed again.
          </span>
          <button
            type="button"
            onClick={undoDismiss}
            disabled={busy != null}
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-accent-700 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
          >
            <Undo2 aria-hidden className="h-3.5 w-3.5" /> Undo
          </button>
        </div>
      )}
      {suggestedCount > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-500" />
          {suggestedCount} workflow{suggestedCount > 1 ? 's are' : ' is'} proposed for this
          application — open one to review and keep it (preview / test-run), or dismiss it.
        </p>
      )}

      {list.length === 0 ? (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            No workflow yet — they derive from the understood model.
          </p>
          <button
            type="button"
            onClick={() => void suggest()}
            disabled={proposing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {proposing ? (
              <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
            )}
            {proposing ? 'Proposing…' : 'Suggest workflows from the model'}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {/* the KPI summary — served counts, never invented */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Workflow summary">
            {([
              ['proposed', Sparkles, 'proposed by the AI — review to keep'],
              ['activable', Zap, 'ready to activate'],
              ['delivered', Send, 'have delivered'],
              ['stopped', RefreshCw, 'stopped'],
            ] as Array<[string, LucideIcon, string]>).map(([k, Icon, hint]) => (
              <span
                key={k}
                title={hint}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                <Icon aria-hidden className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                {counts?.[k] ?? '—'} {k}
              </span>
            ))}
          </div>

          {/* FUNCTIONAL families — grouped by what they DO; a wall (ten load
              schedules) starts folded, small families open; search opens all */}
          {[...FAMILIES, OTHER_FAMILY].map((f) => {
            const ws = rows.filter((w) => familyOf(w) === f.id);
            if (ws.length === 0) return null;
            const attention = ws.filter((w) => w.activable?.ok === false || w.state === 'stopped').length;
            const isOpen = q.trim() ? true : (openGroups[f.id] ?? ws.length <= 5);
            const Icon = f.Icon;
            return (
              <section key={f.id} className="rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroups((g) => ({ ...g, [f.id]: !isOpen }))}
                  className="flex w-full items-center gap-2 p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {isOpen ? (
                    <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-accent-500" />
                  <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{f.label}</span>
                  {f.hint && (
                    <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">{f.hint}</span>
                  )}
                  {attention > 0 && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      {attention} to decide
                    </span>
                  )}
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-px text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {ws.length}
                  </span>
                </button>
                {isOpen && <div className="border-t border-slate-100 dark:border-slate-800">{renderTable(ws)}</div>}
              </section>
            );
          })}
          {rows.length === 0 && q && (
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">No workflow matches « {q} ».</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}
