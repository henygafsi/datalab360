'use client';

/**
 * FullscreenPanel — tiny shared fullscreen deep-dive affordance
 * (2026-07-11 workflow + intelligent one-pager refactor).
 *
 * Wraps ANY panel/table and renders the SAME children full-viewport in a
 * fixed inset-0 z-50 overlay — no portal, no new deps, mirrors the
 * ModelingCanvas isFullscreen pattern. Esc or the X button closes it.
 *
 * Two usages:
 *   · uncontrolled — leave `open` undefined; a floating Maximize2 trigger is
 *     rendered top-right (tune with `triggerClassName`);
 *   · controlled  — pass `open` + `onOpenChange` and place your own trigger
 *     (use <FullscreenExpandButton/> for the standard look).
 *
 * Children unmount/remount on toggle — fine for the data-driven tables and
 * read panels this is meant for (cache-aware queries make remounts cheap).
 * Do NOT wrap surfaces with unsaved local state (e.g. a live canvas).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FullscreenExpandButton({
  onClick,
  label = 'Expand to fullscreen',
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white/90 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800/90 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200',
        className,
      )}
    >
      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

export default function FullscreenPanel({
  title,
  subtitle,
  children,
  className,
  bodyClassName,
  triggerClassName,
  open,
  onOpenChange,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Class of the inline (non-fullscreen) wrapper. */
  className?: string;
  /** Class of the scrolling overlay body (defaults add p-4). */
  bodyClassName?: string;
  /** Position/tune the built-in floating trigger (uncontrolled mode only). */
  triggerClassName?: string;
  /** Controlled mode — when provided, no built-in trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const controlled = open !== undefined;
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = controlled ? !!open : innerOpen;

  const setOpen = useCallback(
    (v: boolean) => {
      if (!controlled) setInnerOpen(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange],
  );

  // Esc closes the overlay.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setOpen]);

  if (isOpen) {
    // Portal to <body>: the dashboard chrome animates `main` with a transform
    // (framer-motion), which would otherwise trap `fixed inset-0` inside the
    // content column instead of the viewport.
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-gray-900"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
            {subtitle && (
              <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close fullscreen"
            title="Close fullscreen (Esc)"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-auto p-4', bodyClassName)}>{children}</div>
      </div>,
      document.body,
    );
  }

  return (
    <div className={cn('relative', className)}>
      {!controlled && (
        <FullscreenExpandButton
          onClick={() => setOpen(true)}
          label={`Expand ${title} to fullscreen`}
          className={cn('absolute right-2 top-2 z-10', triggerClassName)}
        />
      )}
      {children}
    </div>
  );
}
