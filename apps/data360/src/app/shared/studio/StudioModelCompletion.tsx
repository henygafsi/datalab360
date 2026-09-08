'use client';

/**
 * StudioModelCompletion — closing the chain, on the model page itself.
 *
 * An application only reports continuously off its own model once TWO
 * things are true: every target it proposed actually exists, and the report
 * reads those targets rather than the sources they were copied from. Until
 * then the screen shows a model that is half a promise — a table marked
 * « proposed / not created yet » and widgets quietly reading the warehouse.
 *
 * This panel states both gaps in one place and closes them where they are
 * read: preview what a target WOULD hold (a guarded SELECT, nothing
 * written), create it, then point the report at the model. Each step is a
 * real call with its own result; nothing is claimed before it happened.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Play, RefreshCw, Table2 } from 'lucide-react';
import {
  getConsistency,
  getVersions,
  patchModel,
  previewTarget,
  runJob,
  type ConsistencyIssue,
  type StudioVersion,
  type TargetPreview,
  type TargetsView,
} from '@/app/services/studio/studio-api';

function errText(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: { message?: string } | string } } })?.response
    ?.data?.detail;
  if (typeof d === 'string') return d;
  if (d?.message) return d.message;
  return e instanceof Error ? e.message : 'The action failed.';
}

export default function StudioModelCompletion({
  draftId,
  view,
  report,
  onChanged,
}: {
  draftId: string;
  view: TargetsView;
  /** the draft report, to locate the widgets that must be repointed */
  report?: { kpis?: Array<Record<string, unknown>>; charts?: Array<Record<string, unknown>> } | null;
  onChanged: () => void;
}) {
  const [issues, setIssues] = useState<ConsistencyIssue[] | null>(null);
  const [versions, setVersions] = useState<StudioVersion[] | null>(null);
  const [active, setActive] = useState<StudioVersion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, TargetPreview | 'loading'>>({});
  const [done, setDone] = useState<string | null>(null);

  const reload = useCallback(() => {
    void getConsistency(draftId)
      .then((c) => setIssues(c.issues))
      .catch(() => setIssues([]));
    void getVersions(draftId)
      .then((v) => {
        setVersions(v.versions);
        setActive(v.active ?? null);
      })
      .catch(() => setVersions([]));
  }, [draftId]);

  useEffect(reload, [reload]);

  const missing = view.targets.filter((t) => t.state === 'proposed' || t.state === 'validated');
  const readsSource = (issues ?? []).filter(
    (i) => i.code === 'REPORT_READS_SOURCE_WHILE_TARGET_LOADED' && i.fix?.available,
  );
  const nothingToDo = missing.length === 0 && readsSource.length === 0;

  /** Create one target for real: its producer job builds the table. */
  const createTarget = async (targetId: string, jobId?: string) => {
    if (!jobId || busy) return;
    setBusy(`create:${targetId}`);
    setError(null);
    try {
      await runJob(draftId, jobId);
      setDone(`Table created — the model now holds it.`);
      onChanged();
      reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  /** Point every widget still reading a source at its loaded target. */
  const pointReportAtModel = async () => {
    if (busy || readsSource.length === 0) return;
    setBusy('repoint');
    setError(null);
    try {
      const specs = [
        ...(report?.kpis ?? []).map((s, i) => ({ s, path: `/report/kpis/${i}` })),
        ...(report?.charts ?? []).map((s, i) => ({ s, path: `/report/charts/${i}` })),
      ];
      const ops: Array<{ op: string; path: string; value: unknown }> = [];
      for (const issue of readsSource) {
        const to = String(issue.fix?.to ?? '');
        const [database, schema, table] = to.split('.');
        if (!database || !schema || !table) continue;
        const hit = specs.find((x) => String(x.s.chart_id ?? '') === String(issue.chart_id ?? ''));
        if (!hit) continue;
        ops.push({ op: 'set', path: `${hit.path}/dataset`, value: { database, schema, table } });
      }
      if (ops.length === 0) {
        setError('The widgets to repoint could not be located in this report.');
        return;
      }
      await patchModel(draftId, ops as never, true, 'point the report at the model');
      setDone(`${ops.length} widget(s) now read the model instead of the sources.`);
      onChanged();
      reload();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Completing the model
        </h3>
        {active?.version_number != null && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            v{active.version_number} active
          </span>
        )}
      </div>

      {issues === null ? (
        <div className="mt-2 h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
      ) : nothingToDo ? (
        <p className="mt-1.5 text-[13px] text-slate-600 dark:text-slate-300">
          Complete — the report regenerates from the model.
        </p>
      ) : (
        <>


          {/* 1 — tables that were proposed but never built */}
          {missing.length > 0 && (
            <div className="mt-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {missing.length} table(s) proposed but never created
              </p>
              <ul className="mt-1 space-y-1.5">
                {missing.map((t) => {
                  const job = (view.jobs ?? []).find(
                    (j) =>
                      j.job_id === t.producer_job_id || (j.target_ids ?? []).includes(t.target_id),
                  );
                  const pv = preview[t.target_id];
                  return (
                    <li
                      key={t.target_id}
                      className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <Table2 aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {t.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {job ? `built by ${job.name ?? job.job_id}` : 'no process builds it yet'}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy != null}
                            onClick={() => {
                              setPreview((p) => ({ ...p, [t.target_id]: 'loading' }));
                              void previewTarget(draftId, t.target_id)
                                .then((r) => setPreview((p) => ({ ...p, [t.target_id]: r })))
                                .catch((e) => {
                                  setError(errText(e));
                                  setPreview((p) => {
                                    const n = { ...p };
                                    delete n[t.target_id];
                                    return n;
                                  });
                                });
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                          >
                            {pv === 'loading' ? 'Reading…' : 'See what it would hold'}
                          </button>
                          <button
                            type="button"
                            disabled={busy != null || !job}
                            title={
                              job
                                ? 'Runs the process that builds this table in the sandbox'
                                : 'No process builds this table yet — propose the processes first'
                            }
                            onClick={() => void createTarget(t.target_id, job?.job_id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
                          >
                            {busy === `create:${t.target_id}` ? (
                              <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play aria-hidden className="h-3.5 w-3.5" />
                            )}
                            {busy === `create:${t.target_id}` ? 'Creating…' : 'Create it'}
                          </button>
                        </span>
                      </div>
                      {pv && pv !== 'loading' && (
                        <div className="mt-1.5">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {(pv.rows?.length ?? 0) > 0
                              ? `${pv.rows!.length} sample row(s) it would hold — nothing has been written.`
                              : 'The preview ran and returned no row — nothing has been written.'}
                          </p>
                          {(pv.columns?.length ?? 0) > 0 && (pv.rows?.length ?? 0) > 0 && (
                            <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                              <table className="min-w-full text-xs">
                                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  <tr>
                                    {pv.columns!.map((c) => (
                                      <th key={c} className="whitespace-nowrap px-2 py-1 font-medium">
                                        {c}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {pv.rows!.slice(0, 5).map((row, ri) => (
                                    <tr key={ri}>
                                      {(row as unknown[]).map((cell, ci) => (
                                        <td
                                          key={ci}
                                          className="whitespace-nowrap px-2 py-1 text-slate-600 dark:text-slate-300"
                                        >
                                          {cell == null ? '—' : String(cell).slice(0, 24)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 2 — widgets still reading the warehouse instead of the model */}
          {readsSource.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {readsSource.length} widget(s) still read the sources
              </p>

              <button
                type="button"
                disabled={busy != null}
                onClick={() => void pointReportAtModel()}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
              >
                {busy === 'repoint' ? (
                  <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                )}
                {busy === 'repoint'
                  ? 'Pointing…'
                  : `Point the ${readsSource.length} widget(s) at the model`}
              </button>
            </div>
          )}
        </>
      )}

      {done && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-emerald-700 dark:text-emerald-300">
          <Check aria-hidden className="h-3.5 w-3.5" />
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* 3 — the model's own history: every enrichment is a version */}
      {(versions?.length ?? 0) > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] text-slate-500 hover:text-slate-700 dark:text-slate-400">
            {versions!.length} version(s) of this model
          </summary>
          <ul className="mt-1 space-y-0.5">
            {versions!.slice(0, 8).map((v) => (
              <li key={v.version_id} className="text-[13px] text-slate-600 dark:text-slate-300">
                v{v.version_number ?? '?'}
                {v.status === 'active' ? ' · active' : ''}
                {v.created_at
                  ? ` · ${new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
                {v.created_by ? ` · by ${v.created_by}` : ''}
                {v.description ? ` — ${v.description}` : ''}
              </li>
            ))}
          </ul>

        </details>
      )}
    </section>
  );
}
