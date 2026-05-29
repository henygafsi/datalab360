'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Non-blocking right-side panel for governance policy create/apply/details forms.
 *
 * Mirrors the explore-design ContextRightBar pattern: it slides in from the
 * right and the page stays visible and interactive behind it (no overlay).
 * Used to replace the centered <Modal> dialogs that previously wrapped every
 * policy create / apply / details form.
 *
 * Destructive confirmations (delete / drop / revoke) intentionally still use
 * <Modal>/<ConfirmDialog> — this panel is only for non-destructive flows.
 */
export interface PolicyFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Tailwind accent color name used for the title bar dot (e.g. "amber"). */
  accentClassName?: string;
  /** Sticky footer actions (Cancel / Submit). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function PolicyFormPanel({
  isOpen,
  onClose,
  title,
  description,
  accentClassName = 'bg-violet-500',
  footer,
  children,
}: PolicyFormPanelProps) {
  // Close on Escape — the old <Modal> gave us this for free; keep keyboard parity.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', accentClassName)} />
            <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>

      {/* Sticky footer */}
      {footer && (
        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          {footer}
        </div>
      )}
    </aside>
  );
}
