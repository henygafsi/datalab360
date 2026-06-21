'use client';

/**
 * ProvisioningPanel — the "Provisioning" section of the Admin command center.
 *
 * Who is provisioned with what: every account user with their granted roles and
 * activation status (Snowflake SHOW USERS via /gouvernance/users-with-roles),
 * rendered as a single honest, paginated AuditTable. A user with no roles shows
 * "—" (never a fabricated 0). Read-only roster — no mutations, nothing gated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { UserCog } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { Spinner, ErrBox, Chip } from './shared';

type Phase = 'loading' | 'ready' | 'error';

export default function ProvisioningPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserGrantTableData[]>([]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPhase('loading');
    setError(null);
    try {
      const res = await getUsersWithRolesAndModules();
      setUsers(res);
      setPhase('ready');
    } catch (e) {
      // On a silent background refetch, keep the current roster rather than
      // replacing a good view with an error box on a transient failure.
      if (opts?.silent) return;
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time refresh: provisioning / role grants elsewhere fire USERS (the
  // /gouvernance/users-with-roles invalidation key) or permission keys — refetch
  // the roster silently via the shared SSE stream (no new connection).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant: string[] = [
      CACHE_KEYS.USERS,
      CACHE_KEYS.ROLES,
      CACHE_KEYS.USER_PERMISSIONS,
      'permissions',
    ];
    if (lastInvalidation.keys.some((k) => relevant.includes(k))) {
      void loadRef.current({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  const rows: Row[] = useMemo(
    () =>
      users.map((u) => ({
        Username: u.username,
        'Display name': u.displayName || '—',
        Email: u.email || '—',
        Status: u.status,
        Roles: u.roles.length > 0 ? u.roles.length : null,
        'Granted roles': u.roles.length > 0 ? u.roles.join(', ') : null,
      })),
    [users],
  );

  if (phase === 'loading') return <Spinner label="Loading provisioned users…" />;
  if (phase === 'error') return <ErrBox message={error ?? 'Failed to load users'} onRetry={() => void load()} />;

  const active = users.filter((u) => u.status === 'Active').length;
  const disabled = users.length - active;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <UserCog className="h-4 w-4 self-center text-[hsl(var(--primary))]" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">User provisioning</h3>
        <span className="text-[11px] text-slate-400">{users.length} users</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="emerald">{active} active</Chip>
        {disabled > 0 && <Chip tone="slate">{disabled} disabled</Chip>}
      </div>
      {rows.length > 0 ? (
        <AuditTable
          rows={rows}
          columns={['Username', 'Display name', 'Email', 'Status', 'Roles', 'Granted roles']}
          pageSize={15}
        />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
          No users returned — —
        </p>
      )}
    </div>
  );
}
