'use client';

/**
 * EndpointsInventoryPanel — the master "endpoint management" panel of the
 * /administration/control page (accountadmin cockpit).
 *
 * Server-paginated, server-filtered inventory of every backend endpoint:
 * method, path, module, cache serving mode, execution class, frontend
 * consumers, tests and lifecycle status — with an inline per-row expansion
 * and an admin-gated "Regenerate inventory" action.
 *
 * Data-first: once a page of results has been shown it is never thrown away —
 * refetches, preparing envelopes and transient errors render as slim notices
 * on top of the kept table.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AlertTriangle, RefreshCw, SearchX } from 'lucide-react';

import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import { formatAge } from '@/app/shared/command-center/lib/meta';
import EmptyState from '@/components/ui/EmptyState';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { TablePager } from '@/components/ui/TablePager';
import { InsightActionButton } from '@/app/shared/insights';
import {
  getEndpointInventory,
  isAdminEnvelope,
  regenerateInventory,
  type AdminEnvelope,
  type InventoryItem,
  type InventoryPage,
  type InventoryQuery,
} from '@/app/services/administration/control';

const PAGE_SIZE = 50;
const MAX_AUTO_RETRIES = 3;

/** Same tint scale as the shared action surfaces (CcActionSurface). */
const METHOD_TINT: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  POST: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_DOT: Record<string, string> = {
  KEEP: 'bg-emerald-500',
  UNKNOWN: 'bg-amber-500',
  DEPRECATED: 'bg-slate-400',
};

const STATUS_OPTIONS = ['All', 'KEEP', 'UNKNOWN', 'DEPRECATED'];
const EXEC_CLASS_OPTIONS = ['All', 'cache_read', 'compute', 'mutation', 'export', 'job', 'stream'];
const METHOD_OPTIONS = ['All', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const FIELD_CLS =
  'rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Count for a field that may arrive as a list or as a number. */
function countOf(v: unknown): number | null {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function listOf(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function secondsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 1000);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Request failed';
}

/**
 * The backend can answer with envelope states beyond the shared contract
 * (observed live: `state: "failed"` with an `error` field). Anything carrying
 * a `state` string but no `items` array is a degraded envelope, never a page.
 */
function asDegradedEnvelope(x: unknown): AdminEnvelope | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.state !== 'string' || Array.isArray(o.items)) return null;
  const reason = [o.reason, o.error].find((v): v is string => typeof v === 'string');
  return {
    state: 'unavailable',
    domain: typeof o.domain === 'string' ? o.domain : undefined,
    reason,
    source: typeof o.source === 'string' ? o.source : undefined,
  };
}

function SlimNotice({
  tone,
  message,
  onRetry,
}: {
  tone: 'amber' | 'red';
  message: string;
  onRetry?: () => void;
}) {
  const toneCls =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-300'
      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300';
  return (
    <div
      role="status"
      className={`mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border px-3 py-1.5 text-[11px] ${toneCls}`}
    >
      <span className="inline-flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <span className="break-words">{message}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded px-1.5 py-0.5 font-semibold underline-offset-2 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function DetailRow({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2 py-0.5 text-[11px]">
      <span className="w-24 shrink-0 text-slate-400 dark:text-slate-500">{label}</span>
      <span
        className={`${mono ? 'font-mono text-[10px] ' : ''}break-all text-slate-700 dark:text-slate-200`}
      >
        {children}
      </span>
    </div>
  );
}

function MonoList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="py-0.5">
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        {label}
        {values.length ? ` (${values.length})` : ''}
      </p>
      {values.length ? (
        <ul className="mt-0.5 space-y-0.5">
          {values.map((v, i) => (
            <li
              key={`${v}-${i}`}
              className="break-all font-mono text-[10px] text-slate-600 dark:text-slate-300"
            >
              {v}
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">—</p>
      )}
    </div>
  );
}

function ServeChip({ serve }: { serve: string | null | undefined }) {
  if (!serve) return <span className="text-slate-400 dark:text-slate-500">—</span>;
  const cls =
    serve === 'prepare'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${cls}`}>{serve}</span>;
}

export interface EndpointsInventoryPanelProps {
  isAdmin: boolean;
}

export default function EndpointsInventoryPanel({ isAdmin }: EndpointsInventoryPanelProps) {
  // Filters — all applied server-side; any change resets to page 1.
  const [qInput, setQInput] = useState('');
  const [moduleInput, setModuleInput] = useState('');
  const [status, setStatus] = useState('All');
  const [execClass, setExecClass] = useState('All');
  const [method, setMethod] = useState('All');
  const [page, setPage] = useState(1);

  const q = useDebounced(qInput, 400);
  const moduleFilter = useDebounced(moduleInput, 400);

  const query = useMemo<InventoryQuery>(
    () => ({
      q,
      module: moduleFilter,
      status: status === 'All' ? undefined : (status as InventoryQuery['status']),
      exec_class: execClass === 'All' ? undefined : execClass,
      method: method === 'All' ? undefined : method,
      page,
      page_size: PAGE_SIZE,
    }),
    [q, moduleFilter, status, execClass, method, page],
  );

  const [data, setData] = useState<InventoryPage | null>(null);
  const [envelope, setEnvelope] = useState<AdminEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [autoRetries, setAutoRetries] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const seqRef = useRef(0);

  const fetchInventory = useCallback(async () => {
    const seq = ++seqRef.current;
    setFetching(true);
    try {
      const res: unknown = await getEndpointInventory(query);
      if (seq !== seqRef.current) return; // a newer request superseded this one
      if (isAdminEnvelope(res)) {
        setEnvelope(res);
        setError(null);
      } else {
        const degraded = asDegradedEnvelope(res);
        if (degraded) {
          setEnvelope(degraded);
          setError(null);
        } else {
          setData(res as InventoryPage);
          setEnvelope(null);
          setError(null);
          setAutoRetries(0);
        }
      }
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(errorMessage(e));
      setEnvelope(null);
    } finally {
      if (seq === seqRef.current) setFetching(false);
    }
  }, [query]);

  // Any filter change goes back to the first page.
  useEffect(() => {
    setPage(1);
  }, [q, moduleFilter, status, execClass, method]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  // Auto-retry while the artifact is preparing — server-paced, bounded.
  useEffect(() => {
    if (envelope?.state !== 'preparing') return;
    if (autoRetries >= MAX_AUTO_RETRIES) return;
    const delayS = Math.min(Math.max(envelope.retry_after_seconds ?? 10, 2), 30);
    const t = setTimeout(() => {
      setAutoRetries((n) => n + 1);
      void fetchInventory();
    }, delayS * 1000);
    return () => clearTimeout(t);
  }, [envelope, autoRetries, fetchInventory]);

  const manualRetry = useCallback(() => {
    setAutoRetries(0);
    void fetchInventory();
  }, [fetchInventory]);

  const generatedAge = data ? formatAge(secondsSince(data.generated_at)) : null;
  const pageSize = Math.max(1, data?.page_size ?? PAGE_SIZE);
  const totalPages = data ? Math.max(1, Math.ceil((data.total ?? 0) / pageSize)) : 1;
  const retriesExhausted = envelope?.state === 'preparing' && autoRetries >= MAX_AUTO_RETRIES;

  const toggleRow = (key: string) => setExpandedKey((cur) => (cur === key ? null : key));

  const renderRow = (item: InventoryItem) => {
    const key = `${item.method} ${item.normalized_path} ${item.operation_id}`;
    const open = expandedKey === key;
    const deprecatedCls = 'text-slate-400 line-through dark:text-slate-500';
    const consumers = countOf(item.frontend_consumers);
    const tests = countOf(item.tests);
    const frontendConsumerList = listOf(item.frontend_consumers);
    const otherConsumerList = listOf(item.other_consumers);
    const testList = listOf(item.tests);

    const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleRow(key);
      }
    };

    return (
      <Fragment key={key}>
        <tr
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={() => toggleRow(key)}
          onKeyDown={onKeyDown}
          className={`cursor-pointer border-b border-slate-50 hover:bg-slate-50 focus:outline-none focus-visible:bg-violet-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40 dark:focus-visible:bg-violet-900/10 ${
            open ? 'bg-slate-50 dark:bg-slate-800/40' : ''
          }`}
        >
          <td className="px-3 py-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                METHOD_TINT[item.method] ?? METHOD_TINT.GET
              }`}
            >
              {item.method}
            </span>
          </td>
          <td className="max-w-[320px] px-3 py-1.5">
            <span
              className={`block truncate font-mono text-[11px] ${
                item.status === 'DEPRECATED'
                  ? deprecatedCls
                  : 'text-slate-700 dark:text-slate-200'
              }`}
              title={item.normalized_path}
            >
              {item.normalized_path}
            </span>
          </td>
          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{item.module || '—'}</td>
          <td className="px-3 py-1.5">
            <ServeChip serve={item.cache?.serve} />
          </td>
          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
            {item.exec_class || '—'}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
            {consumers != null && consumers > 0 ? consumers : '—'}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
            {tests != null && tests > 0 ? tests : '—'}
          </td>
          <td className="px-3 py-1.5">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  STATUS_DOT[item.status] ?? 'bg-slate-400'
                }`}
              />
              <span
                className={
                  item.status === 'DEPRECATED'
                    ? deprecatedCls
                    : 'text-slate-600 dark:text-slate-300'
                }
              >
                {item.status || '—'}
              </span>
            </span>
          </td>
        </tr>
        {open && (
          <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
            <td colSpan={8} className="px-4 py-3">
              <div className="border-l-2 border-violet-400 pl-3 dark:border-violet-500">
                <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                  <div>
                    <DetailRow label="Summary">{item.summary || '—'}</DetailRow>
                    <DetailRow label="Operation" mono>
                      {item.operation_id || '—'}
                    </DetailRow>
                    <DetailRow label="Auth">
                      {item.auth?.length ? item.auth.join(' · ') : '—'}
                    </DetailRow>
                    <DetailRow label="Cache">
                      {item.cache
                        ? `${item.cache.decorator ?? '—'} · ttl ${item.cache.ttl ?? '—'} · ${
                            item.cache.domain ?? '—'
                          }`
                        : '—'}
                    </DetailRow>
                    {item.duplicate_name ? (
                      <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                        {typeof item.duplicate_name === 'string'
                          ? `Duplicate operation name: ${item.duplicate_name}`
                          : 'Duplicate operation name'}
                      </p>
                    ) : null}
                    {item.in_openapi === false ? (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Not in the OpenAPI schema
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <MonoList label="Frontend consumers" values={frontendConsumerList} />
                    <MonoList label="Other consumers" values={otherConsumerList} />
                    <MonoList label="Tests" values={testList} />
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Header — title, freshness, admin regenerate */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Endpoint inventory
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Every backend endpoint — lifecycle, cache serving, consumers and tests
          </p>
        </div>
        <div className="flex items-center gap-3">
          {envelope?.state === 'preparing' && data ? (
            <PreparingState compact domainLabel="the endpoint inventory" startedAt={null} />
          ) : generatedAge ? (
            <span
              className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
              title={data?.generated_at ?? undefined}
            >
              Generated {generatedAge} ago
            </span>
          ) : null}
          {isAdmin && (
            <InsightActionButton
              label="Regenerate inventory"
              icon={RefreshCw}
              hideWhenUnavailable
              confirm={{
                title: 'Regenerate the endpoint inventory?',
                body: 'Re-scans the backend code and rewrites the inventory artifact (~10 s).',
              }}
              onAction={() => regenerateInventory()}
              onDone={() => {
                setAutoRetries(0);
                void fetchInventory();
              }}
            />
          )}
        </div>
      </div>

      {/* Toolbar — server-side filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search path, operation or summary…"
          aria-label="Search endpoints"
          className={`${FIELD_CLS} w-64`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className={FIELD_CLS}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === 'All' ? 'All statuses' : o}
            </option>
          ))}
        </select>
        <select
          value={execClass}
          onChange={(e) => setExecClass(e.target.value)}
          aria-label="Filter by execution class"
          className={FIELD_CLS}
        >
          {EXEC_CLASS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === 'All' ? 'All classes' : o}
            </option>
          ))}
        </select>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          aria-label="Filter by method"
          className={FIELD_CLS}
        >
          {METHOD_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === 'All' ? 'All methods' : o}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={moduleInput}
          onChange={(e) => setModuleInput(e.target.value)}
          placeholder="Module"
          aria-label="Filter by module"
          className={`${FIELD_CLS} w-32`}
        />
      </div>

      {/* Body */}
      {data === null ? (
        error ? (
          <div className="p-4">
            <ErrorDisplay error={error} onRetry={manualRetry} />
          </div>
        ) : envelope ? (
          envelope.state === 'preparing' ? (
            <div className="px-4">
              <PreparingState domainLabel="the endpoint inventory" startedAt={null} />
              {retriesExhausted && (
                <div className="pb-4 pl-3.5">
                  <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Still preparing after several checks.
                  </p>
                  <button
                    type="button"
                    onClick={manualRetry}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Retry now
                  </button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              compact
              icon={AlertTriangle}
              title="Inventory unavailable"
              description={
                envelope.reason ??
                'The backend dependency for this view is not reachable right now.'
              }
              action={
                <button
                  type="button"
                  onClick={manualRetry}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Retry
                </button>
              }
            />
          )
        ) : (
          <TableSkeleton rows={8} columns={6} className="m-4" />
        )
      ) : (
        <>
          {error && <SlimNotice tone="red" message={`Refresh failed — ${error}`} onRetry={manualRetry} />}
          {envelope?.state === 'unavailable' && (
            <SlimNotice
              tone="amber"
              message={`Inventory temporarily unavailable — showing the last loaded page.${
                envelope.reason ? ` ${envelope.reason}` : ''
              }`}
              onRetry={manualRetry}
            />
          )}
          {retriesExhausted && (
            <SlimNotice
              tone="amber"
              message="Still preparing — the inventory is being rebuilt."
              onRetry={manualRetry}
            />
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs" aria-busy={fetching}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Module</th>
                  <th className="px-3 py-2">Serve</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2 text-right">Consumers</th>
                  <th className="px-3 py-2 text-right">Tests</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className={fetching ? 'opacity-60' : undefined}>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        compact
                        icon={SearchX}
                        title="No endpoints match"
                        description="Adjust the search or clear a filter."
                      />
                    </td>
                  </tr>
                ) : (
                  data.items.map(renderRow)
                )}
              </tbody>
            </table>
          </div>
          <TablePager
            page={Math.max(0, (data.page ?? page) - 1)}
            totalPages={totalPages}
            total={data.total ?? 0}
            onPage={(p) => setPage(p + 1)}
          />
        </>
      )}
    </section>
  );
}
