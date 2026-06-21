'use client';

import { Text } from 'rizzui';

type KpiStripProps = {
  /** Total endpoints is statically known — always a number. */
  total: number;
  /** healthy / expected / defects / failing / slow / avgLatency are null until a probe has run. */
  healthy: number | null;
  /** Expected 4xx — the API correctly rejecting fake/empty probe input (benign, not a warning). */
  expected: number | null;
  /** Genuine defects (SQL compilation / 405 / 408 / 5xx) — the trustworthy "real bug" count. */
  defects: number | null;
  failing: number | null;
  slow: number | null;
  avgLatencyMs: number | null;
  /** Honest success rate (healthy / total, 0..1). Null until a probe has run. */
  successRate?: number | null;
  /** Latency percentiles over reachable probes. Null until a probe has run. */
  p50Ms?: number | null;
  p95Ms?: number | null;
  /** Raw HTTP buckets (independent of the honest defect/expected split). */
  raw4xx?: number | null;
  raw5xx?: number | null;
};

function fmt(value: number | null): string {
  // Honest dash, never a fake 0.
  return value == null ? '—' : String(value);
}

function fmtPct(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function fmtMs(value: number | null | undefined): string {
  return value == null ? '—' : `${value} ms`;
}

const cards: { key: keyof KpiStripProps; label: string; tone: string }[] = [
  { key: 'total', label: 'Total endpoints', tone: '#334155' },
  { key: 'successRate', label: 'Success rate', tone: '#16a34a' },
  { key: 'healthy', label: 'Healthy', tone: '#16a34a' },
  { key: 'expected', label: 'Expected', tone: '#64748b' },
  { key: 'defects', label: 'Defects', tone: '#a21caf' },
  { key: 'raw4xx', label: '4xx', tone: '#d97706' },
  { key: 'raw5xx', label: '5xx', tone: '#dc2626' },
  { key: 'failing', label: 'Failing', tone: '#dc2626' },
  { key: 'slow', label: 'Slow', tone: '#d97706' },
  { key: 'avgLatencyMs', label: 'Avg latency', tone: '#2563eb' },
  { key: 'p50Ms', label: 'p50 latency', tone: '#2563eb' },
  { key: 'p95Ms', label: 'p95 latency', tone: '#7c3aed' },
];

export function KpiStrip(props: KpiStripProps) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const raw = props[c.key];
        const display =
          c.key === 'successRate'
            ? fmtPct(raw as number | null | undefined)
            : c.key === 'avgLatencyMs' || c.key === 'p50Ms' || c.key === 'p95Ms'
              ? fmtMs(raw as number | null | undefined)
              : fmt(raw as number | null);
        return (
          <div
            key={c.key}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-50"
          >
            <div className="text-2xl font-bold leading-tight" style={{ color: c.tone }}>
              {display}
            </div>
            <Text className="mt-0.5 text-xs text-gray-500">{c.label}</Text>
          </div>
        );
      })}
    </div>
  );
}
