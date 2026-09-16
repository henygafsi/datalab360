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
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, RefreshCw } from 'lucide-react';
import {
  confirmDateContract,
  getDlq,
  getQuality,
  getTargetsView,
  replayDlq,
  runJob,
  type DlqItem,
  type QualityIndicator,
  type QualityView,
} from '@/app/services/studio/studio-api';

// served check/verdict vocabulary said in business words — unknown values
// pass through verbatim rather than being guessed at
const RULE_WORDS: Record<string, string> = {
  not_null: 'never empty',
  unique: 'no duplicates',
  referential_integrity: 'matches its reference',
  accepted_values: 'value in the allowed list',
  freshness: 'fresh enough',
  row_count: 'expected volume',
};
const VERDICT_WORDS: Record<string, string> = {
  enforced_by_job: 'enforced by the load',
  pass: 'pass',
  fail: 'FAIL',
  not_evaluated: 'not evaluated yet',
};

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string } | string }; status?: number } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return e instanceof Error ? e.message : 'The action failed.';
}

/* ── the data-quality SCORE — a composition of explicit gates, never an
 *    averaged percentage. Each gate is a real measurement with three
 *    states: pass, to-resolve, or NOT-YET-MEASURED. An unmeasured model
 *    (no indicators, no checks run) reads "not measured yet" — it never
 *    shows a green score for an application that holds no data. Open
 *    quarantine residues are one of the gates the user asked to see here. */
type GateState = 'pass' | 'fail' | 'na';
interface QualityGate {
  id: string;
  label: string;
  state: GateState;
  detail?: string;
}

function buildGates(ind: Record<string, QualityIndicator>, dlqOpen: DlqItem[] | null): QualityGate[] {
  const num = (i?: QualityIndicator) => (typeof i?.value === 'number' ? i.value : undefined);
  const gates: QualityGate[] = [];

  const vol = num(ind.volume);
  gates.push({
    id: 'volume',
    label: 'Data present',
    state: vol == null ? 'na' : vol > 0 ? 'pass' : 'fail',
    detail: vol != null ? `${vol.toLocaleString()} row(s) in target` : undefined,
  });

  const conf = ind.measured_conformity;
  gates.push({
    id: 'conformity',
    label: 'Rows conform to the rules',
    state:
      conf?.value == null
        ? 'na'
        : conf.numerator != null && conf.denominator != null
          ? conf.numerator >= conf.denominator
            ? 'pass'
            : 'fail'
          : Number(conf.value) >= 1
            ? 'pass'
            : 'fail',
    detail:
      conf?.numerator != null && conf?.denominator != null
        ? `${conf.numerator.toLocaleString()} of ${conf.denominator.toLocaleString()} conform`
        : undefined,
  });

  const rej = num(ind.open_rejects);
  gates.push({
    id: 'rejects',
    label: 'No rejected rows',
    state: rej == null ? 'na' : rej === 0 ? 'pass' : 'fail',
    detail: rej != null && rej > 0 ? `${rej.toLocaleString()} rejected` : undefined,
  });

  // the residues the user asked to fold in: open quarantine. null = the read
  // failed (not measured), [] = genuinely nothing held, [...] = residues.
  gates.push({
    id: 'dlq',
    label: 'Quarantine clear',
    state: dlqOpen == null ? 'na' : dlqOpen.length === 0 ? 'pass' : 'fail',
    detail: dlqOpen && dlqOpen.length > 0 ? `${dlqOpen.length} residue(s) held in DLQ` : undefined,
  });

  const cov = ind.coverage;
  gates.push({
    id: 'coverage',
    label: 'Checks cover the model',
    state: cov?.value == null ? 'na' : Number(cov.value) > 0 ? 'pass' : 'fail',
    detail:
      cov?.numerator != null && cov?.denominator != null
        ? `${cov.numerator.toLocaleString()} of ${cov.denominator.toLocaleString()} checked`
        : undefined,
  });

  return gates;
}

function GateRow({ g }: { g: QualityGate }) {
  const tone =
    g.state === 'pass'
      ? 'text-emerald-700 dark:text-emerald-300'
      : g.state === 'fail'
        ? 'text-red-700 dark:text-red-300'
        : 'text-slate-400 dark:text-slate-500';
  const dot =
    g.state === 'pass'
      ? 'bg-emerald-500'
      : g.state === 'fail'
        ? 'bg-red-500'
        : 'bg-slate-300 dark:bg-slate-600';
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span
        className={`font-medium ${g.state === 'na' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}
      >
        {g.label}
      </span>
      <span className={tone}>{g.state === 'pass' ? 'pass' : g.state === 'fail' ? 'to resolve' : 'not measured'}</span>
      {g.detail && <span className="truncate text-slate-400 dark:text-slate-500">· {g.detail}</span>}
    </li>
  );
}

function IndicatorCard({ label, ind }: { label: string; ind?: { value?: number | string; unit?: string; numerator?: number; denominator?: number; note?: string } }) {
  // The five columns are fixed, known indicators. An unmeasured one must still
  // hold its place with an honest "—", not vanish and leave the row ragged.
  const hasValue = ind != null && ind.value != null;
  const pct = hasValue && typeof ind!.value === 'number' && ind!.denominator != null;
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900"
      title={hasValue ? [ind!.unit, ind!.note].filter(Boolean).join(' — ') : `${label} — not measured yet`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p
        className={`text-sm font-semibold tabular-nums ${
          hasValue ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {!hasValue
          ? '—'
          : pct
            ? `${(Number(ind!.value) * 100).toFixed(1)}%`
            : typeof ind!.value === 'number'
              ? ind!.value.toLocaleString()
              : String(ind!.value).slice(0, 16)}
      </p>
      {ind?.numerator != null && ind?.denominator != null && (
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
  // per-table expand-beneath: the served checks[] + indicators{} were typed
  // but never rendered — the detail is already in memory, showing it is free
  const [openTargets, setOpenTargets] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateForm, setDateForm] = useState<{ targetId: string; column: string; formats: string; confirmed: boolean } | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setQ('loading');
      try {
        const [qv, open, resolved] = await Promise.all([
          getQuality(draftId, refresh),
          // null (read failed) must stay distinct from [] (genuinely no
          // residue) — the score gate reads "not measured", never a green
          // pass, when the quarantine could not be read.
          getDlq(draftId, 'open').catch(() => null),
          // same rule as the open read: a failed resolved read is null, not []
          // — [] would let "0 resolved" and the "nothing hidden" copy read as
          // fact when the audit trail simply could not be read.
          getDlq(draftId, 'resolved').catch(() => null),
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

  // whether this model has been ANALYSED at all — the honest evaluability
  // signal is coverage (a level marked "present"), or a real target table
  // existing. A stray volume of 0 on a not-yet-modelled app is NOT a
  // measurement: without this guard the score would read "residues to
  // resolve" for an application that was never built.
  const coverage = (q as { coverage?: Record<string, { status?: string }> }).coverage ?? {};
  const measured =
    Object.values(coverage).some((v) => v?.status === 'present') ||
    (q.target?.tables?.length ?? 0) > 0;
  const gates = buildGates(ind, dlqOpen).map((g) =>
    measured ? g : { ...g, state: 'na' as GateState, detail: undefined },
  );
  const evaluated = gates.filter((g) => g.state !== 'na');
  const passed = evaluated.filter((g) => g.state === 'pass');
  const failed = evaluated.filter((g) => g.state === 'fail');
  const verdict =
    evaluated.length === 0
      ? {
          ring: 'border-slate-200 dark:border-slate-800',
          badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
          headline: 'Not measured yet',
          sub: 'Run the checks below and re-measure to score this model — nothing is assumed clean.',
        }
      : failed.length === 0
        ? {
            ring: 'border-emerald-200 dark:border-emerald-900/40',
            badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            headline: 'Ready to explore',
            sub: `${passed.length} of ${evaluated.length} checks pass — this data is exact.`,
          }
        : {
            ring: 'border-amber-200 dark:border-amber-900/40',
            badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            headline: 'Residues to resolve',
            sub: `${passed.length} of ${evaluated.length} checks pass — ${failed.length} still ${failed.length === 1 ? 'holds' : 'hold'} the model back.`,
          };

  return (
    <div className="space-y-3">
      {/* ── the data-quality SCORE — the readiness verdict, its gates
             visible one by one (DLQ residues included), no averaged % ── */}
      <section className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${verdict.ring}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data quality score</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdict.badge}`}>
            {verdict.headline}
            {evaluated.length > 0 ? ` · ${passed.length}/${evaluated.length}` : ''}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{verdict.sub}</p>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {gates.map((g) => (
            <GateRow key={g.id} g={g} />
          ))}
        </ul>
      </section>

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

        {targetTables.length > 0 && (() => {
          /* one shared scale so the BARS compare across tables — the volume
             story at a glance instead of a wall of « read · accepted ·
             rejected » words. Served numbers only; no number → no bar. */
          const maxRead = Math.max(
            1,
            ...targetTables.map((t) => Number(t.population?.rows_read ?? 0)),
          );
          const fmt = (n: number | null | undefined) => (n != null ? Number(n).toLocaleString() : '—');
          return (
          <ul className="mt-2.5 space-y-1">
            {targetTables.map((t) => {
              const read = t.population?.rows_read != null ? Number(t.population.rows_read) : null;
              const acc = t.population?.rows_accepted != null ? Number(t.population.rows_accepted) : null;
              const rej = t.population?.rows_rejected != null ? Number(t.population.rows_rejected) : null;
              const degraded = t.state === 'degraded';
              const tKey = String(t.target_id ?? t.target ?? '');
              const tOpen = openTargets[tKey] ?? false;
              const nChecks = t.checks?.length ?? 0;
              return (
                <li key={t.target_id ?? t.target} className={`rounded-lg border p-2 ${degraded ? 'border-amber-300/70 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-950/20' : 'border-slate-100 dark:border-slate-800'}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {degraded ? (
                      <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : t.state === 'loaded' ? (
                      <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <HelpCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{t.target}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-xs ${degraded ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {t.state ?? '—'}
                    </span>
                    <span
                      className="text-xs text-slate-400 dark:text-slate-500"
                      title={`${t.sample_vs_full ?? ''} ${t.method ? `· ${t.method}` : ''}`.trim() || undefined}
                    >
                      {fmt(read)} read
                      {rej != null && rej > 0 && (
                        <span className="text-rose-600 dark:text-rose-400"> · {fmt(rej)} rejected</span>
                      )}
                      {t.population?.target_rows != null && ` · ${fmt(t.population.target_rows)} in target`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenTargets((o) => ({ ...o, [tKey]: !tOpen }))}
                      aria-expanded={tOpen}
                      className="inline-flex items-center gap-0.5 rounded text-xs text-slate-500 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-accent-400"
                    >
                      {tOpen ? (
                        <ChevronDown aria-hidden className="h-3 w-3" />
                      ) : (
                        <ChevronRight aria-hidden className="h-3 w-3" />
                      )}
                      {nChecks} check{nChecks === 1 ? '' : 's'}
                    </button>
                    {t.producer_job_id && onFixInJob && (
                      <button
                        type="button"
                        onClick={() => onFixInJob(t.producer_job_id!)}
                        className={`ml-auto rounded-lg px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                          degraded
                            ? 'bg-amber-600 font-medium text-white hover:bg-amber-700'
                            : 'border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}
                        title={degraded ? 'This load is degraded — open its process to fix the rule or the mapping' : `Open ${t.producer_job_id}`}
                      >
                        {degraded ? 'Fix the load' : 'Open job'}
                      </button>
                    )}
                  </div>
                  {/* the static volume chart — accepted (green) + rejected
                      (red) on a shared scale; no served number, no bar */}
                  {read != null && read > 0 ? (
                    <div
                      className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      role="img"
                      aria-label={`${t.target}: ${fmt(acc)} accepted, ${fmt(rej)} rejected of ${fmt(read)} read`}
                    >
                      <span
                        className="h-full bg-emerald-400 dark:bg-emerald-500"
                        style={{ width: `${((acc ?? 0) / maxRead) * 100}%` }}
                      />
                      <span
                        className="h-full bg-rose-400 dark:bg-rose-500"
                        style={{ width: `${((rej ?? 0) / maxRead) * 100}%` }}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      volumes not measured — nothing to draw
                    </p>
                  )}
                  {tOpen && (
                    // expand-beneath: the table's OWN measures and rules —
                    // served figures only, "not measured" said as such
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                      {t.indicators && (
                        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400">
                          <span>
                            conformity:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {t.indicators.measured_conformity?.numerator != null &&
                              t.indicators.measured_conformity?.denominator != null
                                ? `${fmt(t.indicators.measured_conformity.numerator)} / ${fmt(t.indicators.measured_conformity.denominator)} accepted`
                                : t.indicators.measured_conformity?.value != null
                                  ? String(t.indicators.measured_conformity.value)
                                  : 'not measured'}
                            </span>
                          </span>
                          <span>
                            in quarantine:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {t.indicators.open_rejects?.value != null
                                ? fmt(Number(t.indicators.open_rejects.value))
                                : 'not measured'}
                            </span>
                          </span>
                          <span>
                            fresh at:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {t.indicators.freshness?.value != null
                                ? String(t.indicators.freshness.value)
                                : 'not measured'}
                            </span>
                          </span>
                        </p>
                      )}
                      {nChecks === 0 ? (
                        <p className="text-slate-400 dark:text-slate-500">
                          no rule declared on this table yet — nothing guards its rows
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {(t.checks ?? []).map((c, i) => {
                            const rule = String(c.rule ?? c.id ?? `check ${i + 1}`);
                            const verdict = String(c.verdict ?? '');
                            return (
                              <li key={String(c.id ?? i)} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  {RULE_WORDS[rule] ?? rule}
                                </span>
                                {c.column != null && (
                                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {String(c.column)}
                                  </span>
                                )}
                                <span
                                  className={
                                    verdict === 'fail'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : verdict === 'not_evaluated' || verdict === ''
                                        ? 'text-slate-400 dark:text-slate-500'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                  }
                                >
                                  {VERDICT_WORDS[verdict] ?? (verdict || 'declared')}
                                </span>
                                {c.behavior === 'quarantine' && (
                                  <span className="text-slate-400 dark:text-slate-500">
                                    violations go to quarantine
                                  </span>
                                )}
                                {typeof c.predicate === 'string' && c.predicate && (
                                  <code className="rounded bg-slate-50 px-1 py-px font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    {c.predicate}
                                  </code>
                                )}
                                {typeof c.responsible_job_id === 'string' && c.responsible_job_id && onFixInJob && (
                                  <button
                                    type="button"
                                    onClick={() => onFixInJob(String(c.responsible_job_id))}
                                    className="rounded text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                                  >
                                    Edit the rule in {String(c.responsible_job_id)}
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          );
        })()}

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
                        : `unavailable — ${a.fix?.instruction ?? 'no responsible job identified'}`}
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
            Quarantine (DLQ) —{' '}
            {dlqOpen == null ? 'could not be read' : `${open.length} open`} ·{' '}
            {dlqResolved == null ? '—' : resolved.length} resolved kept in audit
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

        {dlqOpen == null ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            The quarantine could not be read — the score above marks it not measured, never clean.
          </p>
        ) : open.length === 0 && dlqResolved == null ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            No open record. The resolved audit could not be read, so nothing here is claimed clean.
          </p>
        ) : open.length === 0 && resolved.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            No record in quarantine — and none is hidden to look clean.
          </p>
        ) : (
          <>
            {/* the quarantine grouped by WHY it was held — same rule, one
                section, its cause as the business label; the technical key
                stays on the row. Resolved (audit) stays a flat list. */}
            <div className="mt-2 space-y-2">
              {(() => {
                const shown = showResolved ? resolved : open;
                const byRule = new Map<string, typeof shown>();
                for (const r of shown) {
                  const k = String(r.rule_id ?? 'unknown_rule');
                  byRule.set(k, [...(byRule.get(k) ?? []), r]);
                }
                return [...byRule.entries()]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([rule, rs]) => (
                    <section key={rule} className="rounded-lg border border-slate-100 dark:border-slate-800">
                      <p className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {String(rs[0]?.cause ?? rule.replace(/_/g, ' '))}
                        </span>
                        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                          {rule}
                        </span>
                        <span className="ml-auto rounded-full bg-white px-1.5 py-px tabular-nums text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                          {rs.length} record{rs.length > 1 ? 's' : ''} held
                        </span>
                      </p>
                      <ul className="space-y-1 p-1.5">
                        {rs.map((r) => (
                          <li key={r.dlq_id} className="text-xs">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                                {r.target} · key {r.record_key}
                              </span>
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
                    </section>
                  ));
              })()}
            </div>
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
