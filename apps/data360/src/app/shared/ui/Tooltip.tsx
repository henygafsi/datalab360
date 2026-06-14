'use client';

/**
 * Tooltip — a minimal, ZERO-DEPENDENCY hover/focus tooltip.
 *
 * No portal, no Radix, no JS state, no effects. Pure CSS: a `group` wrapper
 * reveals an absolutely-positioned bubble on `group-hover` / `group-focus-within`
 * (so it works for both mouse and keyboard users). For reliability and a11y the
 * wrapper ALSO mirrors `label` into the native `title` attribute and `aria-label`,
 * so the description is announced/readable even where the CSS bubble can't show
 * (touch devices, reduced-motion, SR users). The visual bubble is `aria-hidden`
 * to avoid a duplicate screen-reader announcement.
 *
 * Usage:
 *   import { Tooltip } from '@/app/shared/ui/Tooltip';
 *
 *   <Tooltip label="Recompute the data-quality score for this project">
 *     <button type="button" onClick={run} aria-label="Run scan">
 *       <RefreshIcon />
 *     </button>
 *   </Tooltip>
 *
 * The trigger keeps its own accessible name (e.g. its own `aria-label` / text);
 * this wrapper layers the supplementary description on top.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The description shown on hover/focus and mirrored to `title` + `aria-label`. */
  label: string;
  /** The trigger element(s) the tooltip describes. */
  children: React.ReactNode;
  /** Bubble placement relative to the trigger. Defaults to `'top'`. */
  side?: TooltipSide;
  /** Extra classes for the inline wrapper. */
  className?: string;
}

const SIDE_CLASSES: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

export function Tooltip({ label, children, side = 'top', className }: TooltipProps) {
  // Render nothing extra when there's no label — the trigger passes through.
  if (!label) return <>{children}</>;

  return (
    <span
      className={cn('group relative inline-flex', className)}
      title={label}
      aria-label={label}
    >
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute z-30 w-max max-w-[14rem] whitespace-normal rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium leading-snug text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700',
          SIDE_CLASSES[side],
        )}
      >
        {label}
      </span>
    </span>
  );
}

export default Tooltip;
