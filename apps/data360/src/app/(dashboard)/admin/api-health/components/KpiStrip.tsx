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
};

function fmt(value: number | null): string {
  // Honest dash, never a fake 0.
  return value == null ? '—' : String(value);
}

const cards: { key: keyof Omit<KpiStripProps, never>; label: string; tone: string }[] = [
  { key: 'total', label: 'Total endpoints', tone: '#334155' },
  { key: 'healthy', label: 'Healthy', tone: '#16a34a' },
  { key: 'expected', label: 'Expected', tone: '#64748b' },
  { key: 'defects', label: 'Defects', tone: '#a21caf' },
  { key: 'failing', label: 'Failing', tone: '#dc2626' },
  { key: 'slow', label: 'Slow', tone: '#d97706' },
  { key: 'avgLatencyMs', label: 'Avg latency', tone: '#2563eb' },
];

export function KpiStrip(props: KpiStripProps) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {cards.map((c) => {
        const raw = props[c.key];
        const display =
          c.key === 'avgLatencyMs'
            ? raw == null
              ? '—'
              : `${raw} ms`
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
