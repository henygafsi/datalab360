'use client';

/**
 * RightTabPanel — the shared "Adaptive Inspector" right panel.
 *
 * Reused by 9 modules (BI, governance, sources, data-quality, data-products,
 * intelligent, observability, explore-design, account-overview). One redesign
 * re-harmonises all of them, so this component stays GENERIC — no module- or
 * governance-specific logic, and it is RBAC-agnostic (consumers role-filter
 * `quickActions` before passing them in).
 *
 * The 2026 right-tab UX standard (`.claude/skills/right-tab-ux-standards.md`,
 * reference impl `workflow/components/WorkflowSmartPanel.tsx`): a docked panel
 * that lives as a flex SIBLING of the page content (NOT a centered modal, NOT a
 * fixed overlay). A far-right vertical ICON RAIL flips the panel body between
 * sections; the page behind stays fully visible and interactive.
 *
 *  - `role="region"` + `aria-modal="false"` (intentionally non-modal — no focus
 *    trap on desktop). Closes on Escape for keyboard parity with the modal it
 *    replaces.
 *  - Click-to-focus, full-height: the active section owns the scrollable body.
 *  - Draft + preselect: the active section id is persisted to a versioned,
 *    minimal localStorage key and restored once on mount.
 *
 * RESPONSIVE — the inspector is adaptive:
 *  - Desktop (≥768px): docked inspector (panel body + right icon rail), as today.
 *  - Mobile/tablet (<768px): a bottom-sheet drawer that slides up full-width;
 *    the icon rail becomes a horizontal scrollable segmented bar. The viewport
 *    breakpoint is read via an SSR-safe `useIsMobile()` (defaults to desktop,
 *    resolves on mount) so there is no hydration mismatch.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from './use-media-query';
import {
  DesktopRail,
  MobileSegmentedBar,
  QuickActions,
  StatusPill,
  type QuickAction,
  type QuickActionTone,
  type StatusPillSpec,
  type StatusTone,
} from './right-tab-panel.parts';

// Re-export the additive contracts so consumers can import them from here.
export type { QuickAction, QuickActionTone, StatusPillSpec, StatusTone };

export interface RightTabSection {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Section body. Rendered only when this section is active. */
  render: () => React.ReactNode;
}

export interface RightTabPanelProps {
  title: string;
  subtitle?: string;
  sections: RightTabSection[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  onClose: () => void;
  /** Versioned localStorage key for the active section (e.g. `data360.gov.x.section.v1`). */
  storageKey: string;
  /** Sticky footer (typically the action buttons). */
  footer?: React.ReactNode;
  /** Tailwind accent class for the header dot + active rail item. Defaults to `bg-violet-500`. */
  accentClassName?: string;
  /** Width class for the whole panel (rail included). Defaults to `w-[360px]`. */
  widthClassName?: string;
  /**
   * Optional compact strip rendered directly under the header — intended for a
   * per-project KPI badge row. Additive; render nothing when omitted.
   */
  kpiStrip?: React.ReactNode;
  /**
   * Optional "ready actions" bar rendered under the KPI strip. Consumers
   * role-filter via `useCanPerform` before passing; render nothing when empty.
   */
  quickActions?: QuickAction[];
  /** Optional header status pill (draft / live / ok / warn / error). */
  statusPill?: StatusPillSpec;
}

export default function RightTabPanel({
  title,
  subtitle,
  sections,
  activeSection,
  onSectionChange,
  onClose,
  storageKey,
  footer,
  accentClassName = 'bg-violet-500',
  widthClassName = 'w-[360px]',
  kpiStrip,
  quickActions,
  statusPill,
}: RightTabPanelProps) {
  const isMobile = useIsMobile();

  // Close on Escape — keyboard parity with the <Modal> this replaces.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Restore the last-used section ONCE on mount (draft → preselect).
  const restoredRef = React.useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved && saved !== activeSection && sections.some((s) => s.id === saved)) {
        onSectionChange(saved);
      }
    } catch {
      /* storage unavailable — keep current section */
    }
    // run-once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist section as it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, activeSection);
    } catch {
      /* ignore */
    }
  }, [storageKey, activeSection]);

  const active = sections.find((s) => s.id === activeSection) ?? sections[0];

  /* ── Shared content slices (composed differently per form factor) ── */

  const header = (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3.5 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', accentClassName)} />
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {active?.label}
          </p>
        </div>
        <h2 className="mt-1 truncate text-[15px] font-semibold leading-tight text-slate-900 dark:text-white">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {statusPill ? <StatusPill pill={statusPill} /> : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const kpi = kpiStrip ? (
    <div className="min-w-0 overflow-x-auto border-b border-slate-200/80 px-4 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800">
      {kpiStrip}
    </div>
  ) : null;

  const actions = <QuickActions actions={quickActions ?? []} />;

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">{active?.render()}</div>
  );

  const footerEl = footer ? (
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
      {footer}
    </div>
  ) : null;

  /* ── Mobile: bottom-sheet drawer ──
   * Rendered through a portal to <body> so `position: fixed` always resolves
   * against the viewport. The 9 consumers each dock this panel inside their own
   * layout, and several have transformed/contain ancestors that would otherwise
   * become the containing block — the portal escapes them so the sheet pins to
   * the viewport bottom and never causes horizontal scroll. */
  if (isMobile && typeof document !== 'undefined') {
    return createPortal(
      <>
        {/* Light, non-trapping scrim — tap to dismiss. */}
        <div
          className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-[1px] motion-safe:animate-fade-in dark:bg-black/50"
          aria-hidden="true"
          onClick={onClose}
        />
        <div
          role="region"
          aria-modal="false"
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl shadow-black/20 motion-safe:animate-slide-up motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Grabber */}
          <div className="flex shrink-0 justify-center pb-1 pt-2.5">
            <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>
          {header}
          {kpi}
          {actions}
          <MobileSegmentedBar
            sections={sections}
            activeSection={activeSection}
            onSectionChange={onSectionChange}
            accentClassName={accentClassName}
          />
          {body}
          {footerEl}
        </div>
      </>,
      document.body,
    );
  }

  /* ── Desktop: docked inspector (body + right icon rail) ── */
  return (
    <div
      role="region"
      aria-modal="false"
      aria-label={title}
      className={cn(
        // Docked + pinned: sticks in view and the active section scrolls inside
        // the capped height rather than stretching the page (full-height feel).
        'sticky top-4 flex max-h-[calc(100vh-6rem)] min-w-0 max-w-full shrink-0 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20 dark:ring-white/5',
        widthClassName,
      )}
    >
      {/* ── Panel body ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        {kpi}
        {actions}
        {body}
        {footerEl}
      </div>

      {/* ── Icon rail (far-right edge, vertical flip menu) ── */}
      <DesktopRail
        sections={sections}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        accentClassName={accentClassName}
      />
    </div>
  );
}
