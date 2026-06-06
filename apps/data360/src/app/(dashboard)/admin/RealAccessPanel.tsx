'use client';

/**
 * RealAccessPanel — "who really has access to what" in the data360 account.
 *
 * The GUI-permission matrix shows configured *view* rules (often empty). This
 * shows the REAL Snowflake RBAC picture: every user × the roles they actually
 * hold (live `SHOW USERS` + role memberships) — pair with RoleGrantsPanel to
 * drill a role into its object grants.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { GlassPanel } from '@/app/shared/glass';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';

export default function RealAccessPanel() {
  const [users, setUsers] = useState<UserGrantTableData[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  return (
    <GlassPanel depth={1} radius="xl" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Users className="h-3.5 w-3.5" /> Who has access — real account RBAC
          </p>
          <p className="text-[10px] text-slate-400">
            Users × the Snowflake roles they hold (live) · {users.length} users
          </p>
        </div>
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
          {roleTally.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              {roleTally.map(([role, n]) => (
                <span
                  key={role}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                >
                  {role} · {n}
                </span>
              ))}
            </div>
          )}
          <div className="scrollbar-thin max-h-[420px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0">
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="glass-2 px-3 py-1.5 text-left font-semibold">User</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Roles (access)</th>
                  <th className="glass-2 px-2 py-1.5 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.username} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-1.5 align-top">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{u.username}</p>
                      {u.email && <p className="text-[10px] text-slate-400">{u.email}</p>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          u.roles.map((r) => (
                            <span
                              key={r}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            >
                              {r}
                            </span>
                          ))
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </GlassPanel>
  );
}
