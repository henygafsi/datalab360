'use client';

/**
 * ConnectionsPanel — the « Connections » view of /studio/source, on the
 * first-class contract (GET /studio/connections: one registry — platform
 * session, legacy /connect rows, REST builder rows — with usage counts,
 * permissions and the persisted dated test proof per row).
 *
 * One dense row per connection (name / type / environment / last test /
 * objects in use / actions), server-side search+filter+pagination, never
 * a big repeated card. Selecting a row opens ConnectionSheet IN PLACE of
 * the list; closed again, nothing is selected. « New connection » renders
 * the schema-driven create form (nothing tested at creation — the sheet's
 * explicit test follows).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plug, RefreshCw, Search } from 'lucide-react';
import {
  listConnections,
  type ConnectionListItem,
  type ConnectionsPage,
} from '@/app/services/studio/connections';
import { invalidateSourcesCaches } from '@/app/services/studio/studio-api';
import { QuietAction } from '@/app/shared/studio/PlainKit';
import ConnectionCreateForm from '@/app/shared/studio/sources/ConnectionCreateForm';
import ConnectionSheet from '@/app/shared/studio/sources/ConnectionSheet';
import { OVERALL_CLS } from '@/app/shared/studio/sources/connection-bits';
import { Pager, fmtDateTime, neutralLabel } from '@/app/shared/studio/sources/sources-kit';

const PAGE_SIZE = 25;

function typeWords(t?: string): string {
  if (!t) return '—';
  const words: Record<string, string> = {
    snowflake_session: 'data warehouse (your session)',
    rest_api: 'REST API',
    postgresql: 'PostgreSQL',
    mysql: 'MySQL',
    oracle: 'Oracle',
    databricks: 'Databricks',
    iceberg: 'Iceberg',
  };
  return words[t] ?? t.replace(/_/g, ' ');
}

export default function ConnectionsPanel({
  initialSelection,
  onSelectionChange,
  onOpenObjects,
  refreshToken,
}: {
  /** ?connection= deep link. */
  initialSelection?: string | null;
  onSelectionChange?: (key: string | null) => void;
  onOpenObjects: () => void;
  /** bump to refetch (e.g. after the add-source flow closes) */
  refreshToken?: number;
}) {
  const [page, setPage] = useState<ConnectionsPage | 'loading' | 'error'>('loading');
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(initialSelection ?? null);
  const [creating, setCreating] = useState(false);
  // types seen across pages — the filter chips must not vanish while filtered
  const seenTypes = useRef<Set<string>>(new Set());
  const debounced = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (params: { q: string; type: string | null; offset: number }) => {
    const my = ++gen.current;
    try {
      const p = await listConnections({
        q: params.q || undefined,
        type: params.type ?? undefined,
        offset: params.offset,
        limit: PAGE_SIZE,
      });
      if (my !== gen.current) return;
      p.items.forEach((i) => i.type && seenTypes.current.add(i.type));
      setPage(p);
    } catch {
      if (my === gen.current) setPage('error');
    }
  }, []);

  useEffect(() => {
    setPage('loading');
    void load({ q: '', type: null, offset: 0 });
    // refreshToken: the add flow (or an edit) may have changed the registry
  }, [load, refreshToken]);

  const search = (value: string) => {
    setQ(value);
    setOffset(0);
    if (debounced.current) clearTimeout(debounced.current);
    debounced.current = setTimeout(() => void load({ q: value.trim(), type, offset: 0 }), 350);
  };

  const pickType = (t: string | null) => {
    setType(t);
    setOffset(0);
    setPage('loading');
    void load({ q: q.trim(), type: t, offset: 0 });
  };

  const goPage = (p: number) => {
    const o = p * PAGE_SIZE;
    setOffset(o);
    setPage('loading');
    void load({ q: q.trim(), type, offset: o });
  };

  const select = useCallback(
    (key: string | null) => {
      setSelected(key);
      onSelectionChange?.(key);
    },
    [onSelectionChange],
  );

  const reload = useCallback(() => {
    invalidateSourcesCaches();
    void load({ q: q.trim(), type, offset });
  }, [load, offset, q, type]);

  const items = typeof page === 'object' ? page.items : [];
  const total = typeof page === 'object' ? page.total ?? items.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const types = useMemo(() => [...seenTypes.current].sort(), [items]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return (
      <ConnectionSheet
        connectionId={selected}
        onClose={() => select(null)}
        onChanged={reload}
        onDeleted={() => {
          select(null);
          reload();
        }}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="Search connections"
            aria-label="Search connections"
            className="h-8 w-56 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => pickType(type === t ? null : t)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              type === t
                ? 'border-accent-500 bg-accent-600 text-white'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            {typeWords(t)}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 dark:text-slate-500">{total} connection(s)</span>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
          >
            <Plug aria-hidden className="h-3.5 w-3.5" />
            New connection
          </button>
        </span>
      </div>

      {creating && (
        <div className="mt-3">
          <ConnectionCreateForm
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              reload();
              select(id);
            }}
          />
        </div>
      )}

      {page === 'loading' ? (
        <div role="status" className="mt-3 h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
          <span className="sr-only">Reading the connections…</span>
        </div>
      ) : page === 'error' ? (
        <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
          The connections could not be read.{' '}
          <QuietAction label="Try again" icon={RefreshCw} onClick={reload} />
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Connection</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Type</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Environment</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Last test</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Objects in use</th>
                  <th scope="col" className="px-2 py-1.5 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((r: ConnectionListItem) => {
                  const lt = r.last_test;
                  const usage = r.usage;
                  return (
                    <tr key={r.connection_id} className="text-[13px]">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => select(r.connection_id)}
                          title="Open the connection sheet"
                          className="rounded font-medium text-slate-900 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-100 dark:hover:text-accent-400"
                        >
                          {neutralLabel(r.name) || r.connection_id}
                        </button>
                        {r.draft != null && (
                          <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            draft
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {typeWords(r.type)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {r.environment ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {lt?.at ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <span className={`rounded-full px-1.5 py-px text-xs ${OVERALL_CLS[lt.overall ?? 'inconclusive'] ?? OVERALL_CLS.inconclusive}`}>
                              {lt.overall}
                            </span>
                            {fmtDateTime(lt.at)}
                            {lt.stale && (
                              <span className="text-xs text-amber-600 dark:text-amber-400" title="The configuration changed since this proof">
                                stale
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">never tested</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {usage?.known ? (
                          <span title={`${usage.applications ?? 0} application(s) · ${usage.objects ?? 0} object(s) · ${usage.jobs ?? 0} job(s)`}>
                            {usage.applications ?? 0} app(s) · {usage.objects ?? 0} object(s)
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500" title="Usage is not readable right now — unknown, not zero">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => select(r.connection_id)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                {q || type ? 'No connection matches the search.' : 'No connection yet — add a source to create one.'}
              </p>
            )}
          </div>
          <Pager
            page={Math.floor(offset / PAGE_SIZE)}
            pageCount={pageCount}
            onPage={goPage}
            total={total}
            shown={items.length}
          />
        </>
      )}

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        One registry — connections managed by the admin Connect page and the REST builder appear
        here too.{' '}
        <button type="button" onClick={onOpenObjects} className="text-accent-600 hover:underline dark:text-accent-400">
          Objects in use
        </button>{' '}
        shows what each application reads through them.
      </p>
    </section>
  );
}
