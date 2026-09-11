'use client';

/**
 * RoleMembershipSurface — who holds each Data360 role. The account's users, and
 * the warehouse roles they hold, bucketed into the seven-role Data360 taxonomy
 * (Admin · Data Engineer · Data Analyst · Data Steward · Business User · AI
 * Engineer · FinOps Manager) — the "grant users / roles → Data360 groups by
 * Data360 type of user" view.
 *
 * Honesty (the two axes are not equal):
 *  • PEOPLE axis is AUTHORITATIVE. The backend resolves each user to a SINGLE
 *    highest-priority Data360 role (getEffectiveUserPermissions.d360_role), so
 *    the buckets are a PARTITION — every user is in exactly one group.
 *  • WAREHOUSE-ROLE axis is OBSERVATIONAL. There is no Snowflake-role → Data360
 *    map served to the client, so a warehouse role's Data360 group is inferred
 *    from the users who hold it. A warehouse role granted to no user cannot
 *    appear, and one seen under two Data360 groups is shown under both — that is
 *    labelled, never presented as a definitive mapping.
 *
 * Admin-only (the resolver is admin-gated). Resolution is N per-user calls run
 * through a small concurrency pool with a live "resolved N of M" progress, the
 * same cost the Access matrix already pays — reading the d360_role/snowflake
 * fields it discards, so this adds no new endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Info,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users as UsersIcon,
} from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/config/constants';
import { getUsersWithRolesAndModules, type UserGrantTableData } from '@/app/services/governance/user_roles';
import { getEffectiveUserPermissions } from '@/app/services/governance/fetch_roles';
import { D360_DATA_ROLES } from '@/app/services/platform/grants';

/* ── Avatar (real initials, deterministic colour) — mirrors UserAccessMatrix ── */
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
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: colorFor(name || email || '?') }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}

/* Small concurrency pool so we don't fire one request per user at once. */
async function pool<T, R>(
  items: T[],
  n: number,
  fn: (it: T, i: number) => Promise<R>,
  onEach: (i: number, r: R) => void,
) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        onEach(i, await fn(items[i], i));
      } catch {
        onEach(i, undefined as unknown as R);
      }
    }
  });
  await Promise.all(workers);
}

type Resolved = { d360_role: string; snowflake_roles: string[] } | 'loading' | 'error';

const UNASSIGNED = 'Unassigned';

/** the role's one-line meaning — kept generic (no vendor terms). */
const ROLE_HINT: Record<string, string> = {
  Admin: 'Full platform control — changes access and governance',
  'Data Engineer': 'Builds and runs the pipelines and models',
  'Data Analyst': 'Reads and analyses the modelled data',
  'Data Steward': 'Curates the catalog, quality and glossary',
  'Business User': 'Consumes reports and dashboards',
  'AI Engineer': 'Builds the AI and agentic features',
  'FinOps Manager': 'Watches cost and consumption',
  [UNASSIGNED]: 'No Data360 role resolved — holds no role the platform maps',
};

function RoleMembership() {
  const [users, setUsers] = useState<UserGrantTableData[]>([]);
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [axis, setAxis] = useState<'people' | 'warehouse'>('people');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDone(0);
    try {
      const list = await getUsersWithRolesAndModules();
      setUsers(list);
      setLoading(false);
      setResolved(Object.fromEntries(list.map((u) => [u.username, 'loading' as Resolved])));
      setResolving(true);
      await pool(
        list,
        5,
        (u) => getEffectiveUserPermissions(u.username),
        (i, res) => {
          const u = list[i];
          setResolved((prev) => ({
            ...prev,
            [u.username]: res
              ? { d360_role: res.d360_role || '', snowflake_roles: res.snowflake_roles ?? [] }
              : 'error',
          }));
          setDone((d) => d + 1);
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read the account users.');
      setLoading(false);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOf = useCallback(
    (username: string): string => {
      const r = resolved[username];
      if (!r || r === 'loading' || r === 'error') return UNASSIGNED;
      return r.d360_role && D360_DATA_ROLES.includes(r.d360_role as (typeof D360_DATA_ROLES)[number])
        ? r.d360_role
        : r.d360_role || UNASSIGNED;
    },
    [resolved],
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const r = resolved[u.username];
      const wh = r && r !== 'loading' && r !== 'error' ? r.snowflake_roles : u.roles;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        wh.some((w) => w.toLowerCase().includes(q))
      );
    });
  }, [users, query, resolved]);

  /* the seven buckets (+ Unassigned + any non-standard resolved role), in the
     taxonomy order, filled with the users the platform resolved into each. */
  const peopleBuckets = useMemo(() => {
    const order = [...D360_DATA_ROLES] as string[];
    const map = new Map<string, UserGrantTableData[]>();
    for (const role of order) map.set(role, []);
    for (const u of filteredUsers) {
      const role = roleOf(u.username);
      if (!map.has(role)) map.set(role, []);
      map.get(role)!.push(u);
    }
    // Unassigned last; any extra resolved role after the seven, before Unassigned
    const extra = [...map.keys()].filter((k) => !order.includes(k) && k !== UNASSIGNED);
    const finalOrder = [...order, ...extra, UNASSIGNED];
    return finalOrder
      .map((role) => ({ role, members: map.get(role) ?? [] }))
      .filter((b) => b.members.length > 0 || D360_DATA_ROLES.includes(b.role as (typeof D360_DATA_ROLES)[number]));
  }, [filteredUsers, roleOf]);

  /* the observational warehouse-role → Data360-role(s) inference: for each
     warehouse role a user holds, which Data360 buckets its holders landed in. */
  const warehouseRows = useMemo(() => {
    const m = new Map<string, { roles: Set<string>; users: number }>();
    for (const u of filteredUsers) {
      const r = resolved[u.username];
      if (!r || r === 'loading' || r === 'error') continue;
      const bucket = roleOf(u.username);
      for (const wh of r.snowflake_roles) {
        const cur = m.get(wh) ?? { roles: new Set<string>(), users: 0 };
        cur.roles.add(bucket);
        cur.users += 1;
        m.set(wh, cur);
      }
    }
    return [...m.entries()]
      .map(([wh, v]) => ({ wh, roles: [...v.roles], users: v.users }))
      .sort((a, b) => b.users - a.users || a.wh.localeCompare(b.wh));
  }, [filteredUsers, resolved, roleOf]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* header + progress + controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Who holds each Data360 role
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {users.length} account user{users.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* axis toggle: people (authoritative) vs warehouse roles (observed) */}
        <div className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" role="tablist" aria-label="Group by">
          {(['people', 'warehouse'] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={axis === a}
              onClick={() => setAxis(a)}
              className={`px-2.5 py-1 text-xs font-medium ${
                axis === a
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {a === 'people' ? 'People' : 'Warehouse roles'}
            </button>
          ))}
        </div>

        <label className="relative">
          <span className="sr-only">Search users or roles</span>
          <Search aria-hidden className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a user or a role"
            className="h-8 w-56 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          {resolving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
              resolving {done} of {users.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={resolving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* the honesty line for the chosen axis */}
      <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {axis === 'people' ? (
          <span>
            The platform resolves each user to a single Data360 role — every user appears in exactly
            one group. A person&rsquo;s warehouse roles are shown as chips; the group is the resolved role,
            not a raw grant.
          </span>
        ) : (
          <span>
            Observed, not definitive: a warehouse role&rsquo;s Data360 group is inferred from the users who
            hold it. A role granted to no user cannot appear here, and one seen under two groups is shown
            under both. Grant the warehouse role a member to make its group certain.
          </span>
        )}
      </p>

      {/* ── PEOPLE axis: the seven buckets as cards ──────────────────────── */}
      {axis === 'people' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {peopleBuckets.map(({ role, members }) => (
            <section
              key={role}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
                  style={{ background: role === UNASSIGNED ? '#94a3b8' : colorFor(role) }}
                  aria-hidden
                >
                  {role === UNASSIGNED ? <UserRound className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                </span>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{role}</h4>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {members.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{ROLE_HINT[role] ?? 'Data360 role'}</p>

              {members.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No user holds this role yet.</p>
              ) : (
                <ul className="mt-2 max-h-64 space-y-1 overflow-auto pr-0.5">
                  {members.slice(0, 60).map((u) => {
                    const r = resolved[u.username];
                    const wh = r && r !== 'loading' && r !== 'error' ? r.snowflake_roles : u.roles;
                    return (
                      <li key={u.username} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <Avatar name={u.displayName || u.username} email={u.email} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-200">
                              {u.username}
                            </span>
                            {u.status === 'Disabled' && (
                              <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                disabled
                              </span>
                            )}
                          </span>
                          {u.email && (
                            <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">{u.email}</span>
                          )}
                          {wh.length > 0 && (
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {wh.slice(0, 4).map((w) => (
                                <span
                                  key={w}
                                  className="rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                >
                                  {w}
                                </span>
                              ))}
                              {wh.length > 4 && <span className="text-[10px] text-slate-400">+{wh.length - 4}</span>}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                  {members.length > 60 && (
                    <li className="px-1.5 text-[11px] text-slate-400">
                      +{members.length - 60} more — narrow the search to see them.
                    </li>
                  )}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : (
        /* ── WAREHOUSE-ROLE axis: role → Data360 group(s) (observed) ─────── */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Warehouse role
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Resolves to (observed)
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Holders
                </th>
              </tr>
            </thead>
            <tbody>
              {warehouseRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-[13px] text-slate-500 dark:text-slate-400">
                    {resolving ? 'Resolving the account users…' : 'No warehouse role could be observed from the resolved users.'}
                  </td>
                </tr>
              ) : (
                warehouseRows.map(({ wh, roles, users: holders }) => (
                  <tr key={wh} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700 dark:text-slate-200">
                        <Layers aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                        {wh}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
                            style={{ background: role === UNASSIGNED ? '#94a3b8' : colorFor(role) }}
                          >
                            {role}
                          </span>
                        ))}
                        {roles.length > 1 && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            seen under {roles.length} groups
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-slate-600 dark:text-slate-300">
                      {holders}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Admin-gated wrapper — embeddable body used by the "By Data360 role" tab of
 * GovernanceEntitySurface (mirrors AccessMatrixSurface). No PageHeader here.
 */
export function RoleMembershipSurface() {
  const { role } = useAuth();
  if (!isAdminRole(role)) {
    return (
      <EmptyState
        icon={Lock}
        title="Access restricted"
        description="Role membership is only available to platform administrators (ACCOUNTADMIN, SYSADMIN, SECURITYADMIN)."
      />
    );
  }
  return (
    <div className="rounded-xl border border-muted bg-white p-4 dark:bg-gray-800">
      <RoleMembership />
    </div>
  );
}

export default RoleMembershipSurface;
