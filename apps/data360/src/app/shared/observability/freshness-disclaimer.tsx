'use client';

import { PiClockCountdownDuotone } from 'react-icons/pi';
import cn from '@core/utils/class-names';

/**
 * Snowflake's ACCOUNT_USAGE views (and the metering/query history they are built
 * on) are *not* real-time — most are updated with a documented latency of up to
 * ~45 minutes to a few hours, and some (storage/metering) up to 24h. Any surface
 * derived from them must say so, otherwise users mistake a stale value for a
 * live one. Drop this inline notice next to cost / usage / lineage / security
 * panels that read ACCOUNT_USAGE.
 */
export default function FreshnessDisclaimer({
  className,
  detail,
}: {
  className?: string;
  /** Optional override of the default explanatory sentence. */
  detail?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400',
        className,
      )}
      role="note"
    >
      <PiClockCountdownDuotone className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {detail ??
          'Figures are sourced from the data platform usage data, which is delayed (typically up to ~45 minutes, and up to ~24h for storage/metering). Recent activity may not be reflected yet.'}
      </span>
    </div>
  );
}
