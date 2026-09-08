'use client';

/**
 * ContextPanel — the Account Overview's single contextual right panel
 * (2026-08-24 refactor). Replaces both the old static right-rail role AND the
 * inline AI-recommendations block that used to sit inside the Account tab.
 *
 * Contract (mission §5):
 * - CLOSED by default; opened from the "Ask AI" entry point (and, later, from
 *   KPIs / chart drill-ins that pass a selection into `context`).
 * - Carries the full analytical context — account, role, active tab, time
 *   window — so the user never restates it.
 * - Hosts the EXISTING advisor surfaces (explanation + evidence + gated
 *   actions). KPIs stay deterministic; the panel explains and prioritizes,
 *   it never fabricates values. An advisor error never blocks reporting —
 *   the hosted components own their degraded states.
 * - Never paints over the charts: docked (shrink-0 column) on xl+, overlay
 *   with backdrop below. Escape or ✕ closes; focus returns to the opener.
 * - Only ONE variant (docked OR overlay) is MOUNTED at a time — the split is
 *   driven by matchMedia, not by CSS-hiding two copies. Mounting both would
 *   double-mount `children`, so every hosted advisor would fetch twice.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tailwind's xl breakpoint — must stay in sync with the docked/overlay split.
const XL_MEDIA_QUERY = '(min-width: 1280px)';

function subscribeToXl(onChange: () => void): () => void {
  const mql = window.matchMedia(XL_MEDIA_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getXlSnapshot(): boolean {
  return window.matchMedia(XL_MEDIA_QUERY).matches;
}

// Server (and first hydration frame): the viewport is unknown — render neither
// variant rather than guessing and double-mounting or flashing the wrong one.
function getXlServerSnapshot(): null {
  return null;
}

export interface PanelContext {
  account?: string | null;
  role?: string | null;
  tabLabel: string;
  days: number;
}

export default function ContextPanel({
  open,
  onClose,
  context,
  children,
}: {
  open: boolean;
  onClose: () => void;
  context: PanelContext;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // true = docked (xl+), false = overlay, null = server/first hydration frame.
  const isDesktop = useSyncExternalStore<boolean | null>(
    subscribeToXl,
    getXlSnapshot,
    getXlServerSnapshot,
  );

  // Focus management: remember the opener on open, restore it on close.
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
    } else if (openerRef.current instanceof HTMLElement) {
      openerRef.current.focus();
      openerRef.current = null;
    }
  }, [open]);

  // Focus the panel once its (single) variant is actually mounted — also
  // re-focuses after a breakpoint crossing remounts the other variant, since
  // the previously focused DOM node is destroyed then.
  useEffect(() => {
    if (open && isDesktop != null) panelRef.current?.focus();
  }, [open, isDesktop]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Viewport unknown (SSR / first hydration frame): mount nothing yet. The
  // client snapshot resolves immediately after hydration; since the panel is
  // closed by default this never causes a visible flash.
  if (!open || isDesktop == null) return null;

  const body = (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="complementary"
      aria-label="AI context panel"
      className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm outline-none dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            Ask AI
          </p>
          {/* The injected context — the user never restates it. */}
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {[context.account, context.role, context.tabLabel, `last ${context.days}d`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI panel"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* The panel owns its scroll — advisors can be long; the reporting
          surface behind is unaffected. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
    </div>
  );

  // Exactly ONE variant mounts at a time (advisors inside `children` fetch on
  // mount — two mounted copies means every fetch fires twice). The responsive
  // classes are kept as a belt-and-suspenders guard for the instant between a
  // breakpoint crossing and the matchMedia-driven re-render.
  if (isDesktop) {
    // xl+: docked column beside the reporting surface (never covers it).
    return <aside className="hidden min-h-0 w-[380px] shrink-0 xl:block">{body}</aside>;
  }

  // <xl: overlay with backdrop (width is too scarce to dock).
  return (
    <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
      <button
        type="button"
        aria-label="Close AI panel"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30"
      />
      <div className={cn('relative m-3 w-[min(380px,90vw)]')}>{body}</div>
    </div>
  );
}
