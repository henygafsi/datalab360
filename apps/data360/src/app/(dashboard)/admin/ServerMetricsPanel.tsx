'use client';

/**
 * ServerMetricsPanel — live in-process server metrics (the ops-dashboard view).
 *
 * Top endpoints by NAME (method+path) with requests/errors/avg/max, slowest
 * endpoints, recent 4xx/5xx errors, most-active users, requests/min, latency
 * percentiles, memory, CPU, uptime. Backed by GET /admin/server-metrics (live,
 * in-memory — not Snowflake). Auto-refreshes every 5s.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  Gauge,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
  Timer,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { GlassPanel } from '@/app/shared/glass';
import { getServerMetrics, type ServerMetrics } from '@/app/services/admin-visibility';

function fmtUptime(s: number): string {
  if (!s || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Card({
  label,
  value,
  sub,
  icon: Icon,
  tint = 'text-slate-800 dark:text-slate-100',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Activity;
  tint?: string;
}) {
  return (
    <GlassPanel depth={1} radius="xl" className="flex flex-col gap-1 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <span className={cn('text-2xl font-semibold', tint)}>{value}</span>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </GlassPanel>
  );
}

const STATUS_TINT = (s: number) =>
  s >= 500
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    : s >= 400
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

export default function ServerMetricsPanel() {
  const [m, setM] = useState<ServerMetrics | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getServerMetrics();
      setM(d);
      setState('done');
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(getApiErrorMessage(e));
      setState((s) => (s === 'done' ? 'done' : 'error'));
    }
  }, []);

  useEffect(() => {
    setState('running');
    void load();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (live) timer.current = setInterval(() => void load(), 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [live, load]);

  if (state === 'running' && !m) {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      </div>
    );
  }
  if (state === 'error' && !m) {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 break-words">
          {error}{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Retry
          </button>
        </span>
      </div>
    );
  }
  if (!m) return <EmptyState icon={BarChart3} compact title="No metrics" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className={cn('h-2 w-2 rounded-full', live ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} />
          {live ? 'Live (5s)' : 'Paused'} · updated {updatedAt}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
          >
            {live ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {live ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Card label="Requests / min" icon={Activity} value={String(m.requests_per_min)} sub={`${m.total_requests.toLocaleString()} total`} />
        <Card label="Avg response" icon={Timer} value={`${Math.round(m.latency.avg_ms)} ms`} sub={`p90 ${Math.round(m.latency.p90_ms)}ms · p99 ${Math.round(m.latency.p99_ms)}ms`} />
        <Card label="Error rate" icon={AlertTriangle} tint={m.error_rate > 5 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'} value={`${m.error_rate.toFixed(2)}%`} sub={`${m.error_count} errors`} />
        <Card label="Uptime" icon={Gauge} value={fmtUptime(m.uptime_seconds)} />
        <Card label="Memory (RSS)" icon={HardDrive} value={`${Math.round(m.memory_rss_mb)} MB`} />
        <Card label="CPU load" icon={Cpu} value={m.cpu_load != null ? m.cpu_load.toFixed(2) : '—'} sub={`${m.cpu_count} cores`} />
        <Card label="Requests / 5min" icon={BarChart3} value={String(m.requests_per_5min)} />
        <Card label="p50 latency" icon={Gauge} value={`${Math.round(m.latency.p50_ms)} ms`} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Top endpoints */}
        <GlassPanel depth={1} radius="xl" className="overflow-hidden lg:col-span-2">
          <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Top endpoints</p>
            <p className="text-[10px] text-slate-400">Most-hit routes since restart</p>
          </div>
          {m.top_endpoints.length === 0 ? (
            <EmptyState icon={BarChart3} compact title="No requests yet" />
          ) : (
            <div className="scrollbar-thin max-h-[420px] overflow-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0">
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="glass-2 px-3 py-1.5 text-left font-semibold">Endpoint</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Req</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Err</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Avg</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {m.top_endpoints.map((e) => (
                    <tr key={`${e.method} ${e.path}`} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="max-w-[300px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
                        <span className="text-slate-400">{e.method}</span> {e.path}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{e.requests.toLocaleString()}</td>
                      <td className={cn('px-2 py-1 text-right', e.errors > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>{e.errors || '·'}</td>
                      <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{Math.round(e.avg_ms)} ms</td>
                      <td className="px-2 py-1 text-right text-slate-400">{Math.round(e.max_ms)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>

        {/* Most active users */}
        <GlassPanel depth={1} radius="xl" className="p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Users className="h-3.5 w-3.5" /> Most active users
          </p>
          {m.active_users.length === 0 ? (
            <EmptyState icon={Users} compact title="—" />
          ) : (
            <ul className="space-y-1">
              {m.active_users.map((u, i) => (
                <li key={u.username} className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-slate-600 dark:text-slate-300">{i + 1}. {u.username || '—'}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{u.requests}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Slowest endpoints */}
        <GlassPanel depth={1} radius="xl" className="overflow-hidden">
          <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Slowest endpoints</p>
            <p className="text-[10px] text-slate-400">Highest average latency</p>
          </div>
          {m.slowest_endpoints.length === 0 ? (
            <EmptyState icon={Timer} compact title="—" />
          ) : (
            <div className="scrollbar-thin max-h-[320px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
              {m.slowest_endpoints.map((e) => (
                <div key={`${e.method} ${e.path}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                  <span className="truncate font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
                    <span className="text-slate-400">{e.method}</span> {e.path}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] text-slate-400">{e.requests}×</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{Math.round(e.avg_ms)} ms</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        {/* Recent errors */}
        <GlassPanel depth={1} radius="xl" className="overflow-hidden">
          <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Recent errors</p>
            <p className="text-[10px] text-slate-400">Latest 4xx / 5xx responses</p>
          </div>
          {m.recent_errors.length === 0 ? (
            <EmptyState icon={AlertTriangle} compact title="No errors 🎉" />
          ) : (
            <div className="scrollbar-thin max-h-[320px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
              {m.recent_errors.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold', STATUS_TINT(e.status))}>{e.status}</span>
                    <span className="truncate font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
                      <span className="text-slate-400">{e.method}</span> {e.path}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {e.username && e.username !== 'anonymous' ? `${e.username} · ` : ''}
                    {e.ts ? new Date(e.ts).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
