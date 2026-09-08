'use client';

/**
 * UsagePanel — endpoint usage telemetry for the administration control page
 * (accountadmin only).
 *
 * Feeds (via the shared administration control service — no direct apiClient):
 *  · GET /admin/endpoint-usage?limit=200 → per-endpoint request counts over
 *    the telemetry window. Client-sortable, paged at 25/page.
 *  · GET /admin/usage-by?dimension=<d>  → aggregated view. Probed live
 *    (2026-09-06): the backend accepts ONLY `dimension` = module | role |
 *    user — `by=` is silently ignored and any other value returns
 *    "Invalid dimension". The Group-by select therefore offers exactly
 *    those three dimensions.
 *
 * Honesty rules: a structured 503 DEPENDENCY_UNAVAILABLE renders an explicit
 * "dependency unavailable" panel — never a table of zeros; unknown values
 * render as '—', never 0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';

import {
  getEndpointUsage,
  getUsageBy,
  isAdminEnvelope,
  type AdminEnvelope,
} from '@/app/services/administration/control';
import {
  formatAge,
  resolveWhenReady,
  type AoMeta,
} from '@/app/shared/command-center/lib/meta';
import FreshnessChip from '@/app/shared/command-center/lib/FreshnessChip';
import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { TablePager, usePagedRows } from '@/components/ui/TablePager';

/* ----------------------------- local view types ---------------------------- */

interface EndpointRowView {
  method?: string | null;
  path?: string | null;
  module?: string | null;
  count?: number | null;
  errors?: number | null;
  distinct_users?: number | null;
  last_seen?: string | null;
}

interface UsageResponseView {
  endpoints?: EndpointRowView[];
  total_requests?: number | null;
  window_days?: number | null;
  meta?: AoMeta | null;
}

interface GroupRowView {
  key?: string | null;
  requests?: number | null;
  errors?: number | null;
  distinct_endpoints?: number | null;
}

interface GroupResponseView {
  dimension?: string;
  rows?: GroupRowView[];
  meta?: AoMeta | null;
}

/** Dimensions the backend genuinely supports (probed: module | role | user). */
const DIMENSIONS = [
  { id: 'module', label: 'Module' },
  { id: 'user', label: 'User' },
  { id: 'role', label: 'Role' },
] as const;
type DimensionId = (typeof DIMENSIONS)[number]['id'];

type SortKey =
  | 'method'
  | 'path'
  | 'module'
  | 'count'
  | 'errors'
  | 'distinct_users'
  | 'last_seen';

type UsageState =
  | { status: 'loading' }
  | { status: 'preparing'; envelope: AdminEnvelope }
  | { status: 'unavailable'; reason?: string }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: UsageResponseView };

type GroupState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason?: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: GroupRowView[]; meta?: AoMeta | null };

/* --------------------------------- helpers -------------------------------- */

/**
 * Structured 503 → unavailable envelope. The shared service may either
 * resolve with an AdminEnvelope or let the transport reject — handle both.
 */
function toUnavailable(err: unknown): AdminEnvelope | null {
  const e = err as {
    response?: {
      status?: number;
      data?: { error_code?: string; reason?: string; detail?: unknown };
    };
  };
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (status === 503 || data?.error_code === 'DEPENDENCY_UNAVAILABLE') {
    const reason =
      data?.reason ??
      (typeof data?.detail === 'string' ? data.detail : undefined);
    return { state: 'unavailable', reason };
  }
  return null;
}

/** Epoch ms for a possibly timezone-naive backend timestamp (else null). */
function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  // Naive stamps are written in the server's local clock; prefer that read
  // and only fall back to UTC when the local read lands in the future.
  const candidates = hasTz ? [iso] : [iso, `${iso}Z`];
  for (const c of candidates) {
    const t = Date.parse(c);
    if (!Number.isNaN(t) && t <= Date.now() + 60_000) return t;
  }
  return null;
}

function ageSeconds(iso: string | null | undefined): number | null {
  const t = parseTs(iso);
  if (t == null) return null;
  const s = (Date.now() - t) / 1000;
  return s >= 0 ? s : null;
}

/** Unknown numeric → '—', never 0. Real zeros render as 0. */
function fmtNum(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '—';
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The backend sometimes prefixes the path with its method — show it once. */
function displayPath(row: EndpointRowView): string {
  const raw = row.path ?? '';
  return raw.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, '');
}

function compareRows(a: EndpointRowView, b: EndpointRowView, key: SortKey): number {
  if (key === 'count' || key === 'errors' || key === 'distinct_users') {
    const av = isFiniteNum(a[key]) ? (a[key] as number) : -1;
    const bv = isFiniteNum(b[key]) ? (b[key] as number) : -1;
    return av - bv;
  }
  if (key === 'last_seen') {
    return (parseTs(a.last_seen) ?? 0) - (parseTs(b.last_seen) ?? 0);
  }
  const av = key === 'path' ? displayPath(a) : String(a[key] ?? '');
  const bv = key === 'path' ? displayPath(b) : String(b[key] ?? '');
  return av.localeCompare(bv);
}

/* ------------------------------ small pieces ------------------------------- */

function MethodChip({ method }: { method?: string | null }) {
  if (!method) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {method.toUpperCase()}
    </span>
  );
}

function DependencyUnavailable({
  reason,
  onRetry,
  compact = false,
}: {
  reason?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20 ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">
          Usage telemetry dependency unavailable
        </h3>
      </div>
      <p className="mt-1.5 pl-4 text-xs text-slate-600 dark:text-slate-300">
        {reason ?? 'The telemetry store did not respond. Counts are withheld rather than shown as zero.'}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 ml-4 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  numeric = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300 ${
        numeric ? 'text-right' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
          active ? 'text-accent-600 dark:text-accent-400' : ''
        }`}
      >
        {label}
        <span aria-hidden="true" className="text-[9px]">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

/* --------------------------------- panel ----------------------------------- */

export default function UsagePanel() {
  const [usage, setUsage] = useState<UsageState>({ status: 'loading' });
  const [dimension, setDimension] = useState<DimensionId>('module');
  const [group, setGroup] = useState<GroupState>({ status: 'loading' });
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'count',
    dir: 'desc',
  });

  const loadUsage = useCallback(async () => {
    setUsage({ status: 'loading' });
    try {
      const res = await resolveWhenReady<unknown>(
        () => getEndpointUsage(200) as Promise<unknown>,
      );
      if (isAdminEnvelope(res)) {
        if (res.state === 'preparing') {
          setUsage({ status: 'preparing', envelope: res });
        } else {
          setUsage({ status: 'unavailable', reason: res.reason });
        }
        return;
      }
      setUsage({ status: 'ready', data: res as UsageResponseView });
    } catch (err) {
      const env = toUnavailable(err);
      if (env) {
        setUsage({ status: 'unavailable', reason: env.reason });
      } else {
        setUsage({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }, []);

  const loadGroup = useCallback(async (dim: DimensionId) => {
    setGroup({ status: 'loading' });
    try {
      const res = await resolveWhenReady<unknown>(
        () => getUsageBy({ dimension: dim }) as Promise<unknown>,
      );
      if (isAdminEnvelope(res)) {
        setGroup({ status: 'unavailable', reason: res.reason });
        return;
      }
      const data = res as GroupResponseView;
      const rows = [...(data.rows ?? [])].sort(
        (a, b) =>
          (isFiniteNum(b.requests) ? b.requests : -1) -
          (isFiniteNum(a.requests) ? a.requests : -1),
      );
      setGroup({ status: 'ready', rows, meta: data.meta });
    } catch (err) {
      const env = toUnavailable(err);
      if (env) {
        setGroup({ status: 'unavailable', reason: env.reason });
      } else {
        setGroup({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    void loadGroup(dimension);
  }, [dimension, loadGroup]);

  const onSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      const numeric =
        key === 'count' || key === 'errors' || key === 'distinct_users' || key === 'last_seen';
      return { key, dir: numeric ? 'desc' : 'asc' };
    });
  }, []);

  const endpointRows = useMemo<EndpointRowView[]>(
    () => (usage.status === 'ready' ? usage.data.endpoints ?? [] : []),
    [usage],
  );

  const sortedRows = useMemo(() => {
    const rows = [...endpointRows].sort((a, b) => compareRows(a, b, sort.key));
    if (sort.dir === 'desc') rows.reverse();
    return rows;
  }, [endpointRows, sort]);

  const pager = usePagedRows(sortedRows, 25);

  const groupRows = group.status === 'ready' ? group.rows : [];
  const groupPager = usePagedRows(groupRows, 25);

  // Sum of counts — total_requests when the backend provides it, else a
  // client-side sum over rows that carry a real number; '—' when unavailable.
  const requestsCaptured = useMemo<string>(() => {
    if (usage.status !== 'ready') return '—';
    const total = usage.data.total_requests;
    if (isFiniteNum(total)) return total.toLocaleString();
    const nums = endpointRows.filter((r) => isFiniteNum(r.count));
    if (!nums.length) return '—';
    return nums.reduce((acc, r) => acc + (r.count as number), 0).toLocaleString();
  }, [usage, endpointRows]);

  const windowDays =
    usage.status === 'ready' && isFiniteNum(usage.data.window_days)
      ? usage.data.window_days
      : null;

  const dimensionLabel =
    DIMENSIONS.find((d) => d.id === dimension)?.label ?? 'Key';

  /* ------------------------------- render ---------------------------------- */

  return (
    <section aria-label="Endpoint usage" className="space-y-4">
      {/* Header + requests-captured tile */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent-600 dark:text-accent-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Endpoint usage
          </h2>
          {usage.status === 'ready' ? <FreshnessChip meta={usage.data.meta} /> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-baseline gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Requests captured
            </span>
            <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {requestsCaptured}
            </span>
            {windowDays != null ? (
              <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                last {windowDays}d
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              void loadUsage();
              void loadGroup(dimension);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* Whole feed unavailable → explicit panel, never zeroed tables */}
      {usage.status === 'unavailable' ? (
        <DependencyUnavailable
          reason={usage.reason}
          onRetry={() => {
            void loadUsage();
            void loadGroup(dimension);
          }}
        />
      ) : usage.status === 'error' ? (
        <ErrorDisplay error={usage.error} onRetry={() => void loadUsage()} />
      ) : usage.status === 'preparing' ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
          <PreparingState domainLabel="usage telemetry" />
        </div>
      ) : usage.status === 'loading' ? (
        <TableSkeleton rows={8} columns={7} />
      ) : endpointRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <EmptyState
            compact
            title="No usage captured yet"
            description="No requests have been recorded in the telemetry window."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Main sortable endpoint table */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr>
                    <SortHeader label="Method" sortKey="method" sort={sort} onSort={onSort} />
                    <SortHeader label="Path" sortKey="path" sort={sort} onSort={onSort} />
                    <SortHeader label="Module" sortKey="module" sort={sort} onSort={onSort} />
                    <SortHeader label="Count" sortKey="count" sort={sort} onSort={onSort} numeric />
                    <SortHeader label="Errors" sortKey="errors" sort={sort} onSort={onSort} numeric />
                    <SortHeader label="Users" sortKey="distinct_users" sort={sort} onSort={onSort} numeric />
                    <SortHeader label="Last seen" sortKey="last_seen" sort={sort} onSort={onSort} numeric />
                  </tr>
                </thead>
                <tbody>
                  {pager.visible.map((row, i) => {
                    const age = ageSeconds(row.last_seen);
                    const ageLabel = age != null ? formatAge(age) : null;
                    return (
                      <tr
                        key={`${row.method ?? ''}-${row.path ?? i}`}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      >
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <MethodChip method={row.method} />
                        </td>
                        <td
                          className="max-w-[320px] truncate px-3 py-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300"
                          title={row.path ?? undefined}
                        >
                          {displayPath(row) || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 dark:text-slate-400">
                          {row.module || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">
                          {fmtNum(row.count)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                            isFiniteNum(row.errors) && row.errors > 0
                              ? 'font-medium text-red-600 dark:text-red-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {fmtNum(row.errors)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {fmtNum(row.distinct_users)}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400"
                          title={row.last_seen ?? undefined}
                        >
                          {ageLabel ? `${ageLabel} ago` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePager
              page={pager.page}
              totalPages={pager.totalPages}
              total={pager.total}
              onPage={pager.setPage}
            />
          </div>

          {/* Group-by aggregate */}
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <label
                htmlFor="usage-group-by"
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                Group by
              </label>
              <select
                id="usage-group-by"
                value={dimension}
                onChange={(e) => setDimension(e.target.value as DimensionId)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {group.status === 'loading' ? (
              <div className="p-3">
                <TableSkeleton rows={4} columns={3} showHeader={false} />
              </div>
            ) : group.status === 'unavailable' ? (
              <div className="p-3">
                <DependencyUnavailable
                  compact
                  reason={group.reason}
                  onRetry={() => void loadGroup(dimension)}
                />
              </div>
            ) : group.status === 'error' ? (
              <div className="p-4 text-xs text-red-600 dark:text-red-400" role="status">
                Could not load the {dimensionLabel.toLowerCase()} breakdown.
                <button
                  type="button"
                  onClick={() => void loadGroup(dimension)}
                  className="ml-2 rounded font-medium text-accent-600 hover:text-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
                >
                  Retry
                </button>
              </div>
            ) : groupRows.length === 0 ? (
              <EmptyState
                compact
                title="No rows for this grouping"
                description="Nothing has been aggregated for this dimension yet."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          {dimensionLabel}
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          Requests
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          Errors
                        </th>
                        <th
                          scope="col"
                          className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          Endpoints
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupPager.visible.map((row, i) => (
                        <tr
                          key={`${row.key ?? i}`}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                        >
                          <td
                            className="max-w-[180px] truncate px-3 py-1.5 text-slate-700 dark:text-slate-300"
                            title={row.key || undefined}
                          >
                            {row.key || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-200">
                            {fmtNum(row.requests)}
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                              isFiniteNum(row.errors) && row.errors > 0
                                ? 'font-medium text-red-600 dark:text-red-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {fmtNum(row.errors)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                            {fmtNum(row.distinct_endpoints)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={groupPager.page}
                  totalPages={groupPager.totalPages}
                  total={groupPager.total}
                  onPage={groupPager.setPage}
                />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
