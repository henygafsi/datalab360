'use client';

/**
 * ProblemsInsightStrip — what is actually failing across the account, and why.
 *
 * Data-first: nothing renders until the real rows land (skeleton, never a
 * component drawn over absent data). The narrative comes from Cortex reading
 * those same rows (GET /org-accounts/errors-overview/insight); when Cortex is
 * unavailable the strip still shows the hard numbers and says the summary is
 * unavailable — it never invents one.
 *
 * Replaces a wall of raw error codes with one answer to the WHs.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getErrorsInsight,
  getErrorsOverview,
  type ErrorsInsightResponse,
  type ErrorsOverviewResponse,
} from '@/app/services/org-accounts/hooks';

const DAYS = 7;

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="min-w-[7rem]">
      <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd
        className={cn(
          'text-lg font-semibold tabular-nums',
          tone === 'bad' ? 'text-rose-600 dark:text-rose-400'
            : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-800 dark:text-slate-100',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800" aria-busy="true">
      <div className="mb-3 h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="flex gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="mt-3 h-12 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

export default function ProblemsInsightStrip() {
  const [data, setData] = useState<ErrorsOverviewResponse | null>(null);
  const [insight, setInsight] = useState<ErrorsInsightResponse | null>(null);
  // The Cortex briefing can run ~10 lines (~450px) and pushed the active
  // tab's KPI zone below the fold (live-caught on the FinOps tab). Collapsed
  // to 2 lines by default; the reader opts into the full briefing.
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Hard numbers first — the strip is useful before the narrative arrives.
      const overview = await getErrorsOverview(DAYS);
      setData(overview);
      setLoading(false);
      // Cortex is slower; let it fill in behind the numbers, and stay silent on failure.
      getErrorsInsight(DAYS).then(setInsight).catch(() => setInsight(null));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the account error history');
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <Skeleton />;

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-700">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const s = data.summary;
  const clean = s.total_failed_queries === 0 && s.total_failed_logins === 0;
  const top = data.top_errors[0];

  return (
    <section
      aria-label="Problems across the account"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="mb-3 flex items-center gap-2">
        <AlertTriangle className={cn('h-4 w-4', clean ? 'text-emerald-500' : 'text-rose-500')} />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Problems · last {data.period_days} days
        </h2>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {data.scope} scope
        </span>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh problems"
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </header>

      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <Kpi label="Failed queries" value={s.total_failed_queries.toLocaleString()} tone={s.total_failed_queries ? 'bad' : undefined} />
        <Kpi label="Error codes" value={String(s.distinct_error_codes)} />
        <Kpi label="Failed logins" value={s.total_failed_logins.toLocaleString()} tone={s.total_failed_logins ? 'warn' : undefined} />
        <Kpi label="Accounts affected" value={String(s.accounts_with_errors)} />
      </dl>

      {top && (
        <p className="mt-3 truncate text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-200">Top: {top.error_code}</span>
          {' · '}
          {top.occurrences.toLocaleString()}× · {top.sample_message.replace(/\s+/g, ' ').slice(0, 110)}
        </p>
      )}

      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
        <div className="mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-violet-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Cortex reading of these rows
          </span>
        </div>
        {insight?.narrative ? (
          <div>
            <p
              className={
                'whitespace-pre-line text-[11.5px] leading-5 text-slate-700 dark:text-slate-200' +
                (briefingOpen ? '' : ' line-clamp-2')
              }
            >
              {insight.narrative}
            </p>
            {insight.narrative.length > 160 && (
              <button
                type="button"
                onClick={() => setBriefingOpen((v) => !v)}
                className="mt-1 text-[10.5px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400"
              >
                {briefingOpen ? 'Collapse briefing' : 'Read full briefing'}
              </button>
            )}
          </div>
        ) : insight ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Summary unavailable{insight.degraded_reason ? ` (${insight.degraded_reason.slice(0, 80)})` : ''} — the
            numbers above are read straight from ACCOUNT_USAGE.
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">Reading the error history…</p>
        )}
      </div>
    </section>
  );
}
