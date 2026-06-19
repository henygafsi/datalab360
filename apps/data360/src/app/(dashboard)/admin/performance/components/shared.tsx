'use client';

/**
 * Shared primitives for the per-account Performance admin page.
 *
 * Mirrors the ServerMetricsPanel visual language: GlassPanel cards, compact
 * tables, STATUS_TINT badges. Centralised here so each axis panel stays small.
 */
import type { ElementType } from 'react';
import { Activity, AlertTriangle, Search, X, Crosshair, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeNum } from '@/lib/format-number';
import { GlassPanel } from '@/app/shared/glass';
import MetricHelp from '@/components/ui/MetricHelp';

// ── Formatting (null → "—") ─────────────────────────────────────────────────

export const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString();

export const fmtMs = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? '—' : `${Math.round(n)} ms`;

export const fmtPct = (n: number | string | null | undefined, digits = 1): string => {
  const v = safeNum(n);
  return v == null ? '—' : `${v.toFixed(digits)}%`;
};

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

/**
 * Provenance hint for a KPI value. The KPI band can draw a single number from
 * either the HTTP request-trail (USER_REQUESTS) or usage-history (ACCOUNT_USAGE)
 * source, so a tiny honest badge records which one a card is showing. `null`
 * (no data / "—") renders nothing.
 */
export type KpiSource = 'request-trail' | 'usage-history' | 'live' | null;

const SOURCE_LABEL: Record<NonNullable<KpiSource>, { tag: string; title: string }> = {
  'request-trail': { tag: 'trail', title: 'Source: HTTP request trail' },
  'usage-history': { tag: 'usage', title: 'Source: usage history (fallback)' },
  live: { tag: 'live', title: 'Source: live in-process server metrics' },
};

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tint = 'text-slate-800 dark:text-slate-100',
  help,
  source = null,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ElementType;
  tint?: string;
  help?: { definition: string; source?: string; goodRange?: string };
  /** Provenance of the displayed value — renders a subtle source chip when set. */
  source?: KpiSource;
}) {
  const src = source ? SOURCE_LABEL[source] : null;
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
      <div className="flex items-center gap-1.5">
        {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
        {src && (
          <span
            title={src.title}
            className="ml-auto rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            {src.tag}
          </span>
        )}
      </div>
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

// ── Deep-dive: focus (cross-axis drill) ──────────────────────────────────────

/**
 * A cross-axis focus carries one entity (an endpoint or a user) so that
 * switching the axis can pre-fill the search to that entity. Lightweight by
 * design — it is a search hint + a visible context chip, never a hidden filter.
 */
export type PerfFocus =
  | { kind: 'endpoint'; value: string } // e.g. "GET /x" (method + path)
  | { kind: 'user'; value: string }
  | null;

// ── Deep-dive: status / method sub-filter (static per axis) ──────────────────

/** Status/method filter options offered for the current axis (static). */
export function statusOptionsForAxis(axis: string): ChipOption<string>[] {
  if (axis === 'errors')
    return [
      { id: '4xx', label: '4xx' },
      { id: '5xx', label: '5xx' },
    ];
  if (axis === 'endpoints')
    return [
      { id: 'GET', label: 'GET' },
      { id: 'POST', label: 'POST' },
      { id: 'PUT', label: 'PUT' },
      { id: 'PATCH', label: 'PATCH' },
      { id: 'DELETE', label: 'DELETE' },
    ];
  return [];
}

/** True when a row passes the active text search (case-insensitive substring). */
export function matchSearch(haystack: string, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

/** True when a status code matches a 4xx / 5xx class filter ('' = no filter). */
export function matchStatusClass(status: number | null | undefined, cls: string): boolean {
  if (!cls) return true;
  if (status == null) return false;
  if (cls === '4xx') return status >= 400 && status < 500;
  if (cls === '5xx') return status >= 500 && status < 600;
  return true;
}

/** True when an HTTP method matches the method filter ('' = no filter). */
export function matchMethod(method: string | null | undefined, m: string): boolean {
  if (!m) return true;
  return (method ?? '').toUpperCase() === m.toUpperCase();
}

// ── Deep-dive toolbar (search + status sub-filter + count + focus chip) ───────

export function DeepDiveToolbar({
  axis,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  shown,
  total,
  focus,
  onClearFocus,
}: {
  axis: string;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  shown: number;
  total: number;
  focus: PerfFocus;
  onClearFocus: () => void;
}) {
  const statusOptions = statusOptionsForAxis(axis);
  const filtered = search.trim() !== '' || statusFilter !== '';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
      <div className="relative flex-1 min-w-[160px]">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search rows…"
          aria-label="Search rows"
          className="w-full rounded-md border border-slate-200 bg-white/70 py-1 pl-7 pr-7 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {statusOptions.length > 0 && (
        <div className="flex items-center gap-1.5">
          <FilterChips
            options={[{ id: '', label: 'All' }, ...statusOptions]}
            value={statusFilter}
            onChange={onStatusFilterChange}
            size="sm"
          />
        </div>
      )}

      {focus && (
        <span
          className="inline-flex max-w-[260px] items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          title={focus.value}
        >
          <Crosshair className="h-3 w-3 shrink-0" />
          {/* "filter:" when the focus is actually applied to these rows; "context:"
              when it is carried for orientation only (e.g. endpoint focus on the
              users axis, where rows have no path to match). */}
          <span className="shrink-0 opacity-70">{search.trim() === focus.value.trim() ? 'filter:' : 'context:'}</span>
          <span className="truncate">{focus.value}</span>
          <button type="button" onClick={onClearFocus} aria-label="Clear focus" className="shrink-0 hover:text-blue-900 dark:hover:text-blue-100">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      <span className={cn('ml-auto shrink-0 text-[10px] tabular-nums', filtered ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')}>
        {filtered ? `${fmtInt(shown)} of ${fmtInt(total)}` : `${fmtInt(total)} rows`}
      </span>
    </div>
  );
}

// ── Analyze with AI ──────────────────────────────────────────────────────────

export type AiState = 'idle' | 'loading' | 'done' | 'error' | 'unavailable';

/** Header button that triggers an AI narrative analysis of the current view. */
export function AnalyzeAiButton({ onClick, state, disabled }: { onClick: () => void; state: AiState; disabled?: boolean }) {
  const loading = state === 'loading';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700/60 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/40',
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {loading ? 'Analyzing…' : 'Analyze with AI'}
    </button>
  );
}

/**
 * Dismissible docked panel that renders the AI narrative (never a blocking
 * modal). Loading / unavailable / error states are all handled honestly.
 */
export function AiAnalysisPanel({
  state,
  text,
  error,
  onClose,
}: {
  state: AiState;
  text: string;
  error: string | null;
  onClose: () => void;
}) {
  if (state === 'idle') return null;
  return (
    <GlassPanel depth={1} radius="xl" className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/30 px-3 py-2 dark:border-white/10">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3.5 w-3.5" />
          AI analysis
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss AI analysis"
          className="rounded-md p-0.5 text-slate-400 hover:bg-white/50 hover:text-slate-600 dark:hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 py-3 text-[12px] leading-relaxed text-slate-700 dark:text-slate-200">
        {state === 'loading' && (
          <span className="inline-flex items-center gap-2 text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing the current view…
          </span>
        )}
        {state === 'unavailable' && (
          <span className="inline-flex items-center gap-2 text-slate-400">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            AI analysis is not available on this backend yet — the analysis route is coming online.
          </span>
        )}
        {state === 'error' && (
          <span className="inline-flex items-start gap-2 text-red-600 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error || 'Analysis failed. Please try again.'}
          </span>
        )}
        {state === 'done' && (
          <p className="whitespace-pre-wrap break-words">{text || '—'}</p>
        )}
      </div>
    </GlassPanel>
  );
}

// ── Drill ("focus") button rendered inside a row ─────────────────────────────

export function DrillButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
    >
      <Crosshair className="h-3 w-3" />
    </button>
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
