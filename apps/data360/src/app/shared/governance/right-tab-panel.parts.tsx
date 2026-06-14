'use client';

/**
 * Presentational parts for {@link RightTabPanel} (the shared "Adaptive
 * Inspector"). Kept in a sibling module so the main component stays focused on
 * layout + behaviour while these stay purely visual and reusable across the
 * desktop rail and the mobile bottom-sheet.
 *
 * All parts are RBAC-agnostic — role filtering happens in the consumer.
 */

import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RightTabSection } from './right-tab-panel';

/* ─────────────────────────── Public contracts ─────────────────────────── */

export type QuickActionTone = 'default' | 'primary' | 'danger';

export interface QuickAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  tone?: QuickActionTone;
}

export type StatusTone = 'draft' | 'live' | 'ok' | 'warn' | 'error';

export interface StatusPillSpec {
  label: string;
  tone: StatusTone;
}

/* ────────────────────────────── Status pill ───────────────────────────── */

const STATUS_TONES: Record<
  StatusTone,
  { dot: string; text: string; bg: string; ring: string; pulse?: boolean }
> = {
  draft: {
    dot: 'bg-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-800',
    ring: 'ring-slate-200 dark:ring-slate-700',
  },
  live: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
    pulse: true,
  },
  ok: {
    dot: 'bg-green-500',
    text: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-500/10',
    ring: 'ring-green-200 dark:ring-green-500/30',
  },
  warn: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
  },
  error: {
    dot: 'bg-red-500',
    text: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-500/10',
    ring: 'ring-red-200 dark:ring-red-500/30',
  },
};

export function StatusPill({ pill }: { pill: StatusPillSpec }) {
  const t = STATUS_TONES[pill.tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        t.bg,
        t.text,
        t.ring,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, t.pulse && 'motion-safe:animate-pulse')} />
      {pill.label}
    </span>
  );
}

/* ───────────────────────────── Quick actions ──────────────────────────── */

const ACTION_TONES: Record<QuickActionTone, string> = {
  default:
    'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  primary:
    'border-transparent bg-slate-900 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100',
  danger:
    'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20',
};

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 overflow-x-auto border-b border-slate-200/80 px-4 py-2.5 dark:border-slate-800">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              ACTION_TONES[a.tone ?? 'default'],
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────── Section nav ───────────────────────────── */

interface SectionNavProps {
  sections: RightTabSection[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  /** Tailwind `bg-*` accent for the active item (consumer-provided). */
  accentClassName: string;
}

/** Polished vertical icon rail for the docked desktop inspector. */
export function DesktopRail({ sections, activeSection, onSectionChange, accentClassName }: SectionNavProps) {
  return (
    <nav
      aria-label="Panel sections"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-l border-slate-200 bg-slate-50/80 py-3 dark:border-slate-800 dark:bg-slate-950/40"
    >
      {sections.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeSection;
        return (
          <div key={item.id} className="group relative">
            <button
              type="button"
              onClick={() => onSectionChange(item.id)}
              aria-label={item.label}
              aria-pressed={isActive}
              title={item.description ?? item.label}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150',
                isActive
                  ? cn(accentClassName, 'text-white shadow-sm')
                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
            {/* Hover/focus tooltip — floats to the left of the rail. Shows the
                section's `description` when given, else its `label`. */}
            <span
              role="tooltip"
              aria-hidden="true"
              className="pointer-events-none absolute right-full top-1/2 z-20 mr-2 max-w-[14rem] -translate-y-1/2 whitespace-normal rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium leading-snug text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
            >
              {item.description ?? item.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/** Horizontal scrollable segmented bar — the rail's mobile bottom-sheet form. */
export function MobileSegmentedBar({
  sections,
  activeSection,
  onSectionChange,
  accentClassName,
}: SectionNavProps) {
  return (
    <nav
      aria-label="Panel sections"
      className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800"
    >
      {sections.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeSection;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id)}
            aria-pressed={isActive}
            title={item.description ?? item.label}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? cn(accentClassName, 'text-white shadow-sm')
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
