'use client';

/**
 * RoleGrantsPanel — granular Snowflake-RBAC grant management for the admin console.
 *
 * Pick a role → see its object-level privileges (real `SHOW GRANTS`) → revoke any
 * one live via POST /gouvernance/revoke-permission (traced REVOKE_PERMISSION).
 * Complements the GUI-permission matrix: this is the actual Snowflake RBAC plane.
 *
 * Drill-down: the header shows the users who actually HOLD the selected role
 * (live SHOW USERS join), and a debounced search filters the grant rows by
 * privilege / object-type / object-name with an honest "X of Y" count.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import Pager, { usePagination } from '@/components/ui/Pager';
import { GlassPanel } from '@/app/shared/glass';
import { getRoles } from '@/app/services/governance/fetch_roles';
import {
  getRolesForGrantsMatrix,
  revokePermission,
  type RoleGrant,
} from '@/app/services/governance/fetch_grants';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';
import { toast } from '@/hooks/use-toast';

export default function RoleGrantsPanel() {
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string>('');
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [users, setUsers] = useState<UserGrantTableData[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Debounced grant search (privilege / object-type / object-name).
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    // Snowflake roles (SHOW GRANTS needs a real Snowflake role, not a D360 app role).
    getRoles()
      .then((rs) => {
        const names = rs
          .map((r) => (r as { role?: string; role_name?: string }).role ?? (r as { role_name?: string }).role_name ?? '')
          .filter(Boolean);
        setRoles(Array.from(new Set(names)).sort());
        if (names.length && !role) setRole(names[0]);
      })
      .catch(() => {});
    // Users (best-effort) — drives the "who holds this role" drill-down.
    getUsersWithRolesAndModules()
      .then((u) => setUsers(Array.isArray(u) ? u : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGrants = useCallback(async (r: string) => {
    if (!r) return;
    setState('running');
    setError(null);
    try {
      const g = await getRolesForGrantsMatrix(r);
      setGrants(Array.isArray(g) ? g : []);
      setState('done');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setGrants([]);
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (role) void loadGrants(role);
  }, [role, loadGrants]);

  // Users who actually hold the selected role (role → users drill-down).
  const roleUsers = useMemo(() => {
    if (!role) return [];
    const t = role.toUpperCase();
    return users.filter((u) => (u.roles ?? []).some((r) => String(r).toUpperCase() === t));
  }, [users, role]);

  const filteredGrants = useMemo(() => {
    if (!debounced) return grants;
    return grants.filter((g) =>
      `${g.privilege} ${g.granted_on} ${g.name}`.toLowerCase().includes(debounced),
    );
  }, [grants, debounced]);

  // Page the filtered grants (no scroll). Clamps to range on filter/role change.
  const pager = usePagination(filteredGrants, 12);

  const revoke = async (grant: RoleGrant, rowKey: string) => {
    if (!grant.revocable) {
      toast({ title: 'Cannot revoke: incomplete grant info' });
      return;
    }
    if (!window.confirm(`Revoke ${grant.privilege} on ${grant.name} from ${role}?`)) return;
    setRevoking(rowKey);
    try {
      await revokePermission([grant.privilege], grant.granted_on, grant.name, role);
      toast({ title: `Revoked ${grant.privilege} on ${grant.name}` });
      // Drop from the source list (filtered view recomputes).
      setGrants((g) => g.filter((row) => row !== grant));
    } catch (e) {
      toast({ title: getApiErrorMessage(e) });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <GlassPanel depth={1} radius="xl" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Role grants — Snowflake RBAC</p>
          <p className="text-[10px] text-slate-400">Object-level privileges per role · grant/revoke live</p>
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded border border-slate-200 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
          aria-label="Role"
        >
          {roles.length === 0 && <option value="">No roles</option>}
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Role → users drill-down (who actually holds this role). */}
      {role && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            <Users className="h-3 w-3" /> Holders
          </span>
          {users.length === 0 ? (
            <span className="text-[10px] text-slate-400">—</span>
          ) : roleUsers.length === 0 ? (
            <span className="text-[10px] text-slate-400">No users hold this role</span>
          ) : (
            roleUsers.slice(0, 12).map((u) => (
              <span
                key={u.username}
                title={u.email || u.username}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                {u.username}
              </span>
            ))
          )}
          {roleUsers.length > 12 && (
            <span className="text-[10px] text-slate-400">+{roleUsers.length - 12} more</span>
          )}
        </div>
      )}

      {/* Search over grant rows. */}
      {state === 'done' && grants.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter privilege / object…"
              className="w-full rounded border border-slate-200 bg-transparent py-1 pl-7 pr-2 text-[11px] outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700"
            />
          </div>
          <span className="shrink-0 text-[10px] text-slate-400">
            {filteredGrants.length} of {grants.length}
          </span>
        </div>
      )}

      {state === 'running' || state === 'idle' ? (
        <div className="space-y-1.5 p-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      ) : state === 'error' ? (
        <div className="flex items-start gap-1.5 p-3 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 break-words">
            {error}{' '}
            <button type="button" className="underline" onClick={() => void loadGrants(role)}>
              Retry
            </button>
          </span>
        </div>
      ) : grants.length === 0 ? (
        <EmptyState icon={ShieldCheck} compact title="No object grants for this role" />
      ) : filteredGrants.length === 0 ? (
        <EmptyState icon={Search} compact title={`No grants match "${search}"`} />
      ) : (
        <>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pager.slice.map((g, i) => {
              // Absolute index across pages → globally-stable key + revoke state.
              const abs = pager.from - 1 + i;
              const rowKey = `${g.privilege}:${g.granted_on}:${g.name}:${abs}`;
              return (
                <div key={rowKey} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{g.privilege || 'Grant'}</span>
                    <span className="text-slate-400"> on {g.granted_on || '—'} </span>
                    {g.name && <span className="break-all font-mono text-slate-500 dark:text-slate-400">{g.name}</span>}
                  </div>
                  <button
                    type="button"
                    disabled={revoking === rowKey || !g.revocable}
                    title={g.revocable ? undefined : 'Grant is missing an object type/name — cannot revoke safely'}
                    onClick={() => void revoke(g, rowKey)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20',
                    )}
                  >
                    {revoking === rowKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-3 pb-2">
            <Pager
              page={pager.page}
              pageCount={pager.pageCount}
              total={pager.total}
              from={pager.from}
              to={pager.to}
              onPage={pager.setPage}
              unit="grants"
            />
          </div>
        </>
      )}
    </GlassPanel>
  );
}
