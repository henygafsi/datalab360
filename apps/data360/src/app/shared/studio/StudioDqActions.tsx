'use client';

/**
 * StudioDqActions — "what to do about it", on the Quality page.
 *
 * THE GAP THIS CLOSES. The Quality page measured beautifully and then stopped:
 * dimensions, layers, a score, "2 of 4 checks pass — 2 still hold the model
 * back". Every one of those sentences is a diagnosis, and the page offered no
 * way to act on any of them. Meanwhile the backend was already serving, per
 * failing check: a `proposal.instruction` written in business words ("Handle
 * 302 orphan rows … map them to an 'unknown' member or exclude them"), a
 * `suggested_action`, and an `actions[]` list where each option says whether it
 * is `available`, and if not, exactly what it `requires` first. None of it was
 * read. The product's own spine is understand → quality → model → visualize and
 * control → ACT; this is the missing last step, and it is built out of what the
 * analysis already deduced rather than a new list of generic advice.
 *
 * HONESTY RULES, which are the whole point on a governance surface:
 *  • Only checks that actually failed appear. A clean gate renders nothing —
 *    an empty "recommended actions" block is worse than no block.
 *  • An action the backend says is NOT available renders DISABLED with its own
 *    `reason` beside it. A button that looks live and then refuses is how a
 *    reader stops trusting the page.
 *  • `requires` is shown BEFORE the click, because "job run afterwards
 *    (credits)" is a spending decision and must not be discovered afterwards.
 *  • Nothing is applied without an explicit confirm, and a refusal is rendered
 *    with the backend's own wording via dqResolveRefusal().
 *  • The evidence stays on screen after a fix: resolving a check never rewrites
 *    what was measured, it records how it was handled.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, Loader2, Wrench } from 'lucide-react';

import {
  getDqChecks,
  resolveDqCheck,
  dqResolveRefusal,
  type DqActionKind,
  type DqCheckActionOption,
  type DqChecksView,
  type DqGateCheck,
  type DqCheckProposal,
} from '@/app/services/studio/activation';

type Check = DqGateCheck & { proposal?: DqCheckProposal | null };

/** The rules in business words — the id ("rel_4.referential_integrity") is for
 *  the log, never for the reader. */
const RULE_WORDS: Record<string, string> = {
  referential_integrity: 'Rows that point at something that does not exist',
  not_null: 'A required value is missing',
  uniqueness: 'The same key appears more than once',
  row_count: 'The table is empty, or far smaller than expected',
  freshness: 'The data has not been refreshed recently enough',
  volume_anomaly: 'The volume moved more than usual',
};

function ruleWords(c: Check): string {
  return RULE_WORDS[String(c.rule ?? '')] ?? (c.rule ? String(c.rule).replace(/_/g, ' ') : 'Check');
}

/** The object, without the database/schema noise the reader already knows. */
function shortObject(fqn?: string): string {
  if (!fqn) return '';
  const parts = fqn.split('.');
  return parts[parts.length - 1] ?? fqn;
}

export default function StudioDqActions({
  draftId,
  onResolved,
}: {
  draftId: string;
  onResolved?: () => void;
}) {
  const [view, setView] = useState<DqChecksView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ id: string; message: string } | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<{ id: string; kind: DqActionKind } | null>(null);
  /* The deterministic reasoning is free and always there. The MODEL refinement
   * is opt-in — one local inference, zero warehouse credits on this backend —
   * so it is a button, never automatic, and the label says what it costs. */
  const [explained, setExplained] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const load = useCallback(async (explain = false) => {
    try {
      setView(await getDqChecks(draftId, explain));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [draftId]);

  const explain = useCallback(async () => {
    setExplaining(true);
    try {
      await load(true);
      setExplained(true);
    } finally {
      setExplaining(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Only what needs a decision. A passing check has nothing to offer, and a
   * not_evaluated one is not a defect — it is a measurement that has not run. */
  const actionable = useMemo(
    () =>
      (view?.checks ?? []).filter(
        (c) => (c.verdict === 'fail' || c.verdict === 'warn') && !c.handled,
      ),
    [view],
  );

  const apply = useCallback(
    async (check: Check, kind: DqActionKind) => {
      setBusy(check.id);
      setRefusal(null);
      try {
        const r = await resolveDqCheck(draftId, { check_id: check.id, action: kind });
        setDone((d) => ({ ...d, [check.id]: r.status ?? 'applied' }));
        onResolved?.();
        await load();
      } catch (e) {
        setRefusal({ id: check.id, message: dqResolveRefusal(e)?.message ?? 'The action was refused.' });
      } finally {
        setBusy(null);
        setConfirming(null);
      }
    },
    [draftId, load, onResolved],
  );

  if (state === 'loading')
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;

  // A failed read must not claim "nothing to do" — that is the one lie that
  // would let a blocked model look clean.
  if (state === 'error')
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        The remediation options could not be read — the measurements above stand.{' '}
        <button type="button" onClick={() => void load()} className="font-medium underline decoration-dotted">
          retry
        </button>
      </p>
    );

  if (actionable.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-1 flex items-center gap-2">
        <Wrench aria-hidden className="h-4 w-4 text-accent-600" />
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          What to do about it
        </h3>
        <span className="rounded-full bg-slate-100 px-2 py-px text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {actionable.length}
        </span>
      </header>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Each option below comes from what the analysis measured on your data — not a generic
          checklist. Nothing is applied until you confirm it.
        </p>
        {!explained && (
          <button
            type="button"
            onClick={() => void explain()}
            disabled={explaining}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
          >
            {explaining ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
            Explain these in context
            <span className="text-slate-400 dark:text-slate-500">(free)</span>
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {actionable.map((c) => {
          const opts: DqCheckActionOption[] = c.actions ?? [];
          const suggested = c.suggested_action ?? null;
          // the engine's pick first — the reader should not have to rank options
          const ordered = [...opts].sort(
            (a, b) => Number(b.kind === suggested) - Number(a.kind === suggested),
          );
          const applied = done[c.id];
          return (
            <li
              key={c.id}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  aria-hidden
                  className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                    c.verdict === 'fail' ? 'text-red-500' : 'text-amber-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                    {ruleWords(c)}
                    {c.object ? (
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        {' '}
                        · {shortObject(c.object)}
                        {c.columns?.length ? ` (${c.columns.join(', ')})` : ''}
                      </span>
                    ) : null}
                  </p>

                  {/* the paragraph that explains the finding with ITS OWN numbers.
                      Shown above the instruction because it is the part that lets
                      someone DECIDE; the instruction is the summary of what to do. */}
                  {c.proposal?.reasoning ? (
                    <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                      {c.proposal.reasoning}
                      {c.proposal.reasoning_source === 'model' ? (
                        <span className="ml-1.5 rounded-full bg-accent-50 px-1.5 text-[10px] text-accent-700 dark:bg-accent-950/50 dark:text-accent-300">
                          explained
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {/* the remediation the engine actually proposes, in its words */}
                  {c.proposal?.instruction ? (
                    <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">
                      {c.proposal.instruction}
                    </p>
                  ) : c.message ? (
                    <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-300">{c.message}</p>
                  ) : null}

                  {/* when there is no one-click fix, say why rather than showing
                      a row of dead buttons with no explanation */}
                  {c.options_hint ? (
                    <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">{c.options_hint}</p>
                  ) : null}

                  {applied ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
                      <Check aria-hidden className="h-3.5 w-3.5" />
                      {applied === 'already_applied' ? 'Already handled' : 'Handled'} — the measurement
                      above is unchanged, only how it is handled was recorded.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {ordered.map((a) => {
                        const canRun = a.available !== false;
                        const isConfirming = confirming?.id === c.id && confirming.kind === a.kind;
                        return (
                          <span key={a.kind} className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={!canRun || busy === c.id}
                              onClick={() =>
                                isConfirming ? void apply(c, a.kind) : setConfirming({ id: c.id, kind: a.kind })
                              }
                              title={canRun ? undefined : a.reason}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                                !canRun
                                  ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                  : isConfirming
                                    ? 'bg-accent-600 text-white hover:bg-accent-700'
                                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                              }`}
                            >
                              {busy === c.id && isConfirming ? (
                                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              {isConfirming ? 'Confirm — apply this' : (a.label ?? a.kind)}
                              {a.kind === suggested && canRun && !isConfirming ? (
                                <span className="rounded-full bg-accent-50 px-1.5 text-[10px] text-accent-700 dark:bg-accent-950/50 dark:text-accent-300">
                                  recommended
                                </span>
                              ) : null}
                              {canRun && !isConfirming ? (
                                <ChevronRight aria-hidden className="h-3 w-3" />
                              ) : null}
                            </button>
                            {/* the precondition / cost is stated BEFORE the click */}
                            {!canRun && a.reason ? (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">{a.reason}</span>
                            ) : canRun && a.requires?.length ? (
                              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                                needs {a.requires.join(', ')}
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                      {ordered.length === 0 ? (
                        <span className="text-[12px] text-slate-500 dark:text-slate-400">
                          No automatic option for this one — it is fixed at the source, or in the model.
                        </span>
                      ) : null}
                    </div>
                  )}

                  {/* WHAT EACH BUTTON DOES TO THE DATA. The two options on an
                      orphan finding differ by whether the value at stake stays in
                      the totals — a reader cannot choose safely without that, and
                      it must be readable BEFORE the click, not discovered after. */}
                  {!applied && ordered.some((a) => a.impact) ? (
                    <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-2.5 dark:border-slate-800">
                      {ordered
                        .filter((a) => a.impact)
                        .map((a) => (
                          <li key={`imp-${a.kind}`} className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {a.label ?? a.kind}
                            </span>{' '}
                            — {a.impact}
                          </li>
                        ))}
                    </ul>
                  ) : null}

                  {refusal?.id === c.id ? (
                    <p role="alert" className="mt-2 text-[12px] text-red-600 dark:text-red-400">
                      {refusal.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
