'use client';

/**
 * Data360 Configuration — the platform's data-config surface.
 *
 * Scoped to its actual mandate (the nav card promise): metadata · tables ·
 * date columns · refresh · cache & TTL. Two genuine config tabs:
 *   Configuration — database → schema → table → date-column → refresh
 *                   (getData360Config / getTableRefreshMapping / triggerRefresh)
 *   Cache & TTL   — cached-entry inventory + class breakdown + editable TTL zones
 *
 * Plus one advisory tab kept here because it is unique (not hosted elsewhere):
 *   Page hints    — advisory GUI page-visibility hints (NOT API-enforced)
 *
 * Access-control and telemetry that used to live here are NOT duplicated: the
 * enforced RBAC matrix, role provisioning, object grants and platform telemetry
 * each have a single canonical home, reached via "Manage in Access Control"
 * redirect links rather than a second editor on the same allow-set.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Database,
  Gauge,
  HardDrive,
  Info,
  KeyRound,
  Layers,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Timer,
  User,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { safeLocale } from '@/lib/format-number';
import EmptyState from '@/components/ui/EmptyState';
import Pager, { usePagination } from '@/components/ui/Pager';
import { GlassPanel } from '@/app/shared/glass';
import {
  getCacheConfig,
  getCacheEntries,
  getData360Config,
  getTableRefreshMapping,
  patchCacheConfig,
  triggerRefresh,
  type CacheEntry,
  type Data360ConfigResponse,
  type TableRefreshMappingItem,
  type TableRefreshMappingResponse,
} from '@/app/services/data360-config';
import { getCacheBreakdown, getCacheInvalidations } from '@/app/services/cache';
import {
  getUserEffectiveGuiAccess,
  listGuiPermissions,
  upsertGuiPermission,
  type GuiPermission,
} from '@/app/services/governance';
import { getUsersWithRolesAndModules, type UserGrantTableData } from '@/app/services/governance/user_roles';
import { useCanPerform } from '@/hooks/useCanPerform';
import { toast } from '@/hooks/use-toast';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

const ACCESS_CENTER = '/administration/access-center';

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

function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

/** Inline 200ms debounce — kept local (src/hooks is out of this surface's scope). */
function useDebounced(value: string, delay = 200): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Compact search box shared by the config tables. */
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-56 rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-7 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** Toggleable filter chip. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
        active
          ? 'bg-[hsl(var(--primary))] text-white'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {children}
    </button>
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
  // Non-blocking inline confirm (no fixed inset-0 scrim). Escape/cancel dismiss.
  return (
    <div
      role="alertdialog"
      aria-labelledby="d360-confirm-title"
      aria-describedby="d360-confirm-body"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      className="mt-2"
    >
      <GlassPanel depth={3} radius="2xl" className="w-full max-w-sm p-4 ring-1 ring-amber-300/50 dark:ring-amber-500/30">
        <p id="d360-confirm-title" className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> {title}
        </p>
        <p id="d360-confirm-body" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{body}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
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

/* ── Redirect card — single-home for surfaces hosted in Access Control ─────── */
/**
 * Honest "this lives elsewhere" pointer. We do NOT re-implement the enforced RBAC
 * matrix, role provisioning, object grants or platform telemetry here — each has
 * one canonical home. The card explains what moved and links to it.
 */
function RedirectCard({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: typeof Settings2;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <GlassPanel depth={1} radius="xl" className="flex items-start gap-3 p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{body}</p>
        <Link
          href={href}
          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </GlassPanel>
  );
}

/* ── Configuration — the real config spine ────────────────────────────────── */
/**
 * database → schema → table → date-column → refresh, on the already-wired
 * getData360Config / getTableRefreshMapping / triggerRefresh. Each control is a
 * clear to-do: it states what it will do before you click, notifies on write,
 * and shows the next step (last_refresh delta + view-table). Routes may 404 until
 * deployed → honest empty/error, never a fake number.
 */
function ConfigTab() {
  const cfg = useFetch<Data360ConfigResponse>(() => getData360Config());
  const mapping = useFetch<TableRefreshMappingResponse>(() => getTableRefreshMapping());

  // Triggering a refresh is a runtime config write → gate it (honest disable).
  const canRefresh = useCanPerform('gouvernance', 'apply');
  const refreshBlocked = !canRefresh.allowed && !canRefresh.loading;

  // Per-table refresh: confirm (runtime write) → POST → toast + bell + next-step.
  const [pending, setPending] = useState<{ table: string } | null>(null);
  const [busyTable, setBusyTable] = useState<string | null>(null);
  // Tables refreshed this session → drive the "Refreshed · view" next-step strip.
  const [refreshed, setRefreshed] = useState<Record<string, string>>({});

  // Debounced search + "has date column" filter over the table mapping.
  const [search, setSearch] = useState('');
  const dq = useDebounced(search).trim().toLowerCase();
  const [onlyDated, setOnlyDated] = useState(false);

  const allTables: TableRefreshMappingItem[] = useMemo(() => mapping.data?.tables ?? [], [mapping.data]);
  const tables: TableRefreshMappingItem[] = useMemo(
    () =>
      allTables.filter((t) => {
        if (onlyDated && t.date_columns.length === 0) return false;
        if (!dq) return true;
        return (
          t.table_name.toLowerCase().includes(dq) ||
          `${t.database}.${t.schema}`.toLowerCase().includes(dq) ||
          t.date_columns.some((dc) => dc.name.toLowerCase().includes(dq))
        );
      }),
    [allTables, dq, onlyDated],
  );
  const tablesPage = usePagination(tables, 12);

  const confirmRefresh = useCallback(async () => {
    if (!pending) return;
    const { table } = pending;
    setPending(null);
    setBusyTable(table);
    try {
      await triggerRefresh({ table });
      const at = new Date().toLocaleTimeString();
      setRefreshed((m) => ({ ...m, [table]: at }));
      // Notify on config write (toast) + bell affordance in the next-step strip.
      toast({ title: `Refresh triggered · ${table}`, description: `Last refresh updated at ${at}` });
      await mapping.reload();
    } catch (e) {
      toast({ title: 'Refresh failed', description: getApiErrorMessage(e) });
    } finally {
      setBusyTable(null);
    }
  }, [pending, mapping]);

  return (
    <div className="space-y-3">
      {/* Step strip — the config spine, so the mandate is legible at a glance */}
      <GlassPanel depth={1} radius="xl" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
        <Settings2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
        <span className="font-medium text-slate-600 dark:text-slate-300">Config spine</span>
        {['database', 'schema', 'table', 'date column', 'refresh', 'cache TTL'].map((s, i) => (
          <span key={s} className="inline-flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
            <span>{s}</span>
          </span>
        ))}
      </GlassPanel>

      {/* Metadata: database + schemas (getData360Config) */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Database className="h-3.5 w-3.5" /> Metadata database &amp; schemas
          </p>
          <p className="text-[10px] text-slate-400">The data warehouse, schemas and zones this platform reads its metadata from</p>
        </div>
        {cfg.state === 'running' || cfg.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={3} />
          </div>
        ) : cfg.state === 'error' ? (
          <div className="p-3">
            <ErrBox message={cfg.error ?? 'Failed to load config'} onRetry={cfg.reload} />
          </div>
        ) : (
          <div className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {cfg.data?.metadata_database || '—'}
              </span>
              <span className="text-slate-400">
                {(cfg.data?.metadata_schemas?.length ?? 0)} schemas · {(cfg.data?.metadata_tables?.length ?? 0)} tables · {(cfg.data?.zones?.length ?? 0)} cache zones
              </span>
            </div>
            {(cfg.data?.metadata_schemas?.length ?? 0) === 0 ? (
              <EmptyState icon={Database} compact title="No metadata schemas configured" />
            ) : (
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {cfg.data?.metadata_schemas?.map((s) => (
                  <li key={s.name} className="flex flex-col rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
                    <span className="truncate font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200" title={s.name}>
                      {s.name}
                    </span>
                    {s.description && <span className="truncate text-[10px] text-slate-400" title={s.description}>{s.description}</span>}
                  </li>
                ))}
              </ul>
            )}
            {cfg.data && cfg.data.zones.length > 0 && (
              <p className="flex items-center gap-1 pt-1 text-[10px] text-slate-400">
                <Info className="h-3 w-3 shrink-0" /> Cache zones: {cfg.data.zones.join(' · ')} — set their TTL in the Cache &amp; TTL tab.
              </p>
            )}
          </div>
        )}
      </GlassPanel>

      {/* Tables → date columns → refresh (getTableRefreshMapping + triggerRefresh) */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Table2 className="h-3.5 w-3.5" /> Tables · date columns · refresh
            </p>
            <p className="text-[10px] text-slate-400">
              Each table&apos;s freshness date-column and last refresh. <span className="font-medium">Refresh</span> re-reads the table now (runtime config write).
            </p>
          </div>
          {mapping.state === 'done' && allTables.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchBox value={search} onChange={setSearch} placeholder="Search table, schema, column…" />
              <FilterChip active={onlyDated} onClick={() => setOnlyDated((v) => !v)}>
                Has date column
              </FilterChip>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {tables.length} of {allTables.length}
              </span>
            </div>
          )}
        </div>
        {mapping.state === 'running' || mapping.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={5} />
          </div>
        ) : mapping.state === 'error' || allTables.length === 0 ? (
          // Route may 404 until deployed → honest empty, never a fake row.
          <EmptyState icon={Table2} compact title="No table refresh mapping to show" />
        ) : tables.length === 0 ? (
          <EmptyState icon={Search} compact title="No tables match your filter" description="Adjust the search or clear the date-column filter." />
        ) : (
          <div className="px-1 pb-2">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="glass-2 px-3 py-1.5 text-left font-semibold">Table</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Date column(s)</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Last refresh</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {tablesPage.slice.map((t) => {
                  const fqn = `${t.database}.${t.schema}.${t.table_name}`;
                  const busy = busyTable === t.table;
                  const justAt = refreshed[t.table];
                  return (
                    <tr key={t.table} className="border-b border-slate-100 align-top dark:border-slate-800">
                      <td className="max-w-[280px] px-3 py-1.5">
                        <span className="block truncate font-mono text-slate-700 dark:text-slate-200" title={fqn}>
                          {t.table_name}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400" title={fqn}>
                          {t.database}.{t.schema}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        {t.date_columns.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {t.date_columns.map((dc) => (
                              <span
                                key={dc.name}
                                className="rounded-full bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                title={dc.last_refresh ? `last: ${new Date(dc.last_refresh).toLocaleString()}` : 'no refresh recorded'}
                              >
                                {dc.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                        {justAt ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <BellRing className="h-3 w-3" /> just now · {justAt}
                          </span>
                        ) : t.table_last_refresh ? (
                          new Date(t.table_last_refresh).toLocaleString()
                        ) : (
                          <span className="text-slate-400">never</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={busy || refreshBlocked}
                          onClick={() => setPending({ table: t.table })}
                          title={refreshBlocked ? 'You do not have permission to trigger a refresh' : `Re-read ${fqn} from the data warehouse now`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
                          {busy ? 'Refreshing…' : 'Refresh'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager
              page={tablesPage.page}
              pageCount={tablesPage.pageCount}
              total={tablesPage.total}
              from={tablesPage.from}
              to={tablesPage.to}
              onPage={tablesPage.setPage}
              unit="tables"
            />
          </div>
        )}
      </GlassPanel>

      {pending && (
        <ConfirmDialog
          title="Refresh this table now?"
          body={`Re-read "${pending.table}" from the data warehouse. This runs a live refresh and updates its last-refresh marker for every consumer of this table.`}
          confirmLabel="Refresh now"
          onConfirm={() => void confirmRefresh()}
          onCancel={() => setPending(null)}
        />
      )}
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

  // Editing a TTL is a platform-wide config write → gate it (honest disable).
  const canApply = useCanPerform('gouvernance', 'apply');
  const writeBlocked = !canApply.allowed && !canApply.loading;

  const allCacheEntries: CacheEntry[] = entries.data?.entries ?? [];
  const redisConnected = entries.data?.redis_connected ?? true;
  const byClass = bd.data?.by_class ?? [];
  const cachedQueries = bd.data?.cached_queries ?? [];
  const invEvents = inval.data?.events ?? [];
  const cfgEntries = Object.entries(cfg.data ?? {});

  // Debounced search + module filter over cached entries.
  const [search, setSearch] = useState('');
  const dq = useDebounced(search).trim().toLowerCase();
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const modules = useMemo(() => {
    const s = new Set<string>();
    for (const e of allCacheEntries) if (e.module) s.add(e.module);
    return [...s].sort();
  }, [allCacheEntries]);
  const cacheEntries = useMemo(
    () =>
      allCacheEntries.filter((e) => {
        if (moduleFilter && e.module !== moduleFilter) return false;
        if (!dq) return true;
        return (
          e.key.toLowerCase().includes(dq) ||
          (e.module ?? '').toLowerCase().includes(dq) ||
          (e.user ?? '').toLowerCase().includes(dq)
        );
      }),
    [allCacheEntries, moduleFilter, dq],
  );
  const entriesPage = usePagination(cacheEntries, 12);
  const queriesPage = usePagination(cachedQueries, 12);
  const invPage = usePagination(invEvents, 12);

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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cached entries</p>
            <p className="text-[10px] text-slate-400">
              {entries.state !== 'done'
                ? 'Live key inventory'
                : entries.data?.truncated
                  ? `Showing first ${allCacheEntries.length} (truncated) · scanned ${(entries.data?.total_scanned ?? 0).toLocaleString()}`
                  : `${allCacheEntries.length} keys · scanned ${(entries.data?.total_scanned ?? 0).toLocaleString()}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {entries.state === 'done' && allCacheEntries.length > 0 && (
              <>
                <SearchBox value={search} onChange={setSearch} placeholder="Search key, module, user…" />
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {cacheEntries.length} of {allCacheEntries.length}
                </span>
              </>
            )}
            {entries.state === 'done' && !redisConnected && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" /> Redis offline — in-process fallback
              </span>
            )}
          </div>
        </div>
        {entries.state === 'done' && modules.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
            <span className="text-[10px] font-medium text-slate-400">Module:</span>
            {modules.map((m) => (
              <FilterChip key={m} active={moduleFilter === m} onClick={() => setModuleFilter(moduleFilter === m ? null : m)}>
                {m}
              </FilterChip>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1 border-b border-slate-100 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800">
          <Info className="h-3 w-3 shrink-0" /> Inventory only — cached values are never exposed; per-key hit counts aren’t tracked.
        </p>
        {entries.state === 'running' || entries.state === 'idle' ? (
          <div className="p-3">
            <Loading rows={5} />
          </div>
        ) : entries.state === 'error' || allCacheEntries.length === 0 ? (
          // New endpoint may 404 until deployed → honest empty, not an error box.
          <EmptyState icon={HardDrive} compact title="No cached entries to show" />
        ) : cacheEntries.length === 0 ? (
          <EmptyState icon={Search} compact title="No cached entries match your filter" description="Adjust the search or clear the module filter." />
        ) : (
          <div className="px-1 pb-2">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="glass-2 px-3 py-1.5 text-left font-semibold">Key</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Module</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">User</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">TTL</th>
                  <th className="glass-2 px-2 py-1.5 text-right font-semibold">Size</th>
                </tr>
              </thead>
              <tbody>
                {entriesPage.slice.map((e, i) => (
                  <tr key={`${e.key}-${entriesPage.from + i}`} className="border-b border-slate-100 dark:border-slate-800">
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
            <Pager
              page={entriesPage.page}
              pageCount={entriesPage.pageCount}
              total={entriesPage.total}
              from={entriesPage.from}
              to={entriesPage.to}
              onPage={entriesPage.setPage}
              unit="entries"
            />
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
            {bd.state === 'done' && bd.data ? `${bd.data.total.toLocaleString()} keys` : '— keys'}
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
                  {c.class} · {safeLocale(c.count)}
                </span>
              ))}
            </div>
            {cachedQueries.length === 0 ? (
              <EmptyState icon={Database} compact title="No cached queries right now" />
            ) : (
              <div className="px-3 pb-2">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {queriesPage.slice.map((q, i) => (
                    <div key={`${q.fqdn}-${queriesPage.from + i}`} className="flex items-center justify-between gap-2 py-1 text-[11px]">
                      <span className="truncate font-mono text-slate-700 dark:text-slate-200" title={q.fqdn}>
                        {q.fqdn}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{q.db}</span>
                    </div>
                  ))}
                </div>
                <Pager
                  page={queriesPage.page}
                  pageCount={queriesPage.pageCount}
                  total={queriesPage.total}
                  from={queriesPage.from}
                  to={queriesPage.to}
                  onPage={queriesPage.setPage}
                  unit="queries"
                />
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
          <div className="px-3 pb-2">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {invPage.slice.map((e, i) => (
                <div key={invPage.from + i} className="flex items-center justify-between gap-2 py-1 text-[11px]">
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
            <Pager
              page={invPage.page}
              pageCount={invPage.pageCount}
              total={invPage.total}
              from={invPage.from}
              to={invPage.to}
              onPage={invPage.setPage}
              unit="events"
            />
          </div>
        )}
      </GlassPanel>

      {/* TTL zones — editable (platform-wide → confirm before PATCH) */}
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="border-b border-white/30 px-3 py-2 dark:border-white/10">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cache TTL zones (seconds)</p>
          <p className="text-[10px] text-slate-400">
            {writeBlocked
              ? 'Read-only — you don’t have permission to change cache TTL'
              : 'Click the value to edit · applies platform-wide via PATCH /api/data360/cache-config'}
          </p>
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
                      disabled={writeBlocked}
                      onClick={() => startEdit(key, ttl)}
                      title={writeBlocked ? 'You do not have permission to change cache TTL' : 'Edit TTL'}
                      className="flex shrink-0 items-center gap-1 rounded px-1 font-semibold text-slate-800 enabled:hover:bg-slate-100 disabled:cursor-not-allowed dark:text-slate-100 dark:enabled:hover:bg-slate-800"
                    >
                      {busy ? '…' : `${ttl}s`}
                      {!writeBlocked && <Pencil className="h-3 w-3 text-slate-400" />}
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
  // Page-hint edits are a grant-like mutation → gate (honest disable when denied).
  const canGrant = useCanPerform('gouvernance', 'grant');
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
  // Gated: denied users see read-only hints (buttons disabled below) and this
  // is a defence-in-depth no-op if it is ever reached.
  const requestCycle = useCallback(
    (role: string, feat: string) => {
      if (!canGrant.allowed) return;
      const cur = lvlOf(role, feat);
      setPendingCell({ role, feat, from: cur, to: CYCLE[cur] });
    },
    [lvlOf, canGrant.allowed],
  );
  const editingDisabled = canGrant.loading || !canGrant.allowed;

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
              {editingDisabled
                ? 'Read-only — you don’t have grant permission to change page-visibility hints'
                : view === 'role'
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
                            disabled={busy || editingDisabled}
                            onClick={() => requestCycle(r, f)}
                            title={
                              editingDisabled
                                ? `${r} · ${f} = ${lvl} (read-only — no grant permission)`
                                : `${r} · ${f} = ${lvl} (click to change)`
                            }
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-semibold transition-opacity',
                              ACCESS_TINT[lvl] ?? ACCESS_TINT.NONE,
                              busy && 'opacity-40',
                              editingDisabled ? 'cursor-default' : 'hover:opacity-80',
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
                                      disabled={saving.has(`${role}|${feat}`) || editingDisabled}
                                      onClick={() => requestCycle(role, feat)}
                                      title={
                                        editingDisabled
                                          ? `${role} grants ${rl} on ${feat} (read-only — no grant permission)`
                                          : `${role} grants ${rl} on ${feat} — click to change (role-wide)`
                                      }
                                      className={cn(
                                        'rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-opacity',
                                        ACCESS_TINT[rl] ?? ACCESS_TINT.NONE,
                                        saving.has(`${role}|${feat}`) && 'opacity-40',
                                        editingDisabled ? 'cursor-default' : 'hover:opacity-80',
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

/* ── Access Control redirects — telemetry + enforced RBAC live elsewhere ───── */
/**
 * The enforced action-RBAC matrix, role provisioning, object grants and platform
 * telemetry were each duplicated here. They now point at their single canonical
 * home so there is never a second editor on the same allow-set.
 */
function AccessControlTab() {
  return (
    <div className="space-y-3">
      <RedirectCard
        icon={ShieldCheck}
        title="Enforced action permissions (module → page → tab → action)"
        body="The enforced RBAC matrix moved to the Access Control Center. Editing permissions in two places risks divergent allow-sets, so it now has a single home."
        href={`${ACCESS_CENTER}?tab=access`}
        cta="Open Access Control"
      />
      <RedirectCard
        icon={Users}
        title="Role provisioning & users × roles"
        body="Assigning roles to users and reviewing who has what is provisioned in the Access Control Center."
        href={`${ACCESS_CENTER}?tab=provisioning`}
        cta="Open Provisioning"
      />
      <RedirectCard
        icon={Lock}
        title="Data-warehouse object grants (revoke / grant)"
        body="Granting and revoking privileges on databases, schemas, tables and stages is handled in Governance → Grants."
        href="/governance/grants"
        cta="Open Grants"
      />
    </div>
  );
}

function TelemetryTab() {
  return (
    <div className="space-y-3">
      <RedirectCard
        icon={Gauge}
        title="Performance & monitoring"
        body="Endpoint performance, slowest queries and server metrics are in the Access Control Center under Performance & Monitoring."
        href={`${ACCESS_CENTER}?tab=performance`}
        cta="Open Performance"
      />
      <RedirectCard
        icon={Activity}
        title="Usage & audit (events, activity, errors)"
        body="Request volume, the activity feed and recent errors are in the Access Control Center under Usage & Audit."
        href={`${ACCESS_CENTER}?tab=usage`}
        cta="Open Usage & Audit"
      />
    </div>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'config', label: 'Configuration', icon: Settings2 },
  { key: 'cache', label: 'Cache & TTL', icon: Layers },
  { key: 'hints', label: 'Page hints', icon: KeyRound },
  { key: 'access-control', label: 'Access Control', icon: ShieldCheck },
  { key: 'telemetry', label: 'Telemetry', icon: Gauge },
] as const;

type TabKey = (typeof TABS)[number]['key'];
const TAB_KEYS = TABS.map((t) => t.key);

// Back-compat: old `?tab=` ids redirect onto the surviving surface.
const TAB_ALIAS: Record<string, TabKey> = {
  overview: 'telemetry',
  performance: 'telemetry',
  events: 'telemetry',
  activity: 'telemetry',
  'action-rbac': 'access-control',
  access: 'hints',
};

function parseTab(raw: string | null): TabKey {
  if (!raw) return 'config';
  if (TAB_KEYS.includes(raw as TabKey)) return raw as TabKey;
  return TAB_ALIAS[raw] ?? 'config';
}

function Data360ConfigPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Lazy-init from the URL so the first paint already reflects the deep-link.
  const [tab, setTab] = useState<TabKey>(() => parseTab(searchParams.get('tab')));

  // URL → state (browser back/forward + retired-tab aliases). Read-only.
  useEffect(() => {
    const t = parseTab(searchParams.get('tab'));
    setTab((prev) => (prev === t ? prev : t));
  }, [searchParams]);

  // state → URL: shallow replace, preserves siblings, no scroll jump.
  const selectTab = useCallback(
    (next: TabKey) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="min-h-full space-y-4 p-4 lg:p-6">
      <header>
        <nav className="mb-1 flex items-center gap-1 text-xs text-slate-400" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden>/</span>
          <span>Admin</span>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">Data360 Configuration</span>
        </nav>
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-[hsl(var(--primary))]" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Data360 Configuration</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Metadata, tables, date columns, refresh and cache TTL — the platform&apos;s data-config surface.
          Access control and telemetry live in the Access Control Center.
        </p>
      </header>

      <GlassPanel depth={2} radius="2xl" className="flex flex-wrap gap-1 p-1" role="tablist" aria-label="Configuration sections">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t.key)}
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
        {tab === 'config' && <ConfigTab />}
        {tab === 'cache' && <CacheTab />}
        {tab === 'hints' && <AccessTab />}
        {tab === 'access-control' && <AccessControlTab />}
        {tab === 'telemetry' && <TelemetryTab />}
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary in the App Router (otherwise
// `next build` throws / the whole page de-opts to client rendering).
export default function Data360ConfigPage() {
  return (
    <Suspense fallback={null}>
      <Data360ConfigPageInner />
    </Suspense>
  );
}
