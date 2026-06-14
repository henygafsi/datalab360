'use client';

/**
 * HelpPopover — a minimal, ZERO-DEPENDENCY click-triggered help bubble.
 *
 * The CLICK-driven companion to {@link Tooltip} (which is hover/focus only).
 * A small "?" button toggles a short help description on click; the bubble
 * closes on outside-click or Escape. No portal, no Radix, no floating-ui —
 * pure React state + a CSS-positioned bubble that mirrors Tooltip's styling.
 *
 * Accessibility:
 *  - The trigger is a real <button> with `aria-expanded` reflecting open state
 *    and `aria-controls` / `aria-describedby` linking it to the bubble (only
 *    while open, so there is never a dangling idref).
 *  - The bubble carries `role="tooltip"` — consistent with {@link Tooltip} —
 *    NOT `role="dialog"`, since this is a non-modal disclosure with no focus
 *    trap. Escape returns focus to the trigger.
 *  - Escape is handled in the CAPTURE phase and stops propagation, so an open
 *    popover swallows the key before any ancestor Escape handler (e.g. the
 *    RightTabPanel "close inspector" handler) sees it — Escape closes the
 *    top-most layer first, then the panel on a second press.
 *
 * Usage:
 *   import { HelpPopover } from '@/app/shared/ui/HelpPopover';
 *
 *   <HelpPopover label="This score blends freshness, completeness and validity." />
 *
 * Pair it next to a heading/label to offer in-journey help without leaving the
 * page (rubric R14/H3, principle P2).
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TooltipSide } from './Tooltip';

export interface HelpPopoverProps {
  /** The help description shown in the popover on click. Renders nothing when empty. */
  label: string;
  /** Optional bold heading shown above the description. */
  title?: string;
  /** Bubble placement relative to the trigger. Defaults to `'bottom'`. */
  side?: TooltipSide;
  /** Accessible name for the trigger button. Defaults to `'More information'`. */
  ariaLabel?: string;
  /** Icon for the trigger button. Defaults to a circled question mark. */
  icon?: LucideIcon;
  /** Extra classes for the inline wrapper. */
  className?: string;
  /** Extra classes for the trigger button (e.g. to tweak size/colour). */
  buttonClassName?: string;
}

/**
 * For top/bottom we LEFT-align the bubble to the trigger (expand rightward)
 * rather than centre it: HelpPopover is commonly docked inside containers with
 * `overflow-hidden` (e.g. RightTabPanel), where a centred bubble would clip on
 * the left edge. Left-align keeps the bubble inside the panel. Left/right
 * variants stay vertically centred like {@link Tooltip}.
 */
const SIDE_CLASSES: Record<TooltipSide, string> = {
  top: 'bottom-full left-0 mb-2',
  bottom: 'top-full left-0 mt-2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

export function HelpPopover({
  label,
  title,
  side = 'bottom',
  ariaLabel = 'More information',
  icon: Icon = HelpCircle,
  className,
  buttonClassName,
}: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popId = useId();

  // While open: close on outside pointer-down and on Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase + stopPropagation: an open popover claims Escape before any
    // ancestor document-level handler (registered on mount, i.e. earlier in the
    // bubble order) can act on it.
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, [open]);

  // Nothing to help with — render nothing (keeps callers free of empty buttons).
  if (!label) return null;

  return (
    <span ref={wrapperRef} className={cn('relative inline-flex', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-describedby={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
          open && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200',
          buttonClassName,
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <span
          id={popId}
          role="tooltip"
          className={cn(
            // Mirrors the Tooltip bubble; slightly roomier for click-length copy.
            'absolute z-40 w-max max-w-[16rem] whitespace-normal rounded-md bg-slate-900 px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-lg ring-1 ring-black/5 dark:bg-slate-700 dark:ring-white/10',
            SIDE_CLASSES[side],
          )}
        >
          {title ? (
            <span className="mb-1 block text-xs font-semibold leading-tight">{title}</span>
          ) : null}
          {label}
        </span>
      ) : null}
    </span>
  );
}

export default HelpPopover;
