'use client';

/**
 * RolesPermissionsPanel — the "Roles & Permissions" section of the Admin
 * command center.
 *
 * Three honest, paginated AuditTables, all from live governance feeds:
 *   1. Role × module matrix — rows = D360 roles, columns = registry modules,
 *      cell = count of explicit ALLOW grants. Built by resolving every role's
 *      stored matrix (getRolePermissions) in parallel. A role whose matrix fails
 *      to resolve renders "—" across its module cells (never a fabricated 0); a
 *      resolved role with no grant in a module renders a real 0.
 *   2. Roles roster — name · type (system/custom) · permission count · created.
 *   3. Action catalog — every grantable (module · page · tab · action) coordinate
 *      from the action-registry (the granular RBAC coordinate space).
 *
 * Self-contained: fetches on mount, isolated loading/error states. No mutations
 * here (the editable matrix lives in the Access Control tab) so nothing is gated.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Layers, ListTree } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import {
  getActionRegistry,
  getD360Roles,
  getRolePermissions,
  type ActionRegistryResponse,
  type D360Role,
} from '@/app/services/governance/fetch_roles';
import { Spinner, ErrBox, Chip } from './shared';

type Phase = 'loading' | 'ready' | 'error';

interface MatrixData {
  rows: Row[];
  columns: string[];
  resolvedRoles: number;
  failedRoles: number;
}

function PanelCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Icon className="h-4 w-4 self-center text-[hsl(var(--primary))]" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle && <span className="text-[11px] text-slate-400">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

export default function RolesPermissionsPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ActionRegistryResponse | null>(null);
  const [roles, setRoles] = useState<D360Role[]>([]);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const [reg, rl] = await Promise.all([getActionRegistry(), getD360Roles()]);
      setRegistry(reg);
      setRoles(rl);

      // Resolve every role's stored matrix in parallel (bounded — admin page).
      const labelOf = (k: string): string => reg.modules?.[k] || reg.registry?.[k]?.label || k;
      const moduleKeys = Object.keys(reg.registry ?? {});
      const results = await Promise.allSettled(rl.map((r) => getRolePermissions(r.role_name)));

      let resolvedRoles = 0;
      let failedRoles = 0;
      const rows: Row[] = rl.map((r, i) => {
        const res = results[i];
        const row: Row = {
          Role: r.role_name,
          Type: r.is_system ? 'System' : 'Custom',
        };
        if (res.status === 'fulfilled') {
          resolvedRoles += 1;
          const counts: Record<string, number> = {};
          for (const p of res.value.permissions) {
            if (String(p.access_level || 'ALLOW').toUpperCase() === 'ALLOW') {
              counts[p.module] = (counts[p.module] ?? 0) + 1;
            }
          }
          let total = 0;
          for (const mk of moduleKeys) {
            const c = counts[mk] ?? 0;
            row[labelOf(mk)] = c;
            total += c;
          }
          row.Total = total;
        } else {
          // Honest: failed resolution → "—" across the row, not a fake 0.
          failedRoles += 1;
          for (const mk of moduleKeys) row[labelOf(mk)] = null;
          row.Total = null;
        }
        return row;
      });

      const columns = ['Role', 'Type', ...moduleKeys.map(labelOf), 'Total'];
      setMatrix({ rows, columns, resolvedRoles, failedRoles });
      setPhase('ready');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rosterRows: Row[] = useMemo(
    () =>
      roles.map((r) => ({
        Role: r.role_name,
        Type: r.is_system ? 'System' : 'Custom',
        Permissions: r.permission_count ?? null,
        Created: r.created_at ?? null,
      })),
    [roles],
  );

  const actionRows: Row[] = useMemo(() => {
    if (!registry) return [];
    const labelOf = (k: string): string => registry.modules?.[k] || registry.registry?.[k]?.label || k;
    return registry.actions.map((a) => ({
      Module: labelOf(a.module),
      Page: a.page,
      Tab: a.tab,
      Action: a.action,
    }));
  }, [registry]);

  if (phase === 'loading') return <Spinner label="Loading roles & permission matrix…" />;
  if (phase === 'error') return <ErrBox message={error ?? 'Failed to load'} onRetry={() => void load()} />;

  const moduleCount = registry ? Object.keys(registry.registry ?? {}).length : 0;
  const systemRoles = roles.filter((r) => r.is_system).length;
  const customRoles = roles.length - systemRoles;

  return (
    <div className="space-y-5">
      <PanelCard
        icon={KeyRound}
        title="Role × module access matrix"
        subtitle={`${roles.length} roles × ${moduleCount} modules · explicit ALLOW counts`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="slate">{systemRoles} system</Chip>
          <Chip tone="violet">{customRoles} custom</Chip>
          {matrix && matrix.failedRoles > 0 && (
            <Chip tone="amber" title="Roles whose stored matrix could not be resolved render — across their cells">
              {matrix.failedRoles} unresolved
            </Chip>
          )}
        </div>
        <div className="overflow-x-auto">
          {matrix && matrix.rows.length > 0 ? (
            <AuditTable rows={matrix.rows} columns={matrix.columns} pageSize={12} />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No roles registered — —
            </p>
          )}
        </div>
      </PanelCard>

      <PanelCard icon={Layers} title="Roles roster" subtitle={`${roles.length} roles`}>
        <AuditTable rows={rosterRows} columns={['Role', 'Type', 'Permissions', 'Created']} pageSize={12} />
      </PanelCard>

      <PanelCard
        icon={ListTree}
        title="Action catalog"
        subtitle={`${actionRows.length} grantable coordinates`}
      >
        <AuditTable rows={actionRows} columns={['Module', 'Page', 'Tab', 'Action']} pageSize={15} />
      </PanelCard>
    </div>
  );
}
