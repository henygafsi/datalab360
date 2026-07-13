'use client';

/**
 * StorageSplitCard — the storage axis of Account Overview › FinOps.
 *
 * Answers the WHs from real ACCOUNT_USAGE (GET /org-accounts/storage-split):
 *  - WHAT : active vs time-travel vs failsafe vs clone vs stage bytes (split bar)
 *  - WHERE: per-database split (top rows)
 *  - WHEN : STORAGE_USAGE daily history (area chart)
 *  - WHY  : top retention-heavy tables — a table whose TT+failsafe dwarf its
 *           active bytes is being rewritten wholesale (churn), the #1 silent
 *           storage-bill driver.
 *
 * Data-first: skeleton until the real payload lands; per-axis refresh evicts
 * ONLY this endpoint's shared cache slot (invalidate-surface, ACCOUNTADMIN)
 * then refetches — non-admins degrade to a plain refetch.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, RefreshCw } from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  getStorageSplit,
  getStorageInsight,
  type StorageSplitResponse,
} from '@/app/services/org-accounts/hooks';
import { invalidateCacheSurface } from '@/app/services/cache/admin';
import FinopsInsightBlock from './FinopsInsightBlock';

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
  return `${(n / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const SEGMENTS = [
  { key: 'active_bytes', label: 'Active', cls: 'bg-emerald-500' },
  { key: 'time_travel_bytes', label: 'Time-travel', cls: 'bg-amber-400' },
  { key: 'failsafe_bytes', label: 'Failsafe', cls: 'bg-rose-400' },
  { key: 'clone_retained_bytes', label: 'Clone-retained', cls: 'bg-violet-400' },
  { key: 'stage_bytes', label: 'Stages', cls: 'bg-sky-400' },
] as const;

function Skeleton() {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800" aria-busy="true">
      <div className="mb-3 h-3 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="mb-3 h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

export default function StorageSplitCard({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<StorageSplitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getStorageSplit(days));
    } catch {
      setError('Storage split unavailable (ACCOUNT_USAGE read failed).');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const account = (session?.user as { account_name?: string } | undefined)?.account_name;
    try {
      if (account) {
        // Evict ONLY this axis' cache slot; harmless 403 for non-admins.
        await invalidateCacheSurface({
          account,
          page: 'account_overview',
          module: 'finops',
          shared_fns: ['get_storage_split'],
        }).catch(() => undefined);
      }
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, session]);

  if (loading && !data) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <HardDrive className="mr-2 inline h-4 w-4" />
        {error ?? 'No storage data.'}
        <button type="button" onClick={() => void load()} className="ml-3 text-xs underline">retry</button>
      </div>
    );
  }

  const split = data.split;
  const total = Math.max(1, split.total_bytes);
  const retentionHeavy = (split.retention_share_pct ?? 0) > 50;
  const topChurn = data.top_retention_tables[0];
  const history = data.history.map((h) => ({
    date: h.date.slice(5),
    'Storage (GB)': +(h.storage_bytes / 2 ** 30).toFixed(2),
    'Failsafe (GB)': +(h.failsafe_bytes / 2 ** 30).toFixed(2),
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <HardDrive className="h-4 w-4 text-sky-500" /> Storage split
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            TABLE_STORAGE_METRICS · STORAGE_USAGE ({data.period_days}d history)
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          title="Evict this axis' cache slot and recompute from ACCOUNT_USAGE"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> Refresh axis
        </button>
      </div>

      {/* COCO reads this axis first — one actionable briefing over the raw split. */}
      <div className="mb-3">
        <FinopsInsightBlock
          fetcher={getStorageInsight}
          days={data.period_days}
          title="COCO reads your storage"
          data-testid="storage-insight"
        />
      </div>

      {/* WHAT — proportional split bar + legend */}
      <div className="mb-1 flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {SEGMENTS.map((s) => {
          const v = split[s.key];
          if (!v) return null;
          return (
            <div
              key={s.key}
              className={s.cls}
              style={{ width: `${Math.max(0.75, (v / total) * 100)}%` }}
              title={`${s.label}: ${formatBytes(v)}`}
            />
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', s.cls)} />
            {s.label} <span className="font-medium tabular-nums">{formatBytes(split[s.key])}</span>
          </span>
        ))}
        <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">
          Total {formatBytes(split.total_bytes)}
        </span>
      </div>

      {/* WHY — honest retention callout, only when retention really dominates */}
      {retentionHeavy && topChurn && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {split.retention_share_pct}% of storage is retention (time-travel + failsafe), not live data.
          Biggest driver: <span className="font-mono">{topChurn.fqn}</span> holds{' '}
          {formatBytes(topChurn.time_travel_bytes + topChurn.failsafe_bytes)} of retention for{' '}
          {formatBytes(topChurn.active_bytes)} active ({topChurn.retention_ratio}×) — the signature of a
          frequently rewritten table. Lowering DATA_RETENTION_TIME_IN_DAYS or making it TRANSIENT stops the bleed.
        </div>
      )}

      {/* WHEN — daily history */}
      {history.length > 1 && (
        <div className="mb-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="Storage (GB)" stroke="#0EA5E9" fill="#0EA5E9" fillOpacity={0.2} />
              <Area type="monotone" dataKey="Failsafe (GB)" stroke="#FB7185" fill="#FB7185" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* WHERE + WHY drill — top retention tables */}
      {data.top_retention_tables.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <th className="py-1.5 pr-2 font-medium"><Database className="mr-1 inline h-3 w-3" />Table</th>
                <th className="py-1.5 pr-2 text-right font-medium">Active</th>
                <th className="py-1.5 pr-2 text-right font-medium">Time-travel</th>
                <th className="py-1.5 pr-2 text-right font-medium">Failsafe</th>
                <th className="py-1.5 text-right font-medium">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {data.top_retention_tables.slice(0, 6).map((t) => (
                <tr key={t.fqn} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="max-w-[16rem] truncate py-1.5 pr-2 font-mono text-[11px] text-slate-600 dark:text-slate-300" title={t.fqn}>
                    {t.fqn}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatBytes(t.active_bytes)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatBytes(t.time_travel_bytes)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatBytes(t.failsafe_bytes)}</td>
                  <td className={cn('py-1.5 text-right font-semibold tabular-nums',
                    t.retention_ratio > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300')}>
                    {t.retention_ratio}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.partial && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
          Partial view — degraded sections: {data.degraded_sections.join(', ')}
        </p>
      )}
    </div>
  );
}
