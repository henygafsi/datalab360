'use client';

/**
 * LatencyFreshnessPanel — Administration → Performance tab (top section).
 *
 * Compact, at-a-glance answer to "is the platform fast and is its data fresh?"
 * — three honest, live sections (all lazy-fetched on mount of this panel only):
 *
 *   1. Warm scheduler   GET /cache/refresh/status   running/stopped + job count
 *   2. Slowest endpoints GET /admin/server-metrics  top-15 by avg latency
 *                        GET /admin/endpoint-usage  7d call counts joined per path
 *                        (endpoint-usage carries counts/errors only — latency
 *                        sampling lives in server-metrics; when server-metrics
 *                        is unreachable we degrade to top-by-calls with "—" avg)
 *   3. Cache freshness  GET /api/refresh-state      last refresh per data zone
 *                        (stale > 30 min renders amber; null renders "—")
 *
 * Degradation is honest and quiet: a 404/501 marks the section "not wired on
 * this backend" (slate notice), any other failure renders an amber notice —
 * never fabricated zeros, never a popup.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Clock, Loader2, RefreshCw, Search, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCacheRefreshStatus,
  getEndpointUsage,
  getRefreshState,
  getServerMetrics,
  type CacheRefreshStatus,
  type EndpointUsageRow,
  type RefreshStateMap,
  type ServerMetrics,
} from '@/app/services/admin-visibility';

// ── Per-source load state ────────────────────────────────────────────────────

type SourceState<T> =
  | { phase: 'loading' }
  | { phase: 'ready'; data: T }
  | { phase: 'unavailable' } // 404 / 501 — route not wired on this backend
  | { phase: 'error' }; // any other failure

function failurePhase(e: unknown): 'unavailable' | 'error' {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501)
    ? 'unavailable'
    : 'error';
}

// ── Small pure helpers ───────────────────────────────────────────────────────

/** endpoint-usage paths look like "GET /foo/" — strip the verb + trailing slash. */
function normPath(p: string): string {
  return p.replace(/^[A-Z]+\s+/, '').replace(/\/+$/, '') || '/';
}

/** Parse an ISO timestamp, treating tz-naive strings as UTC (defensive). */
function parseUtc(iso: string): Date {
  return new Date(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
}

function fmtMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/** Latency color scale: <300ms green · <1500ms amber · else red. */
function latencyTone(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return 'text-slate-400';
  if (ms < 300) return 'text-emerald-600 dark:text-emerald-400';
  if (ms < 1500) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function relTime(ageMin: number): string {
  if (ageMin < 1) return 'just now';
  if (ageMin < 60) return `${Math.floor(ageMin)}m ago`;
  if (ageMin < 60 * 24) return `${Math.floor(ageMin / 60)}h ago`;
  return `${Math.floor(ageMin / (60 * 24))}d ago`;
}

const STALE_MINUTES = 30;

// ── Shared micro-UI ──────────────────────────────────────────────────────────

/** Quiet section-level degradation notice (slate = not wired, amber = failed). */
function SectionNotice({ kind, children }: { kind: 'quiet' | 'warn'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-md border px-2.5 py-2 text-[11px]',
        kind === 'quiet'
          ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
      )}
    >
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {children}
    </p>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

interface LatencyRow {
  path: string;
  /** 7d call count from endpoint-usage when known, else live process requests. */
  calls: number | null;
  /** Avg latency (ms) from server-metrics; null in the counts-only fallback. */
  avg: number | null;
}

export default function LatencyFreshnessPanel() {
  const [usage, setUsage] = useState<SourceState<EndpointUsageRow[]>>({ phase: 'loading' });
  const [metrics, setMetrics] = useState<SourceState<ServerMetrics>>({ phase: 'loading' });
  const [freshness, setFreshness] = useState<SourceState<RefreshStateMap>>({ phase: 'loading' });
  const [scheduler, setScheduler] = useState<SourceState<CacheRefreshStatus>>({
    phase: 'loading',
  });
  const [search, setSearch] = useState('');
  // Snapshotted at load time so relative ages are stable between renders.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setUsage({ phase: 'loading' });
    setMetrics({ phase: 'loading' });
    setFreshness({ phase: 'loading' });
    setScheduler({ phase: 'loading' });
    const [u, m, f, s] = await Promise.allSettled([
      getEndpointUsage(7, 200),
      getServerMetrics(),
      getRefreshState(),
      getCacheRefreshStatus(),
    ]);
    setNow(Date.now());
    setUsage(
      u.status === 'fulfilled'
        ? { phase: 'ready', data: u.value.endpoints ?? [] }
        : { phase: failurePhase(u.reason) },
    );
    setMetrics(
      m.status === 'fulfilled' ? { phase: 'ready', data: m.value } : { phase: failurePhase(m.reason) },
    );
    setFreshness(
      f.status === 'fulfilled'
        ? { phase: 'ready', data: f.value ?? {} }
        : { phase: failurePhase(f.reason) },
    );
    setScheduler(
      s.status === 'fulfilled' ? { phase: 'ready', data: s.value } : { phase: failurePhase(s.reason) },
    );
  }, []);

  // Lazy: this effect only runs when the panel itself mounts (Performance tab).
  useEffect(() => {
    void load();
  }, [load]);

  const loading =
    usage.phase === 'loading' ||
    metrics.phase === 'loading' ||
    freshness.phase === 'loading' ||
    scheduler.phase === 'loading';

  // (a) Endpoints ranked by avg latency — server-metrics latency joined with
  //     7d endpoint-usage call counts. Counts-only fallback when metrics fail.
  const latencyRows = useMemo<LatencyRow[] | null>(() => {
    if (metrics.phase === 'ready') {
      const byPath = new Map<string, LatencyRow>();
      for (const e of metrics.data.slowest_endpoints ?? []) {
        byPath.set(e.path, { path: e.path, calls: e.requests ?? null, avg: e.avg_ms });
      }
      for (const e of metrics.data.top_endpoints ?? []) {
        byPath.set(e.path, { path: e.path, calls: e.requests ?? null, avg: e.avg_ms });
      }
      if (usage.phase === 'ready') {
        for (const r of usage.data) {
          const row = byPath.get(normPath(r.path));
          if (row && r.count != null) row.calls = r.count;
        }
      }
      return [...byPath.values()].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
    }
    if (usage.phase === 'ready') {
      return usage.data
        .map((r) => ({ path: normPath(r.path), calls: r.count ?? null, avg: null }))
        .sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0));
    }
    return null;
  }, [metrics, usage]);

  const filteredRows = useMemo(() => {
    if (!latencyRows) return null;
    const q = search.trim().toLowerCase();
    return latencyRows.filter((r) => !q || r.path.toLowerCase().includes(q)).slice(0, 15);
  }, [latencyRows, search]);

  const latencyUnavailable = metrics.phase !== 'ready' && usage.phase !== 'ready';
  const latencyFallback = metrics.phase !== 'ready' && usage.phase === 'ready';

  // (b) Cache freshness — freshest first, never-refreshed zones last.
  const freshnessRows = useMemo(() => {
    if (freshness.phase !== 'ready') return null;
    return Object.entries(freshness.data)
      // The response envelope's execution_time_ms rode along as a "zone":
      // its value (2 ms) parsed as epoch-1970 and rendered "572890d ago".
      // A zone's value is an ISO timestamp or null — keep only those keys.
      .filter(([zone, ts]) => zone !== 'execution_time_ms' && (ts === null || typeof ts === 'string'))
      .map(([zone, ts]) => {
        const ageMin = ts ? (now - parseUtc(ts).getTime()) / 60_000 : null;
        return { zone, ageMin: ageMin != null && Number.isFinite(ageMin) ? Math.max(0, ageMin) : null };
      })
      .sort((a, b) => (a.ageMin ?? Infinity) - (b.ageMin ?? Infinity));
  }, [freshness, now]);

  return (
    <section
      aria-label="Latency and cache freshness"
      className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Header: title + endpoint filter + reload */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[hsl(var(--primary))] dark:bg-slate-800">
          <Timer className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Latency &amp; freshness
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Slowest endpoints, per-zone cache freshness and the warm scheduler — live.
          </p>
        </div>
        <div className="relative w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter endpoints…"
            aria-label="Filter slowest endpoints by path"
            className="w-full rounded-lg border border-slate-200 bg-white/70 py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:focus:ring-slate-700"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Reload latency and freshness"
          title="Reload"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* (c) Warm-scheduler status line */}
      <div className="mb-3" role="status">
        {scheduler.phase === 'loading' && (
          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking warm scheduler…
          </p>
        )}
        {scheduler.phase === 'ready' && (
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span
              aria-hidden
              className={cn(
                'h-2 w-2 rounded-full',
                scheduler.data.status === 'running' ? 'bg-emerald-500' : 'bg-rose-500',
              )}
            />
            <span
              className={cn(
                'font-semibold',
                scheduler.data.status === 'running'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400',
              )}
            >
              Warm scheduler {scheduler.data.status === 'running' ? 'running' : 'stopped'}
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              · {scheduler.data.total_jobs} scheduled job{scheduler.data.total_jobs === 1 ? '' : 's'}
            </span>
            {scheduler.data.status !== 'running' && (
              <span className="text-[11px] text-slate-400">
                — cached reads serve stale data until it is restarted
              </span>
            )}
          </p>
        )}
        {scheduler.phase === 'unavailable' && (
          <SectionNotice kind="quiet">
            Warm-scheduler status is not wired on this backend.
          </SectionNotice>
        )}
        {scheduler.phase === 'error' && (
          <SectionNotice kind="warn">Could not load the warm-scheduler status.</SectionNotice>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        {/* (a) Top-15 endpoints by avg latency */}
        <div className="min-w-0 lg:col-span-3">
          <SectionTitle>
            Slowest endpoints{' '}
            <span className="font-normal normal-case text-slate-400">
              · top 15 by avg latency{latencyFallback ? ' · by calls (latency sampling unavailable)' : ''}
            </span>
          </SectionTitle>
          {latencyUnavailable ? (
            metrics.phase === 'unavailable' && usage.phase === 'unavailable' ? (
              <SectionNotice kind="quiet">
                Endpoint latency metrics are not wired on this backend.
              </SectionNotice>
            ) : metrics.phase === 'loading' || usage.phase === 'loading' ? (
              <p className="flex items-center gap-2 py-4 text-[11px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading endpoint latencies…
              </p>
            ) : (
              <SectionNotice kind="warn">Could not load endpoint latency metrics.</SectionNotice>
            )
          ) : filteredRows && filteredRows.length > 0 ? (
            <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                  <tr>
                    <th scope="col" className="px-2.5 py-1.5 font-medium">
                      Endpoint
                    </th>
                    <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                      Calls (7d)
                    </th>
                    <th scope="col" className="px-2.5 py-1.5 text-right font-medium">
                      Avg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr
                      key={r.path}
                      className="border-t border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30"
                    >
                      <td className="max-w-0 truncate px-2.5 py-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300" title={r.path}>
                        {r.path}
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {r.calls != null ? r.calls.toLocaleString() : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-2.5 py-1.5 text-right font-semibold tabular-nums',
                          latencyTone(r.avg),
                        )}
                      >
                        {fmtMs(r.avg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
              {search.trim()
                ? 'No endpoint matches your filter.'
                : 'No latency samples yet — metrics populate as the platform is used.'}
            </p>
          )}
        </div>

        {/* (b) Cache freshness per zone */}
        <div className="min-w-0 lg:col-span-2">
          <SectionTitle>
            Cache freshness{' '}
            <span className="font-normal normal-case text-slate-400">· last refresh per zone</span>
          </SectionTitle>
          {freshness.phase === 'loading' && (
            <p className="flex items-center gap-2 py-4 text-[11px] text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading cache freshness…
            </p>
          )}
          {freshness.phase === 'unavailable' && (
            <SectionNotice kind="quiet">
              Cache freshness state is not wired on this backend.
            </SectionNotice>
          )}
          {freshness.phase === 'error' && (
            <SectionNotice kind="warn">Could not load cache freshness.</SectionNotice>
          )}
          {freshnessRows && freshnessRows.length === 0 && (
            <p className="rounded-lg border border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
              No cache zones reported yet.
            </p>
          )}
          {freshnessRows && freshnessRows.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {freshnessRows.map(({ zone, ageMin }) => {
                const stale = ageMin != null && ageMin > STALE_MINUTES;
                return (
                  <li key={zone} className="flex items-center gap-2 px-2.5 py-1.5">
                    <Clock
                      aria-hidden
                      className={cn(
                        'h-3 w-3 shrink-0',
                        ageMin == null
                          ? 'text-slate-300 dark:text-slate-600'
                          : stale
                            ? 'text-amber-500'
                            : 'text-emerald-500',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      {zone}
                    </span>
                    <span
                      className={cn(
                        'whitespace-nowrap text-[11px] tabular-nums',
                        ageMin == null
                          ? 'text-slate-400'
                          : stale
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400',
                      )}
                      title={
                        ageMin == null
                          ? 'No refresh recorded yet'
                          : stale
                            ? `Last refresh over ${STALE_MINUTES} min ago`
                            : 'Recently refreshed'
                      }
                    >
                      {ageMin == null ? '—' : relTime(ageMin)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
