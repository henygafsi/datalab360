'use client';

/**
 * StudioModelDelivers — "what this model delivers", on the Model page.
 *
 * The model is built to answer business questions, but the page only showed the
 * shapes (facts, dimensions, relationships) — never the VALUE: which reports and
 * KPIs each modelled object actually powers, and which objects are built but feed
 * nothing yet. This reads the served `used_by_reports` (per target → the KPIs /
 * charts / reports it feeds) and turns it into a functional ROI: how much of the
 * model earns its keep, object by object, in human report names — cross-
 * referenced with the dimensions and facts, not ids.
 *
 * It also answers "I don't see the cost change": on a DRAFT the credits are
 * genuinely 0 because edits and previews are free, so this states that plainly —
 * the effort spent (operations, AI calls) and the fact that billable warehouse
 * compute only starts once the app runs tagged queries — instead of leaving a
 * silent 0 that reads as broken.
 *
 * Honesty: an object that feeds nothing is said so ("not yet used"), never
 * hidden; a report count is the served number; cost is credits, never a
 * currency amount, and "—" when a figure was not evaluated.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Coins,
  Info,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  getAppCost,
  type AppCost,
  type StudioReportSpec,
} from '@/app/services/studio/studio-api';
import type { ModelSummary } from '@/app/services/studio/summary';

interface DeliverRow {
  id: string;
  name: string;
  widgets: string[];
  reports: number;
  powers: number;
}

export default function StudioModelDelivers({
  draftId,
  summary,
  report,
  targets,
}: {
  draftId: string;
  summary: ModelSummary | null;
  report?: StudioReportSpec | null;
  /** target objects, to resolve a target_id to its business name */
  targets: Array<{ target_id?: string; name?: string }>;
}) {
  /* widget id → its human title, from the report spec (never show a raw id) */
  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    const all = [
      ...(report?.kpis ?? []),
      ...(report?.charts ?? []),
      ...(report?.detail ? [report.detail] : []),
    ];
    for (const w of all) if (w?.chart_id) m.set(w.chart_id, w.title || w.chart_id);
    return m;
  }, [report]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of targets) if (t.target_id) m.set(t.target_id, t.name || t.target_id);
    return m;
  }, [targets]);

  const rows: DeliverRow[] = useMemo(() => {
    const ubr = summary?.used_by_reports ?? {};
    return Object.entries(ubr)
      .map(([id, v]) => {
        const kpis = v?.kpis ?? [];
        const charts = v?.charts ?? [];
        const widgets = [...kpis, ...charts].map((w) => titleById.get(w) ?? w);
        return {
          id,
          name: nameById.get(id) ?? id.replace(/^tgt_/, '').toUpperCase(),
          widgets,
          reports: v?.reports ?? 0,
          powers: kpis.length + charts.length,
        };
      })
      .sort((a, b) => b.powers - a.powers);
  }, [summary, titleById, nameById]);

  const used = rows.filter((r) => r.powers > 0);
  const unused = rows.filter((r) => r.powers === 0);
  const totalWidgets = used.reduce((a, r) => a + r.powers, 0);

  /* cost, read on demand — honest about why a draft stays at 0 credits */
  const [cost, setCost] = useState<AppCost | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    setCost('loading');
    void getAppCost(draftId)
      .then((c) => alive && setCost(c))
      .catch(() => alive && setCost(null));
    return () => {
      alive = false;
    };
  }, [draftId]);

  // nothing to say until the model has been analysed for report usage
  if (!summary || rows.length === 0) return null;

  const c = cost && cost !== 'loading' ? cost : null;
  const credits = c?.credits_charged;
  const whQueries = c?.warehouse?.queries;
  const whCredits = c?.warehouse?.credits_attributed_compute;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <TrendingUp aria-hidden className="h-4 w-4 text-accent-500" />
          What this model delivers
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            used.length === 0
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          }`}
        >
          {used.length} of {rows.length} objects power a report
        </span>
        {totalWidgets > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {totalWidgets} KPI/chart{totalWidgets > 1 ? 's' : ''} across your reports
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        The value of a modelled fact or dimension is the questions it answers — the reports and KPIs it
        feeds. Editing one re-runs exactly the widgets below, so the impact of a change is what you see
        here, not a guess.
      </p>

      {/* objects that EARN their keep — the ROI, in report names */}
      {used.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {used.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <BarChart3 aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{r.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  powers {r.powers} widget{r.powers > 1 ? 's' : ''} in {r.reports} report{r.reports > 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                  editing it re-runs them
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-1 pl-5">
                {r.widgets.map((w, i) => (
                  <span
                    key={`${r.id}-${i}`}
                    className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {w}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* built-but-unused — the honest other half of the ROI */}
      {unused.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50/60 p-2 dark:bg-amber-950/20">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
            {unused.length} object{unused.length > 1 ? 's are' : ' is'} built but not yet used by any report
          </p>
          <p className="mt-0.5 flex flex-wrap gap-1">
            {unused.map((r) => (
              <span
                key={r.id}
                className="rounded bg-white px-1.5 py-px font-mono text-[11px] text-amber-700 dark:bg-slate-900 dark:text-amber-300"
              >
                {r.name}
              </span>
            ))}
          </p>
          <p className="mt-1 text-[11px] text-amber-700/90 dark:text-amber-300/80">
            Wire one into a report to make it earn its keep, or reconsider building it — an unused object
            still costs to load and maintain.
          </p>
        </div>
      )}

      {/* cost — the honest answer to "I don't see the cost change" */}
      <div className="mt-2 flex flex-wrap items-start gap-1.5 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
        <Coins aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p className="min-w-0 flex-1 text-slate-500 dark:text-slate-400">
          {cost === 'loading' ? (
            <span className="inline-flex items-center gap-1">
              <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> reading the cost…
            </span>
          ) : (
            <>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {credits == null ? '—' : `${Number(credits)} credit${Number(credits) === 1 ? '' : 's'}`} charged
              </span>{' '}
              for this application so far.{' '}
              {credits != null && Number(credits) === 0 && (
                <>
                  It stays at 0 because building and previewing the model is free — you only see it move
                  once the application runs billable warehouse compute
                  {whQueries != null ? ` (${whQueries} tagged quer${whQueries === 1 ? 'y' : 'ies'} so far` : ''}
                  {whCredits != null ? `, ${Number(whCredits).toFixed(3)} credits attributed)` : whQueries != null ? ')' : ''}.
                </>
              )}
              {c?.interventions != null && (
                <span className="text-slate-400 dark:text-slate-500">
                  {' '}
                  {c.interventions} operation{c.interventions === 1 ? '' : 's'} recorded
                  {c.ai_calls != null ? ` · ${c.ai_calls} AI call${c.ai_calls === 1 ? '' : 's'}` : ''}.
                </span>
              )}
            </>
          )}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500" title="Cost is metered in credits, never a currency amount; the dollar figure top-right is account-wide.">
          <Info aria-hidden className="h-3 w-3" /> credits, not $
        </span>
      </div>
    </section>
  );
}
