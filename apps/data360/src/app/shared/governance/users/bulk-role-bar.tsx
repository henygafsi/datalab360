'use client';

/**
 * BulkRoleBar — docked (inline, non-popup) bulk-action bar for the Users table.
 *
 * Appears only when ≥1 user row is selected. Affords the headline access-bulk
 * operations the console was missing (backlog A-1/2/4):
 *   • Grant a role to N users        (POST /gouvernance/assign-role, looped)
 *   • Revoke a role from N users      (DELETE /gouvernance/unassign-role, looped)
 *   • Enable / Disable N users        (enable_user / disable_user, looped)
 *
 * Guardrails (admin-controlled security):
 *   • Every button is gated by useCanPerform — grant/enable/disable need
 *     'gouvernance:edit'; revoke needs 'gouvernance:delete'. A denied action is
 *     disabled with a reason, never hidden-then-failing.
 *   • Each run confirms first (ConfirmDialog) — these touch many identities.
 *   • Snowflake applies GRANT/ALTER one statement per target, so we LOOP and
 *     capture per-row {user, ok, error}, then report an honest success/failure
 *     summary instead of a single optimistic toast.
 *   • assignRoleToUser/unassignRole already call invalidateMyPermissions()
 *     internally, so a bulk grant/revoke re-gates every open tab after the loop.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { ShieldCheck, ShieldX, UserCheck, UserX, Loader2 } from 'lucide-react';
import { getRoles } from '@/app/services/governance/fetch_roles';
import type { RoleTableDataType } from '@/app/shared/governance/roles/table';
import {
  assignRoleToUser,
  unassignRole,
  enableUser,
  disableUser,
} from '@/app/services/governance/fetch_users';
import { useCanPerform } from '@/hooks/useCanPerform';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toServiceError } from '@/app/services/_errors';

type BulkRoleBarProps = {
  /** Snowflake usernames of the currently-selected rows. */
  usernames: string[];
  /** Refetch the users list after a successful run. */
  onDone: () => void | Promise<void>;
  /** Clear the table selection after a run. */
  onClear?: () => void;
};

type RowResult = { user: string; ok: boolean; error?: string };

export default function BulkRoleBar({ usernames, onDone, onClear }: BulkRoleBarProps) {
  const { allowed: canEdit } = useCanPerform('gouvernance', 'edit');
  const { allowed: canDelete } = useCanPerform('gouvernance', 'delete');

  const [roles, setRoles] = useState<RoleTableDataType[]>([]);
  const [roleName, setRoleName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; run: () => void }>({
    open: false, title: '', message: '', run: () => {},
  });

  // Load the role list once for the picker (best-effort; bar still allows
  // enable/disable if roles fail to load).
  useEffect(() => {
    let alive = true;
    getRoles()
      .then(r => { if (alive) setRoles(r ?? []); })
      .catch(() => { if (alive) setRoles([]); });
    return () => { alive = false; };
  }, []);

  const count = usernames.length;

  // Run an async op over every selected user, capturing per-row results.
  const runBulk = useCallback(
    async (key: string, op: (u: string) => Promise<unknown>, verb: string) => {
      setBusy(key);
      setProgress({ done: 0, total: count });
      const results: RowResult[] = [];
      for (const user of usernames) {
        try {
          await op(user);
          results.push({ user, ok: true });
        } catch (e) {
          results.push({ user, ok: false, error: toServiceError(e, 'failed').message });
        }
        setProgress(p => (p ? { ...p, done: p.done + 1 } : p));
      }
      const okCount = results.filter(r => r.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) {
        toast.success(`✅ ${verb} succeeded for ${okCount} user${okCount === 1 ? '' : 's'}`);
      } else if (okCount > 0) {
        toast(`⚠️ ${verb}: ${okCount} succeeded, ${failCount} failed (${results.filter(r => !r.ok).map(r => r.user).join(', ')})`, { icon: '⚠️' });
      } else {
        toast.error(`❌ ${verb} failed for all ${failCount} user${failCount === 1 ? '' : 's'}`);
      }
      setBusy(null);
      setProgress(null);
      onClear?.();
      await onDone();
    },
    [usernames, count, onDone, onClear],
  );

  const ask = (title: string, message: string, run: () => void) =>
    setConfirm({ open: true, title, message, run });

  const roleOptions = useMemo(
    () => roles.map(r => r.role).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [roles],
  );

  if (count === 0) return null;

  const grantDisabledReason = !canEdit ? 'Requires governance edit permission' : !roleName ? 'Pick a role first' : '';
  const revokeDisabledReason = !canDelete ? 'Requires governance delete permission' : !roleName ? 'Pick a role first' : '';

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/10">
      <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
        {count} user{count === 1 ? '' : 's'} selected
      </span>

      <div className="h-5 w-px bg-blue-200 dark:bg-blue-900/40" />

      {/* Role picker */}
      <select
        value={roleName}
        onChange={e => setRoleName(e.target.value)}
        disabled={!!busy}
        aria-label="Role to grant or revoke"
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      >
        <option value="">{roleOptions.length ? 'Select a role…' : 'No roles available'}</option>
        {roleOptions.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {/* Grant role */}
      <button
        type="button"
        disabled={!!busy || !!grantDisabledReason}
        title={grantDisabledReason || `Grant ${roleName} to ${count} user(s)`}
        onClick={() =>
          ask(
            `Grant role to ${count} user(s)`,
            `Grant the role "${roleName}" to ${count} selected user(s)?\n\n${usernames.join(', ')}`,
            () => runBulk('grant', u => assignRoleToUser(u, roleName), `Grant "${roleName}"`),
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'grant' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Grant role
      </button>

      {/* Revoke role */}
      <button
        type="button"
        disabled={!!busy || !!revokeDisabledReason}
        title={revokeDisabledReason || `Revoke ${roleName} from ${count} user(s)`}
        onClick={() =>
          ask(
            `Revoke role from ${count} user(s)`,
            `Revoke the role "${roleName}" from ${count} selected user(s)?\n\n${usernames.join(', ')}`,
            () => runBulk('revoke', u => unassignRole(u, roleName), `Revoke "${roleName}"`),
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
      >
        {busy === 'revoke' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldX className="h-4 w-4" />}
        Revoke role
      </button>

      <div className="h-5 w-px bg-blue-200 dark:bg-blue-900/40" />

      {/* Enable / Disable */}
      <button
        type="button"
        disabled={!!busy || !canEdit}
        title={!canEdit ? 'Requires governance edit permission' : `Enable ${count} user(s)`}
        onClick={() =>
          ask(
            `Enable ${count} user(s)`,
            `Enable ${count} selected user(s)?\n\n${usernames.join(', ')}`,
            () => runBulk('enable', u => enableUser(u), 'Enable'),
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200"
      >
        {busy === 'enable' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
        Enable
      </button>
      <button
        type="button"
        disabled={!!busy || !canEdit}
        title={!canEdit ? 'Requires governance edit permission' : `Disable ${count} user(s)`}
        onClick={() =>
          ask(
            `Disable ${count} user(s)`,
            `Disable ${count} selected user(s)? They will not be able to sign in until re-enabled.\n\n${usernames.join(', ')}`,
            () => runBulk('disable', u => disableUser(u), 'Disable'),
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800"
      >
        {busy === 'disable' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
        Disable
      </button>

      {progress && (
        <span className="text-sm text-blue-800 dark:text-blue-300">
          {progress.done}/{progress.total}…
        </span>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel="Confirm"
        onConfirm={() => { setConfirm(s => ({ ...s, open: false })); confirm.run(); }}
        onCancel={() => setConfirm(s => ({ ...s, open: false }))}
      />
    </div>
  );
}
