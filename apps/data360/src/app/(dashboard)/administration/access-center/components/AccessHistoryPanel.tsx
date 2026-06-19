'use client';

/**
 * AccessHistoryPanel — "who accessed what" surface. Backed by GET
 * /observability/lineage/access-patterns, which reads ACCESS_HISTORY on the
 * caller's own connection (works locally + prod).
 *
 * Each row is an object with its total access count, DISTINCT-user count and
 * last-accessed time. When the backend supplies per-object `by_user` lineage,
 * the row expands to reveal the top users who accessed it (with their own
 * access_count + last_accessed). When that grain is absent we stay honest:
 * "—"/no expand affordance. Absent / not-deployed → a quiet empty state.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, History, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { GlassPanel } from '@/app/shared/glass';
import { getAccessPatterns } from '@/app/services/observability';
import type { AccessPattern } from '@/app/services/observability/types';

type Phase = 'idle' | 'running' | 'done' | 'error';

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AccessHistoryPanel({ days = 7 }: { days?: number }) {
  const [rows, setRows] = useState<AccessPattern[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setPhase('running');
    setError(null);
    getAccessPatterns(days)
      .then((res) => {
        if (!alive) return;
        const patterns = Array.isArray(res?.patterns) ? res.patterns : [];
        // Most-accessed first so the panel leads with the hot objects.
        patterns.sort((a, b) => (b.access_count ?? 0) - (a.access_count ?? 0));
        setRows(patterns);
        setPhase('done');
      })
      .catch((e) => {
        if (!alive) return;
        setError(getApiErrorMessage(e));
        setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, [days, reloadKey]);

  const filtered = useMemo(() => {
    if (!debounced) return rows;
    return rows.filter((r) =>
      `${r.database} ${r.schema} ${r.table} ${r.access_type}`.toLowerCase().includes(debounced),
    );
  }, [rows, debounced]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <GlassPanel depth={1} radius="xl" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <History className="h-3.5 w-3.5" /> Who accessed what (last {days}d)
          </p>
          <p className="text-[10px] text-slate-400">
            Most-accessed objects · access count · distinct users · expand for who
          </p>
        </div>
      </div>

      {phase === 'done' && rows.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter database / schema / object…"
              className="w-full rounded border border-slate-200 bg-transparent py-1 pl-7 pr-2 text-[11px] outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700"
            />
          </div>
          <span className="shrink-0 text-[10px] text-slate-400">
            {filtered.length} of {rows.length}
          </span>
        </div>
      )}

      {phase === 'running' || phase === 'idle' ? (
        <div className="space-y-1.5 p-3" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      ) : phase === 'error' ? (
        <div className="flex items-start gap-1.5 p-3 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 break-words">
            {error}{' '}
            <button type="button" className="underline" onClick={retry}>
              Retry
            </button>
          </span>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={History} compact title="No recent object access recorded" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} compact title={`No objects match "${search}"`} />
      ) : (
        <div className="scrollbar-thin max-h-[340px] overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0">
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="glass-2 px-3 py-1.5 text-left font-semibold">Object</th>
                <th className="glass-2 px-2 py-1.5 text-right font-semibold">Accesses</th>
                <th className="glass-2 px-2 py-1.5 text-right font-semibold">Users</th>
                <th className="glass-2 px-2 py-1.5 text-left font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const rowKey = `${r.database}.${r.schema}.${r.table}:${i}`;
                const byUser = Array.isArray(r.by_user) ? r.by_user : [];
                const hasWho = byUser.length > 0;
                const expanded = hasWho && expandedKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr
                      onClick={hasWho ? () => setExpandedKey(expanded ? null : rowKey) : undefined}
                      className={cn(
                        'border-b border-slate-100 dark:border-slate-800',
                        hasWho && 'cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40',
                      )}
                    >
                      <td className="px-3 py-1.5 align-top">
                        <div className="flex items-start gap-1">
                          {hasWho ? (
                            expanded ? (
                              <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                            )
                          ) : (
                            <span className="w-3 shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <p className="break-all font-mono font-medium text-slate-800 dark:text-slate-100">{r.table || '—'}</p>
                            <p className="break-all text-[10px] text-slate-400">
                              {[r.database, r.schema].filter(Boolean).join('.') || '—'}
                              {r.access_type ? ` · ${r.access_type}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right align-top font-medium text-slate-700 dark:text-slate-200">
                        {r.access_count ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right align-top text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-0.5">
                          <Users className="h-3 w-3 text-slate-400" />
                          {r.unique_users ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 align-top text-slate-500 dark:text-slate-400">{fmtWhen(r.last_accessed)}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <td colSpan={4} className="bg-slate-50/70 px-3 py-2 dark:bg-slate-800/30">
                          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            <Users className="h-3 w-3" /> Who accessed this object
                          </p>
                          <ul className="space-y-0.5">
                            {byUser.map((w, j) => (
                              <li
                                key={`${w.user}:${j}`}
                                className="flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-300"
                              >
                                <span className="break-all font-medium text-slate-700 dark:text-slate-200">{w.user || '—'}</span>
                                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                                  {w.access_count ?? '—'} accesses · {fmtWhen(w.last_accessed)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}
