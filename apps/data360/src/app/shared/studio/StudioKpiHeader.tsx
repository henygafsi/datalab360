'use client';

/**
 * StudioKpiHeader — the business-KPI card strip that leads each Studio view.
 *
 * The one rule it never breaks: a metric that has not been evaluated is
 * `null` and renders as "—", never as 0 and never as a full 100 %. Each card
 * can carry the `method` by which its figure was computed (shown on hover),
 * so nothing on screen reads as an invented number. Values come from the
 * backend `summary` roll-up (derived from persisted state, never a scan).
 */

import type { LucideIcon } from 'lucide-react';

export interface Kpi {
  key: string;
  label: string;
  /** null / undefined ⇒ "—" (not evaluated). */
  value: number | string | null | undefined;
  /** e.g. '%' — appended to a numeric value. */
  unit?: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  /** how the figure was computed — shown on hover, and honesty over polish. */
  method?: string | null;
}

const TONE: Record<NonNullable<Kpi['tone']>, string> = {
  default: 'text-slate-900 dark:text-slate-100',
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
};

function render(value: Kpi['value'], unit?: string): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    const n = Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return unit ? `${n}${unit}` : n;
  }
  return String(value);
}

export default function StudioKpiHeader({
  kpis,
  loading = false,
}: {
  kpis: Kpi[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div role="status" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <span className="sr-only">Reading the figures…</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
        ))}
      </div>
    );
  }
  if (kpis.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {kpis.map((k) => {
        const Icon = k.icon;
        const known = k.value != null && k.value !== '';
        return (
          <div
            key={k.key}
            title={k.method ? `${k.label} — ${k.method}` : k.label}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-1.5">
              {Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />}
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">{k.label}</span>
            </div>
            <div
              className={`mt-0.5 truncate text-xl font-semibold tabular-nums ${
                known ? TONE[k.tone ?? 'default'] : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {render(k.value, k.unit)}
            </div>
            {k.sub && <div className="truncate text-xs text-slate-400 dark:text-slate-500">{k.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
