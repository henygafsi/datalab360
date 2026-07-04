'use client';

/**
 * WhatChangedCard — compact "What changed this week?" digest on the Overview tab.
 *
 * Fetches `/org-accounts/anomalies?days=7` (z-score credit spikes for the last 7 days).
 * Renders up to 4 plain-language bullets. On error: degrades to null (no card shown).
 * On empty: "Nothing notable this period." Never throws, never shows fake data.
 *
 * Source is intentionally NOT /command-center/recommendations — that endpoint is already
 * consumed by AiAdvisor and TopProblemsPanel on the same tab. Anomalies is a separate,
 * deduplicated change signal (cost spikes only, not already present on Overview).
 */

import { useEffect, useState } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { getAnomalies } from '@/app/services/org-accounts/hooks';
import type { AnomalyEntry } from '@/app/services/org-accounts/types';

const MAX_ITEMS = 4;

/** Format an ISO date string to "Mon DD" (e.g. "Jun 17"). */
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Locale-format a credit number to 1 decimal place ('—' when absent). */
function fmtCr(n: number | null | undefined): string {
  // Anomaly entries arrive with optional numeric fields; an undefined here
  // crashed the whole card (and the page KPIs above it) via .toLocaleString().
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Build a plain-language summary for one anomaly entry. */
function summaryLine(a: AnomalyEntry): string {
  const acct = a.account_name || a.account_locator || 'account';
  const actual = fmtCr(a.actual_value);
  const expected = fmtCr(a.upper_bound);
  const date = fmtDate(a.date);
  return `${date} — ${acct} used ${actual} credits (expected ≤ ${expected})`;
}

export default function WhatChangedCard() {
  const [items, setItems] = useState<AnomalyEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);

  const load = () => {
    setLoading(true);
    setDegraded(false);
    getAnomalies(7)
      .then((res) => {
        setItems((res.anomalies ?? []).slice(0, MAX_ITEMS));
      })
      .catch(() => {
        // Soft-degrade: a 403/404/5xx returns null card — never an error boundary.
        setDegraded(true);
        setItems([]);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  // Role-gated or unavailable endpoint → silently omit the card.
  if (degraded && !loading) return null;

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40"
      aria-label="What changed this week"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            What changed this week?
          </h2>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 py-3">
        {loading ? (
          <div className="animate-pulse space-y-2" aria-hidden="true">
            <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3.5 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Nothing notable this period.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((a, i) => (
              <li
                key={`${a.date}-${a.account_locator}-${i}`}
                className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                <span>{summaryLine(a)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
