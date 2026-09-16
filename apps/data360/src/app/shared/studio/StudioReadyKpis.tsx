'use client';

/**
 * StudioReadyKpis — the bridge from an exact model to exploration.
 *
 * Once the quality score reads "ready", these are the questions the model
 * can already answer: the indicators and charts already in the report
 * (explore them), plus the ones the scan proposed that compile but were not
 * kept yet (add one and jump straight into Reporting). Patterns the report
 * engine cannot express yet are named honestly — never offered as a button
 * that would do nothing.
 *
 * The add is the SAME chain the source card uses: confirm the decision, then
 * append the compiled spec to the report — nothing is invented here.
 */

import { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Plus, RefreshCw } from 'lucide-react';
import {
  patchModel,
  postDecision,
  proposeKpiCandidates,
  type ModelTable,
  type StudioReportSpec,
} from '@/app/services/studio/studio-api';

function errText(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: { message?: string } | string } } })?.response?.data
    ?.detail;
  if (typeof d === 'string') return d;
  if (d?.message) return d.message;
  return e instanceof Error ? e.message : 'The action failed.';
}

type Candidate = NonNullable<NonNullable<ModelTable['kpi_candidates']>['candidates']>[number];

export default function StudioReadyKpis({
  draftId,
  report,
  tables,
  onExplore,
  onChanged,
}: {
  draftId: string;
  report: StudioReportSpec | null;
  tables: ModelTable[];
  /** switch to the Reporting tab */
  onExplore: () => void;
  /** refresh the model after a KPI is added */
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the 51-proposal wall folds — top 4 visible, the rest one click away
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const { readyCount, candidates, notExpressible } = useMemo(() => {
    const widgets = [...(report?.kpis ?? []), ...(report?.charts ?? [])];
    const ready = widgets.filter((w) => w.status !== 'unavailable');
    const existing = new Set(widgets.map((w) => String(w.title ?? '').trim().toLowerCase()).filter(Boolean));

    const seen = new Set<string>();
    const addable: Candidate[] = [];
    const cannot: string[] = [];
    for (const t of tables ?? []) {
      const kc = t.kpi_candidates;
      if (!kc) continue;
      for (const c of kc.candidates ?? []) {
        const title = String(c.title ?? '').trim();
        const key = title.toLowerCase();
        // compilable = the scan gave a spec with a kind; anything without one
        // belongs to not_expressible, never to a live button
        if (!c.spec || !c.spec.kind || !title) continue;
        if (existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        addable.push(c);
      }
      for (const ne of kc.not_expressible ?? []) {
        const title = String(ne.title ?? '').trim();
        if (title) cannot.push(title);
      }
    }
    return { readyCount: ready.length, candidates: addable, notExpressible: [...new Set(cannot)] };
  }, [report, tables]);

  const nothing = readyCount === 0 && candidates.length === 0 && notExpressible.length === 0;

  const addCandidate = async (c: Candidate) => {
    if (busy || !c.spec) return;
    setBusy(c.kpi_id ?? c.title ?? 'add');
    setError(null);
    try {
      // confirm the decision first — the SAME contract as the source card:
      // a draft that predates the decision row gets it registered and the
      // call retried, but a GENUINE failure throws and the append below never
      // runs, so the report and the decision store never diverge.
      if (c.decision_id) {
        try {
          await postDecision(draftId, { decision_id: c.decision_id, status: 'confirmed' });
        } catch (e) {
          const msg = (e as { message?: string })?.message ?? '';
          if (!/not a decision/i.test(msg)) throw e;
          await proposeKpiCandidates(draftId);
          await postDecision(draftId, { decision_id: c.decision_id, status: 'confirmed' });
        }
      }
      const path = c.spec.kind === 'kpi' ? '/report/kpis/-' : '/report/charts/-';
      await patchModel(draftId, [{ op: 'add', path, value: c.spec }] as never, true, `add ${c.title}`);
      onChanged();
      onExplore();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">KPIs ready to explore</h3>
        {readyCount > 0 && (
          <button
            type="button"
            onClick={onExplore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
          >
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            Explore in Reporting
          </button>
        )}
      </div>

      {nothing ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          No KPI is ready yet — keep the candidates the scan proposed on each source card, or compose
          one in{' '}
          <button type="button" onClick={onExplore} className="text-accent-600 hover:underline dark:text-accent-400">
            Reporting
          </button>
          .
        </p>
      ) : (
        <>
          {readyCount > 0 && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <BarChart3 aria-hidden className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              {readyCount} indicator(s) &amp; chart(s) already read the model — open Reporting to explore them.
            </p>
          )}

          {candidates.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {candidates.length} more the scan proposed
              </p>
              <ul className="mt-1 space-y-1.5">
                {candidates.slice(0, showAllCandidates ? candidates.length : 4).map((c) => {
                  const id = c.kpi_id ?? c.title ?? '';
                  return (
                    <li
                      key={id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800"
                    >
                      <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                        {c.title}
                      </span>
                      {c.why && (
                        <span className="min-w-0 truncate text-xs text-slate-400 dark:text-slate-500" title={c.why}>
                          {c.why}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={() => void addCandidate(c)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        {busy === id ? (
                          <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                        )}
                        Add &amp; explore
                      </button>
                    </li>
                  );
                })}
              </ul>
              {candidates.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllCandidates((v) => !v)}
                  aria-expanded={showAllCandidates}
                  className="mt-1.5 rounded text-xs text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                >
                  {showAllCandidates ? 'show fewer' : `show all ${candidates.length} proposals`}
                </button>
              )}
            </div>
          )}

          {notExpressible.length > 0 && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {notExpressible.length} pattern(s) the report engine cannot express yet:{' '}
              {notExpressible.slice(0, 4).join(', ')}
              {notExpressible.length > 4 ? '…' : ''} — kept out of the ready list rather than approximated.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
