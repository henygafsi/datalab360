'use client';

/**
 * Shared primitives for the per-account Performance admin page.
 *
 * Mirrors the ServerMetricsPanel visual language: GlassPanel cards, compact
 * tables, STATUS_TINT badges. Centralised here so each axis panel stays small.
 */
import type { ElementType } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';
import MetricHelp from '@/components/ui/MetricHelp';

// ── Formatting (null → "—") ─────────────────────────────────────────────────

export const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString();

export const fmtMs = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '—' : `${Math.round(n)} ms`;

export const fmtPct = (n: number | null | undefined, digits = 1): string =>
  n == null || Number.isNaN(n) ? '—' : `${n.toFixed(digits)}%`;

export const fmtTime = (ts: string | null | undefined): string => {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString();
};

/** 4xx amber / 5xx red — identical to ServerMetricsPanel's STATUS_TINT. */
export const STATUS_TINT = (s: number) =>
  s >= 500
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    : s >= 400
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

// ── KPI Card (same shape as ServerMetricsPanel.Card + optional help) ─────────

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tint = 'text-slate-800 dark:text-slate-100',
  help,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ElementType;
  tint?: string;
  help?: { definition: string; source?: string; goodRange?: string };
}) {
  return (
    <GlassPanel depth={1} radius="xl" className="flex flex-col gap-1 p-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
          {help && <MetricHelp title={label} definition={help.definition} source={help.source} goodRange={help.goodRange} />}
        </span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <span className={cn('text-2xl font-semibold', tint)}>{value}</span>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </GlassPanel>
  );
}

// ── FilterChips (axis switcher) ──────────────────────────────────────────────

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  icon?: ElementType;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Axis">
      {options.map((o) => {
        const active = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border font-medium transition-colors',
              size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
              active
                ? 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Table panel chrome ───────────────────────────────────────────────────────

export function PanelHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/30 px-3 py-2 dark:border-white/10">
      <div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Quiet "not deployed yet" banner — shown when a backend route 404/501s. */
export function NotDeployedBanner({ what = 'This view' }: { what?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-6 text-[11px] text-slate-400">
      <Activity className="h-3.5 w-3.5 shrink-0" />
      <span>{what} is not deployed yet — the backend route is coming online.</span>
    </div>
  );
}

export function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-1.5 px-3 py-4 text-xs text-red-700 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 break-words">
        {message}{' '}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </span>
    </div>
  );
}

/** Small inline hit-rate bar (0–100%). */
export function HitRateBar({ rate }: { rate: number | null | undefined }) {
  if (rate == null || Number.isNaN(rate)) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const pct = Math.max(0, Math.min(100, rate));
  const tint = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <span className={cn('block h-full rounded-full', tint)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-slate-500 dark:text-slate-400">{pct.toFixed(0)}%</span>
    </span>
  );
}
