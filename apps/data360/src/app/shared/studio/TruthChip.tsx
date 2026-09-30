'use client';

/**
 * TruthChip — the common truth matrix, rendered.
 *
 * observed | inferred | confirmed | applied | verified | stale | failed —
 * the backend maps every raw status onto these seven (§A.2 of the
 * convergence doc) and the front READS `truth`, never re-glues statuses.
 * Seven states, seven renderings: they are never collapsed into one green
 * badge — `verified` is the only green, `confirmed` is the user's word
 * (accent), everything else says exactly how much trust it deserves.
 */

import type { TruthStatus } from '@/app/services/studio/context';

const CLS: Record<TruthStatus, string> = {
  observed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  inferred: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  confirmed: 'bg-accent-600/10 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200',
  applied: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  verified: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  stale: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const TITLE: Record<TruthStatus, string> = {
  observed: 'Read from the system — not interpreted',
  inferred: 'A hypothesis of the analysis — not confirmed by anyone',
  confirmed: 'Your word — the AI never overwrites it',
  applied: 'Written/activated — not yet re-verified against reality',
  verified: 'Proven by a real run or read, with its evidence',
  stale: 'Its inputs changed since — needs a refresh',
  failed: 'Broken or revoked — do not trust the last value',
};

export default function TruthChip({ truth }: { truth?: TruthStatus | string | null }) {
  const t = (truth ?? '') as TruthStatus;
  if (!CLS[t]) return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  return (
    <span className={`rounded-full px-1.5 py-px text-xs ${CLS[t]}`} title={TITLE[t]}>
      {t}
    </span>
  );
}
