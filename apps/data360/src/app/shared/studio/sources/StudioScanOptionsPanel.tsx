'use client';

/**
 * StudioScanOptionsPanel — the COST at the centre (user directive):
 * every way of scanning/understanding the estate is a PRICED option.
 *
 * Reading the options is a free metadata GET; LAUNCHING one is the spend
 * and stays an explicit click — armed twice when the server says
 * requires_confirmation, always carrying the estimated credits and how
 * they were estimated. The account budget (served) frames every choice.
 * Vendor names in served pricing strings stay in tooltips (evidence),
 * never in the visible copy.
 */

import { useCallback, useEffect, useState } from 'react';
import { Coins, Database, ScanSearch } from 'lucide-react';
import {
  getScanOptions,
  launchScanOption,
  type ScanOption,
  type ScanOptionsView,
} from '@/app/services/studio/studio-api';
import { readFailure } from '@/app/shared/studio/studio-errors';

const fmtRows = (n?: number): string =>
  n == null
    ? '—'
    : n >= 1e9
      ? `${(n / 1e9).toFixed(1)} B`
      : n >= 1e6
        ? `${(n / 1e6).toFixed(1)} M`
        : n.toLocaleString();

export default function StudioScanOptionsPanel({ databases }: { databases: string[] }) {
  const [view, setView] = useState<ScanOptionsView | 'loading' | 'error'>('loading');
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await getScanOptions(databases));
    } catch {
      setView('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databases.join(',')]);

  useEffect(() => {
    setView('loading');
    void load();
  }, [load]);

  const launch = useCallback(
    async (o: ScanOption) => {
      const id = o.id ?? '';
      if (busy) return;
      if (o.requires_confirmation && armed !== id) {
        setArmed(id);
        return;
      }
      setBusy(id);
      setArmed(null);
      setError(null);
      try {
        await launchScanOption(o);
        setDone((d) => ({ ...d, [id]: 'launched — results land on the concerned surfaces' }));
        void load();
      } catch (e) {
        const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        setError(readFailure(detail ?? e).text);
      } finally {
        setBusy(null);
      }
    },
    [armed, busy, load],
  );

  if (view === 'loading')
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (view === 'error')
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        The scan options could not be read.{' '}
        <button type="button" onClick={() => { setView('loading'); void load(); }} className="text-accent-600 hover:underline dark:text-accent-400">
          Try again
        </button>
      </p>
    );

  const remaining = view.budget?.remaining_credits;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <ScanSearch aria-hidden className="h-4 w-4 text-slate-400" />
          Scan & understand — priced options
        </h3>
        {/* the estate this prices — served figures */}
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <Database aria-hidden className="h-3 w-3 text-slate-400" />
          {view.scope?.tables ?? '—'} tables · {fmtRows(view.scope?.rows)} rows ·{' '}
          {view.scope?.compressed_gb != null ? `${Math.round(view.scope.compressed_gb)} GB` : '—'}
        </span>
        {/* the budget that frames every choice — served, with its monitor */}
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          title={
            view.budget
              ? `quota ${view.budget.quota_credits ?? '—'} · used ${view.budget.used_credits ?? '—'} · monitor ${view.budget.monitor ?? '—'}`
              : undefined
          }
        >
          <Coins aria-hidden className="h-3 w-3" />
          {remaining != null ? `${remaining.toLocaleString()} credits remaining` : 'budget —'}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {(view.options ?? []).map((o) => {
          const id = o.id ?? '';
          const est = o.estimated_credits;
          const free = est != null && est === 0;
          const unlaunchable = (o.launch?.route ?? '').includes('{');
          return (
            <li
              key={id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {o.label ?? id}
                </span>
                {o.estimate_method && (
                  <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500" title={o.estimate_method}>
                    {o.estimate_method}
                  </span>
                )}
                {done[id] && (
                  <span role="status" className="block text-[11px] text-emerald-700 dark:text-emerald-400">
                    {done[id]}
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                  free
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                }`}
                title={
                  free && view.llm?.provider
                    ? `free while the AI runs on ${view.llm.provider}${view.llm?.price_source ? ` — list price otherwise: ${view.llm.price_source}` : ''}`
                    : o.estimate_method
                }
              >
                {est == null ? 'cost —' : free ? 'free' : `≈ ${est} credits`}
              </span>
              {unlaunchable ? (
                <span
                  className="shrink-0 text-xs text-slate-400 dark:text-slate-500"
                  title="This option runs from the concerned application's own surface"
                >
                  launch from its application
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void launch(o)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    armed === id
                      ? 'bg-amber-600 font-medium text-white hover:bg-amber-700'
                      : 'border border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200'
                  }`}
                  title={
                    o.requires_confirmation
                      ? `Spends ≈ ${est ?? '—'} credits — asks once more before running`
                      : free
                        ? 'Runs within the free policy'
                        : undefined
                  }
                >
                  {busy === id
                    ? 'Launching…'
                    : armed === id
                      ? `Confirm — spends ≈ ${est ?? '—'} credits`
                      : 'Launch'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
