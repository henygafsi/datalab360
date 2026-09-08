'use client';

/**
 * StudioSourceCard — the rich, functional sheet of one source.
 *
 * The user's mandate: a source is not a row of technical facts, it is a
 * thing the business understands. So the sheet leads with the company's
 * OWN words — an editable functional description, business terms, notes —
 * which the backend feeds to the LLM at understanding and model edit
 * ("your words go to the AI"), and it reads everything else from one
 * /sources/card call: health, storage cost, functional relation
 * sentences, load pattern, sample DQ, and the KPI candidates to keep.
 *
 * Three honesty rules, kept verbatim from the contract:
 *   · a not_evaluated signal is never counted healthy — overall is the
 *     worst verdict among the signals that WERE evaluated;
 *   · a storage amount never appears without its assumptions (standard
 *     price × the account's factor, on active bytes — time-travel and
 *     fail-safe excluded);
 *   · a relation sentence uses the company's functional description when
 *     it exists, the technical name otherwise.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Coins, HeartPulse, KeyRound, Link2, Pencil, RefreshCw } from 'lucide-react';
import {
  getSourceCard,
  patchModel,
  postDecision,
  proposeKpiCandidates,
  setSourceMetadata,
  type SourceCard,
  type SourceCardHealthSignal,
} from '@/app/services/studio/studio-api';
import { CONFIDENCE_CLS } from '@/app/shared/studio/studio-keys';

const VERDICT_CLS: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  pass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  fail: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  not_evaluated: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const verdictCls = (v?: string) => VERDICT_CLS[v ?? 'not_evaluated'] ?? VERDICT_CLS.not_evaluated;

function signalWords(s: SourceCardHealthSignal): string {
  switch (s.signal) {
    case 'freshness':
      return s.days_since_last_load != null
        ? `last loaded ${s.days_since_last_load} day(s) ago${s.expected_max_days ? ` (expected ≤ ${s.expected_max_days})` : ''}`
        : 'freshness';
    case 'volume':
      return s.rows != null ? `${s.rows.toLocaleString()} rows` : 'volume';
    case 'row_trend':
      return s.direction && s.direction !== 'no_baseline'
        ? `rows ${s.direction} over 7 days`
        : 'no baseline to compare yet';
    case 'load_failures':
      return s.failures ? `${s.failures} failure(s) in ${s.loads ?? '?'} load(s)` : 'no recent load failures';
    default:
      return s.signal ?? '';
  }
}

export default function StudioSourceCard({
  draftId,
  entityId,
  fqn,
  onChanged,
}: {
  draftId: string;
  entityId?: string;
  fqn?: string;
  onChanged?: () => void;
}) {
  const [card, setCard] = useState<SourceCard | 'loading' | 'error' | null>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [kpiDecided, setKpiDecided] = useState<Record<string, 'kept' | 'discarded'>>({});

  const load = useCallback(async () => {
    if (!entityId && !fqn) return;
    try {
      const c = await getSourceCard(draftId, { entityId, fqn, includeHistory: true });
      setCard(c);
    } catch {
      setCard('error');
    }
  }, [draftId, entityId, fqn]);

  useEffect(() => {
    setCard('loading');
    void load();
  }, [load]);

  // the ingestion block (COPY_HISTORY + lineage) is prepared in the
  // background — the card answers immediately with processing.status
  // "deferred". Pull the prepared value on its own, a few bounded retries,
  // rather than making the reader click refresh.
  const retryRef = useRef(0);
  useEffect(() => {
    if (typeof card !== 'object' || card == null) return;
    const p = card.processing as { status?: string; retry_after_seconds?: number } | null;
    if (p?.status !== 'deferred' || retryRef.current >= 3) return;
    const secs = Math.max(3, Math.min(30, Number(p.retry_after_seconds) || 5));
    const t = setTimeout(() => {
      retryRef.current += 1;
      void load();
    }, secs * 1000);
    return () => clearTimeout(t);
  }, [card, load]);

  if (card === 'loading')
    return <div className="mt-2 h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (card === 'error' || card == null)
    return (
      <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
        The source sheet could not be read.
      </p>
    );

  const c = card;
  const fx = c.functional;
  const cardFqn = c.fqn ?? fqn ?? '';

  const startEdit = () => {
    setDesc(fx?.description ?? '');
    setTerms((fx?.business_terms ?? []).join(', '));
    setNotes(fx?.notes ?? '');
    setEditing(true);
  };
  const saveMeta = async () => {
    setBusy('meta');
    try {
      await setSourceMetadata({
        fqn: cardFqn,
        draft_id: draftId,
        description: desc,
        business_terms: terms.split(',').map((t) => t.trim()).filter(Boolean),
        notes,
      });
      setEditing(false);
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const decideKpi = async (decisionId: string, status: 'confirmed' | 'rejected') => {
    try {
      await postDecision(draftId, { decision_id: decisionId, status });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      if (!/not a decision/i.test(msg)) throw e;
      await proposeKpiCandidates(draftId);
      await postDecision(draftId, { decision_id: decisionId, status });
    }
  };
  const keepKpi = async (k: NonNullable<NonNullable<SourceCard['kpi_candidates']>['candidates']>[number]) => {
    setBusy(k.decision_id ?? 'kpi');
    try {
      await decideKpi(k.decision_id ?? '', 'confirmed');
      const path = k.spec?.kind === 'kpi' ? '/report/kpis/-' : '/report/charts/-';
      await patchModel(draftId, [{ op: 'add', path, value: k.spec }] as never, true, `keep ${k.title}`);
      setKpiDecided((m) => ({ ...m, [k.decision_id ?? '']: 'kept' }));
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };
  const discardKpi = async (k: NonNullable<NonNullable<SourceCard['kpi_candidates']>['candidates']>[number]) => {
    setBusy(k.decision_id ?? 'kpi');
    try {
      await decideKpi(k.decision_id ?? '', 'rejected');
      setKpiDecided((m) => ({ ...m, [k.decision_id ?? '']: 'discarded' }));
    } finally {
      setBusy(null);
    }
  };

  const cost = c.storage_cost;
  const usd = cost?.monthly_usd;
  const a = cost?.assumptions;
  const proc = (c.processing ?? null) as {
    status?: string;
    reason?: string;
    retry_after_seconds?: number;
    ingestion_type?: string;
    cadence?: string;
    last_run?: string;
    pipeline_name?: string;
  } | null;

  return (
    <div className="mt-2 space-y-3 text-[13px]">
      {/* ── the company's own words — the authoritative functional layer ── */}
      <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            What this source means, in your words
          </p>
          {/* provenance at the point of display — the truth rule */}
          {fx?.source === 'user' ? (
            <span className="rounded-full bg-accent-600/10 px-1.5 py-px text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200" title="Written by your organisation — the AI never overwrites it">
              your words
            </span>
          ) : fx?.description ? (
            <span className="rounded-full bg-sky-50 px-1.5 py-px text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" title="Proposed — confirm or reword it; your version then becomes the truth">
              proposed
            </span>
          ) : null}
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
            >
              <Pencil aria-hidden className="h-3 w-3" />
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-1.5 space-y-1.5">
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="A functional description — what this table is, for a colleague. Goes to the AI."
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Business terms, comma-separated (e.g. point de vente, réseau)"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy === 'meta'}
                onClick={() => void saveMeta()}
                className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                {busy === 'meta' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                Cancel
              </button>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Your words go to the AI at understanding and model edit.
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-1">
            <p className="text-slate-700 dark:text-slate-200">
              {fx?.description || (
                <span className="text-slate-400 dark:text-slate-500">
                  No functional description yet — add one so the AI speaks your business.
                </span>
              )}
            </p>
            {(fx?.business_terms ?? []).length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
                {(fx?.business_terms ?? []).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200"
                  >
                    {t}
                  </span>
                ))}
              </p>
            )}
            {fx?.notes && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{fx.notes}</p>}
          </div>
        )}
      </section>

      {/* ── health — overall is the worst EVALUATED verdict, never a gap ── */}
      {c.health && (
        <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <HeartPulse aria-hidden className="h-3.5 w-3.5" />
            Health
            <span className={`ml-1 rounded-full px-1.5 py-px text-xs ${verdictCls(c.health.overall)}`}>
              {c.health.overall ?? 'not evaluated'}
            </span>
            <span className="text-slate-400">
              {c.health.evaluated ?? 0} of {c.health.of ?? 0} signals evaluated
            </span>
          </p>
          <ul className="mt-1 space-y-0.5">
            {(c.health.signals ?? []).map((s, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className={`rounded-full px-1.5 py-px text-xs ${verdictCls(s.verdict)}`}>
                  {s.verdict ?? 'not evaluated'}
                </span>
                <span className="text-slate-600 dark:text-slate-300">{signalWords(s)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── storage cost — never without its assumptions ─────────────── */}
      {cost && (
        <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Coins aria-hidden className="h-3.5 w-3.5" />
            Storage cost
          </p>
          {cost.state === 'estimated' && a ? (
            <p className="mt-1 text-slate-700 dark:text-slate-200">
              ≈ ${Number(usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}/month
              <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
                {a.standard_price_usd_per_tb_month ?? 23}$/TB × {a.factor ?? 10}, {a.scope ?? 'active bytes'}
                {cost.gb != null ? ` · ${cost.gb.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB` : ''}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {cost.reason ?? 'Storage size is not readable for this object.'}
            </p>
          )}
        </section>
      )}

      {/* ── functional relation sentences ────────────────────────────── */}
      {(c.relationships ?? []).length > 0 && (
        <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Link2 aria-hidden className="h-3.5 w-3.5" />
            How it relates
          </p>
          <ul className="mt-1 space-y-0.5">
            {(c.relationships ?? []).map((r, i) => (
              <li key={r.relationship_id ?? i} className="text-slate-700 dark:text-slate-200">
                {r.sentence}
                {r.duplication_risk && (
                  <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                    — may duplicate rows if joined directly
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── how it is fed + what the rows say (pattern + sample DQ) ───── */}
      {c.load_pattern && (
        <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            How it is fed
          </p>
          <p className="mt-1 flex items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs ${CONFIDENCE_CLS[c.load_pattern.confidence ?? 'none'] ?? CONFIDENCE_CLS.none}`}>
              {String(c.load_pattern.pattern ?? 'unknown').replace(/_/g, ' ')}
              {c.load_pattern.confidence ? ` · ${c.load_pattern.confidence}` : ''}
            </span>
            {c.load_pattern.time_field && (
              <span className="font-mono text-xs text-slate-400">time: {c.load_pattern.time_field}</span>
            )}
          </p>
          {(c.load_pattern.evidence ?? []).slice(0, 2).map((ev, i) => (
            <p key={i} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{ev}</p>
          ))}
          {c.sample_dq && (
            <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
              {(c.sample_dq.checks ?? []).map((ck, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className={`rounded-full px-1.5 py-px text-xs ${verdictCls(ck.verdict)}`}>
                    {ck.verdict ?? 'not evaluated'}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {ck.check === 'key_nulls'
                      ? `no null in the key (${(ck.columns ?? []).join(', ')})`
                      : ck.check === 'grain_duplicates'
                        ? `one row per ${(ck.columns ?? []).join(', ')}`
                        : (ck.check ?? '')}
                  </span>
                  {ck.verdict === 'fail' && ck.check === 'grain_duplicates' && (
                    <span className="text-red-600 dark:text-red-400">— cannot be keyed on this as-is</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── KPI candidates — keep or discard, nothing generated without it ── */}
      {(c.kpi_candidates?.candidates ?? []).length > 0 && (
        <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <KeyRound aria-hidden className="h-3.5 w-3.5" />
            KPIs this pattern proposes
          </p>
          <ul className="mt-1 space-y-1">
            {(c.kpi_candidates!.candidates ?? []).map((k) => {
              const done = kpiDecided[k.decision_id ?? ''];
              return (
                <li key={k.kpi_id} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-800 dark:text-slate-200">{k.title}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{k.why}</span>
                  </span>
                  {done ? (
                    <span className={`text-xs ${done === 'kept' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {done === 'kept' ? 'kept — added to the report' : 'discarded'}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy === k.decision_id}
                        onClick={() => void keepKpi(k)}
                        className="rounded-lg bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        disabled={busy === k.decision_id}
                        onClick={() => void discardKpi(k)}
                        className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                      >
                        Discard
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {(c.kpi_candidates!.not_expressible ?? []).map((n, i) => (
            <p key={i} className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {n.title ?? 'an idea'} — not available yet: {n.reason ?? n.why ?? 'the engine cannot express it'}
            </p>
          ))}
        </section>
      )}

      {/* ingestion — prepared in the background (COPY_HISTORY + lineage are
          heavy to read); the card never blocks on it. It says "preparing"
          and fills in on its own, rather than showing a stuck skeleton. */}
      {proc &&
        (proc.status === 'deferred' || proc.ingestion_type || proc.last_run || proc.pipeline_name) && (
          <section className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ingestion
            </p>
            {proc.status === 'deferred' ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                Preparing the ingestion history — it appears here on its own, no need to wait.
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
                {[
                  proc.ingestion_type,
                  proc.cadence,
                  proc.last_run ? `last run ${proc.last_run}` : null,
                  proc.pipeline_name,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            )}
          </section>
        )}
    </div>
  );
}
