'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/app/shared/ui/Tooltip';

/**
 * ActionRail — shared, non-blocking right-rail action panel.
 *
 * A slide-in panel anchored to the right edge of the viewport. The page behind
 * it stays visible and interactive (no backdrop / overlay) — this is the key
 * difference from a centered `<Modal>`: contextual actions, forms and detail
 * views live here without trapping focus or blocking the underlying screen.
 *
 * Generalized from two existing patterns:
 *  - explore-design `ContextRightBar` (contextual right-side action surface)
 *  - governance `PolicyFormPanel` (non-blocking create/apply/details forms)
 *
 * Behavior:
 *  - `role="dialog"` + `aria-modal="false"` (intentionally non-modal).
 *  - Closes on Escape.
 *  - Sticky header (title + optional description + close button).
 *  - Scrollable body.
 *  - Sticky footer when `footer` is provided (e.g. Cancel / Submit).
 *  - Mounts/unmounts on `isOpen` (no animation dependency).
 *
 * Use it for non-destructive flows. Destructive confirmations (delete / drop /
 * revoke) should still use `<Modal>` / `<ConfirmDialog>`, which trap focus.
 *
 * @example
 * const { isOpen, panel, open, close } = useActionPanel<'create' | 'edit'>();
 * <ActionRail
 *   isOpen={isOpen}
 *   onClose={close}
 *   title={panel === 'create' ? 'New policy' : 'Edit policy'}
 *   description="Changes apply on save."
 *   footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save}>Save</Button></>}
 * >
 *   <MyForm />
 * </ActionRail>
 */
export interface ActionRailProps {
  /** Whether the panel is visible. When false the panel unmounts. */
  isOpen: boolean;
  /** Called on close (Escape key or close button). */
  onClose: () => void;
  /** Panel title, shown in the sticky header. Also the default accessible label. */
  title: string;
  /** Optional sub-text shown under the title. */
  description?: string;
  /**
   * Tailwind accent class for the small dot next to the title
   * (e.g. `"bg-violet-500"`, `"bg-blue-500"`). Defaults to `"bg-violet-500"`.
   */
  accentClassName?: string;
  /**
   * Accessible label for the dialog. Defaults to `title`. Provide this when the
   * visible title is not descriptive enough on its own.
   */
  ariaLabel?: string;
  /** Sticky footer content (typically the action buttons). */
  footer?: React.ReactNode;
  /**
   * Extra classes for the panel `<aside>`. Useful to override the default
   * width (`w-full max-w-md`) for wider/narrower rails.
   */
  className?: string;
  /** Scrollable body content. */
  children: React.ReactNode;
}

export default function ActionRail({
  isOpen,
  onClose,
  title,
  description,
  accentClassName = 'bg-violet-500',
  ariaLabel,
  footer,
  className,
  children,
}: ActionRailProps) {
  // Close on Escape — keyboard parity with the <Modal> this replaces.
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
      aria-label={ariaLabel ?? title}
      className={cn(
        'fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      {/* Sticky header */}
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
        <Tooltip label="Close this panel" side="left">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </Tooltip>
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

/**
 * useActionPanel — open/close + which-panel state for an ActionRail.
 *
 * Generic over a string union of panel keys so a single rail can host several
 * mutually-exclusive views (e.g. `'create' | 'edit' | 'details'`). For a rail
 * with a single view, pass any sentinel key (e.g. `open('main')`) and ignore
 * `panel`, relying on `isOpen` alone.
 *
 * @example
 * const { isOpen, panel, open, close, toggle } = useActionPanel<'create' | 'edit'>();
 * <Button onClick={() => open('create')}>New</Button>
 * <ActionRail isOpen={isOpen} onClose={close} title={panel === 'edit' ? 'Edit' : 'New'}>...</ActionRail>
 */
export function useActionPanel<P extends string = string>() {
  // `null` = closed. A non-null key = open, showing that panel.
  const [panel, setPanel] = useState<P | null>(null);

  /** Open the rail on the given panel key. */
  const open = useCallback((next: P) => setPanel(next), []);

  /** Close the rail. */
  const close = useCallback(() => setPanel(null), []);

  /**
   * Toggle a panel: opens it if closed (or a different panel is open),
   * closes it if that same panel is already open.
   */
  const toggle = useCallback((next: P) => {
    setPanel((cur) => (cur === next ? null : next));
  }, []);

  return {
    /** The currently open panel key, or `null` when closed. */
    panel,
    /** Convenience boolean: `panel !== null`. */
    isOpen: panel !== null,
    open,
    close,
    toggle,
    /** Imperatively set the panel key (escape hatch). */
    setPanel,
  } as const;
}
