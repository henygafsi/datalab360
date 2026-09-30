'use client';

/**
 * TracesPanel — request-trace lookup + recent traces for the administration
 * control page (accountadmin only).
 *
 * Reads GET /admin/traces/{request_id} and GET /admin/traces through the
 * shared administration control service (never apiClient directly).
 *
 * Honesty rules baked in:
 *  - a TRACE_NOT_FOUND answer is NORMAL (successful display GETs are not
 *    persisted) — rendered as a calm informational state, never as an error;
 *  - 503 from the trace store renders "dependency unavailable", never 0 rows;
 *  - refresh is manual only — no polling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSearch, RefreshCw, Search } from 'lucide-react';

import {
  getRecentTraces,
  getTraceByRequestId,
  isAdminEnvelope,
  type TraceRow,
} from '@/app/services/administration/control';
import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import { resolveWhenReady } from '@/app/shared/command-center/lib/meta';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { TablePager, usePagedRows } from '@/components/ui/TablePager';

const RID_PATTERN = /^[A-Za-z0-9._:-]{4,64}$/;
const RECENT_LIMIT = 100;

const SINCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: 'Last 15 min' },
  { value: 60, label: 'Last hour' },
  { value: 1440, label: 'Last 24 h' },
  { value: 10080, label: 'Last 7 days' },
];

const STATUS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'All statuses' },
  { value: 400, label: '400+' },
  { value: 500, label: '500+' },
];

/* ------------------------------------------------------------------ */
/* Response / error interpretation                                     */
/* ------------------------------------------------------------------ */

interface TraceListPayload {
  request_id?: string;
  traces?: TraceRow[];
  source?: string;
  coverage?: string;
  detail?: { error_code?: string; hint?: string };
  error_code?: string;
  hint?: string;
}

interface ParsedApiError {
  status: number | null;
  code: string | null;
  hint: string | null;
  message: string;
}

/** Reads an axios-style thrown error without depending on axios types. */
function parseApiError(err: unknown): ParsedApiError {
  const e = err as {
    response?: { status?: number; data?: unknown };
    status?: number;
    message?: string;
  } | null;
  const status =
    typeof e?.response?.status === 'number'
      ? e.response.status
      : typeof e?.status === 'number'
        ? e.status
        : null;
  const raw = (e?.response?.data ?? null) as {
    detail?: unknown;
    error_code?: string;
    hint?: string;
  } | null;
  const detail = (
    raw && typeof raw.detail === 'object' && raw.detail !== null ? raw.detail : raw
  ) as { error_code?: string; hint?: string } | null;
  return {
    status,
    code: typeof detail?.error_code === 'string' ? detail.error_code : null,
    hint: typeof detail?.hint === 'string' ? detail.hint : null,
    message:
      typeof e?.message === 'string' && e.message.length > 0
        ? e.message
        : 'Request failed',
  };
}

type LookupView =
  | { kind: 'idle' }
  | {
      kind: 'found';
      requestId: string;
      rows: TraceRow[];
      source: string | null;
      coverage: string | null;
    }
  | { kind: 'not_found'; requestId: string; hint: string | null }
  | { kind: 'preparing' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

function interpretLookup(rid: string, body: unknown): LookupView {
  if (body == null) return { kind: 'not_found', requestId: rid, hint: null };
  if (isAdminEnvelope(body)) {
    if (body.state === 'preparing') return { kind: 'preparing' };
    return {
      kind: 'unavailable',
      message: body.reason ?? 'Trace store dependency unavailable',
    };
  }
  const b = body as TraceListPayload;
  const code = b.error_code ?? b.detail?.error_code;
  if (code === 'TRACE_NOT_FOUND') {
    return {
      kind: 'not_found',
      requestId: rid,
      hint: b.hint ?? b.detail?.hint ?? null,
    };
  }
  if (code === 'DEPENDENCY_UNAVAILABLE') {
    return { kind: 'unavailable', message: 'Trace store dependency unavailable' };
  }
  const rows = Array.isArray(b.traces) ? b.traces : [];
  if (rows.length === 0) return { kind: 'not_found', requestId: rid, hint: null };
  return {
    kind: 'found',
    requestId: rid,
    rows,
    source: b.source ?? null,
    coverage: b.coverage ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Small display atoms                                                 */
/* ------------------------------------------------------------------ */

function formatTs(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusChip({ status }: { status: number | null | undefined }) {
  if (status == null || !Number.isFinite(status)) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  const bad = status >= 400;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        bad
          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {status}
    </span>
  );
}

function CacheHitDot({ hit }: { hit: boolean | null | undefined }) {
  if (hit == null) return <span className="text-slate-400 dark:text-slate-500">—</span>;
  return (
    <span
      title={hit ? 'Cache hit' : 'Cache miss'}
      aria-label={hit ? 'Cache hit' : 'Cache miss'}
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        hit ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    />
  );
}

function rowContextTitle(row: TraceRow, clickable: boolean): string | undefined {
  const parts: string[] = [];
  if (row.request_id) parts.push(`Request id: ${row.request_id}`);
  if (row.module) parts.push(`Module: ${row.module}`);
  if (row.page) parts.push(`Page: ${row.page}`);
  if (row.tab) parts.push(`Tab: ${row.tab}`);
  if (row.action_key) parts.push(`Action: ${row.action_key}`);
  if (row.entity_type) {
    parts.push(`Entity: ${row.entity_type}${row.entity_id ? ` ${row.entity_id}` : ''}`);
  }
  if (clickable) parts.push('Click to copy this request id into the lookup');
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/* ------------------------------------------------------------------ */
/* Shared trace table                                                  */
/* ------------------------------------------------------------------ */

function TraceTable({
  rows,
  source,
  coverage,
  onPickRequestId,
}: {
  rows: TraceRow[];
  source: string | null;
  coverage: string | null;
  onPickRequestId?: (rid: string) => void;
}) {
  const pager = usePagedRows(rows, 25);

  return (
    <div>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {[
                  'Timestamp',
                  'Method · path',
                  'Status',
                  'Duration (ms)',
                  'Cache hit',
                  'User · role',
                  'Decision',
                ].map((h) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400 ${
                      h === 'Duration (ms)' ? 'text-right' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pager.visible.map((row, i) => {
                const clickable = Boolean(onPickRequestId && row.request_id);
                const decision = typeof row.decision === 'string' ? row.decision : null;
                const isDeny = decision != null && /den/i.test(decision);
                const ts = formatTs(row.request_timestamp);
                const fullPath = row.query ? `${row.path}?${row.query}` : row.path;
                return (
                  <tr
                    key={`${row.request_id ?? 'row'}-${i}`}
                    title={rowContextTitle(row, clickable)}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={
                      clickable ? () => onPickRequestId?.(row.request_id) : undefined
                    }
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter') onPickRequestId?.(row.request_id);
                          }
                        : undefined
                    }
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                      clickable
                        ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600 dark:text-slate-300">
                      {ts ?? '—'}
                    </td>
                    <td className="max-w-[340px] px-3 py-1.5">
                      <span
                        className="block truncate font-mono text-[11px]"
                        title={fullPath ?? undefined}
                      >
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {row.method ?? '—'}
                        </span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">
                          {row.path ?? '—'}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <StatusChip status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {row.duration_ms != null && Number.isFinite(row.duration_ms)
                        ? Math.round(row.duration_ms).toLocaleString()
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <CacheHitDot hit={row.cache_hit} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 dark:text-slate-300">
                      {row.username ?? '—'}
                      {row.role ? (
                        <span className="text-slate-400 dark:text-slate-500">
                          {' '}
                          · {row.role}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        title={isDeny && row.deny_reason ? row.deny_reason : undefined}
                        className={
                          isDeny
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }
                      >
                        {decision ?? '—'}
                      </span>
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
      {source || coverage ? (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {[source ? `Source: ${source}` : null, coverage ? `Coverage: ${coverage}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function TracesPanel() {
  /* ---- lookup ---- */
  const [ridInput, setRidInput] = useState('');
  const trimmedRid = ridInput.trim();
  const ridValid = RID_PATTERN.test(trimmedRid);
  const [lookup, setLookup] = useState<LookupView>({ kind: 'idle' });
  const [lookupBusy, setLookupBusy] = useState(false);
  const lookupSeq = useRef(0);

  const runLookup = useCallback(async () => {
    if (!RID_PATTERN.test(trimmedRid)) return;
    const rid = trimmedRid;
    const seq = ++lookupSeq.current;
    setLookupBusy(true);
    try {
      const res = (await resolveWhenReady(() => getTraceByRequestId(rid))) as unknown;
      if (seq !== lookupSeq.current) return;
      setLookup(interpretLookup(rid, res));
    } catch (err) {
      if (seq !== lookupSeq.current) return;
      const parsed = parseApiError(err);
      if (parsed.code === 'TRACE_NOT_FOUND' || parsed.status === 404) {
        setLookup({ kind: 'not_found', requestId: rid, hint: parsed.hint });
      } else if (parsed.status === 503 || parsed.code === 'DEPENDENCY_UNAVAILABLE') {
        setLookup({ kind: 'unavailable', message: 'Trace store dependency unavailable' });
      } else {
        setLookup({ kind: 'error', message: parsed.message });
      }
    } finally {
      if (seq === lookupSeq.current) setLookupBusy(false);
    }
  }, [trimmedRid]);

  /* ---- recent traces ---- */
  const [sinceMinutes, setSinceMinutes] = useState(60);
  const [statusMin, setStatusMin] = useState(0);
  const [recentData, setRecentData] = useState<{
    rows: TraceRow[];
    source: string | null;
    coverage: string | null;
  } | null>(null);
  const [recentIssue, setRecentIssue] = useState<
    | { kind: 'preparing' }
    | { kind: 'unavailable'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [recentBusy, setRecentBusy] = useState(false);
  const [recentLoadedOnce, setRecentLoadedOnce] = useState(false);
  const recentSeq = useRef(0);

  const fetchRecent = useCallback(async () => {
    const seq = ++recentSeq.current;
    setRecentBusy(true);
    try {
      const params: Record<string, string | number> = {
        since_minutes: sinceMinutes,
        limit: RECENT_LIMIT,
      };
      if (statusMin > 0) params.status_min = statusMin;
      const res = (await resolveWhenReady(() => getRecentTraces(params))) as unknown;
      if (seq !== recentSeq.current) return;
      if (isAdminEnvelope(res)) {
        setRecentIssue(
          res.state === 'preparing'
            ? { kind: 'preparing' }
            : {
                kind: 'unavailable',
                message: res.reason ?? 'Trace store dependency unavailable',
              },
        );
      } else {
        const b = res as TraceListPayload;
        setRecentData({
          rows: Array.isArray(b.traces) ? b.traces : [],
          source: b.source ?? null,
          coverage: b.coverage ?? null,
        });
        setRecentIssue(null);
      }
    } catch (err) {
      if (seq !== recentSeq.current) return;
      const parsed = parseApiError(err);
      if (parsed.status === 503 || parsed.code === 'DEPENDENCY_UNAVAILABLE') {
        setRecentIssue({
          kind: 'unavailable',
          message: 'Trace store dependency unavailable',
        });
      } else {
        setRecentIssue({ kind: 'error', message: parsed.message });
      }
    } finally {
      if (seq === recentSeq.current) {
        setRecentBusy(false);
        setRecentLoadedOnce(true);
      }
    }
  }, [sinceMinutes, statusMin]);

  // Initial load + reload when the window/status filters change. No polling —
  // afterwards the Refresh button is the only trigger.
  useEffect(() => {
    void fetchRecent();
  }, [fetchRecent]);

  const pickRequestId = useCallback((rid: string) => {
    setRidInput(rid);
  }, []);

  /* ---- lookup body ---- */
  let lookupBody: React.ReactNode = null;
  if (lookup.kind === 'found') {
    lookupBody = (
      <TraceTable rows={lookup.rows} source={lookup.source} coverage={lookup.coverage} />
    );
  } else if (lookup.kind === 'not_found') {
    lookupBody = (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          No persisted trace for this id
        </p>
        {lookup.hint ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{lookup.hint}</p>
        ) : null}
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Successful display reads are not persisted — correlation still works via the
          echoed X-Request-ID header.
        </p>
      </div>
    );
  } else if (lookup.kind === 'preparing') {
    lookupBody = <PreparingState domainLabel="the trace store" />;
  } else if (lookup.kind === 'unavailable') {
    lookupBody = (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-500">
        {lookup.message}
      </p>
    );
  } else if (lookup.kind === 'error') {
    lookupBody = (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
        Lookup failed — {lookup.message}
      </p>
    );
  }

  /* ---- recent body ---- */
  let recentBody: React.ReactNode;
  if (!recentLoadedOnce && recentData == null) {
    recentBody = <TableSkeleton rows={6} columns={7} showHeader />;
  } else {
    recentBody = (
      <>
        {recentIssue?.kind === 'preparing' ? (
          recentData ? (
            <PreparingState compact domainLabel="recent traces" className="mb-2" />
          ) : (
            <PreparingState domainLabel="recent traces" />
          )
        ) : null}
        {recentIssue?.kind === 'unavailable' ? (
          <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-500">
            {recentIssue.message}
            {recentData ? ' — showing the last loaded results.' : ''}
          </p>
        ) : null}
        {recentIssue?.kind === 'error' ? (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
            Could not load recent traces — {recentIssue.message}
            {recentData ? ' Showing the last loaded results.' : ''}
          </p>
        ) : null}
        {recentData ? (
          recentData.rows.length === 0 ? (
            <EmptyState
              compact
              icon={FileSearch}
              title="No traces in this window"
              description="Only mutations, first accesses, governed actions, denials and errors are persisted."
            />
          ) : (
            <TraceTable
              rows={recentData.rows}
              source={recentData.source}
              coverage={recentData.coverage}
              onPickRequestId={pickRequestId}
            />
          )
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* -------- Lookup -------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Trace lookup
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Find the persisted trace of a request by its correlation id.
        </p>
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runLookup();
          }}
        >
          <input
            value={ridInput}
            onChange={(e) => setRidInput(e.target.value)}
            placeholder="Paste a request id (X-Request-ID)"
            aria-label="Request id"
            spellCheck={false}
            autoComplete="off"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!ridValid || lookupBusy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-slate-900"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Look up
          </button>
          {lookupBusy ? (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Looking up…
            </span>
          ) : null}
        </form>
        {trimmedRid.length > 0 && !ridValid ? (
          <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">
            A request id is 4–64 characters: letters, digits, dots, underscores, colons
            or dashes.
          </p>
        ) : null}
        {lookupBody ? <div className="mt-4">{lookupBody}</div> : null}
      </section>

      {/* -------- Recent traces -------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Recent traces
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Sampled requests persisted to the event store.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sinceMinutes}
              onChange={(e) => setSinceMinutes(Number(e.target.value))}
              aria-label="Time window"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {SINCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={statusMin}
              onChange={(e) => setStatusMin(Number(e.target.value))}
              aria-label="Minimum status"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void fetchRecent()}
              disabled={recentBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${recentBusy ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-3">{recentBody}</div>
      </section>
    </div>
  );
}
