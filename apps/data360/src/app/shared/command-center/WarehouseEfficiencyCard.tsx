'use client';

/**
 * WarehouseEfficiencyCard — the compute-efficiency axis of Account Overview ›
 * Usage & Performance.
 *
 * The backend endpoint (GET /org-accounts/warehouse-efficiency) existed but had
 * ZERO UI consumers — queue times, disk-spilling queries and auto-suspend
 * misconfigurations were computed and never shown. This card surfaces them:
 *  - WHAT : per-warehouse credits vs query volume (credits / 100 queries)
 *  - WHY  : spilled queries (undersized WH) + queue time (overloaded WH)
 *  - WHO/WHERE: which warehouse; misconfig flags name the exact setting
 *  - WHEN : the selected window; per-axis refresh recomputes from ACCOUNT_USAGE
 *
 * Data-first: skeleton until the payload lands; honest empty state.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  getWarehouseEfficiency,
  type WarehouseEfficiencyResponse,
} from '@/app/services/org-accounts/hooks';
import { invalidateCacheSurface } from '@/app/services/cache/admin';

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
  return `${(n / 2 ** (10 * i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Skeleton() {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800" aria-busy="true">
      <div className="mb-3 h-3 w-52 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

export default function WarehouseEfficiencyCard({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<WarehouseEfficiencyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getWarehouseEfficiency(days));
    } catch {
      setError('Warehouse efficiency unavailable (ACCOUNT_USAGE read failed).');
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
        await invalidateCacheSurface({
          account,
          page: 'account_overview',
          module: 'usage_performance',
          shared_fns: ['get_warehouse_efficiency'],
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
        <Gauge className="mr-2 inline h-4 w-4" />
        {error ?? 'No warehouse data.'}
        <button type="button" onClick={() => void load()} className="ml-3 text-xs underline">retry</button>
      </div>
    );
  }

  const rows = [...data.warehouses].sort((a, b) => b.credits - a.credits);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Gauge className="h-4 w-4 text-amber-500" /> Warehouse efficiency
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            QUERY_HISTORY · WAREHOUSE_METERING_HISTORY · SHOW WAREHOUSES ({data.period_days}d)
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

      {/* Misconfig flags — each names the exact setting and the honest cost */}
      {data.misconfigurations.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.misconfigurations.map((f) => (
            <span
              key={`${f.warehouse}-${f.flag}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
              title={f.detail}
            >
              <AlertTriangle className="h-3 w-3" />
              <span className="font-medium">{f.warehouse}</span> {f.flag.replaceAll('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No warehouse activity in the last {data.period_days} days.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <th className="py-1.5 pr-2 font-medium">Warehouse</th>
                <th className="py-1.5 pr-2 text-right font-medium">Credits</th>
                <th className="py-1.5 pr-2 text-right font-medium">Queries</th>
                <th className="py-1.5 pr-2 text-right font-medium">Cr / 100 q</th>
                <th className="py-1.5 pr-2 text-right font-medium">Avg queue</th>
                <th className="py-1.5 pr-2 text-right font-medium">Spilled</th>
                <th className="py-1.5 text-right font-medium">Spill vol.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.warehouse} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">{w.warehouse}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{w.credits}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{w.query_count.toLocaleString()}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {w.credits_per_100_queries ?? '—'}
                  </td>
                  <td className={cn('py-1.5 pr-2 text-right tabular-nums',
                    w.avg_queue_ms > 1000 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300')}>
                    {w.avg_queue_ms >= 1000 ? `${(w.avg_queue_ms / 1000).toFixed(1)}s` : `${Math.round(w.avg_queue_ms)}ms`}
                  </td>
                  <td className={cn('py-1.5 pr-2 text-right tabular-nums',
                    w.spilled_queries > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300')}>
                    {w.spilled_queries}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {formatBytes(w.local_spill_bytes + w.remote_spill_bytes)}
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
