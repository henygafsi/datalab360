'use client';

/**
 * AxisCockpit — the UNIFIED per-module right cockpit (2026-07-02 redesign).
 *
 * One shared primitive so every module presents the SAME mental model:
 * a hidable right panel + an always-visible vertical mini-rail of AXES
 * (Deployment / Cost / Perf / Data Quality / AI / History / Governance …),
 * each with a color severity dot:
 *   green = OK · orange = warning · red = blocker · blue = changes/pending ·
 *   grey = not configured / not run.
 *
 * Modules pass their own axis set (config-driven) — content stays module-specific,
 * the shell/behavior is identical everywhere. Zero popups: everything docked.
 *
 * Behavior contract (mirrors Explore & Design):
 *  - rail click on axis  -> open panel on that axis (or close if same axis clicked while open)
 *  - `open` + `activeAxis` are controlled by the parent (deep-linkable)
 *  - optional per-axis primary CTA renders in the panel header (gated by the caller)
 */

import React from 'react';
import { X } from 'lucide-react';

export type AxisSeverity = 'ok' | 'warn' | 'blocker' | 'pending' | 'idle';

/** Purge-safe literal class maps (never build class names dynamically). */
const DOT: Record<AxisSeverity, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  blocker: 'bg-red-500',
  pending: 'bg-blue-500',
  idle: 'bg-slate-300 dark:bg-slate-600',
};

export interface AxisPrimaryCta {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Tooltip / reason when disabled (rights, not configured…). */
  title?: string;
  /** 'danger' renders red (e.g. Fix Blockers). */
  tone?: 'primary' | 'danger' | 'neutral';
}

export interface AxisDef {
  id: string;
  label: string;
  /** Short rail label (<= 8 chars ideal). Falls back to `label`. */
  railLabel?: string;
  icon: React.ElementType;
  severity?: AxisSeverity;
  /** Small count badge shown in the panel header (e.g. "2 blockers"). */
  badge?: string;
  /** Panel body for this axis. Keep it lazy: only rendered when active. */
  render: () => React.ReactNode;
  primaryCta?: AxisPrimaryCta;
}

export interface AxisCockpitProps {
  axes: AxisDef[];
  open: boolean;
  activeAxis: string | null;
  onOpenAxis: (id: string) => void;
  onClose: () => void;
  /** Panel width class. Default w-[392px]. */
  widthClassName?: string;
  /** Optional live feed (AI change analyst) pinned under the active axis body. */
  footer?: React.ReactNode;
  className?: string;
}

const CTA_TONE: Record<NonNullable<AxisPrimaryCta['tone']> | 'primary', string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  neutral:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
};

export default function AxisCockpit({
  axes,
  open,
  activeAxis,
  onOpenAxis,
  onClose,
  widthClassName = 'w-[392px]',
  footer,
  className = '',
}: AxisCockpitProps) {
  const active = axes.find((a) => a.id === activeAxis) ?? null;

  return (
    <div className={`flex min-h-0 ${className}`}>
      {/* Panel (only when open) */}
      {open && active && (
        <section
          aria-label={`${active.label} panel`}
          className={`${widthClassName} flex min-h-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900`}
        >
          <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <active.icon className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{active.label}</h3>
            {active.badge && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {active.badge}
              </span>
            )}
            <span className="flex-1" />
            {active.primaryCta && (
              <button
                type="button"
                onClick={active.primaryCta.onClick}
                disabled={active.primaryCta.disabled}
                title={active.primaryCta.title}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${CTA_TONE[active.primaryCta.tone ?? 'primary']}`}
              >
                {active.primaryCta.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Close panel"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{active.render()}</div>
          {footer && (
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">{footer}</div>
          )}
        </section>
      )}

      {/* Mini-rail — always visible */}
      <nav
        aria-label="Module axes"
        className="flex w-[52px] flex-col items-center gap-1 border-l border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-900"
      >
        {axes.map((a) => {
          const isActive = open && a.id === activeAxis;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => (isActive ? onClose() : onOpenAxis(a.id))}
              title={a.label}
              aria-pressed={isActive}
              className={`relative flex w-10 flex-col items-center gap-1 rounded-lg py-2 transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-slate-800'
              }`}
            >
              <a.icon className="h-[18px] w-[18px]" aria-hidden />
              <span className="text-[8px] font-semibold leading-none">
                {a.railLabel ?? a.label}
              </span>
              {a.severity && a.severity !== 'idle' && (
                <span
                  aria-label={`${a.label} status: ${a.severity}`}
                  className={`absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full ${DOT[a.severity]}`}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
