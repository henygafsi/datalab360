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
import { RefreshCw, Search } from 'lucide-react';
import {
  getWorkflows,
  removeWorkflow,
  type WorkflowItem,
} from '@/app/services/studio/studio-api';
import StudioWorkflowEditor from '@/app/shared/studio/StudioWorkflowEditor';
import { QuietAction } from '@/app/shared/studio/PlainKit';

const STATE_CLS: Record<string, string> = {
  proposed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  simulated: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  delivered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  stopped: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function StudioWorkflowsPanel({
  draftId,
  onOpenActivation,
}: {
  draftId: string;
  /** every « needs activation » word links to the ONE activation panel */
  onOpenActivation?: () => void;
}) {
  const [items, setItems] = useState<WorkflowItem[] | 'loading' | 'error'>('loading');
  const [choices, setChoices] = useState<string[]>(['manual', 'hourly', 'daily', 'weekly', 'monthly']);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getWorkflows(draftId);
      setItems(r.items);
      if (r.trigger_choices?.length) setChoices(r.trigger_choices);
    } catch {
      setItems('error');
    }
  }, [draftId]);

  useEffect(() => {
    setItems('loading');
    setOpenId(null);
    void load();
  }, [load]);

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

      {list.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
          No workflow can be proposed yet — they derive from the understood model.
        </p>
      ) : (
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
              {rows.map((w) => {
                const aid = w.automation_id;
                const missing =
                  (w.prerequisites?.data?.missing?.length ?? 0) +
                  (w.prerequisites?.destination?.missing?.length ?? 0);
                const last = w.runs_summary?.last;
                const scheduleActive = Boolean((w.schedule as { active?: boolean } | undefined)?.active);
                return (
                  <tr key={aid} className="text-[13px]">
                    <td className="px-2 py-2">
                      <button
                        type="button"
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
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setOpenId(aid)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                        >
                          Edit
                        </button>
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
