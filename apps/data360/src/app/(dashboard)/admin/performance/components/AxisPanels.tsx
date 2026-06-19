'use client';

/**
 * AxisPanels — one table component per drill-down axis (endpoints, users, cache,
 * modules, projects, errors). Each owns its fetch via {@link usePerfFetch} and
 * degrades quietly when the backend route is not deployed yet.
 *
 * Row clicks (endpoints / users) bubble up a {@link PerfSelection} so the parent
 * page can render the always-visible right detail panel.
 */
import { useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import Pager, { usePagination } from '@/components/ui/Pager';
import {
  getPerfByEndpoint,
  getPerfByUser,
  getPerfByCache,
  getPerfByModule,
  getPerfErrors,
  type CacheAxis,
} from '@/app/services/admin-performance';
import {
  FilterChips,
  HitRateBar,
  STATUS_TINT,
  ErrorRetry,
  NotDeployedBanner,
  DrillButton,
  matchSearch,
  matchStatusClass,
  matchMethod,
  fmtInt,
  fmtMs,
  fmtPct,
  fmtTime,
  type PerfFocus,
} from './shared';
import { usePerfFetch, type PerfState } from './usePerfFetch';

export type PerfSelection =
  | { kind: 'endpoint'; method: string; path: string }
  | { kind: 'user'; username: string }
  | null;

/** A flat, label-keyed snapshot of the visible rows lifted to the page for the
 * deep-dive toolbar count + the "Analyze with AI" payload. */
export interface PerfRowsView {
  shown: number;
  total: number;
  /** Plain-text label lines for the top visible rows (AI payload + count). */
  lines: string[];
}

/** Deep-dive props threaded down into every axis panel. The panel filters its
 * own already-loaded rows and reports {@link PerfRowsView} back up. */
interface DeepDiveProps {
  search: string;
  statusFilter: string;
  onRows: (view: PerfRowsView) => void;
  onFocus?: (focus: PerfFocus) => void;
}

interface BaseProps extends DeepDiveProps {
  account: string;
  hours: number;
  liveMs: number | null;
  selected: PerfSelection;
  onSelect: (sel: PerfSelection) => void;
}

/** Lift the filtered-rows view up to the page in an effect (never during render). */
function useReportRows(onRows: (v: PerfRowsView) => void, view: PerfRowsView) {
  const key = `${view.shown}|${view.total}|${view.lines.join('')}`;
  useEffect(() => {
    onRows(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const TH = 'glass-2 px-2 py-1.5 text-right font-semibold';
const THL = 'glass-2 px-3 py-1.5 text-left font-semibold';

function Frame({
  state,
  error,
  empty,
  reload,
  children,
}: {
  state: PerfState;
  error: string | null;
  empty: boolean;
  reload: () => void;
  children: React.ReactNode;
}) {
  if (state === 'not-deployed') return <NotDeployedBanner what="This axis" />;
  if (state === 'error') return <ErrorRetry message={error || 'Failed to load'} onRetry={reload} />;
  if (state === 'loading')
    return (
      <div className="space-y-1 p-3" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
    );
  if (empty)
    return (
      <div className="px-4 py-6">
        <EmptyState
          icon={BarChart3}
          compact
          title="No request telemetry for this window"
          description="The HTTP request trail is populated via the platform service connection (available on production), so it can be empty on this backend. Usage-history metrics are unaffected."
        />
      </div>
    );
  return <table className="w-full border-collapse text-[11px]">{children}</table>;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export function EndpointsPanel({ account, hours, liveMs, selected, onSelect, search, statusFilter, onRows, onFocus }: BaseProps) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfByEndpoint(account, { hours, limit: 100 }),
    [account, hours],
    liveMs,
  );
  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(
    () => all.filter((e) => matchSearch(`${e.method} ${e.path}`, search) && matchMethod(e.method, statusFilter)),
    [all, search, statusFilter],
  );
  useReportRows(onRows, {
    shown: rows.length,
    total: all.length,
    lines: rows.slice(0, 20).map((e) => `${e.method} ${e.path} — ${fmtInt(e.requests)} req, ${fmtPct(e.error_rate)} err, avg ${fmtMs(e.avg_ms)}, cache ${fmtPct(e.cache_hit_rate, 0)}`),
  });
  const pg = usePagination(rows, 12);
  return (
    <>
    <Frame state={state} error={error} empty={all.length === 0} reload={reload}>
      <thead className="sticky top-0">
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className={THL}>Endpoint</th>
          <th className={TH}>Req</th>
          <th className={TH}>Err</th>
          <th className={TH}>Err %</th>
          <th className={TH}>Avg</th>
          <th className={TH}>Max</th>
          <th className={TH}>p95</th>
          <th className={TH}>Cache</th>
          <th className={TH} aria-label="Drill" />
        </tr>
      </thead>
      <tbody>
        {pg.slice.map((e) => {
          const active = selected?.kind === 'endpoint' && selected.method === e.method && selected.path === e.path;
          return (
            <tr
              key={`${e.method} ${e.path}`}
              onClick={() => onSelect({ kind: 'endpoint', method: e.method, path: e.path })}
              className={cn(
                'group cursor-pointer border-b border-slate-100 dark:border-slate-800',
                active ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-white/50 dark:hover:bg-white/5',
              )}
            >
              <td className="max-w-[280px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
                <span className="text-slate-400">{e.method}</span> {e.path}
              </td>
              <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{fmtInt(e.requests)}</td>
              <td className={cn('px-2 py-1 text-right', (e.errors ?? 0) > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>{e.errors ? fmtInt(e.errors) : '·'}</td>
              <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{fmtPct(e.error_rate)}</td>
              <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{fmtMs(e.avg_ms)}</td>
              <td className="px-2 py-1 text-right text-slate-400">{fmtMs(e.max_ms)}</td>
              <td className="px-2 py-1 text-right text-slate-400">{fmtMs(e.p95_ms)}</td>
              <td className="px-2 py-1 text-right">{fmtPct(e.cache_hit_rate, 0)}</td>
              <td className="px-1 py-1 text-right">
                {onFocus && (
                  <span onClick={(ev) => ev.stopPropagation()}>
                    <DrillButton label={`Focus ${e.method} ${e.path}`} onClick={() => onFocus({ kind: 'endpoint', value: `${e.method} ${e.path}` })} />
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Frame>
    <Pager page={pg.page} pageCount={pg.pageCount} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} unit="endpoints" className="px-3 pb-2" />
    </>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

export function UsersPanel({ account, hours, liveMs, selected, onSelect, search, onRows, onFocus }: BaseProps) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfByUser(account, { hours, limit: 100 }),
    [account, hours],
    liveMs,
  );
  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(
    () => all.filter((u) => matchSearch(`${u.username ?? ''} ${u.role ?? ''}`, search)),
    [all, search],
  );
  useReportRows(onRows, {
    shown: rows.length,
    total: all.length,
    lines: rows.slice(0, 20).map((u) => `${u.username || '—'} (${u.role || '—'}) — ${fmtInt(u.requests)} req, ${fmtPct(u.error_rate)} err, cache ${fmtPct(u.cache_hit_rate, 0)}, avg ${fmtMs(u.avg_ms)}`),
  });
  const pg = usePagination(rows, 12);
  return (
    <>
    <Frame state={state} error={error} empty={all.length === 0} reload={reload}>
      <thead className="sticky top-0">
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className={THL}>User</th>
          <th className={THL}>Role</th>
          <th className={TH}>Req</th>
          <th className={TH}>Queries</th>
          <th className={TH}>Err</th>
          <th className={TH}>Err %</th>
          <th className={TH}>Cache</th>
          <th className={TH}>Avg</th>
          <th className={TH} aria-label="Drill" />
        </tr>
      </thead>
      <tbody>
        {pg.slice.map((u) => {
          const active = selected?.kind === 'user' && selected.username === u.username;
          return (
            <tr
              key={u.username}
              onClick={() => onSelect({ kind: 'user', username: u.username })}
              className={cn(
                'group cursor-pointer border-b border-slate-100 dark:border-slate-800',
                active ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-white/50 dark:hover:bg-white/5',
              )}
            >
              <td className="max-w-[200px] truncate px-3 py-1 text-slate-700 dark:text-slate-200" title={u.username}>{u.username || '—'}</td>
              <td className="px-3 py-1 text-slate-400">{u.role || '—'}</td>
              <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{fmtInt(u.requests)}</td>
              <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{fmtInt(u.distinct_paths)}</td>
              <td className={cn('px-2 py-1 text-right', (u.errors ?? 0) > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>{u.errors ? fmtInt(u.errors) : '·'}</td>
              <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{fmtPct(u.error_rate)}</td>
              <td className="px-2 py-1 text-right">{fmtPct(u.cache_hit_rate, 0)}</td>
              <td className="px-2 py-1 text-right text-slate-400">{fmtMs(u.avg_ms)}</td>
              <td className="px-1 py-1 text-right">
                {onFocus && (
                  <span onClick={(ev) => ev.stopPropagation()}>
                    <DrillButton label={`Focus ${u.username}`} onClick={() => onFocus({ kind: 'user', value: u.username })} />
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Frame>
    <Pager page={pg.page} pageCount={pg.pageCount} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} unit="users" className="px-3 pb-2" />
    </>
  );
}

// ── Cache (sub-axis: page | tab | module | project) ──────────────────────────

export function CachePanel({
  account,
  hours,
  liveMs,
  axis,
  onAxisChange,
  search,
  onRows,
}: Pick<BaseProps, 'account' | 'hours' | 'liveMs' | 'search' | 'onRows'> & {
  axis: CacheAxis;
  onAxisChange: (a: CacheAxis) => void;
}) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfByCache(account, axis, hours),
    [account, hours, axis],
    liveMs,
  );
  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(() => all.filter((c) => matchSearch(c.key ?? '', search)), [all, search]);
  useReportRows(onRows, {
    shown: rows.length,
    total: all.length,
    lines: rows.slice(0, 20).map((c) => `${c.key || '—'} — ${fmtInt(c.requests)} req, ${fmtInt(c.cache_hits)} hits / ${fmtInt(c.cache_misses)} misses, ${fmtPct(c.cache_hit_rate, 0)}`),
  });
  const pg = usePagination(rows, 12);
  const subOptions = useMemo(
    () =>
      (['page', 'tab', 'module', 'project'] as CacheAxis[]).map((a) => ({
        id: a,
        label: a.charAt(0).toUpperCase() + a.slice(1),
      })),
    [],
  );
  return (
    <div>
      <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
        <FilterChips options={subOptions} value={axis} onChange={onAxisChange} size="sm" />
      </div>
      <Frame state={state} error={error} empty={all.length === 0} reload={reload}>
        <thead className="sticky top-0">
          <tr className="text-[10px] uppercase tracking-wide text-slate-400">
            <th className={THL}>{axis.charAt(0).toUpperCase() + axis.slice(1)}</th>
            <th className={TH}>Req</th>
            <th className={TH}>Hits</th>
            <th className={TH}>Misses</th>
            <th className={cn(TH, 'min-w-[120px]')}>Hit rate</th>
          </tr>
        </thead>
        <tbody>
          {pg.slice.map((c) => (
            <tr key={c.key} className="border-b border-slate-100 dark:border-slate-800">
              <td className="max-w-[300px] truncate px-3 py-1 text-slate-700 dark:text-slate-200" title={c.key}>{c.key || '—'}</td>
              <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{fmtInt(c.requests)}</td>
              <td className="px-2 py-1 text-right text-emerald-600 dark:text-emerald-400">{fmtInt(c.cache_hits)}</td>
              <td className="px-2 py-1 text-right text-slate-400">{fmtInt(c.cache_misses)}</td>
              <td className="px-2 py-1 text-right"><HitRateBar rate={c.cache_hit_rate} /></td>
            </tr>
          ))}
        </tbody>
      </Frame>
      <Pager page={pg.page} pageCount={pg.pageCount} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} unit="keys" className="px-3 pb-2" />
    </div>
  );
}

// ── Modules ──────────────────────────────────────────────────────────────────

export function ModulesPanel({ account, hours, liveMs, search, onRows }: Pick<BaseProps, 'account' | 'hours' | 'liveMs' | 'search' | 'onRows'>) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfByModule(account, hours),
    [account, hours],
    liveMs,
  );
  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(() => all.filter((m) => matchSearch(m.module ?? '', search)), [all, search]);
  useReportRows(onRows, {
    shown: rows.length,
    total: all.length,
    lines: rows.slice(0, 20).map((m) => `${m.module || '—'} — ${fmtInt(m.requests)} req, ${fmtPct(m.error_rate)} err, avg ${fmtMs(m.avg_ms)}, cache ${fmtPct(m.cache_hit_rate, 0)}, ${fmtInt(m.distinct_users)} users`),
  });
  const pg = usePagination(rows, 12);
  return (
    <>
    <Frame state={state} error={error} empty={all.length === 0} reload={reload}>
      <thead className="sticky top-0">
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className={THL}>Module</th>
          <th className={TH}>Req</th>
          <th className={TH}>Err</th>
          <th className={TH}>Err %</th>
          <th className={TH}>Avg</th>
          <th className={TH}>Cache</th>
          <th className={TH}>Users</th>
        </tr>
      </thead>
      <tbody>
        {pg.slice.map((mod) => (
          <tr key={mod.module} className="border-b border-slate-100 dark:border-slate-800">
            <td className="max-w-[220px] truncate px-3 py-1 text-slate-700 dark:text-slate-200" title={mod.module}>{mod.module || '—'}</td>
            <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{fmtInt(mod.requests)}</td>
            <td className={cn('px-2 py-1 text-right', (mod.errors ?? 0) > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>{mod.errors ? fmtInt(mod.errors) : '·'}</td>
            <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{fmtPct(mod.error_rate)}</td>
            <td className="px-2 py-1 text-right text-slate-500 dark:text-slate-400">{fmtMs(mod.avg_ms)}</td>
            <td className="px-2 py-1 text-right">{fmtPct(mod.cache_hit_rate, 0)}</td>
            <td className="px-2 py-1 text-right text-slate-400">{fmtInt(mod.distinct_users)}</td>
          </tr>
        ))}
      </tbody>
    </Frame>
    <Pager page={pg.page} pageCount={pg.pageCount} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} unit="modules" className="px-3 pb-2" />
    </>
  );
}

// ── Projects (reuses by-cache axis='project') ────────────────────────────────

export function ProjectsPanel({ account, hours, liveMs, search, onRows }: Pick<BaseProps, 'account' | 'hours' | 'liveMs' | 'search' | 'onRows'>) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfByCache(account, 'project', hours),
    [account, hours],
    liveMs,
  );
  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(() => all.filter((c) => matchSearch(c.key ?? '', search)), [all, search]);
  useReportRows(onRows, {
    shown: rows.length,
    total: all.length,
    lines: rows.slice(0, 20).map((c) => `${c.key || '—'} — ${fmtInt(c.requests)} req, ${fmtInt(c.cache_hits)} hits / ${fmtInt(c.cache_misses)} misses, ${fmtPct(c.cache_hit_rate, 0)}`),
  });
  const pg = usePagination(rows, 12);
  return (
    <>
    <Frame state={state} error={error} empty={all.length === 0} reload={reload}>
      <thead className="sticky top-0">
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className={THL}>Project</th>
          <th className={TH}>Req</th>
          <th className={TH}>Hits</th>
          <th className={TH}>Misses</th>
          <th className={cn(TH, 'min-w-[120px]')}>Cache hit rate</th>
        </tr>
      </thead>
      <tbody>
        {pg.slice.map((c) => (
          <tr key={c.key} className="border-b border-slate-100 dark:border-slate-800">
            <td className="max-w-[300px] truncate px-3 py-1 text-slate-700 dark:text-slate-200" title={c.key}>{c.key || '—'}</td>
            <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">{fmtInt(c.requests)}</td>
            <td className="px-2 py-1 text-right text-emerald-600 dark:text-emerald-400">{fmtInt(c.cache_hits)}</td>
            <td className="px-2 py-1 text-right text-slate-400">{fmtInt(c.cache_misses)}</td>
            <td className="px-2 py-1 text-right"><HitRateBar rate={c.cache_hit_rate} /></td>
          </tr>
        ))}
      </tbody>
    </Frame>
    <Pager page={pg.page} pageCount={pg.pageCount} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} unit="projects" className="px-3 pb-2" />
    </>
  );
}

// ── Errors ───────────────────────────────────────────────────────────────────

export function ErrorsPanel({ account, hours, liveMs, search, statusFilter, onRows }: Pick<BaseProps, 'account' | 'hours' | 'liveMs' | 'search' | 'statusFilter' | 'onRows'>) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfErrors(account, { hours, limit: 100 }),
    [account, hours],
    liveMs,
  );
  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(
    () =>
      all.filter(
        (e) =>
          matchSearch(`${e.method} ${e.path} ${e.username ?? ''} ${e.deny_reason ?? ''} ${e.status}`, search) &&
          matchStatusClass(e.status, statusFilter),
      ),
    [all, search, statusFilter],
  );
  useReportRows(onRows, {
    shown: rows.length,
    total: all.length,
    lines: rows.slice(0, 20).map((e) => `${e.status} ${e.method} ${e.path} — ${e.username || '—'}${e.deny_reason ? ` · ${e.deny_reason}` : ''} (${fmtMs(e.duration_ms)})`),
  });
  const pg = usePagination(rows, 12);
  return (
    <>
    <Frame state={state} error={error} empty={all.length === 0} reload={reload}>
      <thead className="sticky top-0">
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className={THL}>Status</th>
          <th className={THL}>Endpoint</th>
          <th className={THL}>User</th>
          <th className={THL}>Reason</th>
          <th className={TH}>Duration</th>
          <th className={TH}>When</th>
        </tr>
      </thead>
      <tbody>
        {pg.slice.map((e, i) => (
          <tr key={`${e.ts}-${pg.from - 1 + i}`} className="border-b border-slate-100 dark:border-slate-800">
            <td className="px-3 py-1">
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold', STATUS_TINT(e.status))}>{e.status}</span>
            </td>
            <td className="max-w-[240px] truncate px-3 py-1 font-mono text-slate-700 dark:text-slate-200" title={`${e.method} ${e.path}`}>
              <span className="text-slate-400">{e.method}</span> {e.path}
            </td>
            <td className="max-w-[160px] truncate px-3 py-1 text-slate-500 dark:text-slate-400" title={`${e.username ?? ''} ${e.role ?? ''}`}>
              {e.username || '—'}{e.role ? <span className="text-slate-400"> · {e.role}</span> : null}
            </td>
            <td className="max-w-[200px] truncate px-3 py-1 text-slate-500 dark:text-slate-400" title={e.deny_reason ?? ''}>{e.deny_reason || '—'}</td>
            <td className="px-2 py-1 text-right text-slate-400">{fmtMs(e.duration_ms)}</td>
            <td className="px-2 py-1 text-right text-slate-400">{fmtTime(e.ts)}</td>
          </tr>
        ))}
      </tbody>
    </Frame>
    <Pager page={pg.page} pageCount={pg.pageCount} total={pg.total} from={pg.from} to={pg.to} onPage={pg.setPage} unit="errors" className="px-3 pb-2" />
    </>
  );
}
