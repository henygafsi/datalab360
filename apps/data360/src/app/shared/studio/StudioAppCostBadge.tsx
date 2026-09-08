'use client';

/**
 * StudioAppCostBadge — credits ATTRIBUTED to this application (QUERY_TAG
 * per draft, ACCOUNT_USAGE latency ≤45 min). 0 or unavailable at first
 * paint is the honest truth (only queries after the tagging deploy are
 * attributed) — never a fabricated figure, never a currency amount.
 */

import { useEffect, useState } from 'react';
import { getAppCost, type AppCost } from '@/app/services/studio/studio-api';

export default function StudioAppCostBadge({ draftId }: { draftId: string }) {
  const [cost, setCost] = useState<AppCost | null>(null);

  useEffect(() => {
    let alive = true;
    setCost(null);
    void getAppCost(draftId)
      .then((c) => alive && setCost(c))
      .catch(() => undefined); // enrichment only — never blocks the page
    return () => {
      alive = false;
    };
  }, [draftId]);

  if (!cost) return null;
  const w = cost.warehouse;
  const credits = w?.credits_attributed_compute;

  return (
    <span
      className="rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-500 dark:border-slate-700 dark:text-slate-400"
      title={
        cost.unavailable
          ? `${cost.unavailable.reason ?? 'attribution unavailable'}${cost.unavailable.hint ? ` — ${cost.unavailable.hint}` : ''}`
          : `Credits attributed to THIS application's queries over ${w?.days ?? 7} day(s) — ${w?.queries ?? 0} tagged quer${(w?.queries ?? 0) === 1 ? 'y' : 'ies'}, metering lags ${w?.latency ?? '≤ 45 min'}; only queries after the tagging deploy count.`
      }
    >
      {cost.unavailable
        ? 'app cost —'
        : `app: ${credits != null ? Number(credits).toFixed(3) : '—'} cr/7d`}
    </span>
  );
}
