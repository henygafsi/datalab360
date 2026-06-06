'use client';

/**
 * RoleGrantsPanel — granular Snowflake-RBAC grant management for the admin console.
 *
 * Pick a role → see its object-level privileges (real `SHOW GRANTS`) → revoke any
 * one live via POST /gouvernance/revoke-permission (traced REVOKE_PERMISSION).
 * Complements the GUI-permission matrix: this is the actual Snowflake RBAC plane.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import { GlassPanel } from '@/app/shared/glass';
import { getRoles } from '@/app/services/governance/fetch_roles';
import { getRolesForGrantsMatrix, revokePermission } from '@/app/services/governance/fetch_grants';
import { toast } from '@/hooks/use-toast';

interface Grant {
  privilege?: string;
  granted_on?: string;
  type?: string;
  name?: string;
}

export default function RoleGrantsPanel() {
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<string>('');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGrants = useCallback(async (r: string) => {
    if (!r) return;
    setState('running');
    setError(null);
    try {
      const g = await getRolesForGrantsMatrix(r);
      setGrants(Array.isArray(g) ? (g as Grant[]) : []);
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

  const revoke = async (grant: Grant, index: number) => {
    const priv = grant.privilege;
    const objType = grant.granted_on || grant.type;
    const objName = grant.name;
    if (!priv || !objType || !objName) {
      toast({ title: 'Cannot revoke: incomplete grant info' });
      return;
    }
    if (!window.confirm(`Revoke ${priv} on ${objName} from ${role}?`)) return;
    setRevoking(index);
    try {
      await revokePermission([String(priv)], String(objType), String(objName), role);
      toast({ title: `Revoked ${priv} on ${objName}` });
      setGrants((g) => g.filter((_, i) => i !== index));
    } catch (e) {
      toast({ title: getApiErrorMessage(e) });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <GlassPanel depth={1} radius="xl" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
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
      ) : (
        <div className="scrollbar-thin max-h-[360px] divide-y divide-slate-100 overflow-auto dark:divide-slate-800">
          {grants.map((g, i) => (
            <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
              <div className="min-w-0">
                <span className="font-medium text-slate-800 dark:text-slate-100">{g.privilege || 'Grant'}</span>
                <span className="text-slate-400"> on {g.granted_on || g.type || '—'} </span>
                {g.name && <span className="break-all font-mono text-slate-500 dark:text-slate-400">{g.name}</span>}
              </div>
              <button
                type="button"
                disabled={revoking === i}
                onClick={() => void revoke(g, i)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20',
                )}
              >
                {revoking === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
