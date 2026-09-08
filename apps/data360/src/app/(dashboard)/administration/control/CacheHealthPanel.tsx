'use client';

/**
 * CacheHealthPanel — cache hit rate, key-class inventory and backend health
 * for the administration control page (accountadmin only).
 *
 * Reads exclusively through the shared administration control service —
 * no direct apiClient calls here. Silent refresh at mount only: no polling,
 * no manual refresh affordance. Unknown values render '—', never 0 — a
 * `count: null` means the backend could not enumerate that class, which is
 * not the same thing as an empty class.
 *
 * `/cache/breakdown` is NOT redundant with `/cache/kpis`: kpis carries
 * sampled byte sizes per class, breakdown carries TTL ranges (oldest/newest
 * seconds to expiry). The TTL ranges surface below the main table as a
 * compact "Key expiry" strip for non-empty classes.
 */

import { useEffect, useState } from 'react';

import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import { formatAge } from '@/app/shared/command-center/lib/meta';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import {
  getCacheBreakdown,
  getCacheKpis,
  getReady,
  isAdminEnvelope,
  type AdminEnvelope,
} from '@/app/services/administration/control';

/* ------------------------------------------------------------------ */
/* Display shapes (structural — tolerant of extra backend fields)      */
/* ------------------------------------------------------------------ */

interface CacheClassRow {
  class: string;
  prefix: string;
  count: number | null;
  status: string; // 'ok' | 'truncated' | 'unavailable'
  bytes?: number | null;
  bytes_sampled?: number;
}

interface CacheKpisShape {
  hit_rate?: number | null;
  miss_rate?: number | null;
  total_keys?: number | null;
  by_class?: CacheClassRow[];
  redis_status?: string | null;
  generated_at?: string;
}

interface BreakdownClassRow {
  class: string;
  prefix?: string;
  count?: number | null;
  status?: string;
  oldest_ttl?: number | null;
  newest_ttl?: number | null;
  ttl_sampled?: number;
}

interface BreakdownShape {
  by_class?: BreakdownClassRow[];
  total?: number | null;
}

interface ReadyShape {
  status?: string;
  checks?: Record<string, string>;
}

type PanelPhase =
  | { phase: 'loading' }
  | { phase: 'preparing'; envelope: AdminEnvelope }
  | { phase: 'unavailable'; envelope: AdminEnvelope }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      kpis: CacheKpisShape;
      ready: ReadyShape | null;
      breakdown: BreakdownShape | null;
    };

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US');
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ChipTone = 'emerald' | 'amber' | 'slate';

const CHIP_TONES: Record<ChipTone, string> = {
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400',
  amber:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400',
  slate:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400',
};

function statusTone(status: string | undefined): ChipTone {
  if (status === 'ok') return 'emerald';
  if (status === 'truncated' || status === 'unavailable') return 'amber';
  return 'slate';
}

function StatusChip({ value, tone }: { value: string; tone: ChipTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${CHIP_TONES[tone]}`}
    >
      {value}
    </span>
  );
}

/** ready.checks.redis wins; falls back to kpis.redis_status; else unknown. */
function deriveBackend(
  ready: ReadyShape | null,
  kpis: CacheKpisShape,
): { label: string; tone: ChipTone } {
  const readyRedis = ready?.checks?.redis;
  if (readyRedis != null) {
    return readyRedis === 'ok'
      ? { label: 'redis', tone: 'emerald' }
      : { label: 'memory', tone: 'amber' };
  }
  if (kpis.redis_status != null) {
    return kpis.redis_status === 'ok'
      ? { label: 'redis', tone: 'emerald' }
      : { label: 'memory', tone: 'amber' };
  }
  return { label: '—', tone: 'slate' };
}

/** TTL range for a breakdown row, via formatAge — null parts elided. */
function formatTtlRange(row: BreakdownClassRow): string | null {
  const oldest = formatAge(row.oldest_ttl);
  const newest = formatAge(row.newest_ttl);
  if (oldest == null && newest == null) return null;
  if (oldest != null && newest != null) {
    return oldest === newest ? oldest : `${oldest} – ${newest}`;
  }
  return oldest ?? newest;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function CacheHealthPanel() {
  const [state, setState] = useState<PanelPhase>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [kpisRes, readyRes, breakdownRes] = await Promise.allSettled([
        getCacheKpis(),
        getReady(),
        getCacheBreakdown(),
      ]);
      if (cancelled) return;

      if (kpisRes.status === 'rejected') {
        const reason = kpisRes.reason;
        setState({
          phase: 'error',
          message:
            reason instanceof Error ? reason.message : 'request failed',
        });
        return;
      }

      const kpisBody = kpisRes.value as unknown;
      if (isAdminEnvelope(kpisBody)) {
        setState({
          phase: kpisBody.state === 'preparing' ? 'preparing' : 'unavailable',
          envelope: kpisBody,
        });
        return;
      }

      // Secondary reads degrade silently — the panel stays honest without them.
      const readyBody =
        readyRes.status === 'fulfilled' &&
        !isAdminEnvelope(readyRes.value as unknown)
          ? (readyRes.value as unknown as ReadyShape)
          : null;
      const breakdownBody =
        breakdownRes.status === 'fulfilled' &&
        !isAdminEnvelope(breakdownRes.value as unknown)
          ? (breakdownRes.value as unknown as BreakdownShape)
          : null;

      setState({
        phase: 'ready',
        kpis: kpisBody as CacheKpisShape,
        ready: readyBody,
        breakdown: breakdownBody,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      role="region"
      aria-label="Cache health"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    >
      <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Cache health
        </h2>
      </header>

      <div className="p-4">
        {state.phase === 'loading' && (
          <TableSkeleton rows={4} columns={5} showHeader />
        )}

        {state.phase === 'preparing' && (
          <PreparingState domainLabel="cache health" />
        )}

        {state.phase === 'unavailable' && (
          <div title={state.envelope.source ?? undefined}>
            <EmptyState
              compact
              title="Cache health unavailable"
              description={state.envelope.reason}
            />
          </div>
        )}

        {state.phase === 'error' && (
          <p className="py-4 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load cache health — {state.message}
          </p>
        )}

        {state.phase === 'ready' && <CacheHealthBody state={state} />}
      </div>
    </section>
  );
}

function CacheHealthBody({
  state,
}: {
  state: Extract<PanelPhase, { phase: 'ready' }>;
}) {
  const { kpis, ready, breakdown } = state;
  const backend = deriveBackend(ready, kpis);
  const rows = Array.isArray(kpis.by_class) ? kpis.by_class : [];

  const ttlRows = (breakdown?.by_class ?? []).filter(
    (row) =>
      (row.count ?? 0) > 0 &&
      (row.oldest_ttl != null || row.newest_ttl != null),
  );

  return (
    <div className="space-y-4">
      {/* Compact tiles */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Hit rate
          </p>
          <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatPercent(kpis.hit_rate)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Total keys
          </p>
          <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatCount(kpis.total_keys)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Backend
          </p>
          <p className="mt-1">
            <StatusChip value={backend.label} tone={backend.tone} />
          </p>
        </div>
      </div>

      {/* Per-class table */}
      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No cache classes reported"
          description="The cache layer returned no per-class inventory."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Class
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Prefix
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Count
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Size
                </th>
                <th scope="col" className="py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.class}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">
                    {row.class}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {row.prefix}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                    {row.count == null ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span>—</span>
                        <StatusChip value="unavailable" tone="amber" />
                      </span>
                    ) : (
                      formatCount(row.count)
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                    {formatBytes(row.bytes)}
                  </td>
                  <td className="py-2">
                    <StatusChip
                      value={row.status ?? '—'}
                      tone={statusTone(row.status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TTL breakdown — only when it adds information over the kpis table */}
      {ttlRows.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Key expiry by class
          </h3>
          <ul className="flex flex-wrap gap-2">
            {ttlRows.map((row) => {
              const range = formatTtlRange(row);
              return (
                <li
                  key={row.class}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  <span>{row.class}</span>
                  <span className="tabular-nums text-slate-400 dark:text-slate-500">
                    {range ?? '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
