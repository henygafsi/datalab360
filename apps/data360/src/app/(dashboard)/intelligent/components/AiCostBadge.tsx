'use client';

/**
 * AiCostBadge — Small inline chip showing the credit cost of an AI action
 * before the user clicks it. Hover/focus reveals a breakdown tooltip.
 *
 * Reads from `useAiCostEstimate(featureKey, params)`. Renders a coin icon
 * + `~X cr`. When the estimate came from the local reference (i.e. the
 * `/ai/estimate` endpoint is missing), the chip shows a discreet
 * "(estimate)" suffix when `showSource` is set.
 *
 * A11y: the chip is a `<span role="status">` so screen readers announce the
 * cost; the tooltip is exposed via `aria-describedby`.
 */

import { useId, useState } from 'react';
import { Coins } from 'lucide-react';
import cn from '@core/utils/class-names';
import { useAiCostEstimate } from '@/hooks/useAiCostEstimate';

export interface AiCostBadgeProps {
  /** Feature key matching `costs-reference.json` (e.g. 'cortex_complete'). */
  featureKey: string;
  /** Optional parameters driving the variable cost (tokens, rows, columns…). */
  params?: Record<string, unknown>;
  /** Visual size — defaults to 'sm'. */
  size?: 'sm' | 'md';
  /** Append "(estimate)" when the cost came from the local reference. */
  showSource?: boolean;
  /** Extra classes for the outer chip. */
  className?: string;
}

/** Formats a credit count to a short, human-readable string. */
function formatCredits(credits: number): string {
  if (!Number.isFinite(credits) || credits <= 0) return '0';
  if (credits < 0.001) return '<0.001';
  if (credits < 1) return credits.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return credits.toFixed(2);
}

export default function AiCostBadge({
  featureKey,
  params,
  size = 'sm',
  showSource = false,
  className,
}: AiCostBadgeProps) {
  const estimate = useAiCostEstimate(featureKey, (params ?? {}) as never);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  const sizes =
    size === 'md'
      ? 'h-7 px-2.5 text-xs gap-1.5'
      : 'h-5 px-2 text-[10px] gap-1';

  const iconSize = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  return (
    <span
      role="status"
      aria-describedby={tooltipId}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      className={cn(
        'relative inline-flex items-center rounded-full border border-amber-200 bg-amber-50 font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/60',
        sizes,
        className,
      )}
    >
      <Coins className={iconSize} aria-hidden="true" />
      <span>~{formatCredits(estimate.credits)} cr</span>
      {showSource && estimate.source === 'local' && (
        <span className="italic text-amber-600/70 dark:text-amber-400/70">
          (estimate)
        </span>
      )}

      {/* Tooltip */}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 min-w-[180px] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-normal text-slate-700 shadow-lg transition-opacity dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="font-semibold text-slate-900 dark:text-white">
          Estimated cost
        </div>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <dt className="text-slate-500">Base</dt>
          <dd className="text-right tabular-nums">
            {formatCredits(estimate.breakdown.base)} cr
          </dd>
          <dt className="text-slate-500">Variable</dt>
          <dd className="text-right tabular-nums">
            {formatCredits(estimate.breakdown.variable)} cr
          </dd>
          <dt className="text-slate-500">Model ×</dt>
          <dd className="text-right tabular-nums">
            {estimate.breakdown.modelFactor.toFixed(2)}
          </dd>
        </dl>
        <div className="mt-1 border-t border-slate-200 pt-1 text-[9px] italic text-slate-500 dark:border-slate-700">
          Source: {estimate.source === 'api' ? 'live estimate' : 'local reference'}
        </div>
      </span>
    </span>
  );
}
