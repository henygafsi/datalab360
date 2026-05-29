'use client';

/**
 * VolumeLockBadge — Surfaces the free-discovery allowance (1000-row sample
 * discovery is free) and how much of it has been consumed.
 *
 * Three states:
 *   1. Unknown usage — `used` is undefined. The free-discovery endpoint
 *      (`GET /account/{id}/usage`) does not exist yet, so we never
 *      fabricate a number. Renders "Free discovery · up to {cap} rows free".
 *   2. Within allowance — `used < cap`. Renders the count + a thin blue
 *      progress bar.
 *   3. Limit reached — `used >= cap`. Switches to an amber lock state:
 *      "Free-discovery limit reached — full volume requires a paid plan".
 *
 * Copy is intentionally kept consistent with the model-catalog sample
 * panel: "Free discovery", "1000 rows".
 */

import { Lock, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VolumeLockBadgeProps {
  /**
   * Rows consumed against the free allowance. Undefined → "unknown usage"
   * state (never fabricated until the usage endpoint lands).
   */
  used?: number;
  /** Free-discovery row cap. Defaults to 1000. */
  cap?: number;
  /** `inline` = compact one-liner; `full` = padded card with progress bar. */
  variant?: 'inline' | 'full';
}

export default function VolumeLockBadge({
  used,
  cap = 1000,
  variant = 'inline',
}: VolumeLockBadgeProps) {
  const known = typeof used === 'number' && Number.isFinite(used);
  const safeUsed = known ? Math.max(0, used as number) : 0;
  const reached = known && safeUsed >= cap;
  const pct = known ? Math.min(100, Math.round((safeUsed / cap) * 100)) : 0;

  // ── Inline variant ──────────────────────────────────────────────────────
  if (variant === 'inline') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
          reached
            ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-300'
            : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/30 dark:text-blue-300',
        )}
      >
        {reached ? (
          <Lock className="h-3 w-3" aria-hidden />
        ) : (
          <Database className="h-3 w-3" aria-hidden />
        )}
        {reached ? (
          <span>Free-discovery limit reached</span>
        ) : known ? (
          <span>
            Free discovery · {safeUsed.toLocaleString()}/{cap.toLocaleString()} rows
          </span>
        ) : (
          <span>Free discovery · up to {cap.toLocaleString()} rows free</span>
        )}
      </span>
    );
  }

  // ── Full variant ────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        reached
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/20'
          : 'border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20',
      )}
    >
      <div className="flex items-center gap-2">
        {reached ? (
          <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
        ) : (
          <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
        )}
        <span
          className={cn(
            'text-sm font-semibold',
            reached
              ? 'text-amber-800 dark:text-amber-200'
              : 'text-blue-800 dark:text-blue-200',
          )}
        >
          {reached ? 'Free-discovery limit reached' : 'Free discovery'}
        </span>
        {known && (
          <span
            className={cn(
              'ml-auto font-mono text-xs font-medium',
              reached
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-blue-700 dark:text-blue-300',
            )}
          >
            {safeUsed.toLocaleString()} / {cap.toLocaleString()} rows
          </span>
        )}
      </div>

      {/* Progress bar — only meaningful when usage is known. */}
      {known && (
        <div
          role="progressbar"
          aria-label="Free discovery rows used"
          aria-valuenow={Math.min(safeUsed, cap)}
          aria-valuemin={0}
          aria-valuemax={cap}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-slate-800/70"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all',
              reached ? 'bg-amber-500' : 'bg-blue-500',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <p
        className={cn(
          'mt-2 text-[11px]',
          reached
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-blue-700/90 dark:text-blue-300/90',
        )}
      >
        {reached
          ? 'Full volume requires a paid plan. Sample discovery above the free cap is metered.'
          : known
            ? `Sample data discovery up to ${cap.toLocaleString()} rows is free.`
            : `Sample data discovery up to ${cap.toLocaleString()} rows is free. Live consumption is unavailable until the usage endpoint lands.`}
      </p>
    </div>
  );
}
