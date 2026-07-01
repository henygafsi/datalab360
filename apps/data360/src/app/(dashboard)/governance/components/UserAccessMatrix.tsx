'use client';

/**
 * UserAccessMatrix — real users (avatars) × Data360 UI pages, where each cell is
 * the user's GOVERNANCE-resolved access to that page (granted per role).
 *
 * Data spine (all real, no fakes):
 *   • rows    = getUsersWithRolesAndModules()  → real users (name/email/roles)
 *   • columns = MODULES (config/modules.ts)    → the Data360 UI pages
 *   • cells   = getEffectiveUserPermissions(u) → modules_summary {allowed,total}
 *               the exact runtime page-access decision the backend resolves from
 *               the user's roles (Snowflake role → D360 role → matrix allow-set).
 *
 * Admin-only (getEffectiveUserPermissions is admin-gated). Per-user resolution
 * is N calls, run through a small concurrency pool with progressive rendering so
 * the grid fills in as answers arrive instead of blocking on the whole set.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { getUsersWithRolesAndModules, type UserGrantTableData } from '@/app/services/governance/user_roles';
import { getEffectiveUserPermissions } from '@/app/services/governance/fetch_roles';
import { MODULES } from '@/config/modules';
import { isAdminRole } from '@/config/constants';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { RefreshCw, Search, ShieldCheck } from 'lucide-react';

// ── Avatar (real initials, deterministic colour) ────────────────────────────
const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
  '#16a34a', '#0891b2', '#4f46e5', '#9333ea', '#0d9488',
];
function initials(name: string, email: string): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function Avatar({ name, email }: { name: string; email: string }) {
  const bg = colorFor(name || email || '?');
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: bg }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}

// ── Access cell ─────────────────────────────────────────────────────────────
type Access = { allowed: number; total: number } | 'loading' | 'none' | 'error';
function levelOf(a: Access): { label: string; bg: string; fg: string; title: string } {
  if (a === 'loading') return { label: '…', bg: '#f1f5f9', fg: '#94a3b8', title: 'Resolving…' };
  if (a === 'error') return { label: '?', bg: '#fef2f2', fg: '#b91c1c', title: 'Could not resolve' };
  if (a === 'none' || a.total === 0 || a.allowed === 0)
    return { label: '—', bg: '#f8fafc', fg: '#cbd5e1', title: 'No access' };
  if (a.allowed >= a.total)
    return { label: '✓', bg: '#dcfce7', fg: '#15803d', title: `Full access (${a.allowed}/${a.total} actions)` };
  return { label: `${a.allowed}/${a.total}`, bg: '#fef9c3', fg: '#a16207', title: `Partial access (${a.allowed}/${a.total} actions)` };
}

// Small concurrency pool so we don't fire one request per user simultaneously.
async function pool<T, R>(items: T[], n: number, fn: (it: T, i: number) => Promise<R>, onEach: (i: number, r: R) => void) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try { onEach(i, await fn(items[i], i)); } catch { onEach(i, undefined as unknown as R); }
    }
  });
  await Promise.all(workers);
}

type RowAccess = Record<string, Access>; // moduleApiName(lowercase) → Access

export default function UserAccessMatrix() {
  const columns = useMemo(() => MODULES.map((m) => ({ apiName: m.apiName.toLowerCase(), name: m.name })), []);
  const [users, setUsers] = useState<UserGrantTableData[]>([]);
  const [access, setAccess] = useState<Record<string, RowAccess>>({}); // username → RowAccess
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await getUsersWithRolesAndModules();
      setUsers(list);
      setLoading(false);
      // Seed every cell as 'loading', then resolve per-user effective access.
      const seed: Record<string, RowAccess> = {};
      for (const u of list) {
        seed[u.username] = Object.fromEntries(columns.map((c) => [c.apiName, 'loading' as Access]));
      }
      setAccess(seed);
      setResolving(true);
      await pool(list, 5, (u) => getEffectiveUserPermissions(u.username), (i, res) => {
        const u = list[i];
        const row: RowAccess = Object.fromEntries(columns.map((c) => [c.apiName, 'none' as Access]));
        if (res && Array.isArray(res.modules_summary)) {
          for (const ms of res.modules_summary) {
            const key = String(ms.module || '').toLowerCase();
            if (key in row) row[key] = { allowed: ms.allowed, total: ms.total };
          }
        } else if (!res) {
          for (const c of columns) row[c.apiName] = 'error';
        }
        setAccess((prev) => ({ ...prev, [u.username]: row }));
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load the access matrix.');
      setLoading(false);
    } finally {
      setResolving(false);
    }
  }, [columns]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) || u.roles.some((r) => r.toLowerCase().includes(q)),
    );
  }, [users, query]);

  if (loading) return <TableSkeleton rows={8} columns={6} />;
  if (error) return <ErrorDisplay error={error} onRetry={() => load()} context="general" />;
  if (users.length === 0)
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">
        No users found.
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by user, email or role…"
            className="w-72 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{filtered.length} user{filtered.length === 1 ? '' : 's'} · {columns.length} pages</span>
          {resolving && (
            <span className="flex items-center gap-1.5 text-blue-600"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> resolving access…</span>
          )}
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded" style={{ background: '#dcfce7' }} /> full</span>
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded" style={{ background: '#fef9c3' }} /> partial</span>
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }} /> none</span>
          </span>
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
                User
              </th>
              {columns.map((c) => (
                <th key={c.apiName} className="px-2 py-3 text-center font-medium text-gray-600 dark:text-gray-300" title={c.name}>
                  <span className="inline-block max-w-[88px] truncate align-middle text-xs">{c.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const admin = u.roles.some((r) => isAdminRole(r));
              const row = access[u.username] ?? {};
              return (
                <tr key={u.username} className="border-t border-gray-100 hover:bg-blue-50/40 dark:border-gray-700 dark:hover:bg-blue-900/10">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2.5 dark:bg-gray-900">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.displayName} email={u.email} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white">
                          <span className="truncate">{u.displayName || u.username}</span>
                          {admin && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Administrator" />}
                          {u.status === 'Disabled' && <span className="rounded bg-gray-200 px-1.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700">disabled</span>}
                        </div>
                        <div className="truncate text-xs text-gray-500">{u.email || u.username}</div>
                        {u.roles.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {u.roles.slice(0, 3).map((r) => (
                              <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">{r}</span>
                            ))}
                            {u.roles.length > 3 && <span className="text-[10px] text-slate-400">+{u.roles.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {columns.map((c) => {
                    const cell = levelOf(row[c.apiName] ?? 'none');
                    return (
                      <td key={c.apiName} className="px-2 py-2.5 text-center">
                        <span
                          className="inline-flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-semibold"
                          style={{ background: cell.bg, color: cell.fg }}
                          title={`${u.displayName || u.username} · ${c.name}: ${cell.title}`}
                        >
                          {cell.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
