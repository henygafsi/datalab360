'use client';

/**
 * ObjectAccessMatrixPanel — "who can access every object" grid, from real
 * Snowflake grants (GET /api/platform/object-permission-matrix). One row per
 * user: their roles + every object they can touch and the privilege. Expandable
 * per user. Honest enforcement banner when grants are configured-not-enforced.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, KeyRound, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  getObjectPermissionMatrix,
  type ObjectAccessRow,
} from '@/app/services/platform/object-access';

const PRIV_CLASS: Record<string, string> = {
  SELECT: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  USAGE: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  INSERT: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  UPDATE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DELETE: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  OWNERSHIP: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};
const short = (fqn: string) => fqn.split('.').slice(-2).join('.');

export default function ObjectAccessMatrixPanel() {
  const [rows, setRows] = useState<ObjectAccessRow[] | null>(null);
  const [enforcement, setEnforcement] = useState<{ status: string; detail?: string } | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getObjectPermissionMatrix();
      setRows(res.rows);
      setEnforcement(res.enforcement);
      setTruncated(res.truncated);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.username.toLowerCase().includes(q) ||
      r.roles.some((x) => x.toLowerCase().includes(q)) ||
      Object.keys(r.access).some((o) => o.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const toggle = (u: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(u) ? next.delete(u) : next.add(u);
      return next;
    });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" data-testid="object-access-matrix-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-blue-500" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Object Access Matrix</h3>
          {rows && <span className="text-[11px] text-slate-400">{rows.length} users · real Snowflake grants</span>}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden /> Refresh
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Exactly who can touch each object — expand a user to see the per-object privileges.</p>

      {enforcement && enforcement.status !== 'enforced' && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-300">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
          <span><span className="font-semibold">{enforcement.status}</span>{enforcement.detail ? ` — ${enforcement.detail}` : ''}</span>
        </div>
      )}

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user, role or object…"
          aria-label="Search object access"
          className="w-full rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>

      {loading && !rows && (
        <div className="mt-3 space-y-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-7 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}</div>
      )}
      {error && !loading && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/40 p-2 text-[11px] text-red-600 dark:border-red-800 dark:bg-red-900/10 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /><span>{error}</span>
        </div>
      )}
      {rows && (
        <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
          {filtered.map((r) => {
            const objCount = Object.keys(r.access).length;
            const open = expanded.has(r.username);
            return (
              <div key={r.username} className="border-t border-slate-100 first:border-t-0 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => toggle(r.username)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  {open ? <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" /> : <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />}
                  <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">{r.username}</span>
                  <span className="truncate text-[10px] text-slate-400">{r.roles.join(', ') || 'no roles'}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-slate-400">{objCount} object{objCount === 1 ? '' : 's'}</span>
                </button>
                {open && (
                  <div className="space-y-1 px-7 pb-2">
                    {Object.entries(r.access).map(([obj, privs]) => (
                      <div key={obj} className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-[10px] text-slate-600 dark:text-slate-400" title={obj}>{short(obj)}</span>
                        <span className="ml-auto flex shrink-0 flex-wrap gap-0.5">
                          {privs.map((p) => (
                            <span key={p} className={cn('rounded px-1 py-0 text-[9px] font-semibold', PRIV_CLASS[p] ?? PRIV_CLASS.USAGE)}>{p}</span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-slate-400">No users match.</div>}
        </div>
      )}
      {truncated && <p className="mt-1.5 text-[10px] text-slate-400">Showing a representative sample — the full grant set is larger.</p>}
    </div>
  );
}
