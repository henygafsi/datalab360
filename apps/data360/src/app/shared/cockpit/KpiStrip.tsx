'use client';

/**
 * KpiStrip — the UNIFIED top KPI strip (2026-07-02 redesign).
 * A horizontal row of compact KPI cards under a module/page header.
 * Honest by design: null/undefined values render as "—" (never fake 0s);
 * real zeros are preserved.
 */

import React from 'react';

export type KpiDotTone = 'ok' | 'warn' | 'blocker' | 'pending' | 'idle';

const DOT: Record<KpiDotTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  blocker: 'bg-red-500',
  pending: 'bg-blue-500',
  idle: 'bg-slate-300 dark:bg-slate-600',
};

const DELTA_TONE = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  muted: 'text-slate-400 dark:text-slate-500',
} as const;

export interface KpiItem {
  label: string;
  /** Main value. null/undefined -> "—". Real 0 is shown. */
  value?: string | number | null;
  /** Small colored status dot before the value. */
  dot?: KpiDotTone;
  /** Secondary inline text (e.g. "↑2", "12 issues", "+3.2%"). */
  delta?: { text: string; tone?: keyof typeof DELTA_TONE };
  /** Muted sub-line under the value (e.g. "On track"). */
  sub?: string;
  /** Optional click-through (deep-link to the owning axis/tab). */
  onClick?: () => void;
  title?: string;
}

export default function KpiStrip({
  items,
  className = '',
}: {
  items: KpiItem[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div
      className={`flex overflow-x-auto border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
      role="list"
      aria-label="Key metrics"
    >
      {items.map((k, i) => {
        const Comp: any = k.onClick ? 'button' : 'div';
        return (
          <Comp
            key={k.label}
            role="listitem"
            type={k.onClick ? 'button' : undefined}
            onClick={k.onClick}
            title={k.title}
            className={`min-w-[128px] flex-1 px-4 py-3 text-left ${
              i > 0 ? 'border-l border-slate-200 dark:border-slate-800' : ''
            } ${k.onClick ? 'transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60' : ''}`}
          >
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {k.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              {k.dot && (
                <span
                  aria-hidden
                  className={`inline-block h-2 w-2 shrink-0 self-center rounded-full ${DOT[k.dot]}`}
                />
              )}
              <span className="text-lg font-bold leading-tight text-slate-900 dark:text-white">
                {k.value === null || k.value === undefined || k.value === '' ? '—' : k.value}
              </span>
              {k.delta && (
                <span
                  className={`text-[11px] font-bold ${DELTA_TONE[k.delta.tone ?? 'muted']}`}
                >
                  {k.delta.text}
                </span>
              )}
            </div>
            {k.sub && (
              <div className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">{k.sub}</div>
            )}
          </Comp>
        );
      })}
    </div>
  );
}
