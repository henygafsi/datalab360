'use client';

/**
 * StudioJobEditor — one process, opened wide enough to work in.
 *
 * Persistent context on top (what the job reads → what it feeds, the
 * environment and the draft state), then four sections:
 *   Transformation / Quality & rejects / Trigger / Runs.
 *
 * Edit semantics (the product truth, not the transport):
 *  - edits accumulate LOCALLY; « Save draft » applies them in ONE
 *    validated patch — the active version is untouched until publish;
 *  - « Run test (sandbox) » executes the saved definition against the
 *    sandbox schema — a passing test is not an activation;
 *  - leaving with unsaved edits asks: save, discard or stay.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  FlaskConical,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  patchModel,
  runJob,
  testJob,
  type JobTestResult,
  type JobRun,
  type StudioJob,
  type StudioTarget,
  type TargetsView,
} from '@/app/services/studio/studio-api';
import { StudioJobBlocksView, StudioBlockProposals } from '@/app/shared/studio/StudioBlocksCanvas';

/** A backend error may be a string OR a structured detail object — never
 *  render one straight into JSX (React refuses objects as children). */
function asText(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as { message?: string; error_code?: string; field?: string };
    return o.message ?? o.error_code ?? JSON.stringify(v).slice(0, 200);
  }
  return String(v);
}

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string } | string } } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return e instanceof Error ? e.message : 'The action failed.';
}

/* One readable state per job — raw enums stay in the tooltip. */
export const JOB_STATE_LABEL: Record<string, { label: string; cls: string }> = {
  configured: { label: 'Ready to run', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  loaded: { label: 'Loaded', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  degraded: { label: 'Needs attention', cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

export const SCHEDULE_LABEL: Record<string, string> = {
  manual: 'Manual',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  cron: 'Custom schedule',
};

/** The newest run — runs[] ordering is not guaranteed. */
export function latestRun(j: StudioJob): JobRun | undefined {
  return (j.runs ?? []).reduce<JobRun | undefined>(
    (best, r) => (!best || String(r.started_at ?? '') > String(best.started_at ?? '') ? r : best),
    undefined,
  );
}

function CopyableFqn({ fqn }: { fqn: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(fqn).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title={`${fqn} — click to copy`}
      className="inline-flex max-w-full items-center gap-1 rounded px-1 font-mono text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <span className="truncate">{fqn}</span>
      <Copy aria-hidden className="h-3 w-3 shrink-0" />
      {copied && <span className="text-xs text-emerald-600 dark:text-emerald-400">copied</span>}
    </button>
  );
}

type Section = 'transformation' | 'quality' | 'trigger' | 'runs';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'transformation', label: 'Transformation' },
  { id: 'quality', label: 'Quality & rejects' },
  { id: 'trigger', label: 'Trigger' },
  { id: 'runs', label: 'Runs' },
];

interface Buffer {
  sql: string;
  sqlExpert: boolean;
  rules: NonNullable<StudioJob['rules']>;
  triggerChoice: string;
}

function bufferFrom(j: StudioJob): Buffer {
  return {
    sql: j.sql ?? '',
    sqlExpert: j.sql_mode === 'expert',
    rules: (j.rules ?? []).map((r) => ({ ...r })),
    triggerChoice: j.trigger?.cron_choice ?? 'manual',
  };
}

function isDirty(b: Buffer, j: StudioJob): boolean {
  const base = bufferFrom(j);
  return (
    b.sql !== base.sql ||
    b.sqlExpert !== base.sqlExpert ||
    b.triggerChoice !== base.triggerChoice ||
    JSON.stringify(b.rules) !== JSON.stringify(base.rules)
  );
}

function RunRow({ run }: { run: JobRun }) {
  const [open, setOpen] = useState(false);
  const c = run.results?.[0] ?? {};
  const ok = run.status === 'succeeded' || run.status === 'success' || run.status === 'ok';
  return (
    <>
      <tr className="text-[13px]">
        <td className="px-2 py-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ok
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            {ok ? 'succeeded' : (run.status ?? 'failed')}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600 dark:text-slate-300">
          {c.rows_read ?? '—'} read · {c.rows_accepted ?? '—'} loaded · {c.rows_rejected ?? '—'} rejected
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-600 dark:text-slate-300">
          {c.target_count_after != null ? `${c.target_count_after} in target` : '—'}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-slate-500 dark:text-slate-400">
          {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-500 dark:text-slate-400">
          {run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)} s` : '—'}
        </td>
        <td className="px-2 py-1.5">
          {(run.proofs?.length ?? 0) > 0 || run.error ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {open ? <ChevronDown aria-hidden className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
              details
            </button>
          ) : null}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-2 pb-2">
            {run.error && (
              <p role="alert" className="mb-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-[13px] text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {asText(run.error)}
              </p>
            )}
            {(run.proofs?.length ?? 0) > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <tr>
                      <th className="px-2 py-1 font-medium">Step</th>
                      <th className="px-2 py-1 font-medium">Duration</th>
                      <th className="px-2 py-1 font-medium">Query id</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {run.proofs!.map((p, i) => (
                      <tr key={i} title={p.sql}>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-600 dark:text-slate-300">{p.step ?? '—'}</td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-500 dark:text-slate-400">
                          {p.duration_ms != null ? `${p.duration_ms} ms` : '—'}
                        </td>
                        <td className="px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400">{p.query_id ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function StudioJobEditor({
  draftId,
  job,
  jobIndex,
  view,
  initialSection,
  onClose,
  onChanged,
  onOpenQuality,
}: {
  draftId: string;
  job: StudioJob;
  /** Index in model.jobs — the patch path base. */
  jobIndex: number;
  view: TargetsView;
  /** A quality anomaly opens straight on its rule. */
  initialSection?: Section;
  onClose: () => void;
  /** After a save or a run — the parent re-reads the targets view. */
  onChanged: () => void;
  onOpenQuality?: () => void;
}) {
  const [section, setSection] = useState<Section>(initialSection ?? 'transformation');
  const [buf, setBuf] = useState<Buffer>(() => bufferFrom(job));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  /** the dry ingestion test — not a run, kept beside the history */
  const [ingestionTest, setIngestionTest] = useState<JobTestResult | null>(null);

  const dirty = isDirty(buf, job);

  /* A reload with no local edits re-syncs the buffer (reopen restores
   * the saved values); local edits are never clobbered by a refresh. */
  useEffect(() => {
    setBuf((cur) => (isDirty(cur, job) ? cur : bufferFrom(job)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const targetById = useMemo(
    () => new Map(view.targets.map((t) => [t.target_id, t])),
    [view.targets],
  );
  const feeds: StudioTarget[] = (job.target_ids ?? [])
    .map((id) => targetById.get(id))
    .filter((t): t is StudioTarget => t != null);
  const mainTarget = feeds[0];
  const lastRun = latestRun(job);
  const dlqOpen = lastRun?.results?.[0]?.dlq_open ?? 0;
  const env = view.target_schema?.environment ?? 'sandbox';

  const save = useCallback(async () => {
    if (!dirty || busy) return;
    setBusy('save');
    setError(null);
    const ops: Array<{ op: string; path: string; value: unknown }> = [];
    const base = bufferFrom(job);
    if (!buf.sqlExpert && base.sqlExpert) {
      // back to the mapping: the backend REGENERATES the SQL — no stale
      // expert text is sent alongside
      ops.push({ op: 'set', path: `/model/jobs/${jobIndex}/sql_mode`, value: 'generated' });
    } else if (buf.sql !== base.sql || buf.sqlExpert !== base.sqlExpert) {
      ops.push({ op: 'set', path: `/model/jobs/${jobIndex}/sql`, value: buf.sql });
      ops.push({ op: 'set', path: `/model/jobs/${jobIndex}/sql_mode`, value: 'expert' });
    }
    if (JSON.stringify(buf.rules) !== JSON.stringify(base.rules)) {
      ops.push({ op: 'set', path: `/model/jobs/${jobIndex}/rules`, value: buf.rules });
    }
    if (buf.triggerChoice !== base.triggerChoice) {
      ops.push({
        op: 'set',
        path: `/model/jobs/${jobIndex}/trigger`,
        value: { cron_choice: buf.triggerChoice === 'manual' ? null : buf.triggerChoice },
      });
    }
    try {
      await patchModel(
        draftId,
        ops as never,
        true,
        `edit job ${job.name ?? job.job_id}`,
        view.updated_at,
      );
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 4000);
      onChanged();
      return true;
    } catch (e) {
      const conflict = JSON.stringify(
        (e as { response?: { data?: unknown } })?.response?.data ?? '',
      ).includes('EDIT_CONFLICT');
      setError(
        conflict
          ? 'Someone else saved this application while you were editing — your edits are kept on screen; close and reopen the process to load the latest state, then redo them.'
          : errText(e),
      );
      return false;
    } finally {
      setBusy(null);
    }
  }, [dirty, busy, buf, job, jobIndex, draftId, view.updated_at, onChanged]);

  const runTest = useCallback(async () => {
    if (busy) return;
    setBusy('run');
    setError(null);
    try {
      await runJob(draftId, job.job_id);
      setSection('runs');
      onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }, [busy, draftId, job.job_id, onChanged]);

  const testIngestion = useCallback(async () => {
    if (busy) return;
    setBusy('test');
    setError(null);
    try {
      setIngestionTest(await testJob(draftId, job.job_id));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }, [busy, draftId, job.job_id]);

  const requestClose = useCallback(() => {
    if (dirty) setLeaving(true);
    else onClose();
  }, [dirty, onClose]);

  const srcShort = (job.sources ?? []).map((s) => s.split('.').slice(-1)[0]).join(', ');

  return (
    <section
      aria-label={`Edit ${job.name ?? job.job_id}`}
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* ── persistent context ── */}
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            All processes
          </button>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {job.name ?? job.job_id}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${(JOB_STATE_LABEL[job.state ?? ''] ?? JOB_STATE_LABEL.configured).cls}`}
            title={`Backend state: ${job.state ?? '—'} · mode ${job.mode ?? '—'}`}
          >
            {(JOB_STATE_LABEL[job.state ?? ''] ?? JOB_STATE_LABEL.configured).label}
          </span>
          {dirty ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              unsaved edits
            </span>
          ) : savedNote ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              saved to draft
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!dirty || busy != null}
              onClick={() => void save()}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={busy != null || dirty}
              title={dirty ? 'Save the draft first — the test runs the saved definition' : 'Run against the sandbox schema — free of production impact'}
              onClick={() => void runTest()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
            >
              {busy === 'run' ? (
                <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play aria-hidden className="h-3.5 w-3.5" />
              )}
              {busy === 'run' ? 'Running…' : 'Run test (sandbox)'}
            </button>
          </span>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-500 dark:text-slate-400">
          <span>
            Reads <span className="font-medium text-slate-700 dark:text-slate-300">{srcShort || '—'}</span>
            {' '}→ feeds{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">{mainTarget?.name ?? '—'}</span>
          </span>
          {mainTarget?.target_fqn && <CopyableFqn fqn={mainTarget.target_fqn} />}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {env}
          </span>
        </p>
        {leaving && (
          <div
            role="alertdialog"
            aria-label="Unsaved edits"
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20"
          >
            <p className="text-[13px] text-amber-800 dark:text-amber-200">
              You have unsaved edits on this process.
            </p>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void save().then((ok) => {
                    if (ok) onClose();
                  });
                }}
                className="rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700"
              >
                Save and close
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Discard edits
              </button>
              <button
                type="button"
                onClick={() => setLeaving(false)}
                className="px-1 text-[13px] text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                Stay
              </button>
            </span>
          </div>
        )}
      </div>

      {/* ── section nav ── */}
      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 pt-2 dark:border-slate-800" role="tablist" aria-label="Job sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`rounded-t-lg border-b-2 px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              section === s.id
                ? 'border-accent-600 font-medium text-slate-900 dark:text-slate-100'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {s.label}
            {s.id === 'quality' && dlqOpen > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {dlqOpen}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ── TRANSFORMATION ── */}
        {section === 'transformation' && (
          <div className="space-y-4">
            {mainTarget && (mainTarget.columns?.length ?? 0) > 0 ? (
              <div>
                <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  Source → target mapping
                </p>
                <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  <table className="min-w-full text-[13px]">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">Target column</th>
                        <th className="px-2.5 py-1.5 font-medium">Type</th>
                        <th className="px-2.5 py-1.5 font-medium">From</th>
                        <th className="px-2.5 py-1.5 font-medium">Rule</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mainTarget.columns!.map((c) => (
                        <tr key={c.name}>
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-700 dark:text-slate-300">
                            {c.name}
                            {c.nullable === false && (
                              <span className="ml-1.5 text-xs text-slate-400" title="not null">
                                *
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                            {c.type ?? '—'}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                            {c.expression
                              ? c.expression
                              : c.source?.column
                                ? `${(c.source.fqn ?? '').split('.').slice(-1)[0]}.${c.source.column}`
                                : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {c.rule?.kind ? `${c.rule.kind} → ${c.rule.behavior ?? '—'}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {mainTarget.mapping?.dedup?.key?.length ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Deduplicated by {mainTarget.mapping.dedup.key.join(' + ')}
                    {mainTarget.mapping.load_mode ? ` · load mode ${mainTarget.mapping.load_mode}` : ''}
                    {mainTarget.mapping.watermark?.column ? ` · watermark ${mainTarget.mapping.watermark.column}` : ''}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                No column mapping is defined yet for this process.
              </p>
            )}

            {/* blocks — the same definition, as a graph */}
            <div>
              <button
                type="button"
                aria-expanded={blocksOpen}
                onClick={() => setBlocksOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-200"
              >
                {blocksOpen ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronRight aria-hidden className="h-4 w-4" />}
                Blocks — the same definition as a graph
              </button>
              {blocksOpen && (
                <div className="mt-2">
                  <StudioJobBlocksView draftId={draftId} jobId={job.job_id} />
                </div>
              )}
            </div>

            {/* SQL — read by default, expert edit is explicit */}
            <div>
              <button
                type="button"
                aria-expanded={sqlOpen}
                onClick={() => setSqlOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-200"
              >
                {sqlOpen ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronRight aria-hidden className="h-4 w-4" />}
                SQL
                <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {buf.sqlExpert ? 'expert — edited by hand' : 'generated from the mapping'}
                </span>
              </button>
              {sqlOpen &&
                (buf.sqlExpert ? (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={buf.sql}
                      onChange={(e) => setBuf((b) => ({ ...b, sql: e.target.value }))}
                      rows={16}
                      spellCheck={false}
                      aria-label={`SQL of ${job.name ?? job.job_id}`}
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-[13px] leading-relaxed text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Expert SQL — the mapping builder no longer follows this job; the backend
                      revalidates before anything runs.
                    </p>
                    <button
                      type="button"
                      onClick={() => setBuf((b) => ({ ...b, sqlExpert: false, sql: job.sql ?? '' }))}
                      title="Back to the mapping — the SQL is regenerated from it on save; the expert text is dropped"
                      className="text-[13px] text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Restore the generated SQL
                    </button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {buf.sql || '—'}
                    </pre>
                    <button
                      type="button"
                      onClick={() => setBuf((b) => ({ ...b, sqlExpert: true }))}
                      className="mt-1.5 text-[13px] text-accent-700 hover:underline dark:text-accent-400"
                    >
                      Edit as expert SQL
                    </button>
                  </div>
                ))}
            </div>

            {/* grounded proposals for THIS application's jobs */}
            <div>
              <button
                type="button"
                aria-expanded={proposalsOpen}
                onClick={() => setProposalsOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-200"
              >
                {proposalsOpen ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronRight aria-hidden className="h-4 w-4" />}
                Proposed blocks
              </button>
              {proposalsOpen && (
                <div className="mt-2">
                  <StudioBlockProposals draftId={draftId} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── QUALITY & REJECTS ── */}
        {section === 'quality' && (
          <div className="space-y-4">
            {(buf.rules.length ?? 0) > 0 ? (
              <div>
                <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  Rules applied on load
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  The same rules the Quality page diagnoses — edited here, in the responsible
                  process, never in a second registry.
                </p>
                <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  <table className="min-w-full text-[13px]">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">Rule</th>
                        <th className="px-2.5 py-1.5 font-medium">Column</th>
                        <th className="px-2.5 py-1.5 font-medium">When it fails</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {buf.rules.map((r, ri) => (
                        <tr key={r.rule_id ?? ri} title={r.predicate}>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-700 dark:text-slate-300">
                            {/* business words first — the raw kind stays as evidence */}
                            <span title={r.kind ?? undefined}>
                              {({
                                not_null: 'must be present',
                                unique: 'no duplicates',
                                referential_integrity: 'must match its reference',
                                accepted_values: 'value in the allowed list',
                                freshness: 'must be fresh',
                                row_count: 'expected volume',
                              } as Record<string, string>)[r.kind ?? ''] ??
                                (r.kind ? r.kind.replace(/_/g, ' ') : '—')}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-600 dark:text-slate-300">
                            {r.column ?? '—'}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <select
                              value={r.behavior ?? 'quarantine'}
                              aria-label={`Behavior of ${r.rule_id ?? r.kind}`}
                              onChange={(e) =>
                                setBuf((b) => ({
                                  ...b,
                                  rules: b.rules.map((x, xi) =>
                                    xi === ri ? { ...x, behavior: e.target.value } : x,
                                  ),
                                }))
                              }
                              className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                              <option value="quarantine">quarantine the row (DLQ)</option>
                              <option value="block">block the whole load</option>
                              <option value="warn">warn only, keep the row</option>
                              {/* A behaviour the server knows and this list
                                  does not must stay visible and selected —
                                  otherwise the rule reads as unconfigured
                                  and the next change silently overwrites it.
                                  The trigger select below already does this. */}
                              {r.behavior && !['quarantine', 'block', 'warn'].includes(r.behavior) && (
                                <option value={r.behavior}>{r.behavior}</option>
                              )}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                This process has no quality rule — every source row is loaded as read.
              </p>
            )}

            {job.on_failure && (
              <p className="text-[13px] text-slate-600 dark:text-slate-300">
                If the process itself fails: <span className="font-medium">{job.on_failure.replace(/_/g, ' ')}</span>.
              </p>
            )}

            <div className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
              <p className="text-[13px] text-slate-600 dark:text-slate-300">
                {dlqOpen > 0 ? (
                  <>
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {dlqOpen} rejected row{dlqOpen > 1 ? 's' : ''} waiting
                    </span>{' '}
                    in quarantine after the last run.
                  </>
                ) : (
                  'No rejected rows waiting after the last run.'
                )}
              </p>
              {onOpenQuality && (
                <button
                  type="button"
                  onClick={onOpenQuality}
                  className="mt-1 text-[13px] text-accent-700 hover:underline dark:text-accent-400"
                >
                  Open the quality diagnosis
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── TRIGGER ── */}
        {section === 'trigger' && (
          <div className="max-w-xl space-y-3">
            <p className="text-[13px] text-slate-700 dark:text-slate-200">
              {buf.triggerChoice === 'manual' ? (
                <>This process runs <span className="font-medium">only when you launch it</span> — nothing is scheduled.</>
              ) : (
                <>
                  Scheduled <span className="font-medium">{(SCHEDULE_LABEL[buf.triggerChoice] ?? buf.triggerChoice).toLowerCase()}</span>, times in UTC.
                </>
              )}
            </p>
            <label className="block text-[13px] text-slate-600 dark:text-slate-300">
              Frequency
              <select
                value={buf.triggerChoice}
                onChange={(e) => setBuf((b) => ({ ...b, triggerChoice: e.target.value }))}
                className="mt-1 block h-8 w-56 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {['manual', 'hourly', 'daily', 'weekly', 'monthly']
                  .concat(
                    !['manual', 'hourly', 'daily', 'weekly', 'monthly'].includes(buf.triggerChoice)
                      ? [buf.triggerChoice]
                      : [],
                  )
                  .map((c) => (
                    <option key={c} value={c}>
                      {SCHEDULE_LABEL[c] ?? c}
                    </option>
                  ))}
              </select>
            </label>
            {buf.triggerChoice !== 'manual' && (
              <div className="rounded-lg border border-slate-100 px-3 py-2 text-[13px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {job.trigger?.next_run ? (
                  <p>
                    Next run: <span className="font-medium tabular-nums">{job.trigger.next_run}</span> (UTC)
                  </p>
                ) : (
                  <p>
                    <span className="font-medium">Not active yet</span> — a schedule starts running
                    when the application is activated; saving this draft does not start it.
                  </p>
                )}
                {job.trigger?.note && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{job.trigger.note}</p>
                )}
              </div>
            )}
            {dirty && buf.triggerChoice !== bufferFrom(job).triggerChoice && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Frequency change not saved yet — use « Save draft » above.
              </p>
            )}
          </div>
        )}

        {/* ── RUNS ── */}
        {section === 'runs' && (
          <div>
            {/* the ingestion test: EXPLAIN + preview, nothing written —
                its result is shown here, above the real runs, and says so */}
            <div className="mb-3 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void testIngestion()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                >
                  {busy === 'test' ? (
                    <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FlaskConical aria-hidden className="h-3.5 w-3.5" />
                  )}
                  {busy === 'test' ? 'Testing…' : 'Test the ingestion'}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Checks the query and estimates the volume — writes nothing.
                </span>
              </div>
              {ingestionTest && (
                <div className="mt-1.5 text-[13px] text-slate-700 dark:text-slate-200">
                  {ingestionTest.explain?.ok === false || ingestionTest.error ? (
                    (() => {
                      const raw = asText(ingestionTest.explain?.error ?? ingestionTest.error);
                      /* a vendor code is not a sentence — say what it means
                       * and keep the exact text one hover away */
                      const missing = /does not exist|002003|42S02/i.test(raw);
                      return (
                        <p className="text-red-600 dark:text-red-400" title={raw}>
                          {missing
                            ? `The target table does not exist yet — run this process once to create it, then the test can read it.`
                            : `The query did not compile: ${raw.replace(/^\d+\s*\([^)]*\):\s*/, '')}`}
                        </p>
                      );
                    })()
                  ) : (
                    <>
                      <p>
                        Query valid · reads about{' '}
                        <span className="tabular-nums">
                          {ingestionTest.estimate?.bytes_assigned != null
                            ? `${(ingestionTest.estimate.bytes_assigned / 1024 / 1024).toFixed(1)} MB`
                            : '—'}
                        </span>
                        {ingestionTest.estimate?.partitions_assigned != null
                          ? ` over ${ingestionTest.estimate.partitions_assigned} of ${ingestionTest.estimate.partitions_total ?? '—'} partitions`
                          : ''}
                        {' · '}
                        {ingestionTest.output_schema?.length ?? 0} column(s) produced
                        {(ingestionTest.affected?.rules?.length ?? 0) > 0
                          ? ` · ${ingestionTest.affected!.rules!.length} quality rule(s) apply`
                          : ''}
                        .
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {ingestionTest.estimate?.note ??
                          'An optimiser estimate before execution — not a billed amount.'}{' '}
                        Nothing was written: this test does not appear as a run below.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            {(job.runs?.length ?? 0) === 0 ? (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                This process has never run — « Run test (sandbox) » executes it against the
                sandbox schema, free of production impact.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="min-w-full">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Result</th>
                      <th className="px-2 py-1.5 font-medium">Rows</th>
                      <th className="px-2 py-1.5 font-medium">Target</th>
                      <th className="px-2 py-1.5 font-medium">Started</th>
                      <th className="px-2 py-1.5 font-medium">Duration</th>
                      <th className="px-2 py-1.5 font-medium" aria-label="Details" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[...(job.runs ?? [])]
                      .sort((a, b) => String(b.started_at ?? '').localeCompare(String(a.started_at ?? '')))
                      .map((r, i) => (
                        <RunRow key={r.run_id ?? i} run={r} />
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
