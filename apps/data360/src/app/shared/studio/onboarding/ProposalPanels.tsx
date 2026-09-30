'use client';

/**
 * ProposalPanels — the business-proposal surface of the Understanding step
 * (iteration A): the DECISIONS the user makes on the unified contract, and
 * the COVERAGE truth (what was retained, what was set aside and why, what
 * the need still misses).
 *
 * Contract rules rendered here, not merely displayed:
 *  - a prefilled proposal is NEVER confirmed — confirming is a click;
 *  - « Decide later » = deferred: it stays unresolved and blocks ONLY the
 *    results in blocks[] (the report marks those unavailable with the
 *    reason — no plausible numbers);
 *  - every decision shows its reason, its observed choices (with counts),
 *    and what it blocks;
 *  - report_stale from the backend surfaces as a « Regenerate » hint, the
 *    active version is never rewritten silently.
 */

import { useState } from 'react';
import { Clock3, Check, X } from 'lucide-react';
import {
  postDecision,
  type StudioCoverage,
  type StudioDecision,
} from '@/app/services/studio/studio-api';

function choiceLabel(c: { value: unknown; count?: number; label?: string }): string {
  const base = c.label ?? String(c.value);
  return c.count != null ? `${base} · ${c.count.toLocaleString()}` : base;
}

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string } | string } } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return e instanceof Error ? e.message : 'The decision could not be saved.';
}

/* ── one decision card ──────────────────────────────────────────────── */

function DecisionCard({
  draftId,
  d,
  onSettled,
  compact = false,
  title,
}: {
  draftId: string | null;
  d: StudioDecision;
  onSettled: (d: StudioDecision, status: string, reportStale: boolean) => void;
  /** one-line row inside a per-table group (the KPI proposals) — the shared
   *  boilerplate lives on the group header, not repeated on every card */
  compact?: boolean;
  /** condensed title for the compact row (e.g. the quoted KPI name) */
  title?: string;
}) {
  const multi = d.input === 'multi_select';
  const text = d.input === 'text';
  const [picked, setPicked] = useState<unknown[]>([]);
  const [textValue, setTextValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = d.status ?? 'proposed';
  const settled = status === 'confirmed' || status === 'rejected';
  /* a proposal with NO observed choices used to leave Confirm permanently
   * disabled (canConfirm demanded a pick that did not exist) — a dead button.
   * Confirming such a decision accepts the proposal, which is exactly the
   * contract: a proposal is never auto-confirmed, confirming is the click. */
  const noChoices = (d.choices ?? []).length === 0;
  const proposalConfirmable = !text && noChoices && d.proposal != null;

  const send = async (nextStatus: 'confirmed' | 'deferred') => {
    if (!draftId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const value =
        nextStatus !== 'confirmed'
          ? undefined
          : text
            ? { text: textValue.trim() }
            : multi
              ? { open_values: picked.length > 0 ? picked : d.proposal != null ? [d.proposal] : [] }
              : { choice: picked[0] ?? d.proposal };
      const res = await postDecision(draftId, {
        decision_id: d.decision_id,
        status: nextStatus,
        value,
      });
      onSettled(d, nextStatus, res.report_stale === true);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const canConfirm = text ? textValue.trim().length > 0 : picked.length > 0 || proposalConfirmable;

  if (compact) {
    /* one functional line per KPI: name · proposal chip · Confirm / Later */
    return (
      <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200" title={d.question ?? d.reason ?? undefined}>
          {title ?? d.label ?? d.decision_id}
        </span>
        {settled ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs ${
              status === 'confirmed'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {status}
          </span>
        ) : (
          <>
            {status === 'deferred' && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                deferred
              </span>
            )}
            {typeof d.proposal === 'string' && d.proposal && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="The AI's proposal — yours to confirm or defer">
                {d.proposal}
              </span>
            )}
            <button
              type="button"
              disabled={!canConfirm || busy || !draftId}
              onClick={() => void send('confirmed')}
              className="inline-flex items-center gap-1 rounded-md bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check aria-hidden className="h-3 w-3" />
              Confirm
            </button>
            <button
              type="button"
              disabled={busy || !draftId || status === 'deferred'}
              onClick={() => void send('deferred')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <Clock3 aria-hidden className="h-3 w-3" />
              Later
            </button>
            {error && (
              <span role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
                {error}
              </span>
            )}
          </>
        )}
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-slate-800 dark:text-slate-200">
          {d.question ?? d.label ?? d.decision_id}
        </p>
        <span className="flex shrink-0 items-center gap-1.5">
          {d.blocking && status !== 'confirmed' && (
            <span
              className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              title={
                d.blocks?.length
                  ? `Until decided, these stay unavailable: ${d.blocks.join(', ')}`
                  : 'Some results stay unavailable until this is decided.'
              }
            >
              blocks {d.blocks?.length ?? ''} result{(d.blocks?.length ?? 0) === 1 ? '' : 's'}
            </span>
          )}
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs ${
              status === 'confirmed'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : status === 'deferred'
                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  : 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
            }`}
          >
            {status === 'proposed' ? 'your call' : status}
          </span>
        </span>
      </div>

      {d.reason && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{d.reason}</p>
      )}

      {!settled && (
        <>
          {text ? (
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder={
                typeof d.proposal === 'string' && d.proposal ? `e.g. ${d.proposal}` : 'your answer'
              }
              aria-label={d.label ?? d.decision_id}
              className="mt-1.5 h-7 w-full max-w-xs rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            />
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(d.choices ?? []).map((c, i) => {
                const active = picked.includes(c.value);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setPicked((prev) =>
                        multi
                          ? active
                            ? prev.filter((v) => v !== c.value)
                            : [...prev, c.value]
                          : [c.value],
                      )
                    }
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      active
                        ? 'border-accent-500 bg-accent-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {choiceLabel(c)}
                  </button>
                );
              })}
            </div>
          )}
          {d.proposal != null && !text && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Proposal: {typeof d.proposal === 'string' ? d.proposal : JSON.stringify(d.proposal)}{' '}
              — a proposal only, nothing is confirmed until you say so.
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={!canConfirm || busy || !draftId}
              title={!draftId ? 'The analysis draft is missing — re-run the analysis.' : undefined}
              onClick={() => void send('confirmed')}
              className="inline-flex items-center gap-1 rounded-md bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check aria-hidden className="h-3 w-3" />
              Confirm
            </button>
            <button
              type="button"
              disabled={busy || !draftId || status === 'deferred'}
              onClick={() => void send('deferred')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              <Clock3 aria-hidden className="h-3 w-3" />
              Decide later
            </button>
            {error && (
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error}
              </span>
            )}
          </div>
        </>
      )}
    </li>
  );
}

/* ── the decisions panel ────────────────────────────────────────────── */

/** what the panel needs from an analysed entity to anchor a KPI group in the
 *  MODEL: its grain and whether its key links (or honestly does not). */
export interface DecisionEntityInfo {
  name?: string;
  grain?: unknown;
  candidate_keys?: Array<{ columns?: string[]; status?: string }> | null;
}

/** which model table a decision belongs to — parsed from the question
 *  ("… pour sales ?" / "… for sales?") or the field's table prefix. A miss is
 *  presentational only: the card falls back to the flat list, never lost. */
function tableOf(d: StudioDecision): string | null {
  const q = d.question ?? d.label ?? '';
  const m = q.match(/\b(?:pour|for)\s+([\w .-]+?)\s*\?\s*$/i);
  if (m) return m[1].trim().toLowerCase();
  const f = d.field ?? '';
  if (f.includes('.')) return f.split('.')[0].toLowerCase();
  return null;
}

/** the quoted KPI name inside « … » (or "…"), else the label. */
function kpiTitle(d: StudioDecision): string {
  const q = d.question ?? '';
  const m = q.match(/«\s*(.+?)\s*»/) ?? q.match(/"\s*(.+?)\s*"/);
  return m?.[1] ?? d.label ?? d.decision_id;
}

function grainWords(grain: unknown): string | null {
  if (typeof grain === 'string' && grain.trim()) return grain;
  if (grain && typeof grain === 'object') {
    const g = grain as { statement?: unknown };
    if (typeof g.statement === 'string' && g.statement.trim()) return g.statement;
  }
  return null;
}

export function DecisionsPanel({
  draftId,
  decisions,
  onReportStale,
  entities,
}: {
  draftId: string | null;
  decisions: StudioDecision[];
  onReportStale?: () => void;
  /** the analysed entities — lets each KPI group show ITS table's grain and
   *  whether its key links the model (or honestly does not) */
  entities?: DecisionEntityInfo[];
}) {
  const [items, setItems] = useState(decisions);
  if (items.length === 0) return null;

  const onSettled = (dec: StudioDecision, status: string, stale: boolean) => {
    setItems((prev) => prev.map((x) => (x.decision_id === dec.decision_id ? { ...x, status } : x)));
    if (stale) onReportStale?.();
  };

  /* group the METRIC proposals under their model table — the KPIs live in the
   * model, not in a wall of identical cards. Everything else (localization,
   * status mapping, missing data) keeps its full card. */
  const groups = new Map<string, StudioDecision[]>();
  const flat: StudioDecision[] = [];
  for (const d of items) {
    const table = (d.kind ?? 'metric') === 'metric' ? tableOf(d) : null;
    if (table) {
      const cur = groups.get(table) ?? [];
      cur.push(d);
      groups.set(table, cur);
    } else {
      flat.push(d);
    }
  }
  const entityByName = new Map(
    (entities ?? []).map((e) => [String(e.name ?? '').toLowerCase(), e] as const),
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        Decisions you make — Data360 never answers these for you
      </h4>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
        Each KPI is proposed on ITS table below — confirm line by line, or « Later » to keep it
        open (only the results that depend on it stay unavailable; nothing is filled in with
        plausible numbers).
      </p>

      {[...groups.entries()].map(([table, ds]) => {
        const ent = entityByName.get(table);
        const grain = ent ? grainWords(ent.grain) : null;
        const key = ent?.candidate_keys?.[0];
        const keyCols = key?.columns ?? [];
        const open = ds.filter((d) => (d.status ?? 'proposed') === 'proposed').length;
        return (
          <section
            key={table}
            className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 bg-slate-50/60 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                {table}
              </span>
              {grain && <span className="text-xs text-slate-500 dark:text-slate-400">— {grain}</span>}
              {/* the key that LINKS this table into the model — or the honest
                  absence of one (no link) */}
              {keyCols.length > 0 ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  key: <span className="font-mono">{keyCols.join(' + ')}</span>
                  {key?.status ? ` (${String(key.status).replace(/_/g, ' ')})` : ''}
                </span>
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  no key evidenced — not linked in the model yet
                </span>
              )}
              <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {open ? `${open} to decide` : 'all decided'}
              </span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {ds.map((d) => (
                <DecisionCard
                  key={d.decision_id}
                  draftId={draftId}
                  d={d}
                  compact
                  title={kpiTitle(d)}
                  onSettled={onSettled}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {flat.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {flat.map((d) => (
            <DecisionCard key={d.decision_id} draftId={draftId} d={d} onSettled={onSettled} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── the coverage panel ─────────────────────────────────────────────── */

export function CoveragePanel({ coverage }: { coverage: StudioCoverage }) {
  const notRetained = coverage.not_retained ?? [];
  const missing = coverage.need?.missing_concepts ?? [];
  const note = coverage.campaign_limit?.note;
  if (notRetained.length === 0 && missing.length === 0 && !note) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        What this proposal covers — and what it honestly doesn&apos;t
      </h4>
      {missing.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {missing.map((m) => (
            <li key={m.concept} className="flex items-start gap-1.5 text-xs">
              <X aria-hidden className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span className="text-slate-600 dark:text-slate-300">
                <span className="font-medium">{m.concept}</span>
                {m.consequence ? ` — ${m.consequence}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {notRetained.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            {notRetained.length} analysed table{notRetained.length === 1 ? '' : 's'} set aside —
            with the reason
          </summary>
          <ul className="mt-1 space-y-0.5">
            {notRetained.map((t) => (
              <li key={t.fqn} className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono text-xs">{t.fqn.split('.').slice(-2).join('.')}</span>{' '}
                · {t.relevance ?? '—'}
                {t.reason ? ` — ${t.reason}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {note ? (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{String(note)}</p>
      ) : null}
    </div>
  );
}
