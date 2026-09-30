'use client';

/**
 * StudioJobsPanel — the processes that feed and automate one application,
 * as a PILOT LIST, not unfolded logs.
 *
 * One row answers: what the process feeds / whether it works / when it
 * runs / what needs an intervention. SQL, proofs and run details live in
 * the editor (StudioJobEditor), reachable from the row — never inline.
 *
 * Loads and automations are two FILTERS over the same surface, not two
 * stacked sections; a workflow keeps ONE definition (the same object the
 * Automations view edits).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, MoreHorizontal, Play, RefreshCw, Search, Workflow } from 'lucide-react';
import { SectionHead } from '@/app/shared/studio/PlainKit';
import {
  getTargetsView,
  patchModel,
  proposeJobs,
  proposeTargets,
  runJob,
  type StudioJob,
  type TargetsView,
} from '@/app/services/studio/studio-api';
import StudioJobEditor, {
  JOB_STATE_LABEL,
  SCHEDULE_LABEL,
  latestRun,
} from '@/app/shared/studio/StudioJobEditor';

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string } | string; code?: string } } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && detail.message)
    return String(detail.message);
  return e instanceof Error ? e.message : 'The action failed.';
}

function isUnsupportedPath(e: unknown): boolean {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  return JSON.stringify(data ?? '').includes('EDIT_PATH_NOT_ALLOWED');
}

/** ⋯ menu — native <details> keeps it keyboard-usable without a library. */
function RowMenu({
  job,
  scheduled,
  unsupported,
  busy,
  onDuplicate,
  onPause,
  onRemove,
  removeArmed,
}: {
  job: StudioJob;
  scheduled: boolean;
  unsupported: string | null;
  busy: boolean;
  onDuplicate: () => void;
  onPause: () => void;
  onRemove: () => void;
  removeArmed: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={`More actions for ${job.name ?? job.job_id}`}
        className="inline-flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal aria-hidden className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            ref.current?.removeAttribute('open');
            onDuplicate();
          }}
          className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Duplicate
        </button>
        {scheduled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              ref.current?.removeAttribute('open');
              onPause();
            }}
            className="block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Pause the schedule
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] disabled:opacity-40 ${
            removeArmed
              ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          }`}
        >
          {removeArmed
            ? 'Confirm — runs are archived, the target keeps its data'
            : 'Remove the process…'}
        </button>
        {unsupported && (
          <p className="px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400">{unsupported}</p>
        )}
      </div>
    </details>
  );
}

export default function StudioJobsPanel({
  draftId,
  onChanged,
  focusJobId,
  onOpenQuality,
  onOpenActivation,
  entityMeaning,
  onOpenTarget,
  listHeader,
}: {
  draftId: string;
  /** Loads/replays change target data — the parent refreshes its report. */
  onChanged?: () => void;
  /** A quality anomaly hands its fix to a specific process (opens its editor). */
  focusJobId?: string | null;
  /** Hand-off back to the quality diagnosis. */
  onOpenQuality?: () => void;
  /** « awaiting activation » is a LINK to the one activation panel. */
  onOpenActivation?: () => void;
  /** entity_id → the AI's plain-words meaning of the model piece a job
   *  builds toward — a job says WHAT it loads, not only the table name. */
  entityMeaning?: Map<string, string> | null;
  /** the jobs→model door — opens the model with the fed table selected. */
  onOpenTarget?: (targetId: string) => void;
  /** rendered ONLY above the pilot list — when a process editor is open it
   *  IS the page (no-scroll directive): the KPI cards step aside. */
  listHeader?: ReactNode;
}) {
  const [view, setView] = useState<TargetsView | 'loading' | 'error' | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [removeArm, setRemoveArm] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const [staleView, setStaleView] = useState(false);
  const load = useCallback(async () => {
    try {
      setView(await getTargetsView(draftId));
      setStaleView(false);
    } catch {
      // keeping the previous list is kinder than wiping it — but SAY it is
      // the last known state, never let it pass for current truth
      setView((v) => {
        if (v && typeof v === 'object') {
          setStaleView(true);
          return v;
        }
        return 'error';
      });
    }
  }, [draftId]);

  useEffect(() => {
    setView('loading');
    void load();
  }, [load]);

  const [fromQuality, setFromQuality] = useState(false);
  useEffect(() => {
    if (focusJobId) {
      setOpenJobId(focusJobId);
      setFromQuality(true);
    }
  }, [focusJobId]);

  const act = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      if (busy) return;
      setBusy(key);
      setError(null);
      try {
        await fn();
        await load();
        onChanged?.();
      } catch (e) {
        if (isUnsupportedPath(e)) {
          setUnsupported('Not supported by this backend version yet.');
        } else {
          setError(errText(e));
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, load, onChanged],
  );

  const ready = view != null && typeof view === 'object' ? view : null;
  const jobs = useMemo(() => ready?.jobs ?? [], [ready]);
  const targetById = useMemo(
    () => new Map((ready?.targets ?? []).map((t) => [t.target_id, t])),
    [ready],
  );
  const jobIndex = (jobId: string) => jobs.findIndex((j) => j.job_id === jobId);

  /* needs-attention first, then name */
  const rows = useMemo(() => {
    const needsAttention = (j: StudioJob) => {
      const r = latestRun(j);
      return j.state === 'degraded' || !!r?.error || (r?.results?.[0]?.dlq_open ?? 0) > 0;
    };
    const filtered = q.trim()
      ? jobs.filter((j) =>
          `${j.name ?? ''} ${j.job_id} ${(j.target_ids ?? []).map((id) => targetById.get(id)?.name ?? '').join(' ')}`
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
        )
      : jobs;
    return [...filtered].sort((a, b) => {
      const na = needsAttention(a) ? 0 : 1;
      const nb = needsAttention(b) ? 0 : 1;
      return na !== nb ? na - nb : String(a.name ?? a.job_id).localeCompare(String(b.name ?? b.job_id));
    });
  }, [jobs, q, targetById]);

  /* the FUNCTIONAL job sections — where correcting the ingestion/transform
   * starts: what needs a fix first, what is ready to run, what loaded clean.
   * Buckets are derived from served state + last run, never invented. */
  const [foldedJobGroups, setFoldedJobGroups] = useState<Record<string, boolean>>({});
  const jobGroupOf = (j: StudioJob): 'attention' | 'ready' | 'loaded' => {
    const r = latestRun(j);
    if (j.state === 'degraded' || !!r?.error || (r?.results?.[0]?.dlq_open ?? 0) > 0) return 'attention';
    return r == null ? 'ready' : 'loaded';
  };
  const JOB_GROUPS = [
    { key: 'attention' as const, label: 'Needs a fix first', hint: 'degraded, failed or holding rejected rows', Icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
    { key: 'ready' as const, label: 'Ready to run', hint: 'configured — never ran yet', Icon: Play, tone: 'text-slate-500 dark:text-slate-400' },
    { key: 'loaded' as const, label: 'Loaded clean', hint: 'last run accepted its rows', Icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400' },
  ];

  const openJob = openJobId ? jobs.find((j) => j.job_id === openJobId) : null;

  if (view === 'loading' || view === null)
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (view === 'error')
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        The processes could not be read — the sources stay usable.
      </p>
    );

  const { target_schema, targets } = view;

  /* the wide editor replaces the list — enough room to work */
  if (openJob) {
    return (
      <StudioJobEditor
        draftId={draftId}
        job={openJob}
        jobIndex={jobIndex(openJob.job_id)}
        view={view}
        initialSection={fromQuality ? 'quality' : undefined}
        onClose={() => {
          setFromQuality(false);
          setOpenJobId(null);
        }}
        onChanged={() => {
          void load();
          onChanged?.();
        }}
        onOpenQuality={onOpenQuality}
      />
    );
  }

  return (
    <>
    {listHeader}
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        {/* automations moved to the Automation group — one nav, one surface */}
        {/* not all of them are loads — fact builds and event jobs sit here too */}
        <SectionHead icon={Workflow} label="Transformations" count={jobs.length || null} />
        {staleView && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" role="status">
            showing the last known state — the refresh failed
            <button
              type="button"
              onClick={() => void load()}
              className="rounded font-medium underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              retry
            </button>
          </span>
        )}
        {jobs.length > 6 && (
          <label className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search processes"
              aria-label="Search processes"
              className="h-8 w-52 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
        )}
        {target_schema?.schema && (
          <span
            className="ml-auto font-mono text-xs text-slate-400 dark:text-slate-500"
            title={target_schema.note}
          >
            {target_schema.database}.{target_schema.schema} · {target_schema.environment}
          </span>
        )}
      </div>

      {/* WHAT BELONGS HERE — the page used to be the catch-all for anything that
          moved data, which made it the place people looked for "load my file" and
          for "tell me when something breaks". Neither lives here any more:
          bringing data IN is a Sources action (connect a system, or upload a file),
          and being TOLD about something is an Automation. What is left is the one
          thing only this page does — the transformations that build the model's
          tables. Saying so costs three lines and saves a hunt. */}
      {/* One line, not a paragraph. The first draft of this explained the page in
          three clauses and then listed what did NOT belong here in a second,
          lighter sentence — which read as grey filler above the only button that
          mattered. What the reader needs is the one thing this page does; where
          the other two things live is a pointer, not prose. */}
      <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
        The step between the data you connected and the model you report on.
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        <span className="text-slate-500 dark:text-slate-400">
          Loading data lives in <span className="font-medium text-slate-600 dark:text-slate-300">Sources</span>,
          alerts in <span className="font-medium text-slate-600 dark:text-slate-300">Automation</span>.
        </span>
      </p>

      {targets.length === 0 ? (
        <div className="mt-3">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            No target model yet — the AI proposes facts and dimensions from what was understood;
            nothing is created before you run a process.
          </p>
          <button
            type="button"
            disabled={busy === 'propose-targets'}
            onClick={() => void act('propose-targets', () => proposeTargets(draftId))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy === 'propose-targets' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
            Propose the target model
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="mt-3">
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {targets.length} target(s) proposed — no process feeds them yet.
          </p>
          <button
            type="button"
            disabled={busy === 'propose-jobs'}
            onClick={() => void act('propose-jobs', () => proposeJobs(draftId))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy === 'propose-jobs' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
            Propose the processes
          </button>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Process</th>
                <th className="px-2 py-1.5 font-medium">Target</th>
                <th className="px-2 py-1.5 font-medium">State</th>
                <th className="px-2 py-1.5 font-medium">Last result</th>
                <th className="px-2 py-1.5 font-medium">Schedule</th>
                <th className="px-2 py-1.5 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {JOB_GROUPS.flatMap((g) => {
                const ws = rows.filter((j) => jobGroupOf(j) === g.key);
                if (ws.length === 0) return [];
                const folded = foldedJobGroups[g.key] ?? (g.key === 'loaded' && ws.length > 8 && !q.trim());
                const GIcon = g.Icon;
                const dlqSum = ws.reduce((a, j) => a + (latestRun(j)?.results?.[0]?.dlq_open ?? 0), 0);
                return [
                  <tr key={`h-${g.key}`} className="bg-slate-50/70 dark:bg-slate-800/40">
                    <td colSpan={6} className="px-2 py-1">
                      <button
                        type="button"
                        aria-expanded={!folded}
                        onClick={() => setFoldedJobGroups((f) => ({ ...f, [g.key]: !folded }))}
                        className="flex w-full items-center gap-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        {folded ? (
                          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <GIcon aria-hidden className={`h-3.5 w-3.5 shrink-0 ${g.tone}`} />
                        <span className="font-medium text-slate-700 dark:text-slate-200">{g.label}</span>
                        <span className="hidden text-slate-400 dark:text-slate-500 sm:inline">{g.hint}</span>
                        {g.key === 'attention' && dlqSum > 0 && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-px text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            {dlqSum} row(s) held in DLQ
                          </span>
                        )}
                        <span className="ml-auto rounded-full bg-white px-1.5 py-px tabular-nums text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          {ws.length}
                        </span>
                      </button>
                    </td>
                  </tr>,
                  ...(folded
                    ? []
                    : ws.map((j) => {
                const feeds = (j.target_ids ?? [])
                  .map((id) => targetById.get(id))
                  .filter((t): t is NonNullable<typeof t> => t != null);
                const r = latestRun(j);
                const c = r?.results?.[0];
                const dlqOpen = c?.dlq_open ?? 0;
                const failed = !!r?.error;
                const running = busy === `run:${j.job_id}`;
                const scheduled = !!j.trigger?.cron_choice && j.trigger.cron_choice !== 'manual';
                const st = JOB_STATE_LABEL[j.state ?? ''] ?? JOB_STATE_LABEL.configured;
                return (
                  <tr key={j.job_id} className="group text-[13px] hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenJobId(j.job_id)}
                        title="Open the editor"
                        className="rounded font-medium text-slate-900 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-100 dark:hover:text-accent-400"
                      >
                        {j.name ?? j.job_id}
                      </button>
                    </td>
                    <td className="max-w-[300px] px-2 py-2">
                      {feeds.length > 0 ? (
                        <>
                          {/* the jobs→model door — the fed table opens ON the model */}
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {feeds.map((t, fi) => (
                              <span key={t.target_id ?? t.name}>
                                {fi > 0 && ', '}
                                {t.target_id && onOpenTarget ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenTarget(t.target_id!)}
                                    title={`Open ${t.target_fqn ?? t.name} in the model`}
                                    className="rounded hover:text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:text-accent-400"
                                  >
                                    {t.name}
                                  </button>
                                ) : (
                                  <span title={t.target_fqn ?? t.name}>{t.name}</span>
                                )}
                              </span>
                            ))}
                          </span>
                          {(() => {
                            // the model's own words for what this job builds
                            const meaning = feeds
                              .map((t) => (t.entity_id ? entityMeaning?.get(t.entity_id) : null))
                              .find(Boolean);
                            return meaning ? (
                              <p className="line-clamp-1 text-[11px] text-slate-400 dark:text-slate-500" title={meaning}>
                                {meaning}
                              </p>
                            ) : null;
                          })()}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                        title={`Backend state: ${j.state ?? '—'}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {r ? (
                        <span className="text-slate-600 dark:text-slate-300">
                          {failed ? (
                            <span className="font-medium text-red-600 dark:text-red-400">failed</span>
                          ) : (
                            <span className="tabular-nums">{c?.rows_accepted ?? '—'} rows loaded</span>
                          )}
                          {r.started_at && (
                            <span className="text-slate-400 dark:text-slate-500">
                              {' '}· {new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {r.duration_ms != null ? ` · ${(r.duration_ms / 1000).toFixed(1)} s` : ''}
                            </span>
                          )}
                          {dlqOpen > 0 && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {dlqOpen} in DLQ
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">never ran</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                      {scheduled ? (
                        <span title="Times in UTC — a schedule starts running when the application is activated">
                          {SCHEDULE_LABEL[j.trigger!.cron_choice!] ?? j.trigger!.cron_choice}
                          {!j.trigger?.next_run &&
                            (onOpenActivation ? (
                              <button
                                type="button"
                                onClick={onOpenActivation}
                                className="ml-1 text-slate-400 underline decoration-dotted hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-accent-400"
                              >
                                awaiting activation
                              </button>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500"> · awaiting activation</span>
                            ))}
                        </span>
                      ) : (
                        'Manual'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`flex translate-x-1 items-center justify-end gap-1.5 opacity-0 transition-all duration-150 focus-within:translate-x-0 focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none ${removeArm === j.job_id || busy != null ? '!translate-x-0 !opacity-100' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setOpenJobId(j.job_id)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={running}
                          title="Run against the sandbox schema"
                          onClick={() => void act(`run:${j.job_id}`, () => runJob(draftId, j.job_id))}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                        >
                          {running ? (
                            <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play aria-hidden className="h-3.5 w-3.5" />
                          )}
                          {running ? 'Running…' : 'Run'}
                        </button>
                        <RowMenu
                          job={j}
                          scheduled={scheduled}
                          unsupported={unsupported}
                          busy={busy != null}
                          removeArmed={removeArm === j.job_id}
                          onDuplicate={() =>
                            void act(`dup:${j.job_id}`, () =>
                              patchModel(
                                draftId,
                                [
                                  {
                                    op: 'add',
                                    path: '/model/jobs/-',
                                    value: { clone_of: j.job_id, name: `${j.name ?? j.job_id} (copy)` },
                                  },
                                ] as never,
                                true,
                                `duplicate ${j.job_id}`,
                                view.updated_at,
                              ),
                            )
                          }
                          onPause={() =>
                            void act(`pause:${j.job_id}`, () =>
                              patchModel(
                                draftId,
                                [
                                  {
                                    op: 'set',
                                    path: `/model/jobs/${jobIndex(j.job_id)}/trigger`,
                                    value: { cron_choice: null },
                                  },
                                ] as never,
                                true,
                                `pause schedule of ${j.job_id}`,
                                view.updated_at,
                              ),
                            )
                          }
                          onRemove={() => {
                            if (removeArm !== j.job_id) {
                              setRemoveArm(j.job_id);
                              return;
                            }
                            setRemoveArm(null);
                            void act(`rm:${j.job_id}`, () =>
                              patchModel(
                                draftId,
                                [{ op: 'remove', path: `/model/jobs/${jobIndex(j.job_id)}` }] as never,
                                true,
                                `remove ${j.job_id}`,
                                view.updated_at,
                              ),
                            );
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                );
                    })),
                ];
              })}
            </tbody>
          </table>
          {rows.length === 0 && q && (
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
              No process matches « {q} ».
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
    </>
  );
}
