'use client';

/**
 * RealAccessPanel — "who really has access to what" in the data360 account.
 *
 * The GUI-permission matrix shows configured *view* rules (often empty). This
 * shows the REAL Snowflake RBAC picture: every user × the roles they actually
 * hold (live `SHOW USERS` + role memberships) — pair with RoleGrantsPanel to
 * drill a role into its object grants.
 *
 * Filters: a debounced search over user/email/role, a clickable role chip (the
 * role tally drills the table down to that role's holders) and an active/disabled
 * status filter — all client-side with an honest "X of Y" count. Below, a compact
 * recent-object-access panel (ACCESS_HISTORY) surfaces who-hit-what at the object
 * grain.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck, Users, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import Pager, { usePagination } from '@/components/ui/Pager';
import ExportButton from '@/components/ui/ExportButton';
import { type ReportInput } from '@/lib/export-report';
import { GlassPanel } from '@/app/shared/glass';
import {
  getUsersWithRolesAndModules,
  type RoleGrantLineage,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';
import AccessHistoryPanel from '@/app/(dashboard)/administration/access-center/components/AccessHistoryPanel';

type StatusFilter = 'all' | 'Active' | 'Disabled';

/** Compact relative-time for grant lineage; honest "—" when null/unparseable. */
function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** "granted by X · 3d ago" tooltip text for a role chip; honest "—" on absent lineage. */
function lineageTooltip(g: RoleGrantLineage | undefined): string {
  if (!g) return 'Grant lineage unavailable';
  const by = g.granted_by ? `granted by ${g.granted_by}` : 'granter —';
  const when = g.granted_at ? relativeTime(g.granted_at) : '—';
  return `${by} · ${when}`;
}

export default function RealAccessPanel() {
  const [users, setUsers] = useState<UserGrantTableData[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setState('running');
    setError(null);
    getUsersWithRolesAndModules()
      .then((u) => {
        if (!alive) return;
        setUsers(Array.isArray(u) ? u : []);
        setState('done');
      })
      .catch((e) => {
        if (!alive) return;
        setError(getApiErrorMessage(e));
        setState('error');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const roleTally = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users) for (const r of u.roles) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (roleFilter && !u.roles.some((r) => String(r).toUpperCase() === roleFilter.toUpperCase()))
        return false;
      if (debounced) {
        const hay = `${u.username} ${u.email} ${u.roles.join(' ')}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      return true;
    });
  }, [users, statusFilter, roleFilter, debounced]);

  const hasFilters = Boolean(debounced) || Boolean(roleFilter) || statusFilter !== 'all';

  // Page the filtered users (no scroll). Clamps to range on filter change.
  const pager = usePagination(filtered, 12);

  // Snapshot the CURRENT filtered view (full set, not just the page) to CSV. One
  // row per user×role so per-role grant lineage (granted_by/at) is preserved.
  const buildReport = (): ReportInput => {
    const rows: (string | number | null)[][] = [];
    for (const u of filtered) {
      const lineageByRole = new Map<string, RoleGrantLineage>();
      for (const g of u.roleGrants) lineageByRole.set(String(g.role).toUpperCase(), g);
      if (u.roles.length === 0) {
        rows.push([u.username, u.email || null, '—', u.status, null, null]);
      } else {
        for (const r of u.roles) {
          const g = lineageByRole.get(String(r).toUpperCase());
          rows.push([u.username, u.email || null, r, u.status, g?.granted_by ?? null, g?.granted_at ?? null]);
        }
      }
    }
    return {
      title: 'Access — Users & Roles',
      meta: [
        { label: 'Generated at', value: new Date().toISOString() },
        { label: 'Search', value: search.trim() || null },
        { label: 'Role filter', value: roleFilter || null },
        { label: 'Status filter', value: statusFilter },
        { label: 'Users shown', value: `${filtered.length} of ${users.length}` },
      ],
      sections: [
        {
          name: 'Users × roles (real account RBAC)',
          columns: ['User', 'Email', 'Role', 'Status', 'Granted by', 'Granted at'],
          rows,
        },
      ],
    };
  };

  return (
    <div className="space-y-3">
      <GlassPanel depth={1} radius="xl" className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <Users className="h-3.5 w-3.5" /> Who has access — real account RBAC
            </p>
            <p className="text-[10px] text-slate-400">
              Users × the roles they hold (live) · hover a role for grant lineage · {users.length} users
            </p>
          </div>
          {state === 'done' && users.length > 0 && (
            <ExportButton buildReport={buildReport} disabled={filtered.length === 0} />
          )}
        </div>

        {state === 'running' || state === 'idle' ? (
          <div className="space-y-1.5 p-3" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex items-start gap-1.5 p-3 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 break-words">
              {error}{' '}
              <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>
                Retry
              </button>
            </span>
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={ShieldCheck} compact title="No users found" />
        ) : (
          <>
            {/* Search + status filter */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <div className="relative min-w-[160px] flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search user / email / role…"
                  aria-label="Search users, emails or roles"
                  className="w-full rounded border border-slate-200 bg-transparent py-1 pl-7 pr-2 text-[11px] outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700"
                />
              </div>
              <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                {(['all', 'Active', 'Disabled'] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition-colors',
                      statusFilter === s
                        ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                        : 'text-slate-500',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-[10px] text-slate-400">
                {filtered.length} of {users.length}
              </span>
            </div>

            {/* Role tally chips — click to drill down to that role's holders */}
            {roleTally.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                {roleTally.map(([role, n]) => {
                  const active = roleFilter?.toUpperCase() === role.toUpperCase();
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRoleFilter(active ? null : role)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40',
                      )}
                    >
                      {role} · {n}
                    </button>
                  );
                })}
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setRoleFilter(null);
                      setStatusFilter('all');
                    }}
                    className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              {filtered.length === 0 ? (
                <EmptyState icon={Search} compact title="No users match the current filters" />
              ) : (
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="glass-2 px-3 py-1.5 text-left font-semibold">User</th>
                      <th className="glass-2 px-2 py-1.5 text-left font-semibold">Roles (access)</th>
                      <th className="glass-2 px-2 py-1.5 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pager.slice.map((u) => {
                      // Per-user role→lineage map (who granted the role + when).
                      const lineageByRole = new Map<string, RoleGrantLineage>();
                      for (const g of u.roleGrants) lineageByRole.set(String(g.role).toUpperCase(), g);
                      return (
                      <tr key={u.username} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="max-w-[220px] px-3 py-1.5 align-top">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-100" title={u.username}>{u.username}</p>
                          {u.email && <p className="truncate text-[10px] text-slate-400" title={u.email}>{u.email}</p>}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0 ? (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            ) : (
                              u.roles.map((r) => {
                                const active = roleFilter?.toUpperCase() === String(r).toUpperCase();
                                const lineage = lineageByRole.get(String(r).toUpperCase());
                                return (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => setRoleFilter(active ? null : r)}
                                    title={lineageTooltip(lineage)}
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                                      active
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
                                    )}
                                  >
                                    {r}
                                    {lineage?.granted_by && (
                                      <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                                        · {lineage.granted_by}
                                      </span>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                              u.status === 'Active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                            )}
                          >
                            {u.status}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {filtered.length > 0 && (
              <div className="px-3 pb-2">
                <Pager
                  page={pager.page}
                  pageCount={pager.pageCount}
                  total={pager.total}
                  from={pager.from}
                  to={pager.to}
                  onPage={pager.setPage}
                  unit="users"
                />
              </div>
            )}
          </>
        )}
      </GlassPanel>

      {/* Recent object access (ACCESS_HISTORY) — who-hit-what at the object grain. */}
      <AccessHistoryPanel days={7} />
    </div>
  );
}
