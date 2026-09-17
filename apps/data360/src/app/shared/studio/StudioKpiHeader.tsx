'use client';

/**
 * StudioKpiHeader — the business-KPI instrument panel that leads each
 * Studio view: ONE banded strip (not a scatter of small cards), each cell
 * an icon tile + hero figure, dense enough to hold a single row.
 *
 * The one rule it never breaks: a metric that has not been evaluated is
 * `null` and renders as "—", never as 0 and never as a full 100 %. Each cell
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

const NUM_TONE: Record<NonNullable<Kpi['tone']>, string> = {
  default: 'text-slate-900 dark:text-slate-50',
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400',
};

const TILE_TONE: Record<NonNullable<Kpi['tone']>, string> = {
  // neutral by default — six identical blue squares say nothing; the brand
  // blue is reserved for tiles that MEAN something (tone 'accent')
  default: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  good: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
  warn: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  bad: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
};

function render(value: Kpi['value'], unit?: string): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    // big figures compact themselves — 4,988,054,089 reads as 4.99 B on a
    // dashboard; the exact figure stays in the title
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${(value / 1e9).toFixed(2)} B${unit ?? ''}`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} M${unit ?? ''}`;
    const n = Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return unit ? `${n}${unit}` : n;
  }
  return String(value);
}

function exact(value: Kpi['value'], unit?: string): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) < 1e6) return undefined;
  return `${value.toLocaleString()}${unit ?? ''}`;
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
      <div
        role="status"
        className="h-[74px] animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <span className="sr-only">Reading the figures…</span>
      </div>
    );
  }
  if (kpis.length === 0) return null;

  return (
    // ONE instrument panel — cells divided by hairlines, wrapping only when
    // the viewport truly cannot hold them (no-scroll directive)
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 lg:grid-cols-6 dark:border-slate-800 dark:bg-slate-900">
      {kpis.map((k) => {
        const Icon = k.icon;
        const known = k.value != null && k.value !== '';
        // a method must be a string before it can reach a title or a child — a
        // non-string (e.g. a per-metric map the caller forgot to resolve) is
        // dropped, never rendered, so it can never crash the strip.
        const methodStr = typeof k.method === 'string' ? k.method : undefined;
        const exactStr = exact(k.value, k.unit);
        return (
          <div
            key={k.key}
            title={[k.label, exactStr, methodStr].filter(Boolean).join(' — ')}
            className="flex min-w-0 items-center gap-2.5 border-b border-r border-slate-100 px-3 py-2.5 last:border-r-0 dark:border-slate-800/60"
          >
            {Icon && (
              <span
                aria-hidden
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TILE_TONE[known ? (k.tone ?? 'default') : 'default']}`}
              >
                <Icon className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {k.label}
                {methodStr && <span className="sr-only"> — how computed: {methodStr}</span>}
              </span>
              <span
                className={`block truncate text-xl font-bold leading-6 tabular-nums ${
                  known ? NUM_TONE[k.tone ?? 'default'] : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {render(k.value, k.unit)}
              </span>
              {k.sub && (
                <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">{k.sub}</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
