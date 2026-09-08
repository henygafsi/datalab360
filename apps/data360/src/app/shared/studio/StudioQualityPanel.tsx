'use client';

/**
 * StudioQualityPanel — whole-model quality DIAGNOSIS (tranche A/B):
 * global indicators with their numerator/denominator (never an averaged
 * percentage), source→target→cross-table results, the DLQ quarantine
 * (open + resolved kept for audit), and anomalies whose fix is a HAND-OFF
 * to the responsible job — a missing capability renders as unavailable
 * with the reason, never as a dead button.
 *
 * Rules are EDITED in Jobs; this page navigates there.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import {
  confirmDateContract,
  getDlq,
  getQuality,
  getTargetsView,
  replayDlq,
  runJob,
  type DlqItem,
  type QualityView,
} from '@/app/services/studio/studio-api';

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string } | string }; status?: number } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return e instanceof Error ? e.message : 'The action failed.';
}

function IndicatorCard({ label, ind }: { label: string; ind?: { value?: number | string; unit?: string; numerator?: number; denominator?: number; note?: string } }) {
  if (!ind || ind.value == null) return null;
  const pct = typeof ind.value === 'number' && ind.denominator != null;
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900"
      title={[ind.unit, ind.note].filter(Boolean).join(' — ')}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {pct ? `${(Number(ind.value) * 100).toFixed(1)}%` : typeof ind.value === 'number' ? ind.value.toLocaleString() : String(ind.value).slice(0, 16)}
      </p>
      {ind.numerator != null && ind.denominator != null && (
        <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
          {ind.numerator.toLocaleString()} / {ind.denominator.toLocaleString()}
        </p>
      )}
    </div>
  );
}

export default function StudioQualityPanel({
  draftId,
  onFixInJob,
  onChanged,
}: {
  draftId: string;
  /** Navigate to the Jobs tab focused on the responsible job. */
  onFixInJob?: (jobId: string) => void;
  onChanged?: () => void;
}) {
  const [q, setQ] = useState<QualityView | 'loading' | 'error' | null>(null);
  const [dlqOpen, setDlqOpen] = useState<DlqItem[] | null>(null);
  const [dlqResolved, setDlqResolved] = useState<DlqItem[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [openOriginal, setOpenOriginal] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateForm, setDateForm] = useState<{ targetId: string; column: string; formats: string; confirmed: boolean } | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setQ('loading');
      try {
        const [qv, open, resolved] = await Promise.all([
          getQuality(draftId, refresh),
          getDlq(draftId, 'open').catch(() => []),
          getDlq(draftId, 'resolved').catch(() => []),
        ]);
        setQ(qv);
        setDlqOpen(open);
        setDlqResolved(resolved);
      } catch {
        setQ('error');
      }
    },
    [draftId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  if (q === 'loading' || q === null)
    return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (q === 'error')
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The quality contract could not be read yet — the sampled gate below stays available.
      </p>
    );

  const ind = q.indicators ?? {};
  const targetTables = q.target?.tables ?? [];
  const anomalies = q.anomalies ?? [];
  const open = dlqOpen ?? [];
  const resolved = dlqResolved ?? [];
  const jobForReplay = open[0]?.job_id ?? targetTables[0]?.producer_job_id ?? null;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Model quality — sources, targets and their relations
          </h3>
          <span className="flex items-center gap-2">
            {(() => {
              /* the root evaluated_at is the RESPONSE time, never shown as an
               * analysis date; the coverage block (per level) is the truth. */
              const cov = (q as { coverage?: Record<string, { status?: string; computed_at?: string }> })
                .coverage;
              if (!cov) return null;
              const parts = Object.entries(cov)
                .filter(([, v]) => v && v.status !== 'not_applicable')
                .map(([k, v]) =>
                  v.status === 'present' && v.computed_at
                    ? `${k.replace(/_/g, ' ')}: ${new Date(v.computed_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : `${k.replace(/_/g, ' ')}: ${v.status ?? 'absent'}`,
                );
              return parts.length > 0 ? (
                <span className="text-xs text-slate-400 dark:text-slate-500" title="When each analysis level was last computed">
                  {parts.join(' · ')}
                </span>
              ) : null;
            })()}
            <button
              type="button"
              disabled={busy === 'refresh'}
              onClick={async () => {
                setBusy('refresh');
                await load(true);
                setBusy(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <RefreshCw aria-hidden className={`h-3 w-3 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
              Re-measure now
            </button>
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <IndicatorCard label="Volume" ind={ind.volume} />
          <IndicatorCard label="Measured conformity" ind={ind.measured_conformity} />
          <IndicatorCard label="Open rejects" ind={ind.open_rejects} />
          <IndicatorCard label="Check coverage" ind={ind.coverage} />
          <IndicatorCard label="Freshness" ind={ind.freshness} />
        </div>

        {targetTables.length > 0 && (
          <ul className="mt-2.5 space-y-1.5">
            {targetTables.map((t) => (
              <li key={t.target_id ?? t.target} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{t.target}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {t.state ?? '—'}
                  </span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    read {t.population?.rows_read ?? '—'} · accepted {t.population?.rows_accepted ?? '—'} ·
                    rejected {t.population?.rows_rejected ?? '—'} · in target {t.population?.target_rows ?? '—'}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {t.sample_vs_full ?? ''} {t.method ? `· ${t.method}` : ''}
                  </span>
                  {t.producer_job_id && onFixInJob && (
                    <button
                      type="button"
                      onClick={() => onFixInJob(t.producer_job_id!)}
                      className="ml-auto text-xs text-accent-600 hover:underline dark:text-accent-400"
                    >
                      Open job {t.producer_job_id}
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}

        {anomalies.length > 0 && (
          <div className="mt-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Anomalies
            </p>
            <ul className="mt-1 space-y-1">
              {anomalies.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {a.level}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {a.rule} · {String(a.object ?? '').split('.').slice(-1)[0]}
                    {a.count != null ? ` · ${a.count}` : ''}
                  </span>
                  {a.fix?.available !== false && a.fix?.job_id && onFixInJob ? (
                    <button
                      type="button"
                      title={a.fix.instruction}
                      onClick={() => onFixInJob(a.fix!.job_id!)}
                      className="text-xs text-accent-600 hover:underline dark:text-accent-400"
                    >
                      {a.fix.kind === 'edit_rule' ? 'Edit the rule' : 'Fix the transformation'} in{' '}
                      {a.fix.job_id}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500" title={a.fix?.instruction}>
                      {a.fix?.kind === 'draft_job'
                        ? 'no responsible job yet — a job draft is the next step'
                        : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── the quarantine — persistent, auditable, replayable ─────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Quarantine (DLQ) — {open.length} open · {resolved.length} resolved kept in audit
          </h3>
          {open.length > 0 && jobForReplay && (
            <button
              type="button"
              disabled={busy === 'replay'}
              onClick={async () => {
                setBusy('replay');
                setError(null);
                try {
                  await replayDlq(draftId, jobForReplay, { status: 'open' });
                } catch (e) {
                  const status = (e as { response?: { status?: number } })?.response?.status;
                  if (status === 404 || status === 405) {
                    // targeted replay not deployed yet — a full job re-run is
                    // idempotent by key and says so
                    try {
                      await runJob(draftId, jobForReplay);
                    } catch (e2) {
                      setError(errText(e2));
                    }
                  } else setError(errText(e));
                }
                await load(false);
                onChanged?.();
                setBusy(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy === 'replay' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
              Replay the open rejects
            </button>
          )}
        </div>

        {open.length === 0 && resolved.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            No record in quarantine — and none is hidden to look clean.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1.5">
              {(showResolved ? resolved : open).map((r) => (
                <li key={r.dlq_id} className="rounded-lg border border-slate-100 p-2 text-xs dark:border-slate-800">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {r.target} · key {r.record_key}
                    </span>
                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      {r.rule_id}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">{r.cause}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      attempts {r.attempts ?? 0} · {r.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenOriginal((o) => (o === r.dlq_id ? null : r.dlq_id!))}
                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {openOriginal === r.dlq_id ? 'hide original' : 'original record'}
                    </button>
                  </p>
                  {openOriginal === r.dlq_id && (
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                      {r.original}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
            {resolved.length > 0 && (
              <button
                type="button"
                onClick={() => setShowResolved((v) => !v)}
                className="mt-1.5 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {showResolved ? `Back to the ${open.length} open` : `See the ${resolved.length} resolved (audit)`}
              </button>
            )}
          </>
        )}

        {/* date-contract: the fix for recoverable formats is a SOURCE
            decision, confirmed explicitly — never an AI interpretation */}
        {open.some((r) => String(r.rule_id ?? '').startsWith('date_')) && (
          <div className="mt-2.5 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
            {!dateForm ? (
              <button
                type="button"
                onClick={() =>
                  setDateForm({
                    targetId: '',
                    column: open.find((r) => String(r.rule_id ?? '').startsWith('date_'))?.column ?? '',
                    formats: 'YYYY-MM-DD, DD/MM/YYYY',
                    confirmed: false,
                  })
                }
                className="text-xs text-accent-600 hover:underline dark:text-accent-400"
              >
                Declare the date formats of the source (source contract)
              </button>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  An ambiguous date needs the SOURCE&apos;s definition — declare the accepted
                  formats and confirm they come from the source contract.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={dateForm.column}
                    onChange={(e) => setDateForm({ ...dateForm, column: e.target.value })}
                    placeholder="column"
                    aria-label="Date column"
                    className="h-7 w-36 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  />
                  <input
                    value={dateForm.formats}
                    onChange={(e) => setDateForm({ ...dateForm, formats: e.target.value })}
                    placeholder="formats, comma-separated"
                    aria-label="Accepted formats"
                    className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={dateForm.confirmed}
                    onChange={(e) => setDateForm({ ...dateForm, confirmed: e.target.checked })}
                  />
                  Confirmed by the source contract (not a guess)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!dateForm.confirmed || busy === 'date'}
                    title={!dateForm.confirmed ? 'The backend refuses without the source-contract confirmation' : undefined}
                    onClick={async () => {
                      setBusy('date');
                      setError(null);
                      try {
                        const tv = await getTargetsView(draftId);
                        // NO fallback to the first target: the column is typed
                        // by hand, so a typo used to write the date contract
                        // against a table that does not carry the column at
                        // all — silently, since the throw below was then
                        // unreachable for the very case it names.
                        const tid = tv.targets.find((t) =>
                          (t.columns ?? []).some((c) => c.name === dateForm.column.trim()),
                        )?.target_id;
                        if (!tid) throw new Error('No target table holds this column.');
                        await confirmDateContract(draftId, {
                          target_id: tid,
                          column: dateForm.column.trim(),
                          formats: dateForm.formats.split(',').map((f) => f.trim()).filter(Boolean),
                        });
                        setDateForm(null);
                        await load(false);
                        onChanged?.();
                      } catch (e) {
                        setError(errText(e));
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="rounded-md bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                  >
                    Apply to the mapping
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateForm(null)}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
