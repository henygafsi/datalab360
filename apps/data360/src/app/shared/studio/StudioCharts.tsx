'use client';

/**
 * StudioCharts — hand-rolled SVG renderers for the reporting tiles.
 *
 * The run contract gives {columns, rows}: rows are label + numeric value(s).
 * Every renderer is HONEST about shape: when the data cannot carry the
 * asked visual (no numeric column, one point for a line, …) it falls back
 * to the table rather than drawing something plausible. No chart library —
 * these stay tiny, theme-aware (Tailwind classes on SVG), and deterministic.
 */

import type { RunResult } from '@/app/services/studio/studio-api';

export type ChartViz = 'line' | 'bar' | 'pie' | 'table';

export function normalizeViz(chartType?: string | null): ChartViz {
  const t = String(chartType ?? '').toLowerCase();
  if (t === 'line' || t === 'area' || t === 'trend') return 'line';
  if (t === 'bar' || t === 'column' || t === 'breakdown') return 'bar';
  if (t === 'pie' || t === 'donut') return 'pie';
  return 'table';
}

/** The visuals the legacy BI renderer draws itself. `normalizeViz` only
 *  chooses the SIMPLE fallback shape; it must never decide that a treemap
 *  or a gauge is a table — that silently swallowed 14 chart types. */
const RENDERER_TYPES = new Set([
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'stacked_bar',
  'stacked_area',
  'combo',
  'scatter',
  'bubble',
  'histogram',
  'heatmap',
  'radar',
  'treemap',
  'funnel',
  'waterfall',
  'gauge',
  'radial_bar',
  'candlestick',
]);

export function isRenderableChart(chartType?: string | null): boolean {
  return RENDERER_TYPES.has(String(chartType ?? '').toLowerCase());
}

/** label + first numeric column of each row; null when nothing numeric. */
function seriesOf(result: RunResult): { label: string; value: number }[] | null {
  const rows = result.rows ?? [];
  if (rows.length === 0) return null;
  const numIdx = (rows[0] ?? []).findIndex((c, i) => i > 0 && typeof c === 'number');
  if (numIdx < 0) return null;
  const out: { label: string; value: number }[] = [];
  for (const r of rows) {
    const v = r[numIdx];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out.push({ label: String(r[0] ?? ''), value: v });
  }
  return out.length > 0 ? out : null;
}

const fmtShort = (n: number): string =>
  Math.abs(n) >= 1e9
    ? `${(n / 1e9).toFixed(1)}B`
    : Math.abs(n) >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `${(n / 1e3).toFixed(1)}k`
        : String(Math.round(n));

/* ── line ───────────────────────────────────────────────────────────── */

function LineSvg({ s }: { s: { label: string; value: number }[] }) {
  const W = 560;
  const H = 150;
  const pad = { l: 6, r: 46, t: 10, b: 18 };
  const min = Math.min(...s.map((p) => p.value));
  const max = Math.max(...s.map((p) => p.value));
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / Math.max(1, s.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const pts = s.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${pad.l},${H - pad.b} ${pts} ${x(s.length - 1).toFixed(1)},${H - pad.b}`;
  const last = s[s.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="line chart">
      <polygon points={area} className="fill-accent-500/10" />
      <polyline
        points={pts}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        className="stroke-accent-500"
      />
      <circle cx={x(s.length - 1)} cy={y(last.value)} r="3" className="fill-accent-600" />
      <text
        x={x(s.length - 1) + 6}
        y={y(last.value) + 3.5}
        className="fill-slate-500 text-xs tabular-nums dark:fill-slate-400"
      >
        {fmtShort(last.value)}
      </text>
      <text x={pad.l} y={H - 5} className="fill-slate-400 text-xs dark:fill-slate-500">
        {s[0].label}
      </text>
      <text
        x={W - pad.r}
        y={H - 5}
        textAnchor="end"
        className="fill-slate-400 text-xs dark:fill-slate-500"
      >
        {last.label}
      </text>
    </svg>
  );
}

/* ── bars ───────────────────────────────────────────────────────────── */

function BarSvg({ s }: { s: { label: string; value: number }[] }) {
  const shown = s.slice(0, 10);
  const max = Math.max(...shown.map((p) => Math.abs(p.value))) || 1;
  return (
    <div className="space-y-1" role="img" aria-label="bar chart">
      {shown.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-28 shrink-0 truncate text-xs text-slate-500 dark:text-slate-400"
            title={p.label}
          >
            {p.label}
          </span>
          <div className="h-3.5 min-w-0 flex-1 rounded-sm bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-sm bg-accent-500"
              style={{ width: `${Math.max(1.5, (Math.abs(p.value) / max) * 100)}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
            {fmtShort(p.value)}
          </span>
        </div>
      ))}
      {s.length > shown.length && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {s.length - shown.length} more row(s) in the table view
        </p>
      )}
    </div>
  );
}

/* ── pie ────────────────────────────────────────────────────────────── */

const PIE_CLASSES = [
  'fill-accent-500',
  'fill-sky-500',
  'fill-emerald-500',
  'fill-amber-500',
  'fill-rose-500',
  'fill-violet-500',
  'fill-teal-500',
  'fill-slate-400',
];

function PieSvg({ s }: { s: { label: string; value: number }[] }) {
  const parts = s.filter((p) => p.value > 0).slice(0, 8);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (parts.length === 0 || total <= 0) return null;
  const R = 54;
  const C = 60;
  let angle = -Math.PI / 2;
  const slices = parts.map((p) => {
    const frac = p.value / total;
    const a0 = angle;
    const a1 = (angle += frac * Math.PI * 2);
    const large = frac > 0.5 ? 1 : 0;
    // a single full-circle slice cannot be drawn as an arc — use a circle
    const d =
      frac >= 0.999
        ? null
        : `M ${C} ${C} L ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} Z`;
    return { ...p, d, frac };
  });
  return (
    <div className="flex items-center gap-3" role="img" aria-label="pie chart">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0">
        {slices.map((sl, i) =>
          sl.d ? (
            <path key={i} d={sl.d} className={PIE_CLASSES[i % PIE_CLASSES.length]}>
              <title>{`${sl.label} — ${(sl.frac * 100).toFixed(1)}%`}</title>
            </path>
          ) : (
            <circle key={i} cx={C} cy={C} r={R} className={PIE_CLASSES[i % PIE_CLASSES.length]} />
          ),
        )}
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {slices.map((sl, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${PIE_CLASSES[i % PIE_CLASSES.length].replace('fill-', 'bg-')}`}
            />
            <span className="min-w-0 truncate text-slate-600 dark:text-slate-300" title={sl.label}>
              {sl.label}
            </span>
            <span className="ml-auto shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
              {(sl.frac * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── dispatcher ─────────────────────────────────────────────────────── */

export function ChartVizView({
  viz,
  result,
  table,
}: {
  viz: ChartViz;
  result: RunResult;
  /** The table fallback markup — provided by the tile so the two render
   *  paths never drift. */
  table: React.ReactNode;
}) {
  if (viz === 'table') return <>{table}</>;
  const s = seriesOf(result);
  if (
    !s ||
    (viz === 'line' && s.length < 2) ||
    (viz === 'pie' && !s.some((p) => p.value > 0))
  ) {
    // the data cannot carry this visual — show the truth, not a drawing
    return (
      <div>
        <p className="mb-1 text-xs text-slate-400 dark:text-slate-500">
          not drawable as {viz} — showing the values
        </p>
        {table}
      </div>
    );
  }
  if (viz === 'line') return <LineSvg s={s} />;
  if (viz === 'bar') return <BarSvg s={s} />;
  return <PieSvg s={s} />;
}
