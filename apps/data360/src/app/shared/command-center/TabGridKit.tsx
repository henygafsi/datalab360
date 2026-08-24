'use client';

/**
 * TabGridKit — layout primitives for the Command Center's tabbed dashboard
 * grids (2026-07-10 "dashboard way" refinement).
 *
 * Every tab renders ONE responsive dashboard column inside the viewport-fit
 * frame:
 *   <TabGrid>            — fills the frame (flex column, no page scroll)
 *     <KpiZone>          — dense KPI tiles pinned on top (reflow 2→3→6 cols;
 *                          internal scroll only when the viewport is short)
 *     <Board>            — 12-col dense grid of chart/table cells; takes the
 *                          remaining height, INTERNAL scroll only
 *     <MoreDrawer>       — in-grid cell for content that can't fit the grid
 *                          at small sizes; opens a docked overlay INSIDE the
 *                          frame (never a popup, never page scroll)
 *
 * Pure layout — zero data logic, zero endpoints.
 */

import React, { useState, type ReactNode } from 'react';
import { ChevronDown, LayoutGrid, X } from 'lucide-react';
import cn from '@core/utils/class-names';

/** Fills the frame: flex column, children manage their own height budget. */
export function TabGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3', className)}>
      {children}
    </div>
  );
}

/**
 * Dense KPI tiles zone pinned at the top. On short viewports the zone caps at
 * ~42% of the tab height and scrolls internally so the board keeps its share.
 */
export function KpiZone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // #52: no height clamp — the page scrolls, cells don't.
        'shrink-0 space-y-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The dashboard board: a dense 12-col grid taking the remaining height.
 * Cells place themselves with col-span classes; the board scrolls INTERNALLY
 * when the viewport is too short for every cell (the page never scrolls).
 */
export function Board({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // min-h-0 + overflow-y-auto make the docstring true: the board is the
        // ONE internal scroll surface when a tab's cells exceed the frame —
        // the page itself never scrolls (zero-scroll contract, 2026-08-24).
        'grid min-h-0 flex-1 content-start grid-cols-12 gap-3 overflow-y-auto pr-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A board cell. Default full-width; pass col-span classes to place it. */
export function Cell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('col-span-12 min-w-0', className)}>{children}</div>;
}

/**
 * MoreDrawer — in-grid cell holding overflow content. Collapsed: one compact
 * row-card ("More · <label>"). Open: docked overlay covering the FRAME
 * (absolute inset-0 against the frame's relative inner), internal scroll,
 * ESC/close button. No page scroll, no popup outside the frame.
 */
export function MoreDrawer({
  label,
  count,
  children,
  className,
  inline = false,
}: {
  label: string;
  /** Optional count badge (e.g. number of folded panels). */
  count?: number;
  children: ReactNode;
  className?: string;
  /** Render expanded inline (titled card, no collapse button / overlay) —
   * for when the drawer is already gated behind a tab/section that owns its
   * visibility, so the frame-covering overlay would be wrong. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Inline mode: the caller controls visibility (e.g. a detail button-tab),
  // so render the content directly in a bordered card — no toggle, no overlay.
  if (inline) {
    return (
      <div className={cn('col-span-12 min-w-0 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900', className)}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <LayoutGrid className="h-4 w-4 text-slate-400" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{label}</h3>
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn('col-span-12 min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <LayoutGrid className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        More · {label}
        {count != null && count > 0 && (
          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {count}
          </span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${label} (expanded)`}
          className="absolute inset-0 z-30 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <LayoutGrid className="h-4 w-4 text-slate-400" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {label}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Close ${label}`}
              className="ml-auto rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
