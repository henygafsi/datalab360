'use client';

/**
 * PerformanceKpiPanel — Administrator → Performance tab.
 *
 * Real per-endpoint KPIs (no mocks, no restart needed): usage + errors + users
 * from /admin/endpoint-usage, latency (avg/max) from /admin/server-metrics
 * top_endpoints, and cache type/TTL/strategy from the backend cache decorators
 * (endpoint-cache-map.json). Replaces the redirect-only Performance card.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getEndpointUsage, getServerMetrics, getUsageBy,
  type EndpointUsageRow, type ServerMetrics, type UsageByResponse,
} from '@/app/services/admin-visibility';
import { Loader2, Activity, AlertTriangle, Search, Database, Clock } from 'lucide-react';
import cacheMap from '../../admin/api-health/data/endpoint-cache-map.json';

interface CacheMeta { path: string; method: string; cached: boolean; cacheType: string | null; ttl: number | null; strategy: string | null; responseMs: number | null }
const CACHE_BY_PATH: Record<string, CacheMeta> = (() => {
  const out: Record<string, CacheMeta> = {};
  for (const e of ((cacheMap.endpoints as CacheMeta[]) || [])) {
    if (!out[e.path] || (e.method === 'GET') || (e.cached && !out[e.path].cached)) out[e.path] = e;
  }
  return out;
})();
const CACHE_TYPE_LABEL: Record<string, string> = { shared_cache: 'shared', session_cache: 'session', account_role_cache: 'role' };

function normPath(p: string): string {
  // endpoint-usage paths are like "GET /foo"; strip the verb + trailing slash
  return p.replace(/^[A-Z]+\s+/, '').replace(/\/$/, '');
}

export default function PerformanceKpiPanel() {
  const [usage, setUsage] = useState<EndpointUsageRow[] | null>(null);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [byModule, setByModule] = useState<UsageByResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const [u, m, bm] = await Promise.allSettled([
        getEndpointUsage(7, 100), getServerMetrics(), getUsageBy('module', 7),
      ]);
      if (cancelled) return;
      if (u.status === 'fulfilled') setUsage(u.value.endpoints || []);
      if (m.status === 'fulfilled') setMetrics(m.value);
      if (bm.status === 'fulfilled') setByModule(bm.value);
      if (u.status === 'rejected' && m.status === 'rejected') setError('Could not load performance metrics.');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // latency per path from server-metrics top_endpoints
  const latencyByPath = useMemo(() => {
    const out: Record<string, { avg: number; max: number }> = {};
    for (const e of (metrics?.top_endpoints || [])) out[e.path] = { avg: e.avg_ms, max: e.max_ms };
    return out;
  }, [metrics]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usage || [])
      .map((r) => {
        const path = normPath(r.path);
        const lat = latencyByPath[path];
        const cache = CACHE_BY_PATH[path];
        return { ...r, cleanPath: path, avg: lat?.avg ?? cache?.responseMs ?? null, max: lat?.max ?? null, cache };
      })
      .filter((r) => !q || r.cleanPath.toLowerCase().includes(q) || (r.module || '').toLowerCase().includes(q))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [usage, latencyByPath, search]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading real performance metrics…</div>;
  }
  if (error) {
    return <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10"><AlertTriangle className="h-4 w-4" /> {error}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Headline KPIs (real, from /admin/server-metrics) */}
      {metrics && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Total requests" value={metrics.total_requests?.toLocaleString() ?? '—'} icon={Activity} />
          <Kpi label="Error rate" value={metrics.error_rate != null ? `${(metrics.error_rate * 100).toFixed(1)}%` : '—'} tone={metrics.error_rate && metrics.error_rate > 0.05 ? 'text-rose-600' : 'text-emerald-600'} />
          <Kpi label="p50 latency" value={fmtMs(metrics.latency?.p50_ms)} icon={Clock} />
          <Kpi label="p90 latency" value={fmtMs(metrics.latency?.p90_ms)} tone={tone(metrics.latency?.p90_ms)} />
          <Kpi label="p99 latency" value={fmtMs(metrics.latency?.p99_ms)} tone={tone(metrics.latency?.p99_ms)} />
          <Kpi label="Req / min" value={metrics.requests_per_min?.toString() ?? '—'} />
        </div>
      )}

      {/* By-module usage */}
      {byModule && byModule.rows?.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Usage by module (7d)</p>
          <div className="flex flex-wrap gap-1.5">
            {byModule.rows.slice(0, 14).map((r: any) => (
              <span key={r.key || r.module} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] dark:bg-slate-800/60">
                <Database className="h-3 w-3 text-slate-400" />
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.key || r.module}</span>
                <span className="text-slate-400">{(r.count ?? r.requests ?? 0).toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-endpoint KPI table */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Per-endpoint KPIs <span className="font-normal text-slate-400">· usage · errors · latency · cache (7d)</span></h3>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter endpoint / module…" aria-label="Filter endpoints by name or module" className="w-full rounded-lg border border-slate-200 bg-white/70 py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200" />
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">No tracked endpoint usage yet — metrics populate as the platform is used.</div>
        ) : (
          <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                <tr>
                  <th className="px-3 py-2 font-medium">Endpoint</th>
                  <th className="px-3 py-2 font-medium">Module</th>
                  <th className="px-3 py-2 font-medium text-right">Requests</th>
                  <th className="px-3 py-2 font-medium text-right">Errors</th>
                  <th className="px-3 py-2 font-medium text-right">Users</th>
                  <th className="px-3 py-2 font-medium text-right">Avg</th>
                  <th className="px-3 py-2 font-medium text-right">Max</th>
                  <th className="px-3 py-2 font-medium">Cache</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => {
                  const errRate = r.count ? (r.errors || 0) / r.count : 0;
                  return (
                    <tr key={`${r.cleanPath}-${i}`} className="border-t border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">{r.cleanPath}</td>
                      <td className="px-3 py-1.5 text-[11px] text-slate-500">{r.module || '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{(r.count || 0).toLocaleString()}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', errRate > 0.1 ? 'text-rose-600 font-semibold' : r.errors ? 'text-amber-600' : 'text-slate-400')}>{r.errors || 0}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.distinct_users || '—'}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', tone(r.avg))}>{fmtMs(r.avg)}</td>
                      <td className={cn('px-3 py-1.5 text-right tabular-nums', tone(r.max))}>{fmtMs(r.max)}</td>
                      <td className="px-3 py-1.5">
                        {r.cache?.cached ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/10" title={`${r.cache.cacheType} · ${r.cache.strategy} · TTL ${r.cache.ttl}s`}>
                            {CACHE_TYPE_LABEL[r.cache.cacheType || ''] || 'cached'}{r.cache.ttl != null && <span className="text-indigo-400">{r.cache.ttl}s</span>}
                          </span>
                        ) : <span className="text-[10px] text-slate-400">realtime</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtMs(ms?: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
function tone(ms?: number | null): string {
  if (ms == null) return 'text-slate-500';
  return ms > 3000 ? 'text-rose-500' : ms > 800 ? 'text-amber-500' : 'text-slate-500';
}
function Kpi({ label, value, tone, icon: Icon }: { label: string; value: React.ReactNode; tone?: string; icon?: React.ElementType }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">{Icon && <Icon className="h-3 w-3" />}{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone || 'text-slate-900 dark:text-white')}>{value}</div>
    </div>
  );
}
