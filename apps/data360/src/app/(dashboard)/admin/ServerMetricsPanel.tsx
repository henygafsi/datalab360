'use client';

/**
 * ServerMetricsPanel — live in-process server metrics (the ops-dashboard view).
 *
 * Top endpoints by NAME (method+path) with requests/errors/avg/max, slowest
 * endpoints, recent 4xx/5xx errors, most-active users, requests/min, latency
 * percentiles, memory, CPU, uptime. Backed by GET /admin/server-metrics.
 *
 * HONEST FRAMING: this counter set is *in-memory and per-worker* — it RESETS to
 * zero every time the backend process restarts, and reflects only the worker
 * that served this request. It is NOT a Snowflake-persisted history. We never
 * paint a fake-0 dashboard: a value the backend cannot supply (e.g. memory/CPU
 * when psutil is absent) renders as "—", and a 404/501 degrades to a clear
 * "metrics unavailable" notice rather than an all-zero board.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Search,
  Timer,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { safeLocale, safeToFixed } from '@/lib/format-number';
import EmptyState from '@/components/ui/EmptyState';
import Pager, { usePagination } from '@/components/ui/Pager';
import ExportButton from '@/components/ui/ExportButton';
import { type ReportInput } from '@/lib/export-report';
import { GlassPanel } from '@/app/shared/glass';
import { getServerMetrics, type ServerMetrics } from '@/app/services/admin-visibility';

/** Poll intervals offered by the live toggle (ms). */
const POLL_OPTIONS = [
  { label: '5s', ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '30s', ms: 30000 },
  { label: '60s', ms: 60000 },
] as const;

const TINT_OK = 'text-emerald-600 dark:text-emerald-400';
const TINT_WARN = 'text-amber-600 dark:text-amber-400';
const TINT_BAD = 'text-red-600 dark:text-red-400';
const TINT_NEUTRAL = 'text-slate-800 dark:text-slate-100';

function fmtUptime(s: number): string {
  if (!s || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** A nullable numeric → display string, never a fake 0. */
function numOr(value: number | null | undefined, fmt: (n: number) => string): string {
  return value == null || Number.isNaN(value) ? '—' : fmt(value);
}

function Card({
  label,
  value,
  sub,
  icon: Icon,
  tint = TINT_NEUTRAL,
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
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error' | 'unavailable'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [pollMs, setPollMs] = useState<number>(POLL_OPTIONS[0].ms);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  // Consecutive poll failures since the last success → drives the stale badge +
  // exponential backoff so a down endpoint isn't hammered at the base cadence.
  const [failures, setFailures] = useState(0);
  const failuresRef = useRef(0);
  const [query, setQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getServerMetrics();
      setM(d);
      setError(null);
      setState('done');
      setUpdatedAt(new Date().toLocaleTimeString());
      failuresRef.current = 0;
      setFailures(0);
    } catch (e) {
      // A 404/501 means the route isn't live on this backend — degrade honestly
      // rather than painting a fake-0 board. (Same contract as the insights layer.)
      if (isUnavailable(e)) {
        setState((s) => (s === 'done' ? 'done' : 'unavailable'));
        setError('Server metrics endpoint is not available on this backend.');
        return;
      }
      setError(getApiErrorMessage(e));
      setState((s) => (s === 'done' ? 'done' : 'error'));
      // Keep the last good board on screen but mark the live feed stale + back off.
      failuresRef.current += 1;
      setFailures(failuresRef.current);
    }
  }, []);

  useEffect(() => {
    setState('running');
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  // Live polling with exponential backoff on consecutive failures. Self-scheduling
  // timeout (not a fixed interval) so the delay grows while failing and snaps back
  // to the base cadence on recovery.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!live || state === 'unavailable') return;

    let cancelled = false;
    const MAX_BACKOFF_MS = 5 * 60_000;
    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(pollMs * 2 ** failuresRef.current, MAX_BACKOFF_MS);
      timer.current = setTimeout(async () => {
        if (cancelled) return;
        await load();
        schedule();
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [live, pollMs, load, state]);

  // ── Threshold tints ─────────────────────────────────────────────────────
  // error_rate is a RATIO (0–1) from the backend, not a percentage — convert.
  const errorPct = m ? m.error_rate * 100 : 0;
  const errorTint = !m
    ? TINT_NEUTRAL
    : errorPct >= 10
      ? TINT_BAD
      : errorPct >= 5
        ? TINT_WARN
        : m.total_requests > 0
          ? TINT_OK
          : TINT_NEUTRAL;
  // cpu_load is the 1-min loadavg; judge it relative to core count.
  const cpuRatio = m && m.cpu_load != null && m.cpu_count > 0 ? m.cpu_load / m.cpu_count : null;
  const cpuTint =
    cpuRatio == null ? TINT_NEUTRAL : cpuRatio >= 1 ? TINT_BAD : cpuRatio >= 0.7 ? TINT_WARN : TINT_OK;
  // p99 latency: green < 500ms, amber < 1500ms, red beyond.
  const p99 = m?.latency.p99_ms ?? 0;
  const latencyTint = !m ? TINT_NEUTRAL : p99 >= 1500 ? TINT_BAD : p99 >= 500 ? TINT_WARN : TINT_OK;

  const filteredEndpoints = useMemo(() => {
    if (!m) return [];
    const q = query.trim().toLowerCase();
    if (!q) return m.top_endpoints;
    return m.top_endpoints.filter(
      (e) => e.path.toLowerCase().includes(q) || e.method.toLowerCase().includes(q),
    );
  }, [m, query]);

  // ── Pagination (scroll-free) — declared BEFORE any early return so the hook
  //    order is stable. Each pages its FILTERED rows; resets to page 0 on filter.
  const epPage = usePagination(filteredEndpoints, 12);
  const usersPage = usePagination(m?.active_users ?? [], 12);
  const slowPage = usePagination(m?.slowest_endpoints ?? [], 12);
  const errPage = usePagination(m?.recent_errors ?? [], 12);

  // ── Loading skeleton ────────────────────────────────────────────────────
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

  // ── Endpoint unavailable (404/501) — degrade, don't fake-0 ───────────────
  if (state === 'unavailable' && !m) {
    return (
      <EmptyState
        icon={BarChart3}
        compact
        title="Server metrics unavailable"
        description={error ?? 'This backend does not expose live server metrics.'}
      />
    );
  }

  // ── Hard error ──────────────────────────────────────────────────────────
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

  // Snapshot the CURRENT view to CSV: filtered top endpoints (full set, not just
  // the page) + active users. `m` is narrowed non-null by the guards above.
  const metrics = m;
  const buildReport = (): ReportInput => ({
    title: 'Server Metrics',
    meta: [
      { label: 'Generated at', value: new Date().toISOString() },
      { label: 'Endpoint filter', value: query.trim() || null },
      { label: 'Endpoints shown', value: `${filteredEndpoints.length} of ${metrics.top_endpoints.length}` },
      { label: 'Updated at', value: updatedAt || null },
      { label: 'Note', value: 'In-memory, per-worker counters; reset on backend restart' },
    ],
    kpis: [
      { label: 'Requests / min', value: metrics.requests_per_min },
      { label: 'Total requests', value: metrics.total_requests },
      { label: 'Error rate %', value: safeToFixed(metrics.error_rate * 100, 2) },
      { label: 'Errors', value: metrics.error_count },
      { label: 'Avg latency ms', value: Math.round(metrics.latency.avg_ms) },
      { label: 'p99 latency ms', value: Math.round(metrics.latency.p99_ms) },
      { label: 'Uptime', value: fmtUptime(metrics.uptime_seconds) },
      { label: 'Memory RSS MB', value: numOr(metrics.memory_rss_mb, (v) => String(Math.round(v))) },
      { label: 'CPU load (1m)', value: numOr(metrics.cpu_load, (v) => safeToFixed(v, 2)) },
    ],
    sections: [
      {
        name: 'Top endpoints',
        columns: ['Method', 'Path', 'Requests', 'Errors', 'Avg ms', 'Max ms'],
        rows: filteredEndpoints.map((e) => [
          e.method,
          e.path,
          e.requests,
          e.errors,
          Math.round(e.avg_ms),
          Math.round(e.max_ms),
        ]),
      },
      {
        name: 'Most active users',
        columns: ['User', 'Requests'],
        rows: metrics.active_users.map((u) => [u.username || null, u.requests]),
      },
    ],
  });

  return (
    <div className="space-y-3">
      {/* Honest framing banner: these are ephemeral, per-worker counters. */}
      <div className="flex items-start gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-400">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          In-memory, per-worker counters — these reset to zero on every backend restart and reflect a
          single worker. Not a persisted history.
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {(() => {
          // A failing live poll keeps the last good board on screen — flag it
          // amber + show its age so a silent backoff never reads as fresh.
          const stale = live && failures > 0;
          const label = POLL_OPTIONS.find((o) => o.ms === pollMs)?.label ?? `${pollMs / 1000}s`;
          return (
            <p
              className={cn(
                'flex items-center gap-1.5 text-[11px]',
                stale ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400',
              )}
              title={
                stale
                  ? `Live refresh is failing (${failures} attempt${failures > 1 ? 's' : ''}); backing off. Showing the last successful update at ${updatedAt || 'an earlier time'}.`
                  : undefined
              }
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  !live ? 'bg-slate-400' : stale ? 'bg-amber-500' : 'animate-pulse bg-emerald-500',
                )}
              />
              {!live ? 'Paused' : stale ? 'Stale — retrying' : `Live (${label})`}
              {updatedAt ? ` · updated ${updatedAt}` : ''}
            </p>
          );
        })()}
        <div className="flex items-center gap-1">
          <select
            value={pollMs}
            onChange={(e) => setPollMs(Number(e.target.value))}
            disabled={!live}
            aria-label="Auto-refresh interval"
            className="rounded-md border border-slate-200 bg-white/50 px-1.5 py-1 text-[11px] font-medium text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-white/5 dark:text-slate-300"
          >
            {POLL_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>
                {o.label}
              </option>
            ))}
          </select>
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
          <ExportButton buildReport={buildReport} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Card label="Requests / min" icon={Activity} value={String(m.requests_per_min)} sub={`${safeLocale(m.total_requests)} total`} />
        <Card
          label="Avg response"
          icon={Timer}
          tint={latencyTint}
          value={`${Math.round(m.latency.avg_ms)} ms`}
          sub={`p90 ${Math.round(m.latency.p90_ms)}ms · p99 ${Math.round(m.latency.p99_ms)}ms`}
        />
        <Card
          label="Error rate"
          icon={AlertTriangle}
          tint={errorTint}
          value={`${safeToFixed(errorPct, 2)}%`}
          sub={`${m.error_count} errors`}
        />
        <Card label="Uptime" icon={Gauge} value={fmtUptime(m.uptime_seconds)} />
        <Card
          label="Memory (RSS)"
          icon={HardDrive}
          value={numOr(m.memory_rss_mb, (v) => `${Math.round(v)} MB`)}
        />
        <Card
          label="CPU load (1m)"
          icon={Cpu}
          tint={cpuTint}
          value={numOr(m.cpu_load, (v) => safeToFixed(v, 2))}
          sub={`${m.cpu_count} cores`}
        />
        <Card label="Requests / 5min" icon={BarChart3} value={String(m.requests_per_5min)} />
        <Card label="p50 latency" icon={Gauge} value={`${Math.round(m.latency.p50_ms)} ms`} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Top endpoints */}
        <GlassPanel depth={1} radius="xl" className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Top endpoints</p>
              <p className="text-[10px] text-slate-400">Most-hit routes since restart</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter route…"
                aria-label="Filter endpoints"
                className="w-36 rounded-md border border-slate-200 bg-white/50 py-1 pl-6 pr-2 text-[11px] text-slate-600 placeholder:text-slate-400 focus:w-44 focus:outline-none dark:border-slate-700 dark:bg-white/5 dark:text-slate-200"
              />
            </div>
          </div>
          {m.top_endpoints.length === 0 ? (
            <EmptyState icon={BarChart3} compact title="No requests yet" />
          ) : filteredEndpoints.length === 0 ? (
            <EmptyState icon={Search} compact title="No matching routes" />
          ) : (
            <div className="px-1 pb-2">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="glass-2 px-3 py-1.5 text-left font-semibold">Endpoint</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Req</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Err</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Avg</th>
                    <th className="glass-2 px-2 py-1.5 text-right font-semibold">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {epPage.slice.map((e) => (
                    <tr key={`${e.method} ${e.path}`} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="max-w-[300px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
                        <span className="text-slate-400">{e.method}</span> {e.path}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{safeLocale(e.requests)}</td>
                      <td className={cn('px-2 py-1 text-right', e.errors > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>{e.errors || '·'}</td>
                      <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{Math.round(e.avg_ms)} ms</td>
                      <td className="px-2 py-1 text-right text-slate-400">{Math.round(e.max_ms)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager
                page={epPage.page}
                pageCount={epPage.pageCount}
                total={epPage.total}
                from={epPage.from}
                to={epPage.to}
                onPage={epPage.setPage}
                unit="endpoints"
              />
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
            <>
              <ul className="space-y-1">
                {usersPage.slice.map((u, i) => (
                  <li key={u.username} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-slate-600 dark:text-slate-300">{usersPage.from + i}. {u.username || '—'}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{u.requests}</span>
                  </li>
                ))}
              </ul>
              <Pager
                page={usersPage.page}
                pageCount={usersPage.pageCount}
                total={usersPage.total}
                from={usersPage.from}
                to={usersPage.to}
                onPage={usersPage.setPage}
                unit="users"
              />
            </>
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
            <div className="px-3 pb-2">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {slowPage.slice.map((e) => (
                  <div key={`${e.method} ${e.path}`} className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
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
              <Pager
                page={slowPage.page}
                pageCount={slowPage.pageCount}
                total={slowPage.total}
                from={slowPage.from}
                to={slowPage.to}
                onPage={slowPage.setPage}
                unit="endpoints"
              />
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
            <EmptyState icon={AlertTriangle} compact title="No errors" />
          ) : (
            <div className="px-3 pb-2">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {errPage.slice.map((e, i) => (
                  <div key={errPage.from + i} className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
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
              <Pager
                page={errPage.page}
                pageCount={errPage.pageCount}
                total={errPage.total}
                from={errPage.from}
                to={errPage.to}
                onPage={errPage.setPage}
                unit="errors"
              />
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
