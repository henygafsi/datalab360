'use client';

/**
 * StudioAppCostBadge — the per-application cost, always visible in the
 * header, symmetric to the account-level chip (top right).
 *
 * The account chip shows real warehouse spend in DOLLARS across every
 * workload; this one shows what is attributed to THIS application, metered
 * in CREDITS. "0 cr used" is the honest truth, not an empty figure: every
 * preview operation is free, and billable warehouse compute is only
 * attributed to queries tagged after the tagging deploy (0 so far).
 *
 * Presentational only — the data is fetched once by the workspace and
 * passed to both this badge and the Overview cost card, so the two never
 * drift. Clicking lands on that card (the Overview tab).
 */

import { Receipt } from 'lucide-react';
import type { AppCost } from '@/app/services/studio/studio-api';

export default function StudioAppCostBadge({
  cost,
  onOpen,
}: {
  cost: AppCost;
  onOpen: () => void;
}) {
  if (cost.unavailable) {
    return (
      <span
        className="rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-400 dark:border-slate-700 dark:text-slate-500"
        title={`${cost.unavailable.reason ?? 'per-app attribution unavailable'}${cost.unavailable.hint ? ` — ${cost.unavailable.hint}` : ''}`}
      >
        app cost —
      </span>
    );
  }

  const spent = cost.credits_charged;
  const attributed = cost.warehouse?.credits_attributed_compute;
  // no fabricated window — an absent day count stays absent, not a made-up 7
  const days = cost.warehouse?.days ?? null;
  const queries = cost.warehouse?.queries ?? 0;
  const spentLabel = spent == null ? '—' : `${Number(spent)} cr used`;
  // only call it "free" when nothing has actually been charged
  const freeClause =
    spent == null || Number(spent) === 0
      ? 'every operation so far is within the free preview.'
      : `${Number(spent)} credit(s) charged to date.`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-500 hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      title={
        `This application: ${spentLabel} — ${freeClause} ` +
        `Billable warehouse compute attributed to it: ${attributed != null ? Number(attributed).toFixed(3) : '—'} credits${days != null ? ` over ${days} day(s)` : ''} ` +
        `(${queries} tagged quer${queries === 1 ? 'y' : 'ies'}; attribution begins at the tagging deploy, metering lags ${cost.warehouse?.latency ?? 'up to 45 min'}). ` +
        `The dollar figure top-right is account-wide warehouse spend, not this app. Click for the full breakdown.`
      }
    >
      <Receipt aria-hidden className="h-3 w-3" />
      app · {spentLabel}
    </button>
  );
}
