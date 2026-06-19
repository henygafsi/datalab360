'use client';

/**
 * PlatformHealthPanel — the Administration hub's "Platform Health" tab.
 *
 * Wires to GET /administration/platform-health (audit-backed; runs on the
 * caller's own connection, so this tab is NOT prod/SVC-gated). Shows:
 *   • a KPI band (calls · error rate · p50/p95/p99 · users · objects · logins),
 *   • four selectable granular sub-views (Top query types / By user / By
 *     warehouse / Top objects), each a compact sortable table,
 *   • filters: time window (1h/24h/7d), an optional server-side user filter, and
 *     a debounced client-side search over the active table's rows,
 *   • "Analyze with AI" — collects KPIs + active table top rows + filters and
 *     POSTs /cortex/complete, rendering the narrative in a dismissible panel.
 *
 * Honest states: loading skeleton; not-deployed (404/501); genuinely-empty
 * (200 but all KPIs null/0 and all tables empty). null → "—" everywhere; never
 * a fabricated 0. No vendor/product names in any visible copy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Boxes,
  Clock,
  Coins,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  HeartPulse,
  KeyRound,
  MemoryStick,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserSearch,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import Pager, { usePagination } from '@/components/ui/Pager';
import { GlassPanel } from '@/app/shared/glass';
import {
  KpiCard,
  FilterChips,
  NotDeployedBanner,
  ErrorRetry,
  AnalyzeAiButton,
  AiAnalysisPanel,
  fmtInt,
  fmtMs,
  fmtPct,
  matchSearch,
  type ChipOption,
  type AiState,
} from '../../admin/performance/components/shared';
import { usePerfFetch } from '../../admin/performance/components/usePerfFetch';
import {
  getPlatformHealth,
  getServerMetricsView,
  type PlatformHealth,
  type ServerMetricsView,
  type TopQueryRow,
  type ByUserRow,
  type ByWarehouseRow,
  type TopObjectRow,
  type FailedLoginDetailRow,
  type AccessByUserRow,
  type StorageByDatabaseRow,
  type TopPolicyRow,
} from '@/app/services/admin-platform-health';
import type { ServerEndpoint, ServerRecentError } from '@/app/services/admin-visibility';

// ── Window + sub-view options ────────────────────────────────────────────────

const HOURS_OPTIONS: ChipOption<string>[] = [
  { id: '1', label: '1h' },
  { id: '24', label: '24h' },
  { id: '168', label: '7d' },
];

// Server-metrics (live in-process counter) sub-views — always populated.
type SmView = 'sm_endpoints' | 'sm_users' | 'sm_errors';
// ACCOUNT_USAGE enrichment sub-views — supplementary, may be unavailable (404).
type UsageView = 'queries' | 'users' | 'warehouses' | 'objects' | 'access' | 'logins' | 'storage' | 'policies';
type View = SmView | UsageView;

const SM_VIEWS: ChipOption<SmView>[] = [
  { id: 'sm_endpoints', label: 'Top endpoints', icon: BarChart3 },
  { id: 'sm_users', label: 'Active users', icon: Users },
  { id: 'sm_errors', label: 'Recent errors', icon: AlertTriangle },
];

const USAGE_VIEWS: ChipOption<UsageView>[] = [
  { id: 'queries', label: 'Top query types', icon: Database },
  { id: 'users', label: 'By user', icon: Users },
  { id: 'warehouses', label: 'By warehouse', icon: Server },
  { id: 'objects', label: 'Top objects accessed', icon: Boxes },
  { id: 'access', label: 'Who accessed what', icon: UserSearch },
  { id: 'logins', label: 'Failed logins', icon: ShieldAlert },
  { id: 'storage', label: 'Storage by database', icon: HardDrive },
  { id: 'policies', label: 'Policies', icon: ShieldCheck },
];

// Combined label lookup for the AI payload / active-view title.
const VIEWS: ChipOption<View>[] = [...SM_VIEWS, ...USAGE_VIEWS];

// ── Local formatters (null → "—") ────────────────────────────────────────────

/** Human-readable bytes (KB/MB/GB/TB), null → "—". Never a fabricated 0. */
function fmtBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(n)) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Compute credits, ~2 decimals, null → "—". Never a fabricated 0. */
function fmtCredits(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Date + time (the window can span days, so a time-only stamp is ambiguous). */
function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/** Compact uptime (d/h/m), null → "—". Never a fabricated 0. */
function fmtUptime(s: number | null | undefined): string {
  if (s == null || Number.isNaN(s)) return '—';
  const sec = Math.max(0, Math.floor(s));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/**
 * Truncate — render a long text cell (paths, object names, error messages) on a
 * single clipped line with the full value as a hover tooltip, so it never pushes
 * the table wider than the panel. null → "—".
 */
function Truncate({ text, max = 'max-w-[220px]' }: { text: string | null | undefined; max?: string }) {
  const v = text || '';
  if (!v) return <>—</>;
  return (
    <span className={cn('block truncate', max)} title={v}>
      {v}
    </span>
  );
}

// ── Generic sortable table ───────────────────────────────────────────────────

interface ColumnDef<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Cell renderer (null → "—" via the fmt* helpers). */
  render: (row: T) => React.ReactNode;
  /** Sort value; null sorts last regardless of direction. */
  sortValue: (row: T) => number | string | null;
}

/** Result of the active-table render — lifted up for the row count + AI payload. */
export interface TableView {
  shown: number;
  total: number;
  /** Top filtered rows as compact one-liners, for the AI prompt. */
  lines: string[];
}

function cmp(a: number | string | null, b: number | string | null, dir: 'asc' | 'desc'): number {
  // nulls always last
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  let d: number;
  if (typeof a === 'number' && typeof b === 'number') d = a - b;
  else d = String(a).localeCompare(String(b));
  return dir === 'asc' ? d : -d;
}

function SortableTable<T>({
  columns,
  rows,
  search,
  searchText,
  emptyLabel,
  rowLine,
  onView,
  initialSortKey,
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  search: string;
  /** Whole-row haystack used for the client-side search. */
  searchText: (row: T) => string;
  emptyLabel: string;
  /** One-line summary of a row for the AI payload. */
  rowLine: (row: T) => string;
  onView: (v: TableView) => void;
  /** Column to sort by on first render / view-switch (default: first column). */
  initialSortKey?: string;
}) {
  const defaultKey = initialSortKey ?? columns[0]?.key ?? '';
  const [sortKey, setSortKey] = useState<string>(defaultKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Reset the sort to the default column whenever the column set changes (i.e.
  // the active sub-view switched) so a stale key from another view never lingers.
  const colKeys = columns.map((c) => c.key).join('|');
  useEffect(() => {
    setSortKey(defaultKey);
    setSortDir('desc');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKeys]);

  const onSort = useCallback(
    (key: string) => {
      setSortKey((prevKey) => {
        if (prevKey === key) {
          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          return prevKey;
        }
        setSortDir('desc');
        return key;
      });
    },
    [],
  );

  const visible = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    const filtered = search.trim()
      ? rows.filter((r) => matchSearch(searchText(r), search))
      : rows;
    const sorted = col
      ? [...filtered].sort((a, b) => cmp(col.sortValue(a), col.sortValue(b), sortDir))
      : filtered;
    return sorted;
  }, [columns, rows, search, searchText, sortKey, sortDir]);

  // Paginate the rendered rows — NO scroll. The AI publish below still uses the
  // full sorted `visible` set (top ~15), independent of the displayed page.
  const { slice, page, setPage, pageCount, total, from, to } = usePagination(visible, 10);

  // Reset to the first page whenever the column set changes (sub-view switch),
  // mirroring the sort reset so a stale page never lingers across views.
  useEffect(() => {
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKeys]);

  // Publish the filtered/sorted view (count + top lines) for the toolbar + AI.
  useEffect(() => {
    onView({
      shown: visible.length,
      total: rows.length,
      lines: visible.slice(0, 15).map(rowLine),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rows.length]);

  if (visible.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-slate-400">
        {search.trim() ? 'No rows match your search.' : emptyLabel}
      </div>
    );
  }

  return (
    <>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-white/30 text-slate-400 dark:border-white/10">
            {columns.map((c) => {
              const active = c.key === sortKey;
              return (
                <th
                  key={c.key}
                  className={cn(
                    'select-none px-3 py-1.5 font-medium uppercase tracking-wide',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={cn(
                      'inline-flex items-center gap-0.5 hover:text-slate-600 dark:hover:text-slate-200',
                      c.align === 'right' && 'flex-row-reverse',
                      active && 'text-slate-700 dark:text-slate-200',
                    )}
                  >
                    {c.label}
                    {active &&
                      (sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {slice.map((row, i) => (
            <tr
              key={i}
              className="border-b border-white/10 last:border-0 hover:bg-white/40 dark:hover:bg-white/5"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3 py-1.5 tabular-nums text-slate-700 dark:text-slate-200',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3">
        <Pager page={page} pageCount={pageCount} total={total} from={from} to={to} onPage={setPage} unit="rows" />
      </div>
    </>
  );
}

// ── Column definitions per sub-view ──────────────────────────────────────────

const QUERY_COLS: ColumnDef<TopQueryRow>[] = [
  { key: 'query_type', label: 'Query type', render: (r) => r.query_type || '—', sortValue: (r) => r.query_type ?? null },
  { key: 'calls', label: 'Calls', align: 'right', render: (r) => fmtInt(r.calls), sortValue: (r) => r.calls },
  { key: 'error_count', label: 'Errors', align: 'right', render: (r) => fmtInt(r.error_count), sortValue: (r) => r.error_count },
  { key: 'avg_latency', label: 'Avg', align: 'right', render: (r) => fmtMs(r.avg_latency), sortValue: (r) => r.avg_latency },
  { key: 'p95_latency', label: 'p95', align: 'right', render: (r) => fmtMs(r.p95_latency), sortValue: (r) => r.p95_latency },
  // Efficiency signals — large scans / queueing / spill flag expensive classes.
  { key: 'bytes_scanned', label: 'Bytes scanned', align: 'right', render: (r) => fmtBytes(r.bytes_scanned), sortValue: (r) => r.bytes_scanned },
  {
    key: 'queued_overload_ms',
    label: 'Queued',
    align: 'right',
    render: (r) => (
      <span className={cn((r.queued_overload_ms ?? 0) > 0 && 'text-amber-600 dark:text-amber-400')}>{fmtMs(r.queued_overload_ms)}</span>
    ),
    sortValue: (r) => r.queued_overload_ms,
  },
  {
    key: 'spill_to_local',
    label: 'Spill',
    align: 'right',
    render: (r) => (
      <span className={cn((r.spill_to_local ?? 0) > 0 && 'text-amber-600 dark:text-amber-400')}>{fmtBytes(r.spill_to_local)}</span>
    ),
    sortValue: (r) => r.spill_to_local,
  },
];

const USER_COLS: ColumnDef<ByUserRow>[] = [
  { key: 'user_name', label: 'User', render: (r) => r.user_name || '—', sortValue: (r) => r.user_name ?? null },
  { key: 'calls', label: 'Calls', align: 'right', render: (r) => fmtInt(r.calls), sortValue: (r) => r.calls },
  { key: 'error_count', label: 'Errors', align: 'right', render: (r) => fmtInt(r.error_count), sortValue: (r) => r.error_count },
  {
    key: 'error_rate',
    label: 'Err rate',
    align: 'right',
    render: (r) => (
      <span className={cn((r.error_rate ?? 0) > 5 && 'text-red-600 dark:text-red-400')}>{fmtPct(r.error_rate, 2)}</span>
    ),
    sortValue: (r) => r.error_rate,
  },
  { key: 'avg_latency', label: 'Avg', align: 'right', render: (r) => fmtMs(r.avg_latency), sortValue: (r) => r.avg_latency },
  { key: 'p95_latency', label: 'p95', align: 'right', render: (r) => fmtMs(r.p95_latency), sortValue: (r) => r.p95_latency },
];

const WAREHOUSE_COLS: ColumnDef<ByWarehouseRow>[] = [
  { key: 'warehouse_name', label: 'Warehouse', render: (r) => r.warehouse_name || '—', sortValue: (r) => r.warehouse_name ?? null },
  { key: 'calls', label: 'Calls', align: 'right', render: (r) => fmtInt(r.calls), sortValue: (r) => r.calls },
  { key: 'error_count', label: 'Errors', align: 'right', render: (r) => fmtInt(r.error_count), sortValue: (r) => r.error_count },
  {
    key: 'error_rate',
    label: 'Err rate',
    align: 'right',
    render: (r) => (
      <span className={cn((r.error_rate ?? 0) > 5 && 'text-red-600 dark:text-red-400')}>{fmtPct(r.error_rate, 2)}</span>
    ),
    sortValue: (r) => r.error_rate,
  },
  { key: 'avg_latency', label: 'Avg', align: 'right', render: (r) => fmtMs(r.avg_latency), sortValue: (r) => r.avg_latency },
  { key: 'p95_latency', label: 'p95', align: 'right', render: (r) => fmtMs(r.p95_latency), sortValue: (r) => r.p95_latency },
  // Cost-per-warehouse driver — total credits, with compute/cloud split on hover.
  {
    key: 'credits_used',
    label: 'Credits',
    align: 'right',
    render: (r) => (
      <span
        title={`compute ${fmtCredits(r.credits_compute)} · cloud services ${fmtCredits(r.credits_cloud)}`}
        className={cn((r.credits_used ?? 0) > 0 && 'font-medium text-slate-800 dark:text-slate-100')}
      >
        {fmtCredits(r.credits_used)}
      </span>
    ),
    sortValue: (r) => r.credits_used,
  },
];

const STORAGE_COLS: ColumnDef<StorageByDatabaseRow>[] = [
  { key: 'database', label: 'Database', render: (r) => <Truncate text={r.database} />, sortValue: (r) => r.database ?? null },
  { key: 'bytes', label: 'Storage', align: 'right', render: (r) => fmtBytes(r.bytes), sortValue: (r) => r.bytes },
];

const POLICY_COLS: ColumnDef<TopPolicyRow>[] = [
  { key: 'policy_name', label: 'Policy', render: (r) => <Truncate text={r.policy_name} />, sortValue: (r) => r.policy_name ?? null },
  { key: 'policy_kind', label: 'Kind', render: (r) => r.policy_kind || '—', sortValue: (r) => r.policy_kind ?? null },
  { key: 'ref_count', label: 'References', align: 'right', render: (r) => fmtInt(r.ref_count), sortValue: (r) => r.ref_count },
];

const OBJECT_COLS: ColumnDef<TopObjectRow>[] = [
  { key: 'object_name', label: 'Object', render: (r) => <Truncate text={r.object_name} />, sortValue: (r) => r.object_name ?? null },
  { key: 'object_type', label: 'Type', render: (r) => r.object_type || '—', sortValue: (r) => r.object_type ?? null },
  { key: 'access_count', label: 'Accesses', align: 'right', render: (r) => fmtInt(r.access_count), sortValue: (r) => r.access_count },
  { key: 'distinct_users', label: 'Users', align: 'right', render: (r) => fmtInt(r.distinct_users), sortValue: (r) => r.distinct_users },
];

// "Who accessed what" — user-grain access records (complements Top objects).
const ACCESS_COLS: ColumnDef<AccessByUserRow>[] = [
  { key: 'object_name', label: 'Object', render: (r) => <Truncate text={r.object_name} />, sortValue: (r) => r.object_name ?? null },
  { key: 'object_type', label: 'Type', render: (r) => r.object_type || '—', sortValue: (r) => r.object_type ?? null },
  { key: 'user_name', label: 'User', render: (r) => r.user_name || '—', sortValue: (r) => r.user_name ?? null },
  { key: 'access_count', label: 'Accesses', align: 'right', render: (r) => fmtInt(r.access_count), sortValue: (r) => r.access_count },
  { key: 'last_seen', label: 'Last seen', align: 'right', render: (r) => fmtDateTime(r.last_seen), sortValue: (r) => r.last_seen ?? null },
];

// "Failed logins" — brute-force / credential-stuffing feed, ordered by attempts.
const FAILED_LOGIN_COLS: ColumnDef<FailedLoginDetailRow>[] = [
  { key: 'user_name', label: 'User', render: (r) => r.user_name || '—', sortValue: (r) => r.user_name ?? null },
  { key: 'client_ip', label: 'IP', render: (r) => r.client_ip || '—', sortValue: (r) => r.client_ip ?? null },
  { key: 'reported_client_type', label: 'Client', render: (r) => r.reported_client_type || '—', sortValue: (r) => r.reported_client_type ?? null },
  { key: 'error_message', label: 'Error', render: (r) => <Truncate text={r.error_message} max="max-w-[260px]" />, sortValue: (r) => r.error_message ?? null },
  {
    key: 'attempts',
    label: 'Attempts',
    align: 'right',
    render: (r) => {
      const high = (r.attempts ?? 0) >= 5;
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 tabular-nums',
            high && 'font-semibold text-red-600 dark:text-red-400',
          )}
        >
          {high && <ShieldAlert className="h-3 w-3" aria-label="High attempt count" />}
          {fmtInt(r.attempts)}
        </span>
      );
    },
    sortValue: (r) => r.attempts,
  },
  { key: 'last_seen', label: 'Last seen', align: 'right', render: (r) => fmtDateTime(r.last_seen), sortValue: (r) => r.last_seen ?? null },
];

// ── Server-metrics tables (live in-process counter — primary source) ─────────

interface ActiveUserRow {
  username: string;
  requests: number;
}

const SM_ENDPOINT_COLS: ColumnDef<ServerEndpoint>[] = [
  { key: 'method', label: 'Method', render: (r) => r.method || '—', sortValue: (r) => r.method ?? null },
  { key: 'path', label: 'Path', render: (r) => <Truncate text={r.path} max="max-w-[260px]" />, sortValue: (r) => r.path ?? null },
  { key: 'requests', label: 'Requests', align: 'right', render: (r) => fmtInt(r.requests), sortValue: (r) => r.requests },
  {
    key: 'errors',
    label: 'Errors',
    align: 'right',
    render: (r) => <span className={cn((r.errors ?? 0) > 0 && 'text-red-600 dark:text-red-400')}>{fmtInt(r.errors)}</span>,
    sortValue: (r) => r.errors,
  },
  { key: 'avg_ms', label: 'Avg', align: 'right', render: (r) => fmtMs(r.avg_ms), sortValue: (r) => r.avg_ms },
  { key: 'max_ms', label: 'Max', align: 'right', render: (r) => fmtMs(r.max_ms), sortValue: (r) => r.max_ms },
  { key: 'distinct_users', label: 'Users', align: 'right', render: (r) => fmtInt(r.distinct_users), sortValue: (r) => r.distinct_users },
];

const SM_ACTIVE_USER_COLS: ColumnDef<ActiveUserRow>[] = [
  { key: 'username', label: 'User', render: (r) => r.username || '—', sortValue: (r) => r.username ?? null },
  { key: 'requests', label: 'Requests', align: 'right', render: (r) => fmtInt(r.requests), sortValue: (r) => r.requests },
];

const SM_RECENT_ERROR_COLS: ColumnDef<ServerRecentError>[] = [
  {
    key: 'status',
    label: 'Status',
    align: 'right',
    render: (r) => {
      const s = r.status ?? 0;
      return (
        <span className={cn('tabular-nums font-medium', s >= 500 ? 'text-red-600 dark:text-red-400' : s >= 400 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300')}>
          {r.status ?? '—'}
        </span>
      );
    },
    sortValue: (r) => r.status,
  },
  { key: 'method', label: 'Method', render: (r) => r.method || '—', sortValue: (r) => r.method ?? null },
  { key: 'path', label: 'Path', render: (r) => <Truncate text={r.path} max="max-w-[260px]" />, sortValue: (r) => r.path ?? null },
  { key: 'username', label: 'User', render: (r) => r.username || '—', sortValue: (r) => r.username ?? null },
  { key: 'ms', label: 'Duration', align: 'right', render: (r) => fmtMs(r.ms), sortValue: (r) => r.ms },
  { key: 'ts', label: 'When', align: 'right', render: (r) => fmtDateTime(r.ts), sortValue: (r) => r.ts ?? null },
];

const smEndpointLine = (r: ServerEndpoint) =>
  `${r.method} ${r.path}: ${fmtInt(r.requests)} reqs, ${fmtInt(r.errors)} errors, avg ${fmtMs(r.avg_ms)}, max ${fmtMs(r.max_ms)}, ${fmtInt(r.distinct_users)} users`;
const smActiveUserLine = (r: ActiveUserRow) => `${r.username}: ${fmtInt(r.requests)} requests`;
const smRecentErrorLine = (r: ServerRecentError) =>
  `${r.status} ${r.method} ${r.path} by ${r.username} — ${fmtMs(r.ms)}, ${fmtDateTime(r.ts)}`;

// Row-line builders for the AI payload (one compact line per row).
const queryLine = (r: TopQueryRow) =>
  `${r.query_type}: ${fmtInt(r.calls)} calls, ${fmtInt(r.error_count)} errors, avg ${fmtMs(r.avg_latency)}, p95 ${fmtMs(r.p95_latency)}, scanned ${fmtBytes(r.bytes_scanned)}, queued ${fmtMs(r.queued_overload_ms)}, spill ${fmtBytes(r.spill_to_local)}`;
const userLine = (r: ByUserRow) =>
  `${r.user_name}: ${fmtInt(r.calls)} calls, err ${fmtPct(r.error_rate, 2)} (${fmtInt(r.error_count)}), avg ${fmtMs(r.avg_latency)}, p95 ${fmtMs(r.p95_latency)}`;
const warehouseLine = (r: ByWarehouseRow) =>
  `${r.warehouse_name}: ${fmtInt(r.calls)} calls, err ${fmtPct(r.error_rate, 2)} (${fmtInt(r.error_count)}), avg ${fmtMs(r.avg_latency)}, p95 ${fmtMs(r.p95_latency)}, credits ${fmtCredits(r.credits_used)} (compute ${fmtCredits(r.credits_compute)}, cloud ${fmtCredits(r.credits_cloud)})`;
const storageLine = (r: StorageByDatabaseRow) => `${r.database}: ${fmtBytes(r.bytes)}`;
const policyLine = (r: TopPolicyRow) =>
  `${r.policy_name} (${r.policy_kind}): ${fmtInt(r.ref_count)} references`;
const objectLine = (r: TopObjectRow) =>
  `${r.object_name} (${r.object_type}): ${fmtInt(r.access_count)} accesses, ${fmtInt(r.distinct_users)} users`;
const accessLine = (r: AccessByUserRow) =>
  `${r.user_name} → ${r.object_name} (${r.object_type}): ${fmtInt(r.access_count)} accesses, last ${fmtDateTime(r.last_seen)}`;
const failedLoginLine = (r: FailedLoginDetailRow) =>
  `${r.user_name} from ${r.client_ip} (${r.reported_client_type}): ${fmtInt(r.attempts)} failed attempts — "${r.error_message}", last ${fmtDateTime(r.last_seen)}`;

// ── Emptiness check (no-fake-0 crux) ─────────────────────────────────────────

/** True when a 200 response carries no real activity at all. */
function isGenuinelyEmpty(d: PlatformHealth): boolean {
  const k = d.kpis;
  const numericFields = [
    k.calls,
    k.error_rate,
    k.p50,
    k.p95,
    k.p99,
    k.distinct_users,
    k.distinct_objects,
    k.logins,
    k.failed_logins,
  ];
  const allKpisBlank =
    numericFields.every((v) => v == null || v === 0) &&
    // Native-metadata KPIs (credits / storage / policy counts) are current-state,
    // not window-scoped — a response carrying only these must still count as data.
    (k.total_credits == null || k.total_credits === 0) &&
    (d.storage?.total_bytes == null || d.storage.total_bytes === 0) &&
    (d.policy_coverage?.masking_policies == null || d.policy_coverage.masking_policies === 0) &&
    (d.policy_coverage?.row_access_policies == null || d.policy_coverage.row_access_policies === 0) &&
    (d.policy_coverage?.tagged_objects == null || d.policy_coverage.tagged_objects === 0);
  const allTablesEmpty =
    (d.top_queries?.length ?? 0) === 0 &&
    (d.by_user?.length ?? 0) === 0 &&
    (d.by_warehouse?.length ?? 0) === 0 &&
    (d.top_objects?.length ?? 0) === 0 &&
    (d.access_by_user?.length ?? 0) === 0 &&
    // A window with ONLY failed logins is exactly the brute-force signal we want
    // to surface — it must not be classified empty and hidden.
    (d.failed_login_detail?.length ?? 0) === 0 &&
    (d.storage?.by_database?.length ?? 0) === 0 &&
    (d.policy_coverage?.top_policies?.length ?? 0) === 0;
  return allKpisBlank && allTablesEmpty;
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function PlatformHealthPanel() {
  const [hours, setHours] = useState(24);
  const [userInput, setUserInput] = useState(''); // raw user-filter text box
  const [userFilter, setUserFilter] = useState(''); // debounced → server param
  const [view, setView] = useState<View>('sm_endpoints');
  const [search, setSearch] = useState(''); // raw search box
  const [debouncedSearch, setDebouncedSearch] = useState(''); // client-side row filter

  // Lifted view of the active table (row count + AI top-lines).
  const [tableView, setTableView] = useState<TableView>({ shown: 0, total: 0, lines: [] });
  const tableViewRef = useRef(tableView);
  tableViewRef.current = tableView;

  // AI narrative analysis (dismissible docked panel).
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiText, setAiText] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);

  // Debounce the server-side user filter (re-fetches) — 400ms.
  useEffect(() => {
    const t = setTimeout(() => setUserFilter(userInput.trim()), 400);
    return () => clearTimeout(t);
  }, [userInput]);

  // Debounce the client-side row search (no fetch) — 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset the per-view table state when the active sub-view changes.
  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
    setTableView({ shown: 0, total: 0, lines: [] });
  }, [view]);

  // PRIMARY source — live in-process server metrics. Always populated locally and
  // in prod (uptime-cumulative, window-independent), so the band + the three
  // server-metrics tables never blank out.
  const sm = usePerfFetch<ServerMetricsView>(() => getServerMetricsView(), []);

  // SUPPLEMENTARY enrichment — ACCOUNT_USAGE history (query types, objects,
  // logins, who-accessed, failed-login feed). A 404 (route not deployed) must NOT
  // blank the page; it only hides the usage-history sub-views.
  const health = usePerfFetch<PlatformHealth>(
    () => getPlatformHealth({ hours, user: userFilter || undefined }),
    [hours, userFilter],
  );

  const metrics = sm.data;
  const data = health.data;
  const k = data?.kpis;
  const usageEmpty = useMemo(() => (data ? isGenuinelyEmpty(data) : false), [data]);
  // The usage-history enrichment is pending whenever its route is down (404) or
  // returns a genuinely-empty window — surfaced as a small inline note, never the
  // whole-page state.
  const usagePending = health.state === 'not-deployed' || health.state === 'error' || usageEmpty;
  const usageReady = health.state === 'done' && !usageEmpty;
  const smUnavailable = sm.state === 'not-deployed' || sm.state === 'error';

  // When the live server-metrics route is unavailable but usage history is, switch
  // the default sub-view off the (empty) live views onto a usage view so the table
  // shows real rows instead of an empty live table.
  useEffect(() => {
    if (smUnavailable && (view === 'sm_endpoints' || view === 'sm_users' || view === 'sm_errors')) {
      setView('queries');
    }
  }, [smUnavailable, view]);

  const onView = useCallback((v: TableView) => setTableView(v), []);

  // ── Analyze with AI — same primitive as the Performance page.
  const runAiAnalysis = useCallback(async () => {
    if (!metrics && !data) return;
    setAiState('loading');
    setAiError(null);
    setAiText('');
    const v = tableViewRef.current;
    const winLabel = hours === 1 ? '1 hour' : hours === 168 ? '7 days' : `${hours} hours`;
    const viewLabel = VIEWS.find((x) => x.id === view)?.label ?? view;
    const filters = [
      userFilter ? `user "${userFilter}"` : null,
      debouncedSearch ? `search "${debouncedSearch}"` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'none';
    // PRIMARY KPIs come from the live server-metrics counter (always populated);
    // the usage-history KPIs are appended as supplementary enrichment when present.
    const liveLines = metrics
      ? [
          `Requests/min: ${fmtInt(metrics.requests_per_min)} (total ${fmtInt(metrics.total_requests)})`,
          `Error rate: ${fmtPct(metrics.error_rate_pct, 2)} (${fmtInt(metrics.error_count)} errors)`,
          `Latency avg/p50/p90/p99: ${fmtMs(metrics.latency.avg_ms)} / ${fmtMs(metrics.latency.p50_ms)} / ${fmtMs(metrics.latency.p90_ms)} / ${fmtMs(metrics.latency.p99_ms)}`,
          `Distinct active users: ${fmtInt(metrics.active_users.length)}`,
          `Uptime: ${fmtUptime(metrics.uptime_seconds)} · Memory: ${fmtBytes(metrics.memory_rss_mb * 1024 * 1024)} · CPU load: ${metrics.cpu_load?.toFixed?.(2) ?? '—'}/${fmtInt(metrics.cpu_count)}`,
        ]
      : [];
    const usageLines = k
      ? [
          `Usage calls: ${fmtInt(k.calls)}`,
          `Usage error rate: ${fmtPct(k.error_rate, 2)}`,
          `Usage latency p50/p95/p99: ${fmtMs(k.p50)} / ${fmtMs(k.p95)} / ${fmtMs(k.p99)}`,
          `Distinct objects: ${fmtInt(k.distinct_objects)}`,
          `Logins: ${fmtInt(k.logins)} (failed ${fmtInt(k.failed_logins)})`,
          `Compute credits: ${fmtCredits(k.total_credits)}`,
          `Storage total: ${fmtBytes(data?.storage?.total_bytes)} (active ${fmtBytes(data?.storage?.active_bytes)}, historical ${fmtBytes(data?.storage?.time_travel_bytes)}, reserve ${fmtBytes(data?.storage?.failsafe_bytes)})`,
          `Policy coverage: ${fmtInt(data?.policy_coverage?.masking_policies)} masking, ${fmtInt(data?.policy_coverage?.row_access_policies)} row-access, ${fmtInt(data?.policy_coverage?.tagged_objects)} tagged objects`,
        ]
      : ['(usage-history enrichment unavailable)'];
    const kpiLines = [...liveLines, ...usageLines];
    const prompt = [
      'You are a platform health analyst. Write a concise, plain-language analysis (3–5 short bullet points) of the platform-health telemetry below.',
      'Call out latency, error-rate, failed-login and access outliers, likely causes, and one concrete next step. Do not mention internal vendor or product names.',
      '',
      `Window: ${winLabel}`,
      `Active view: ${viewLabel}`,
      `Active filters: ${filters}`,
      '',
      'KPIs:',
      ...kpiLines.map((l) => `- ${l}`),
      '',
      `Top rows (${viewLabel}) — ${v.shown} of ${v.total} shown:`,
      ...(v.lines.length ? v.lines.map((l, i) => `${i + 1}. ${l}`) : ['(no rows in this view)']),
    ].join('\n');

    try {
      const { data: res } = await apiClient.post(API.cortex.complete(), {
        prompt,
        model: 'mistral-large2',
      });
      const inner = res?.data ?? res;
      const text: string = inner?.response ?? inner?.completion ?? '';
      setAiText(text);
      setAiState('done');
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 404 || status === 501) {
        setAiState('unavailable');
      } else {
        setAiError(getApiErrorMessage(e));
        setAiState('error');
      }
    }
  }, [metrics, data, k, hours, view, userFilter, debouncedSearch]);

  // ── Active table render (typed per view) ──────────────────────────────────
  const activeTable = useMemo(() => {
    // Server-metrics sub-views render from the live counter (no usage dependency).
    if (view === 'sm_endpoints' || view === 'sm_users' || view === 'sm_errors') {
      switch (view) {
        case 'sm_endpoints':
          return (
            <SortableTable
              columns={SM_ENDPOINT_COLS}
              rows={metrics?.top_endpoints ?? []}
              search={debouncedSearch}
              searchText={(r) => `${r.method} ${r.path}`}
              rowLine={smEndpointLine}
              initialSortKey="requests"
              emptyLabel="No endpoint activity recorded yet."
              onView={onView}
            />
          );
        case 'sm_users':
          return (
            <SortableTable
              columns={SM_ACTIVE_USER_COLS}
              rows={metrics?.active_users ?? []}
              search={debouncedSearch}
              searchText={(r) => r.username}
              rowLine={smActiveUserLine}
              initialSortKey="requests"
              emptyLabel="No active users recorded yet."
              onView={onView}
            />
          );
        case 'sm_errors':
          return (
            <SortableTable
              columns={SM_RECENT_ERROR_COLS}
              rows={metrics?.recent_errors ?? []}
              search={debouncedSearch}
              searchText={(r) => `${r.status} ${r.method} ${r.path} ${r.username}`}
              rowLine={smRecentErrorLine}
              initialSortKey="ts"
              emptyLabel="No recent errors — nothing to show."
              onView={onView}
            />
          );
      }
    }
    if (!data) return null;
    switch (view) {
      case 'queries':
        return (
          <SortableTable
            columns={QUERY_COLS}
            rows={data.top_queries ?? []}
            search={debouncedSearch}
            searchText={(r) => r.query_type ?? ''}
            rowLine={queryLine}
            emptyLabel="No query activity in this window."
            onView={onView}
          />
        );
      case 'users':
        return (
          <SortableTable
            columns={USER_COLS}
            rows={data.by_user ?? []}
            search={debouncedSearch}
            searchText={(r) => r.user_name ?? ''}
            rowLine={userLine}
            emptyLabel="No per-user activity in this window."
            onView={onView}
          />
        );
      case 'warehouses':
        return (
          <SortableTable
            columns={WAREHOUSE_COLS}
            rows={data.by_warehouse ?? []}
            search={debouncedSearch}
            searchText={(r) => r.warehouse_name ?? ''}
            rowLine={warehouseLine}
            emptyLabel="No compute activity in this window."
            onView={onView}
          />
        );
      case 'objects':
        return (
          <SortableTable
            columns={OBJECT_COLS}
            rows={data.top_objects ?? []}
            search={debouncedSearch}
            searchText={(r) => `${r.object_name ?? ''} ${r.object_type ?? ''}`}
            rowLine={objectLine}
            emptyLabel="No object access in this window."
            onView={onView}
          />
        );
      case 'access':
        return (
          <SortableTable
            columns={ACCESS_COLS}
            rows={data.access_by_user ?? []}
            search={debouncedSearch}
            searchText={(r) => `${r.user_name ?? ''} ${r.object_name ?? ''} ${r.object_type ?? ''}`}
            rowLine={accessLine}
            initialSortKey="access_count"
            emptyLabel="No user-grain access in this window."
            onView={onView}
          />
        );
      case 'logins':
        return (
          <SortableTable
            columns={FAILED_LOGIN_COLS}
            rows={data.failed_login_detail ?? []}
            search={debouncedSearch}
            searchText={(r) => `${r.user_name ?? ''} ${r.client_ip ?? ''} ${r.reported_client_type ?? ''} ${r.error_message ?? ''}`}
            rowLine={failedLoginLine}
            initialSortKey="attempts"
            emptyLabel="No failed logins in this window."
            onView={onView}
          />
        );
      case 'storage':
        return (
          <SortableTable
            columns={STORAGE_COLS}
            rows={data.storage?.by_database ?? []}
            search={debouncedSearch}
            searchText={(r) => r.database ?? ''}
            rowLine={storageLine}
            initialSortKey="bytes"
            emptyLabel="No storage metadata available."
            onView={onView}
          />
        );
      case 'policies':
        return (
          <SortableTable
            columns={POLICY_COLS}
            rows={data.policy_coverage?.top_policies ?? []}
            search={debouncedSearch}
            searchText={(r) => `${r.policy_name ?? ''} ${r.policy_kind ?? ''}`}
            rowLine={policyLine}
            initialSortKey="ref_count"
            emptyLabel="No governance policies found."
            onView={onView}
          />
        );
      default:
        return null;
    }
  }, [metrics, data, view, debouncedSearch, onView]);

  const filtered = debouncedSearch.trim() !== '';
  const isSmView = view === 'sm_endpoints' || view === 'sm_users' || view === 'sm_errors';

  return (
    <div className="space-y-3">
      {/* Header: title + window + user filter + refresh + AI */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <HeartPulse className="h-4 w-4 text-[hsl(var(--primary))]" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Platform Health</h2>
          </div>
          <FilterChips options={HOURS_OPTIONS} value={String(hours)} onChange={(v) => setHours(Number(v))} size="sm" />
          <div className="relative">
            <Users className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Filter by user…"
              aria-label="Filter by user"
              className="w-40 rounded-md border border-slate-200 bg-white/70 py-1 pl-7 pr-7 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            {userInput && (
              <button
                type="button"
                onClick={() => setUserInput('')}
                aria-label="Clear user filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sm.reload();
              health.reload();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          {(metrics || usageReady) && <AnalyzeAiButton onClick={runAiAnalysis} state={aiState} />}
        </div>
      </div>

      {/*
        States — the live server-metrics counter is the PRIMARY source and is
        always populated, so the page never blanks on the platform-health 404.
        Skeleton shows only while BOTH fetches are still pending; once metrics
        arrive the band + tables render. We fall back to a settled empty/error
        state only when server-metrics itself is unavailable AND usage has no data.
      */}
      {!metrics && !data ? (
        sm.state === 'error' && health.state === 'error' ? (
          <GlassPanel depth={1} radius="xl" className="overflow-hidden">
            <ErrorRetry
              message={sm.error ?? health.error ?? 'Failed to load platform health.'}
              onRetry={() => {
                sm.reload();
                health.reload();
              }}
            />
          </GlassPanel>
        ) : sm.state === 'not-deployed' && (health.state === 'not-deployed' || health.state === 'error') ? (
          <GlassPanel depth={1} radius="xl" className="overflow-hidden">
            <NotDeployedBanner what="The Platform Health endpoints" />
          </GlassPanel>
        ) : (sm.state === 'done' || sm.state === 'not-deployed' || sm.state === 'error') &&
          (health.state === 'done' || health.state === 'not-deployed' || health.state === 'error') ? (
          <GlassPanel depth={1} radius="xl" className="px-3 py-8 text-center">
            <Activity className="mx-auto mb-2 h-5 w-5 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">No platform telemetry available</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Neither live server metrics nor usage history returned data.</p>
          </GlassPanel>
        ) : (
          <KpiSkeleton />
        )
      ) : (
        <>
          {/* PRIMARY KPI band — live in-process server metrics. Always populated;
              real value or "—", never a fabricated 0. If the live counter route is
              itself unavailable (server-metrics 404) but usage history has data, we
              fall back to the usage-history KPI band so the band is still never
              empty (requirement 3 / no-empty-KPI goal). */}
          {metrics ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <KpiCard
                label="Requests / min"
                icon={Activity}
                value={fmtInt(metrics.requests_per_min)}
                source="live"
                help={{ definition: 'Live request rate from the in-process server counter (a rate, not filtered by the selected window).' }}
              />
              <KpiCard
                label="Avg response"
                icon={Timer}
                value={fmtMs(metrics.latency.avg_ms)}
                sub={`p50 ${fmtMs(metrics.latency.p50_ms)} · p90 ${fmtMs(metrics.latency.p90_ms)} · p99 ${fmtMs(metrics.latency.p99_ms)}`}
                source="live"
                help={{ definition: 'Mean server response time; sub-line shows the percentile spread.', goodRange: '< 500 ms p90' }}
              />
              <KpiCard
                label="Error rate"
                icon={AlertTriangle}
                tint={(metrics.error_rate_pct ?? 0) > 5 ? 'text-red-600 dark:text-red-400' : undefined}
                value={fmtPct(metrics.error_rate_pct, 2)}
                sub={metrics.error_count != null ? `${fmtInt(metrics.error_count)} errors` : undefined}
                source="live"
                help={{ definition: 'Share of requests that returned an error.', goodRange: '< 1%' }}
              />
              <KpiCard
                label="Distinct users"
                icon={Users}
                value={fmtInt(metrics.active_users.length)}
                source="live"
                help={{ definition: 'Number of users seen in the live request counter.' }}
              />
              <KpiCard
                label="Total requests"
                icon={Zap}
                value={fmtInt(metrics.total_requests)}
                source="live"
                help={{ definition: 'Total requests served since the server process started.' }}
              />
              <KpiCard
                label="Error count"
                icon={ShieldAlert}
                tint={(metrics.error_count ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
                value={fmtInt(metrics.error_count)}
                source="live"
                help={{ definition: 'Total errored requests since the server process started.' }}
              />
              <KpiCard
                label="Uptime"
                icon={Clock}
                value={fmtUptime(metrics.uptime_seconds)}
                source="live"
                help={{ definition: 'Time elapsed since the server process started.' }}
              />
              <KpiCard
                label="Memory"
                icon={MemoryStick}
                value={metrics.memory_rss_mb != null ? fmtBytes(metrics.memory_rss_mb * 1024 * 1024) : '—'}
                source="live"
                help={{ definition: 'Resident set size of the server process.' }}
              />
              <KpiCard
                label="CPU load"
                icon={Cpu}
                tint={
                  metrics.cpu_count > 0 && metrics.cpu_load / metrics.cpu_count >= 1
                    ? 'text-red-600 dark:text-red-400'
                    : undefined
                }
                value={metrics.cpu_load != null ? metrics.cpu_load.toFixed(2) : '—'}
                sub={metrics.cpu_count != null ? `${fmtInt(metrics.cpu_count)} cores` : undefined}
                source="live"
                help={{ definition: '1-minute load average; sub-line shows core count.', goodRange: '< core count' }}
              />
            </div>
          ) : (
            /* Fallback band — usage-history KPIs when the live counter is unavailable. */
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard
                label="Calls"
                icon={Activity}
                value={fmtInt(k?.calls)}
                source="usage-history"
                help={{ definition: 'Total requests recorded in the selected window.' }}
              />
              <KpiCard
                label="Error rate"
                icon={AlertTriangle}
                tint={(k?.error_rate ?? 0) > 5 ? 'text-red-600 dark:text-red-400' : undefined}
                value={fmtPct(k?.error_rate, 2)}
                source="usage-history"
                help={{ definition: 'Share of requests that failed.', goodRange: '< 1%' }}
              />
              <KpiCard
                label="Latency"
                icon={Timer}
                value={fmtMs(k?.p95)}
                sub={`p50 ${fmtMs(k?.p50)} · p95 ${fmtMs(k?.p95)} · p99 ${fmtMs(k?.p99)}`}
                source="usage-history"
                help={{ definition: 'Headline value is p95; sub-line shows the full percentile spread.', goodRange: '< 500 ms p95' }}
              />
              <KpiCard
                label="Distinct users"
                icon={Users}
                value={fmtInt(k?.distinct_users)}
                source="usage-history"
                help={{ definition: 'Unique users active in the window.' }}
              />
              <KpiCard
                label="Distinct objects"
                icon={Boxes}
                value={fmtInt(k?.distinct_objects)}
                source="usage-history"
                help={{ definition: 'Unique data objects accessed in the window.' }}
              />
              <KpiCard
                label="Logins"
                icon={KeyRound}
                tint={(k?.failed_logins ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
                value={fmtInt(k?.logins)}
                sub={`${fmtInt(k?.failed_logins)} failed`}
                source="usage-history"
                help={{ definition: 'Successful sign-ins; sub-line shows failed attempts.', goodRange: 'few failures' }}
              />
            </div>
          )}

          {/* Native-metadata band — cost (credits) · storage · governance. Renders
              only when the usage-history enrichment returned (usageReady); each
              value is a real figure or "—", never a fabricated 0. Sits alongside
              the live band above, regardless of whether the live counter is up. */}
          {usageReady && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <KpiCard
                label="Compute credits"
                icon={Coins}
                value={fmtCredits(k?.total_credits)}
                source="usage-history"
                help={{ definition: 'Total compute credits consumed across all warehouses in the selected window.' }}
              />
              <KpiCard
                label="Storage"
                icon={HardDrive}
                value={fmtBytes(data?.storage?.total_bytes)}
                sub={
                  data?.storage
                    ? `active ${fmtBytes(data.storage.active_bytes)} · historical ${fmtBytes(data.storage.time_travel_bytes)} · reserve ${fmtBytes(data.storage.failsafe_bytes)}`
                    : undefined
                }
                source="usage-history"
                help={{ definition: 'Total bytes stored across all databases; the sub-line splits live data from the historical and recovery reserve held for point-in-time restore and disaster recovery.' }}
              />
              <KpiCard
                label="Masking policies"
                icon={ShieldCheck}
                value={fmtInt(data?.policy_coverage?.masking_policies)}
                source="usage-history"
                help={{ definition: 'Column-masking policies defined in the account (governance coverage).' }}
              />
              <KpiCard
                label="Row-access policies"
                icon={ShieldCheck}
                value={fmtInt(data?.policy_coverage?.row_access_policies)}
                source="usage-history"
                help={{ definition: 'Row-access policies defined in the account (governance coverage).' }}
              />
              <KpiCard
                label="Tagged objects"
                icon={ShieldCheck}
                value={fmtInt(data?.policy_coverage?.tagged_objects)}
                source="usage-history"
                help={{ definition: 'Objects carrying at least one governance tag.' }}
              />
            </div>
          )}

          {/* Sub-view switcher — live server-metrics views first (always available),
              then the usage-history enrichment views. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              <Gauge className="h-3 w-3" /> Live
            </span>
            <FilterChips options={SM_VIEWS} value={view} onChange={setView} />
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              <Database className="h-3 w-3" /> Usage history
            </span>
            <FilterChips options={USAGE_VIEWS} value={view} onChange={setView} />
          </div>

          {/* AI narrative — dismissible docked panel */}
          <AiAnalysisPanel state={aiState} text={aiText} error={aiError} onClose={() => setAiState('idle')} />

          {/* Inline note when the usage-history enrichment route isn't live yet —
              non-blocking: the live band + tables above still show real data. */}
          {!isSmView && usagePending && (
            <GlassPanel depth={1} radius="xl" className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 shrink-0" />
                {health.state === 'not-deployed' || health.state === 'error'
                  ? 'Usage-history enrichment (query types, objects, logins) is pending — the live server metrics above are unaffected.'
                  : 'No usage-history activity in this window — try a wider window or clear the user filter. Live server metrics above are unaffected.'}
              </span>
            </GlassPanel>
          )}

          {/* Active sub-view table + client-side search toolbar.
              Usage-history views with no data fall back to their own empty label. */}
          {(isSmView || usageReady) && (
            <GlassPanel depth={1} radius="xl" className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
                <div className="relative min-w-[160px] flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search rows…"
                    aria-label="Search rows"
                    className="w-full rounded-md border border-slate-200 bg-white/70 py-1 pl-7 pr-7 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-[10px] tabular-nums',
                    filtered ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400',
                  )}
                >
                  {filtered
                    ? `${fmtInt(tableView.shown)} of ${fmtInt(tableView.total)}`
                    : `${fmtInt(tableView.total)} rows`}
                </span>
              </div>
              {activeTable}
            </GlassPanel>
          )}

          <p className="px-1 text-[10px] text-slate-400">
            {isSmView
              ? 'Live server metrics — figures are cumulative since the server process started and are not filtered by the selected time window.'
              : 'Usage history — audit-backed figures over the selected window, recorded on your own connection.'}
          </p>
        </>
      )}
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 9 }).map((_, i) => (
        <GlassPanel key={i} depth={1} radius="xl" className="flex flex-col gap-2 p-3.5">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
          <div className="h-6 w-16 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
        </GlassPanel>
      ))}
    </div>
  );
}
