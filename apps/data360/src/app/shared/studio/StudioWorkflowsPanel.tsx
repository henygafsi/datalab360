'use client';

/**
 * StudioWorkflowsPanel — the application's workflows (C-2), living in the
 * Jobs tab: ONE definition shared with the jobs (a linked item's trigger
 * patches the job's path — trigger_path is the resolved truth).
 *
 * Each proposal is a PHRASE — event/condition → action → destination →
 * expected result — with honest prerequisites: a missing decision renders
 * as a decision to take (inline, grounded in the carried proposal), never
 * as a dead "activate" button. Preview reads bounded history and says its
 * dedup; a not_computable preview lists what is missing and ran ZERO
 * queries. Test-run delivers into the sandbox WF_DELIVERIES with proofs;
 * an identical replay delivers 0 (MERGE). Stop renders the REAL
 * verification (SHOW TASKS, schedule inactive, linked job back to
 * manual); remove refuses politely until stopped.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Play, RefreshCw, Square, X } from 'lucide-react';
import {
  getWorkflowRuns,
  getWorkflowVersions,
  getWorkflows,
  patchModel,
  postDecision,
  previewWorkflow,
  removeWorkflow,
  stopWorkflow,
  testRunWorkflow,
  type WorkflowItem,
  type WorkflowMissing,
  type WorkflowPreview,
  type WorkflowRunsPage,
  type WorkflowTestRun,
  type WorkflowVersions,
} from '@/app/services/studio/studio-api';

function errText(e: unknown): string {
  const r = (e as { response?: { status?: number; data?: { detail?: { message?: string; error_code?: string } | string } } })?.response;
  const detail = r?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  if (detail?.error_code) return detail.error_code;
  return e instanceof Error ? e.message : 'The action failed.';
}

const STATE_CLS: Record<string, string> = {
  proposed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  simulated: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  delivered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  stopped: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

/** Inline decision for a missing prerequisite — grounded in its proposal. */
function MissingDecision({
  draftId,
  m,
  onDone,
}: {
  draftId: string;
  m: WorkflowMissing;
  onDone: () => void;
}) {
  const kind = String((m.proposal as { kind?: string } | null)?.kind ?? '');
  const [days, setDays] = useState('30');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const did = m.decision_id;
  if (!did) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">{m.how_to_complete}</span>;
  }
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const value =
        kind === 'sla_days'
          ? {
              days: Number(days),
              from_field: (m.proposal as { from_field?: string } | null)?.from_field,
              kind,
            }
          : text.includes(',')
            ? { open_values: text.split(',').map((v) => v.trim()).filter(Boolean) }
            : { text: text.trim() };
      await postDecision(draftId, { decision_id: did, status: 'confirmed', value });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {kind === 'sla_days' ? (
        <>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label={`Days for ${m.decision_id}`}
            className="h-6 w-16 rounded border border-slate-200 bg-white px-1.5 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            days after {(m.proposal as { from_field?: string } | null)?.from_field ?? '—'}
          </span>
        </>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="value(s), comma-separated"
          aria-label={`Value for ${m.decision_id}`}
          className="h-6 w-44 rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        />
      )}
      <button
        type="button"
        disabled={busy || (kind !== 'sla_days' && !text.trim())}
        onClick={() => void send()}
        className="rounded-md bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
      >
        Confirm
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </span>
  );
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
  const [choices, setChoices] = useState<string[]>(['manual', 'hourly', 'daily', 'weekly', 'monthly']);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ aid: string; message: string } | null>(null);
  /** execution + definition history, fetched only when asked for */
  const [history, setHistory] = useState<
    Record<string, { runs: WorkflowRunsPage; versions: WorkflowVersions } | undefined>
  >({});

  const loadHistory = useCallback(
    async (aid: string) => {
      try {
        const [runs, versions] = await Promise.all([
          getWorkflowRuns(draftId, aid),
          getWorkflowVersions(draftId, aid).catch(() => ({ events: [] }) as WorkflowVersions),
        ]);
        setHistory((h) => ({ ...h, [aid]: { runs, versions } }));
      } catch (e) {
        setError({ aid, message: errText(e) });
      }
    },
    [draftId],
  );
  const [previews, setPreviews] = useState<Record<string, WorkflowPreview>>({});
  const [runs, setRuns] = useState<Record<string, WorkflowTestRun>>({});
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
    void load();
  }, [load]);

  const act = async (key: string, aid: string, fn: () => Promise<unknown>, reload = true) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (reload) await load();
    } catch (e) {
      setError({ aid, message: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  if (items === 'loading')
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (items === 'error')
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The workflows could not be read — jobs above stay usable.
      </p>
    );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Workflows</h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Proposed from this application&apos;s model and objective — one definition with the
        jobs; nothing runs without you, and a missing prerequisite is a decision to take,
        never a broken button.
        {onOpenActivation && (
          <>
            {' '}
            Schedules only run once the application is activated —{' '}
            <button
              type="button"
              onClick={onOpenActivation}
              className="text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
            >
              open the activation panel
            </button>
            .
          </>
        )}
      </p>

      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          No workflow can be proposed yet — they derive from the understood model.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {items.map((w) => {
            const aid = w.automation_id;
            const missing = [
              ...(w.prerequisites?.data?.missing ?? []),
              ...(w.prerequisites?.destination?.missing ?? []),
            ];
            const pv = previews[aid];
            const tr = runs[aid];
            const isOpen = open === aid;
            return (
              <li key={aid} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : aid)}
                    className="flex min-w-0 items-center gap-1 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                      {w.name ?? aid}
                    </span>
                  </button>
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${STATE_CLS[w.state ?? 'proposed'] ?? STATE_CLS.proposed}`}>
                    {w.state ?? 'proposed'}
                  </span>
                  {w.job_id && (
                    <span
                      className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      title="One definition — its trigger IS the job's trigger"
                    >
                      job {w.job_id}
                    </span>
                  )}
                  {w.activable?.ok ? (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      activable
                    </span>
                  ) : (
                    <span
                      className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      title={w.activable?.reason}
                    >
                      not activable yet
                    </span>
                  )}
                </div>

                {w.phrase && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-medium">{w.phrase.event ?? '—'}</span>
                    {w.phrase.condition ? ` when ${w.phrase.condition}` : ''} →{' '}
                    {w.phrase.action ?? '—'} → {w.phrase.destination ?? '—'}
                    {w.phrase.expected_result ? (
                      <span className="text-slate-400 dark:text-slate-500">
                        {' '}
                        — {w.phrase.expected_result}
                      </span>
                    ) : null}
                  </p>
                )}

                {missing.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {missing.map((m, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="text-amber-700 dark:text-amber-400">{m.what}</span>
                        <span className="text-slate-400 dark:text-slate-500">{m.why}</span>
                        <MissingDecision draftId={draftId} m={m} onDone={() => void load()} />
                      </li>
                    ))}
                  </ul>
                )}

                {/* controls are ALWAYS on the row — testable and stoppable
                  * without expanding; a missing decision disables with its
                  * reason, never hides the button */}
                <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        trigger
                        <select
                          value={w.trigger?.cron_choice ?? 'manual'}
                          disabled={!w.trigger_path || busy === `trig:${aid}`}
                          aria-label={`Trigger for ${aid}`}
                          title={
                            w.trigger_path
                              ? `Patches ${w.trigger_path} — the same definition the job reads`
                              : 'This item has no editable trigger'
                          }
                          onChange={(e) =>
                            void act(`trig:${aid}`, aid, () =>
                              patchModel(
                                draftId,
                                [
                                  {
                                    op: 'set',
                                    path: w.trigger_path!,
                                    value: { cron_choice: e.target.value === 'manual' ? null : e.target.value },
                                  },
                                ],
                                true,
                                `workflow trigger → ${e.target.value}`,
                              ),
                            )
                          }
                          className="h-6 rounded border border-slate-200 bg-white px-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </span>
                      <button
                        type="button"
                        disabled={busy === `pv:${aid}`}
                        onClick={async () => {
                          if (busy) return;
                          setBusy(`pv:${aid}`);
                          setError(null);
                          try {
                            const r = await previewWorkflow(draftId, aid);
                            setPreviews((p) => ({ ...p, [aid]: r }));
                          } catch (e) {
                            setError({ aid, message: errText(e) });
                          } finally {
                            setBusy(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                      >
                        {busy === `pv:${aid}` && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
                        Preview on history
                      </button>
                      <button
                        type="button"
                        disabled={busy === `run:${aid}` || w.activable?.ok === false}
                        title={
                          w.activable?.ok === false
                            ? `Blocked by a decision to take — ${w.activable?.reason ?? 'see the line above'}`
                            : 'Runs the workflow once against the sandbox — no side effects outside it'
                        }
                        onClick={async () => {
                          setBusy(`run:${aid}`);
                          setError(null);
                          try {
                            const r = await testRunWorkflow(draftId, aid);
                            setRuns((p) => ({ ...p, [aid]: r }));
                            await load();
                          } catch (e) {
                            setError({ aid, message: errText(e) });
                          } finally {
                            setBusy(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                      >
                        {busy === `run:${aid}` ? (
                          <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play aria-hidden className="h-3 w-3" />
                        )}
                        Test-run (sandbox)
                      </button>
                      {w.state !== 'stopped' ? (
                        <button
                          type="button"
                          disabled={busy === `stop:${aid}`}
                          onClick={() => void act(`stop:${aid}`, aid, () => stopWorkflow(draftId, aid, 'stopped from the panel'))}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          <Square aria-hidden className="h-3 w-3" />
                          Stop
                        </button>
                      ) : removeArmed === aid ? (
                        <button
                          type="button"
                          disabled={busy === `rm:${aid}`}
                          onClick={() => void act(`rm:${aid}`, aid, () => removeWorkflow(draftId, aid))}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          Remove for good?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRemoveArmed(aid)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:text-red-500 dark:border-slate-700 dark:text-slate-400"
                        >
                          <X aria-hidden className="h-3 w-3" />
                          Remove
                        </button>
                      )}
                    </div>

                    {pv && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {pv.status === 'not_computable' ? (
                          <>
                            Not computable yet — {(pv.missing ?? []).map((m) => m.what).join('; ')}.
                            No query ran.
                          </>
                        ) : (
                          <>
                            {pv.count ?? 0} expected triggering(s)
                            {pv.deduplicated ? ` · ${pv.deduplicated} deduplicated` : ''}
                            {pv.dedup_note ? ` — ${pv.dedup_note}` : ''} · no side effects
                            {pv.count === 0 && pv.history_hint?.overdue_records_all_time != null && (
                              <span className="block text-slate-400 dark:text-slate-500">
                                Nothing due in this window — the history holds{' '}
                                {pv.history_hint.overdue_records_all_time.toLocaleString()} overdue
                                record(s) all-time
                                {pv.history_hint.window_days_to_reach_min_due != null
                                  ? `; a ${pv.history_hint.window_days_to_reach_min_due}-day window reaches them`
                                  : ''}
                                .
                              </span>
                            )}
                          </>
                        )}
                      </p>
                    )}
                    {tr && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Delivered {tr.results?.delivered_new ?? '—'} (before{' '}
                        {tr.results?.deliveries_before ?? '—'} → after{' '}
                        {tr.results?.deliveries_after ?? '—'})
                        {tr.results?.deduplicated ? ` · ${tr.results.deduplicated} deduplicated` : ''}{' '}
                        · inbox {tr.evidence?.inbox?.status ?? '—'} ·{' '}
                        <span className="font-mono text-xs">{tr.evidence?.deliveries_table}</span>
                        {tr.evidence?.is_test_data ? ' · test data' : ''}
                      </p>
                    )}
                    {w.stopped?.verification && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Stop verified{w.stopped.verification.ok ? '' : ' — NOT clean'}:{' '}
                        {Object.entries(w.stopped.verification.checks ?? {})
                          .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v === true || v === 'ok' ? '✓' : String(v)}`)
                          .join(' · ')}
                      </p>
                    )}
                    {/* execution history — counters come with the list, the
                        detail is fetched only when asked for */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600 dark:text-slate-300">
                      <span>
                        {(w.runs_summary?.count ?? 0) === 0
                          ? 'Never executed'
                          : `Executed ${w.runs_summary!.count} time${w.runs_summary!.count === 1 ? '' : 's'}`}
                        {w.runs_summary?.last?.at
                          ? ` · last ${new Date(w.runs_summary.last.at).toLocaleString()}`
                          : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadHistory(aid)}
                        className="text-accent-700 hover:underline dark:text-accent-400"
                      >
                        {history[aid] ? 'Refresh history' : 'History'}
                      </button>
                      {w.definition_version?.last_changed_at && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          definition rev {w.definition_version.revision ?? '—'}, last changed{' '}
                          {new Date(w.definition_version.last_changed_at).toLocaleDateString()}
                          {w.definition_version.last_changed_by
                            ? ` by ${w.definition_version.last_changed_by}`
                            : ''}
                        </span>
                      )}
                    </div>
                    {history[aid] && (
                      <div className="rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                        {history[aid]!.runs.items.length === 0 ? (
                          <p className="text-[13px] text-slate-500 dark:text-slate-400">
                            No execution recorded.
                            {history[aid]!.runs.scheduled?.available === false
                              ? ` ${history[aid]!.runs.scheduled!.reason}.`
                              : ''}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-[13px]">
                              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                <tr>
                                  <th className="px-2 py-1 font-medium">Kind</th>
                                  <th className="px-2 py-1 font-medium">Result</th>
                                  <th className="px-2 py-1 font-medium">Delivered</th>
                                  <th className="px-2 py-1 font-medium">When</th>
                                  <th className="px-2 py-1 font-medium">Version used</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {history[aid]!.runs.items.map((r, i) => (
                                  <tr key={r.run_id ?? i}>
                                    <td className="whitespace-nowrap px-2 py-1">
                                      {r.kind === 'test' ? 'test run' : (r.kind ?? '—')}
                                      {r.evidence?.is_test_data ? ' · test data' : ''}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1">{r.status ?? '—'}</td>
                                    <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                                      {r.delivered ?? '—'}
                                      {r.deduplicated ? ` · ${r.deduplicated} deduplicated` : ''}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                                      {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                                      {r.duration_ms != null ? ` · ${(r.duration_ms / 1000).toFixed(1)} s` : ''}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                                      {r.version ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {history[aid]!.runs.retention?.note && (
                              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                {history[aid]!.runs.retention!.note}
                              </p>
                            )}
                          </div>
                        )}
                        {(history[aid]!.versions.events.length ?? 0) > 0 && (
                          <div className="mt-2 border-t border-slate-100 pt-1.5 dark:border-slate-800">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Definition history
                            </p>
                            <ul className="mt-0.5 space-y-0.5">
                              {history[aid]!.versions.events.slice(0, 8).map((ev, i) => (
                                <li key={i} className="text-[13px] text-slate-600 dark:text-slate-300">
                                  {ev.at ? new Date(ev.at).toLocaleString() : '—'} ·{' '}
                                  {ev.summary ??
                                    (ev.kind === 'edit'
                                      ? `${ev.field ?? ev.path ?? 'a field'} changed`
                                      : (ev.kind ?? 'change'))}
                                  {ev.by ? ` · by ${ev.by}` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {(w.steps?.length ?? 0) > 0 && (
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500">
                          {w.steps!.length} step(s) — the same definition the graph shows
                        </summary>
                        <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                          {w.steps!.map((s, i) => (
                            <li key={i}>
                              {String((s as { name?: string; kind?: string }).name ?? (s as { kind?: string }).kind ?? `step ${i + 1}`)}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                {error?.aid === aid && (
                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {error.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
