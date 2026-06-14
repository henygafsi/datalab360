'use client';

/**
 * ProvisioningPanel — the "Provisioning" section of the Admin command center.
 *
 * Who is provisioned with what: every account user with their granted roles and
 * activation status (Snowflake SHOW USERS via /gouvernance/users-with-roles),
 * rendered as a single honest, paginated AuditTable. A user with no roles shows
 * "—" (never a fabricated 0). Read-only roster — no mutations, nothing gated.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCog } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';
import { Spinner, ErrBox, Chip } from './shared';

type Phase = 'loading' | 'ready' | 'error';

export default function ProvisioningPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserGrantTableData[]>([]);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await getUsersWithRolesAndModules();
      setUsers(res);
      setPhase('ready');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
