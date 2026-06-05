'use client';

/**
 * Data360 Admin Console — cache · APIs · events · access, one glass ops surface.
 *
 * Refactor of the old data360-config page into a unified, event-centric admin
 * dashboard (see Obsidian `_design-system-2026`). Five tabs, all wired to live
 * services with honest empty/error states — no faked numbers:
 *   Overview    — query metrics + module health + live activity counts
 *   Performance — query performance + slowest queries (data360's "endpoints")
 *   Events      — recent activity + most-active users + recent errors (event store)
 *   Cache       — cached-entry inventory + class breakdown + editable TTL zones
 *   Access      — feature×role matrix + per-user effective view (advisory GUI perms)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Database,
  Gauge,
  HardDrive,
  Info,
  KeyRound,
  Layers,
  LineChart,
  Pencil,
  Search,
  ShieldAlert,
  ShieldCheck,
  Timer,
  User,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { GlassPanel } from '@/app/shared/glass';
import { getActivityFeed } from '@/app/services/command-center';
import type { ActivityEvent } from '@/app/services/command-center/types';
import { getSlowQueries } from '@/app/services/observability';
import type { SlowQuery } from '@/app/services/observability/types';
import {
  getCacheConfig,
  getCacheEntries,
  getData360Config,
  patchCacheConfig,
  type CacheEntry,
} from '@/app/services/data360-config';
import { getCacheBreakdown, getCacheInvalidations } from '@/app/services/cache';
import {
  getEndpointUsage,
  getActivityStats,
  type EndpointUsageRow,
  type EndpointUsageResponse,
} from '@/app/services/admin-visibility';
import {
  getUserEffectiveGuiAccess,
  listGuiPermissions,
  upsertGuiPermission,
  type GuiPermission,
} from '@/app/services/governance';
import { getUsersWithRolesAndModules, type UserGrantTableData } from '@/app/services/governance/user_roles';
import { toast } from '@/hooks/use-toast';
import RoleGrantsPanel from '../RoleGrantsPanel';
import RealAccessPanel from '../RealAccessPanel';
import ServerMetricsPanel from '../ServerMetricsPanel';
import ActivityDashboard from '../ActivityDashboard';
import ActionRbacTab from './ActionRbacTab';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

function useFetch<T>(fn: () => Promise<T>) {
  const [state, setState] = useState<AsyncState>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setState('running');
    setError(null);
    try {
      setData(await fn());
      setState('done');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { state, data, error, reload };
}

function isError(status: string): boolean {
  const s = status?.toUpperCase();
  return s === 'FAILED' || s === 'ERROR' || s === 'FAILURE';
}

function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

function ErrBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="flex-1">
        <span className="break-words">{message}</span>{' '}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

function MetricCard({
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

function humanBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Small inline confirm overlay — used before platform-wide / role-wide writes. */
function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <GlassPanel depth={3} radius="2xl" className="w-full max-w-sm p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> {title}
        </p>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{body}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}

/* ── Overview — detailed, interactive endpoint view (not a rollup) ──────────── */
type EpSortKey = 'method' | 'path' | 'module' | 'count' | 'errors' | 'errPct' | 'distinct_users' | 'last_seen';

function errPctOf(e: EndpointUsageRow): number {
  return e.count > 0 ? (e.errors / e.count) * 100 : 0;
}

function OverviewTab() {
  // Real per-endpoint detail (AUDIT_LOG), not aggregated summary cards.
  const usage = useFetch<EndpointUsageResponse>(() => getEndpointUsage(7, 200));
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<EpSortKey>('count');
  const [asc, setAsc] = useState(false);

  const all = useMemo<EndpointUsageRow[]>(() => usage.data?.endpoints ?? [], [usage.data]);
  const rows = useMemo<EndpointUsageRow[]>(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? all.filter(
          (e) =>
            e.path.toLowerCase().includes(needle) ||
            (e.module ?? '').toLowerCase().includes(needle) ||
            e.method.toLowerCase().includes(needle),
        )
      : all;
    const val = (e: EndpointUsageRow): string | number => {
      switch (sortKey) {
        case 'errPct':
          return errPctOf(e);
        case 'last_seen':
          return e.last_seen ? Date.parse(e.last_seen) || 0 : 0;
        case 'path':
          return e.path.toLowerCase();
        case 'module':
          return (e.module ?? '').toLowerCase();
        case 'method':
          return e.method.toLowerCase();
        default:
          return e[sortKey];
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return asc ? cmp : -cmp;
    });
  }, [all, q, sortKey, asc]);

  const toggleSort = (k: EpSortKey) => {
    if (k === sortKey) {
      setAsc((v) => !v);
    } else {
      setSortKey(k);
      setAsc(false);
    }
  };

  const Th = ({ k, label, align = 'right' }: { k: EpSortKey; label: string; align?: 'left' | 'right' }) => (
    <th
      className={cn(
        'glass-2 cursor-pointer select-none px-2 py-1.5 font-semibold hover:text-slate-600 dark:hover:text-slate-200',
        align === 'left' ? 'text-left' : 'text-right',
      )}
      onClick={() => toggleSort(k)}
      title="Click to sort"
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-[hsl(var(--primary))]' : 'text-slate-300 dark:text-slate-600')} />
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter endpoints by path, module, or method…"
            className="w-full rounded-lg border border-slate-200 bg-white/70 py-1.5 pl-8 pr-3 text-xs text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
          />
        </div>
        <span className="text-[11px] text-slate-400">
          {usage.data
            ? `${rows.length}/${all.length} endpoints · ${usage.data.total_requests.toLocaleString()} reqs · ${usage.data.window_days}d`
            : '—'}
        </span>
      </div>

      {usage.state === 'running' && <Loading rows={10} />}
      {usage.state === 'error' && (
        <ErrBox message={usage.error ?? 'Failed to load endpoint usage'} onRetry={() => void usage.reload()} />
      )}
      {usage.state === 'done' && rows.length === 0 && (
        <EmptyState icon={BarChart3} compact title={all.length === 0 ? 'No endpoint activity recorded' : 'No endpoints match your filter'} />
      )}

      {usage.state === 'done' && rows.length > 0 && (
        <GlassPanel depth={1} radius="xl" className="overflow-hidden">
          <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Activity className="h-3.5 w-3.5" /> Endpoint detail (last {usage.data?.window_days ?? 7}d)
            </p>
            <p className="text-[10px] text-slate-400">Per-route requests · errors · distinct users · last seen — click a header to sort</p>
          </div>
          <div className="scrollbar-thin max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <Th k="method" label="Method" align="left" />
                  <Th k="path" label="Endpoint" align="left" />
                  <Th k="module" label="Module" align="left" />
                  <Th k="count" label="Requests" />
                  <Th k="errors" label="Errors" />
                  <Th k="errPct" label="Err %" />
                  <Th k="distinct_users" label="Users" />
                  <Th k="last_seen" label="Last seen" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  const pct = errPctOf(e);
                  return (
                    <tr
                      key={`${e.method}:${e.path}:${i}`}
                      className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30"
                    >
                      <td className="px-2 py-1 text-left font-mono font-semibold text-slate-500 dark:text-slate-400">{e.method}</td>
                      <td className="max-w-[360px] truncate px-2 py-1 text-left font-mono text-slate-700 dark:text-slate-200" title={e.path}>
                        {e.path}
                      </td>
                      <td className="max-w-[140px] truncate px-2 py-1 text-left text-slate-500 dark:text-slate-400" title={e.module}>
                        {e.module || '—'}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{e.count.toLocaleString()}</td>
                      <td className={cn('px-2 py-1 text-right font-semibold', e.errors > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400')}>
                        {e.errors.toLocaleString()}
                      </td>
                      <td className={cn('px-2 py-1 text-right', pct > 2 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                        {pct.toFixed(1)}%
                      </td>
                      <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{e.distinct_users}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{e.last_seen ? new Date(e.last_seen).toLocaleString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}

/* ── Performance ──────────────────────────────────────────────────────────── */
function PerformanceTab() {
  const usage = useFetch(() => getEndpointUsage(7, 40));
  const slow = useFetch<{ slow_queries: SlowQuery[] }>(() => getSlowQueries({ days: 7 }));
  const endpoints = usage.data?.endpoints ?? [];
  const slowRows = slow.data?.slow_queries ?? [];

  return (
    <div className="space-y-3">
      {/* Top requested endpoints (AUDIT_LOG) */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Top endpoints</p>
            <p className="text-[10px] text-slate-400">Most-requested routes · {usage.data?.window_days ?? 7}d</p>
          </div>
          {usage.data && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {usage.data.total_requests.toLocaleString()} req
            </span>
          )}
        </div>
        {usage.state === 'running' || usage.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={6} />
          </div>
        ) : usage.state === 'error' ? (
          <div className="p-3">
            <ErrBox message={usage.error ?? 'Failed'} onRetry={usage.reload} />
          </div>
        ) : endpoints.length === 0 ? (
          <EmptyState icon={BarChart3} compact title="No request history yet" />
        ) : (
          <div className="scrollbar-thin max-h-[360px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="glass-2 px-3 py-1.5 text-left font-semibold">Endpoint</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Module</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">Req</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">Err</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">Users</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={`${e.method} ${e.path}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="max-w-[320px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
                      <span className="text-slate-400">{e.method}</span> {e.path}
                    </td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{e.module}</td>
                    <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{e.count.toLocaleString()}</td>
                    <td className={cn('px-2 py-1 text-right', e.errors > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>
                      {e.errors || '·'}
                    </td>
                    <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{e.distinct_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {/* Slowest queries */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Slowest queries (7d)</p>
          <p className="text-[10px] text-slate-400">Highest execution time</p>
        </div>
        {slow.state === 'running' || slow.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={4} />
          </div>
        ) : slow.state === 'error' ? (
          <div className="p-3">
            <ErrBox message={slow.error ?? 'Failed'} onRetry={slow.reload} />
          </div>
        ) : slowRows.length === 0 ? (
          <EmptyState icon={Timer} compact title="No slow queries" />
        ) : (
          <div className="scrollbar-thin max-h-[360px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
            {slowRows.slice(0, 40).map((q) => (
              <div key={q.query_id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-200" title={q.query_text}>
                    {q.query_type || 'QUERY'} · {q.query_text?.slice(0, 80) || q.query_id}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {q.user_name} · {q.warehouse_name} · {q.mb_scanned?.toFixed(0)}MB
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  {q.execution_time_sec?.toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

/* ── Events ───────────────────────────────────────────────────────────────── */
function EventsTab() {
  const { state, data, error, reload } = useFetch(() => getActivityFeed(200, { days: 7 }));
  const events: ActivityEvent[] = useMemo(() => data?.events ?? [], [data]);
  const stats = useFetch(() => getActivityStats(7));

  const topUsers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.username, (counts.get(e.username) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);
  const errors = useMemo(() => events.filter((e) => isError(e.status)).slice(0, 25), [events]);

  if (state === 'running' || state === 'idle') return <Loading rows={8} />;
  if (state === 'error') return <ErrBox message={error ?? 'Failed'} onRetry={reload} />;
  if (events.length === 0) return <EmptyState icon={Activity} compact title="No recent events" />;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <GlassPanel depth={1} radius="xl" className="overflow-hidden lg:col-span-2">
        <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Recent activity</p>
          <p className="text-[10px] text-slate-400">{events.length} events · last 7d</p>
        </div>
        <div className="scrollbar-thin max-h-[440px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
          {events.slice(0, 80).map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-[11px] text-slate-700 dark:text-slate-200">
                  <span className="font-medium">{e.username}</span> · {e.event_type}
                </p>
                <p className="text-[10px] text-slate-400">{e.module}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                    isError(e.status)
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                  )}
                >
                  {e.status}
                </span>
                <span className="text-[10px] text-slate-400">
                  {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      <div className="space-y-3">
        <GlassPanel depth={1} radius="xl" className="p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Users className="h-3.5 w-3.5" /> Most active users
          </p>
          {topUsers.length === 0 ? (
            <EmptyState icon={Users} compact title="—" />
          ) : (
            <ul className="space-y-1">
              {topUsers.map(([user, n], i) => (
                <li key={user} className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {i + 1}. {user || '—'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
        <GlassPanel depth={1} radius="xl" className="p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Recent errors
          </p>
          {errors.length === 0 ? (
            <EmptyState icon={ShieldCheck} compact title="No errors 🎉" />
          ) : (
            <ul className="scrollbar-thin max-h-[220px] space-y-1 overflow-auto">
              {errors.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {e.module} · {e.event_type}
                  </span>
                  <span className="shrink-0 text-slate-400">
                    {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
        <GlassPanel depth={1} radius="xl" className="p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Layers className="h-3.5 w-3.5" /> Events by module / project
          </p>
          {!stats.data ? (
            <Loading rows={3} />
          ) : (
            <div className="space-y-2">
              <ul className="space-y-1">
                {stats.data.by_module.slice(0, 6).map((m) => (
                  <li key={m.module} className="flex items-center justify-between text-[11px]">
                    <span className="truncate text-slate-600 dark:text-slate-300">{m.module}</span>
                    <span className="shrink-0 text-slate-400">
                      {m.events}
                      {m.failures > 0 && <span className="text-red-500"> · {m.failures}✗</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {stats.data.by_project.length > 0 && (
                <div className="border-t border-slate-100 pt-1.5 dark:border-slate-800">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">By project</p>
                  <ul className="space-y-1">
                    {stats.data.by_project.slice(0, 5).map((pj) => (
                      <li key={pj.project_id} className="flex items-center justify-between text-[11px]">
                        <span className="truncate font-mono text-slate-600 dark:text-slate-300">{pj.project_id || '—'}</span>
                        <span className="shrink-0 text-slate-400">{pj.events}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

/* ── Cache ────────────────────────────────────────────────────────────────── */
/**
 * TTL config GET (`/api/data360/cache-config`) may not be deployed (PATCH-only on
 * some builds). Fall back to the same map exposed by `/api/data360/config` so the
 * zones panel is never blank.
 */
async function loadCacheConfig(): Promise<Record<string, number>> {
  try {
    return await getCacheConfig();
  } catch {
    const cfg = await getData360Config();
    return cfg.cache_config ?? {};
  }
}

function CacheTab() {
  const cfg = useFetch<Record<string, number>>(() => loadCacheConfig());
  const entries = useFetch(() => getCacheEntries());
  const bd = useFetch(() => getCacheBreakdown());
  const inval = useFetch(() => getCacheInvalidations(100));

  const cacheEntries: CacheEntry[] = entries.data?.entries ?? [];
  const redisConnected = entries.data?.redis_connected ?? true;
  const byClass = bd.data?.by_class ?? [];
  const cachedQueries = bd.data?.cached_queries ?? [];
  const invEvents = inval.data?.events ?? [];
  const cfgEntries = Object.entries(cfg.data ?? {});

  // TTL inline edit (platform-wide → confirm before PATCH).
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [pending, setPending] = useState<{ key: string; value: number } | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const startEdit = (key: string, cur: number) => {
    setEditKey(key);
    setEditVal(String(cur));
  };
  const requestSave = (key: string) => {
    const v = Number(editVal);
    if (!Number.isFinite(v) || v < 0) {
      toast({ title: 'Enter a non-negative number of seconds' });
      return;
    }
    setPending({ key, value: Math.round(v) });
  };
  const confirmSave = async () => {
    if (!pending) return;
    const { key, value } = pending;
    setPending(null);
    setSavingKey(key);
    try {
      await patchCacheConfig({ key, value_seconds: value });
      toast({ title: `TTL "${key}" → ${value}s` });
      setEditKey(null);
      await cfg.reload();
    } catch (e) {
      toast({ title: getApiErrorMessage(e) });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Cached entries (live key inventory) */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cached entries</p>
            <p className="text-[10px] text-slate-400">
              {entries.data?.truncated
                ? `Showing first ${cacheEntries.length} (truncated) · scanned ${(entries.data?.total_scanned ?? 0).toLocaleString()}`
                : `${cacheEntries.length} keys · scanned ${(entries.data?.total_scanned ?? 0).toLocaleString()}`}
            </p>
          </div>
          {entries.state === 'done' && !redisConnected && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> Redis offline — in-process fallback
            </span>
          )}
        </div>
        <p className="flex items-center gap-1 border-b border-slate-100 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800">
          <Info className="h-3 w-3 shrink-0" /> Inventory only — cached values are never exposed; per-key hit counts aren’t tracked.
        </p>
        {entries.state === 'running' || entries.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={5} />
          </div>
        ) : entries.state === 'error' || cacheEntries.length === 0 ? (
          // New endpoint may 404 until deployed → honest empty, not an error box.
          <EmptyState icon={HardDrive} compact title="No cached entries to show" />
        ) : (
          <div className="scrollbar-thin max-h-[320px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="glass-2 px-3 py-1.5 text-left font-semibold">Key</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Module</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">User</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">TTL</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">Size</th>
                </tr>
              </thead>
              <tbody>
                {cacheEntries.map((e, i) => (
                  <tr key={`${e.key}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="max-w-[280px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={e.key}>
                      {e.key}
                    </td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{e.module ?? '—'}</td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{e.user ?? '—'}</td>
                    <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{e.ttl_remaining}s</td>
                    <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{humanBytes(e.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {/* Cached data — by class + cached queries */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cached data</p>
            <p className="text-[10px] text-slate-400">Keys by class · cached query results</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {(bd.data?.total ?? 0).toLocaleString()} keys
          </span>
        </div>
        {bd.state === 'running' || bd.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={4} />
          </div>
        ) : bd.state === 'error' ? (
          <div className="p-3">
            <ErrBox message={bd.error ?? 'Failed'} onRetry={bd.reload} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              {byClass.map((c) => (
                <span key={c.prefix} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  {c.class} · {c.count.toLocaleString()}
                </span>
              ))}
            </div>
            {cachedQueries.length === 0 ? (
              <EmptyState icon={Database} compact title="No cached queries right now" />
            ) : (
              <div className="scrollbar-thin max-h-[280px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
                {cachedQueries.slice(0, 200).map((q, i) => (
                  <div key={`${q.fqdn}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1 text-[11px]">
                    <span className="truncate font-mono text-slate-700 dark:text-slate-200" title={q.fqdn}>
                      {q.fqdn}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">{q.db}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </GlassPanel>

      {/* Recent invalidations */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Recent invalidations</p>
          <p className="text-[10px] text-slate-400">{inval.data?.note ?? `Source: ${inval.data?.source ?? 'in-memory'} · resets on restart`}</p>
        </div>
        {inval.state === 'running' || inval.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={3} />
          </div>
        ) : inval.state === 'error' ? (
          <div className="p-3">
            <ErrBox message={inval.error ?? 'Failed'} onRetry={inval.reload} />
          </div>
        ) : invEvents.length === 0 ? (
          <EmptyState icon={Layers} compact title="No invalidations since restart" />
        ) : (
          <div className="scrollbar-thin max-h-[240px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
            {invEvents.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-1 text-[11px]">
                <span className="truncate font-mono text-slate-700 dark:text-slate-200" title={e.table}>
                  {e.table}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {e.module ?? ''} {e.triggered_by ? `· ${e.triggered_by}` : ''}{' '}
                  {e.ts ? new Date(e.ts).toLocaleTimeString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* TTL zones — editable (platform-wide → confirm before PATCH) */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cache TTL zones (seconds)</p>
          <p className="text-[10px] text-slate-400">Click the value to edit · applies platform-wide via PATCH /api/data360/cache-config</p>
        </div>
        {cfg.state === 'error' ? (
          <div className="p-3">
            <ErrBox message={cfg.error ?? 'Failed'} onRetry={cfg.reload} />
          </div>
        ) : cfg.state !== 'done' ? (
          <div className="p-3">
            <Loading rows={3} />
          </div>
        ) : cfgEntries.length === 0 ? (
          <EmptyState icon={Timer} compact title="No TTL zones configured" />
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 p-3 md:grid-cols-2 xl:grid-cols-3">
            {cfgEntries.map(([key, ttl]) => {
              const editing = editKey === key;
              const busy = savingKey === key;
              return (
                <div key={key} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 text-[11px] dark:border-slate-800">
                  <span className="truncate font-mono text-slate-600 dark:text-slate-300" title={key}>
                    {key}
                  </span>
                  {editing ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        autoFocus
                        value={editVal}
                        onChange={(ev) => setEditVal(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') requestSave(key);
                          if (ev.key === 'Escape') setEditKey(null);
                        }}
                        className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[11px] text-slate-800 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => requestSave(key)}
                        disabled={busy}
                        className="rounded bg-[hsl(var(--primary))] px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? '…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditKey(null)}
                        className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(key, ttl)}
                      title="Edit TTL"
                      className="flex shrink-0 items-center gap-1 rounded px-1 font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      {busy ? '…' : `${ttl}s`}
                      <Pencil className="h-3 w-3 text-slate-400" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {pending && (
        <ConfirmDialog
          title="Change cache TTL platform-wide?"
          body={`Set "${pending.key}" to ${pending.value}s. This changes caching for every user and module at runtime.`}
          confirmLabel="Apply"
          onConfirm={() => void confirmSave()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/* ── Access matrix (feature × role) ───────────────────────────────────────── */
const ACCESS_TINT: Record<string, string> = {
  WRITE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  READ: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  NONE: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

type AccessLevel = 'READ' | 'WRITE' | 'NONE';
const CYCLE: Record<AccessLevel, AccessLevel> = { NONE: 'READ', READ: 'WRITE', WRITE: 'NONE' };
const RANK: Record<string, number> = { NONE: 0, READ: 1, WRITE: 2 };

/** Persistent reminder: GUI permissions are advisory UI hints, not API enforcement. */
function EnforcementBanner() {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <span className="font-semibold">Page Visibility Hints (Not Enforced).</span> These rules set
        UI page visibility hints only — they do <span className="font-semibold">not</span> enforce API
        access. For enforced action-level grants use the <span className="font-semibold">Action RBAC</span>{' '}
        tab. Per-user granularity is via role membership; edits change the rule for a whole role.
      </p>
    </div>
  );
}

function AccessTab() {
  const permsFetch = useFetch<{ data: GuiPermission[] }>(() => listGuiPermissions());
  const usersFetch = useFetch<UserGrantTableData[]>(() => getUsersWithRolesAndModules());
  const [view, setView] = useState<'role' | 'user'>('role');
  const [edits, setEdits] = useState<Map<string, AccessLevel>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  // Role-scoped edit confirm (both views).
  const [pendingCell, setPendingCell] = useState<{ role: string; feat: string; from: AccessLevel; to: AccessLevel } | null>(null);
  // By-user picker + on-demand effective fetch.
  const [picked, setPicked] = useState<string>('');
  const [eff, setEff] = useState<{ state: AsyncState; access: Record<string, AccessLevel>; roles: string[]; error: string | null }>(
    { state: 'idle', access: {}, roles: [], error: null },
  );

  const perms = useMemo(() => permsFetch.data?.data ?? [], [permsFetch.data]);
  const { roles, features, base } = useMemo(() => {
    const roleSet = new Set<string>();
    const featSet = new Set<string>();
    const g = new Map<string, AccessLevel>();
    for (const pm of perms) {
      roleSet.add(pm.role_name);
      featSet.add(pm.page_path);
      g.set(`${pm.role_name}|${pm.page_path}`, pm.access_level);
    }
    return { roles: [...roleSet].sort(), features: [...featSet].sort(), base: g };
  }, [perms]);

  const lvlOf = useCallback(
    (role: string, feat: string): AccessLevel =>
      edits.get(`${role}|${feat}`) ?? base.get(`${role}|${feat}`) ?? 'NONE',
    [edits, base],
  );

  // Stage an edit → confirm dialog explains the role-wide blast radius.
  const requestCycle = useCallback(
    (role: string, feat: string) => {
      const cur = lvlOf(role, feat);
      setPendingCell({ role, feat, from: cur, to: CYCLE[cur] });
    },
    [lvlOf],
  );

  // Load one user's effective access (server-resolved). Declared before commitCycle
  // because commitCycle lists it as a dependency.
  const loadEffective = useCallback(async (username: string) => {
    if (!username) {
      setEff({ state: 'idle', access: {}, roles: [], error: null });
      return;
    }
    setEff({ state: 'running', access: {}, roles: [], error: null });
    try {
      const res = await getUserEffectiveGuiAccess(username);
      setEff({ state: 'done', access: res.access ?? {}, roles: res.roles ?? [], error: null });
    } catch (e) {
      setEff({ state: 'error', access: {}, roles: [], error: getApiErrorMessage(e) });
    }
  }, []);

  const commitCycle = useCallback(async () => {
    if (!pendingCell) return;
    const { role, feat, from, to } = pendingCell;
    const key = `${role}|${feat}`;
    setPendingCell(null);
    setSaving((s) => new Set(s).add(key));
    setEdits((m) => new Map(m).set(key, to)); // optimistic
    try {
      await upsertGuiPermission({ role_name: role, page_path: feat, access_level: to });
      toast({ title: `${role} · ${feat} → ${to}` });
      // Keep the by-user "Effective" column in sync with the edit just made.
      if (view === 'user' && picked) void loadEffective(picked);
    } catch (e) {
      setEdits((m) => new Map(m).set(key, from)); // revert
      toast({ title: getApiErrorMessage(e) });
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }, [pendingCell, view, picked, loadEffective]);

  if (permsFetch.state === 'running' || permsFetch.state === 'idle') return <Loading rows={8} />;
  if (permsFetch.state === 'error')
    return <ErrBox message={permsFetch.error ?? 'Failed'} onRetry={permsFetch.reload} />;
  if (perms.length === 0)
    return (
      <div className="space-y-3">
        <EnforcementBanner />
        <EmptyState icon={KeyRound} compact title="No GUI permission rules defined" />
      </div>
    );

  const users = usersFetch.data ?? [];
  const pickedUser = users.find((u) => u.username === picked) ?? null;
  // Roles that confer a given level on a feature (from the local rule map) — the
  // "which role grants this" attribution the effective endpoint doesn't return.
  const contributingRoles = (userRoles: string[], feat: string): { role: string; lvl: AccessLevel }[] =>
    userRoles
      .map((r) => ({ role: r, lvl: lvlOf(r, feat) }))
      .filter((x) => x.lvl !== 'NONE')
      .sort((a, b) => RANK[b.lvl] - RANK[a.lvl]);

  return (
    <div className="space-y-3">
      <EnforcementBanner />
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {view === 'role'
                ? `Feature access by role — ${roles.length} roles × ${features.length} features`
                : 'Effective access by user'}
            </p>
            <p className="text-[10px] text-slate-400">
              {view === 'role'
                ? 'Click a cell to change NONE → READ → WRITE (role-wide · confirm required)'
                : 'Pick a user → server-resolved access · edit the role that confers each feature'}
            </p>
          </div>
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {(['role', 'user'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
                  view === v
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500',
                )}
              >
                By {v}
              </button>
            ))}
          </div>
        </div>

        {view === 'role' ? (
          <div className="scrollbar-thin max-h-[460px] overflow-auto">
            <table className="border-collapse text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="glass-2 sticky left-0 z-20 border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Feature
                  </th>
                  {roles.map((r) => (
                    <th key={r} className="glass-2 whitespace-nowrap border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f} className="odd:bg-slate-50/40 dark:odd:bg-slate-800/20">
                    <td className="sticky left-0 z-10 max-w-[220px] truncate bg-white/80 px-2 py-1 font-mono text-slate-700 backdrop-blur dark:bg-slate-900/70 dark:text-slate-200" title={f}>
                      {f}
                    </td>
                    {roles.map((r) => {
                      const lvl = lvlOf(r, f);
                      const busy = saving.has(`${r}|${f}`);
                      return (
                        <td key={r} className="px-1.5 py-1 text-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => requestCycle(r, f)}
                            title={`${r} · ${f} = ${lvl} (click to change)`}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-semibold transition-opacity hover:opacity-80',
                              ACCESS_TINT[lvl] ?? ACCESS_TINT.NONE,
                              busy && 'opacity-40',
                            )}
                          >
                            {busy ? '…' : lvl === 'NONE' ? '·' : lvl[0]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <User className="h-3.5 w-3.5" /> User
              </label>
              <select
                value={picked}
                onChange={(ev) => {
                  setPicked(ev.target.value);
                  void loadEffective(ev.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
              {pickedUser && (
                <span className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                  roles:
                  {(eff.roles.length ? eff.roles : pickedUser.roles).map((r) => (
                    <span key={r} className="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {r}
                    </span>
                  ))}
                </span>
              )}
            </div>

            {!picked ? (
              <EmptyState icon={User} compact title="Pick a user to see effective access" />
            ) : eff.state === 'running' || eff.state === 'idle' ? (
              <Loading rows={6} />
            ) : eff.state === 'error' || Object.keys(eff.access).length === 0 ? (
              // effective endpoint may 404 until deployed → honest empty state.
              <EmptyState icon={KeyRound} compact title="No effective access to show for this user" />
            ) : (
              <div className="scrollbar-thin max-h-[420px] overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="glass-2 px-3 py-1.5 text-left font-semibold">Feature</th>
                      <th className="glass-2 px-2 py-1.5 text-center font-semibold">Effective</th>
                      <th className="glass-2 px-3 py-1.5 text-left font-semibold">Granted via role (click to edit)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(eff.access)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([feat, lvl]) => {
                        const contribs = contributingRoles(eff.roles.length ? eff.roles : pickedUser?.roles ?? [], feat);
                        return (
                          <tr key={feat} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="max-w-[240px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={feat}>
                              {feat}
                            </td>
                            <td className="px-2 py-1 text-center">
                              <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold', ACCESS_TINT[lvl] ?? ACCESS_TINT.NONE)}>
                                {lvl}
                              </span>
                            </td>
                            <td className="px-3 py-1">
                              <span className="flex flex-wrap gap-1">
                                {contribs.length === 0 ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  contribs.map(({ role, lvl: rl }) => (
                                    <button
                                      key={role}
                                      type="button"
                                      disabled={saving.has(`${role}|${feat}`)}
                                      onClick={() => requestCycle(role, feat)}
                                      title={`${role} grants ${rl} on ${feat} — click to change (role-wide)`}
                                      className={cn(
                                        'rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-opacity hover:opacity-80',
                                        ACCESS_TINT[rl] ?? ACCESS_TINT.NONE,
                                        saving.has(`${role}|${feat}`) && 'opacity-40',
                                      )}
                                    >
                                      {role} · {rl[0]}
                                    </button>
                                  ))
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </GlassPanel>

      {pendingCell && (
        <ConfirmDialog
          title="Change UI access for a whole role?"
          body={`Set "${pendingCell.feat}" from ${pendingCell.from} to ${pendingCell.to} for role ${pendingCell.role}. This changes UI visibility for ALL users with role ${pendingCell.role} (it does not enforce API access).`}
          confirmLabel="Apply to role"
          onConfirm={() => void commitCycle()}
          onCancel={() => setPendingCell(null)}
        />
      )}
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'performance', label: 'Performance', icon: BarChart3 },
  { key: 'events', label: 'Events', icon: Activity },
  { key: 'activity', label: 'Activity', icon: LineChart },
  { key: 'cache', label: 'Cache', icon: Layers },
  { key: 'action-rbac', label: 'Action RBAC', icon: ShieldCheck },
  { key: 'access', label: 'Page hints', icon: KeyRound },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Data360ConfigPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  return (
    <div className="min-h-full space-y-4 p-4 lg:p-6">
      <header>
        <nav className="mb-1 flex items-center gap-1 text-xs text-slate-400" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden>/</span>
          <span>Admin</span>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">Data360 Console</span>
        </nav>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Data360 Admin Console</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Live platform metrics, events, cache and access — one operational surface.
        </p>
      </header>

      <GlassPanel depth={2} radius="2xl" className="flex flex-wrap gap-1 p-1">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100',
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </GlassPanel>

      <div>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'performance' && (
          <div className="space-y-3">
            <ServerMetricsPanel />
            <PerformanceTab />
          </div>
        )}
        {tab === 'events' && <EventsTab />}
        {tab === 'activity' && <ActivityDashboard />}
        {tab === 'cache' && <CacheTab />}
        {tab === 'action-rbac' && <ActionRbacTab />}
        {tab === 'access' && (
          <div className="space-y-3">
            <RealAccessPanel />
            <RoleGrantsPanel />
            <AccessTab />
          </div>
        )}
      </div>
    </div>
  );
}
