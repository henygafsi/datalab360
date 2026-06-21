'use client';

/**
 * DefaultRoleGovernancePanel — the "Role Governance" section of the Admin
 * command center.
 *
 * Answers "who can do what, by default" at ACTION granularity for the DEFAULT
 * Data360 roles: the three Snowflake admin roles (ACCOUNTADMIN / SYSADMIN /
 * SECURITYADMIN) plus every system D360 role. Deliberately distinct from the
 * "Roles & Permissions" tab (which is role × module ALLOW *counts* for ALL
 * roles): here every row is a single grantable (module · page · tab · action)
 * coordinate and every default-role cell is the TRI-STATE stored governance
 * (allow / deny / inherit), never a count.
 *
 * Honesty: cells reflect what is STORED in each role's matrix (the action
 * registry × getRolePermissions), never an asserted runtime effect. A role whose
 * matrix can't be resolved renders "—" across its column (never a fake "deny").
 * The three Snowflake admin roles bypass module gating at runtime (documented) —
 * a banner states this, so an empty stored matrix for them is not read as "no
 * access". A second view rolls the same data up to module × role coverage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Info, KeyRound, ListTree, ShieldCheck, Grid3x3 } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import {
  getActionRegistry,
  getD360Roles,
  getRolePermissions,
  type ActionRegistryResponse,
  type D360Role,
} from '@/app/services/governance/fetch_roles';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { buildPermMap, keyOf, Spinner, ErrBox, Chip, type PermMap } from './shared';

type Phase = 'loading' | 'ready' | 'error';

/** Snowflake admin roles that bypass module gating (CLAUDE.md RBAC contract). */
const SNOWFLAKE_ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];

type RoleKind = 'admin' | 'system';

interface ResolvedRole {
  name: string;
  kind: RoleKind;
  resolved: boolean; // false → matrix could not be resolved (render "—")
  uninitialized: boolean;
  map: PermMap;
  allow: number;
  deny: number;
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

export default function DefaultRoleGovernancePanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ActionRegistryResponse | null>(null);
  const [resolved, setResolved] = useState<ResolvedRole[]>([]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPhase('loading');
    setError(null);
    try {
      const [reg, d360Roles] = await Promise.all([getActionRegistry(), getD360Roles()]);
      setRegistry(reg);

      // Default roles = the 3 Snowflake admins + every system D360 role, deduped
      // by upper-cased name (admins win the kind tag).
      const order: { name: string; kind: RoleKind }[] = [];
      const seen = new Set<string>();
      for (const a of SNOWFLAKE_ADMIN_ROLES) {
        order.push({ name: a, kind: 'admin' });
        seen.add(a.toUpperCase());
      }
      d360Roles
        .filter((r: D360Role) => r.is_system)
        .forEach((r) => {
          const u = (r.role_name || '').toUpperCase();
          if (!u || seen.has(u)) return;
          seen.add(u);
          order.push({ name: r.role_name, kind: 'system' });
        });

      // Resolve each default role's stored matrix in parallel (honest on failure).
      const results = await Promise.allSettled(order.map((r) => getRolePermissions(r.name)));
      const out: ResolvedRole[] = order.map((r, i) => {
        const res = results[i];
        if (res.status !== 'fulfilled') {
          return { name: r.name, kind: r.kind, resolved: false, uninitialized: false, map: new Map(), allow: 0, deny: 0 };
        }
        const map = buildPermMap(res.value.permissions);
        let allow = 0;
        let deny = 0;
        for (const v of map.values()) {
          if (v === 'allow') allow += 1;
          else if (v === 'deny') deny += 1;
        }
        return {
          name: r.name,
          kind: r.kind,
          resolved: true,
          uninitialized: Boolean(res.value.uninitialized),
          map,
          allow,
          deny,
        };
      });
      setResolved(out);
      setPhase('ready');
    } catch (e) {
      // On a silent background refetch, keep the current matrix rather than
      // wiping a good view on a transient failure.
      if (opts?.silent) return;
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time refresh: role / permission / grant mutations elsewhere fire the
  // relevant key on the shared cache-invalidation SSE stream — re-resolve the
  // default-role governance matrix silently (no skeleton flash; no second SSE
  // connection).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant: string[] = [
      CACHE_KEYS.ROLES,
      CACHE_KEYS.GRANTS,
      CACHE_KEYS.USER_PERMISSIONS,
      'permissions',
    ];
    if (lastInvalidation.keys.some((k) => relevant.includes(k))) {
      void loadRef.current({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  const labelOf = useCallback(
    (k: string): string => registry?.modules?.[k] || registry?.registry?.[k]?.label || k,
    [registry],
  );

  // ── Action governance matrix (coordinate × default role → allow/deny/—) ──────
  const actionMatrix: Row[] = useMemo(() => {
    if (!registry) return [];
    return registry.actions.map((a) => {
      const row: Row = {
        Module: labelOf(a.module),
        Page: a.page,
        Tab: a.tab || '*',
        Action: a.action,
      };
      const k = keyOf(a.module, a.page, a.tab || '*', a.action);
      // Fall back to a tab-wildcard grant so a stored `tab:'*'` rule isn't
      // under-reported as inherit on a registry coordinate that names a tab.
      const wk = keyOf(a.module, a.page, '*', a.action);
      for (const r of resolved) {
        // Unresolved role → honest "—" (null), never a fabricated deny.
        row[r.name] = r.resolved ? r.map.get(k) ?? r.map.get(wk) ?? null : null;
      }
      return row;
    });
  }, [registry, resolved, labelOf]);

  // ── Module × role coverage rollup (allow / total coordinates) ───────────────
  const moduleCoverage: Row[] = useMemo(() => {
    if (!registry) return [];
    const totalByModule = new Map<string, number>();
    for (const a of registry.actions) {
      totalByModule.set(a.module, (totalByModule.get(a.module) ?? 0) + 1);
    }
    const moduleKeys = Object.keys(registry.registry ?? {});
    const ordered = moduleKeys.length ? moduleKeys : Array.from(totalByModule.keys());
    return ordered.map((mk) => {
      const total = totalByModule.get(mk) ?? 0;
      const row: Row = { Module: labelOf(mk), Coordinates: total };
      for (const r of resolved) {
        if (!r.resolved) {
          row[r.name] = null;
          continue;
        }
        let allow = 0;
        for (const [k, v] of r.map) {
          if (v === 'allow' && k.startsWith(`${mk}:`)) allow += 1;
        }
        row[r.name] = total > 0 ? `${allow}/${total}` : null;
      }
      return row;
    });
  }, [registry, resolved, labelOf]);

  if (phase === 'loading') return <Spinner label="Loading default-role governance…" />;
  if (phase === 'error') return <ErrBox message={error ?? 'Failed to load'} onRetry={() => void load()} />;

  const roleCols = resolved.map((r) => r.name);
  const totalCoords = registry?.action_count ?? registry?.actions.length ?? 0;
  const adminRoles = resolved.filter((r) => r.kind === 'admin');
  const unresolved = resolved.filter((r) => !r.resolved);

  return (
    <div className="space-y-5">
      {/* Admin-bypass + honesty banner */}
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold">{SNOWFLAKE_ADMIN_ROLES.join(' · ')}</span> bypass module &amp; action gating
          at runtime and have full access regardless of stored rows. Cells show what is{' '}
          <span className="font-semibold">stored</span> in each role&apos;s matrix (allow / deny / inherit) — an empty
          admin matrix is the bypass default, not a denial.
        </span>
      </div>

      {/* Per-role status chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {resolved.map((r) => (
          <Chip
            key={r.name}
            tone={r.kind === 'admin' ? 'violet' : !r.resolved ? 'amber' : 'slate'}
            title={
              !r.resolved
                ? 'Stored matrix could not be resolved — cells render —'
                : r.uninitialized
                  ? 'No stored matrix yet (uninitialized) — inherits defaults'
                  : `${r.allow} allow · ${r.deny} deny`
            }
          >
            <KeyRound className="h-3 w-3" />
            {r.name}
            {r.kind === 'admin' ? ' · bypass' : !r.resolved ? ' · —' : ` · ${r.allow}✓`}
          </Chip>
        ))}
        {resolved.length === 0 && <span className="text-[11px] text-slate-400">No default roles registered — —</span>}
      </div>

      {/* Value glossary (cells render as plain text — see status chips for color) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span className="font-semibold text-slate-500 dark:text-slate-300">Cell values:</span>
        <span><span className="font-semibold text-slate-600 dark:text-slate-200">allow</span> = explicit grant</span>
        <span><span className="font-semibold text-slate-600 dark:text-slate-200">deny</span> = explicit block</span>
        <span><span className="font-semibold text-slate-600 dark:text-slate-200">—</span> = inherit / not stored</span>
      </div>

      {/* ── Module × role coverage rollup ── */}
      <PanelCard
        icon={Grid3x3}
        title="Module governance by default role"
        subtitle={`${moduleCoverage.length} modules × ${roleCols.length} roles · explicit-ALLOW / total coordinates`}
      >
        <div className="overflow-x-auto">
          {moduleCoverage.length > 0 ? (
            <AuditTable rows={moduleCoverage} columns={['Module', 'Coordinates', ...roleCols]} pageSize={12} />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No modules in the action registry — —
            </p>
          )}
        </div>
      </PanelCard>

      {/* ── Action governance matrix ── */}
      <PanelCard
        icon={ListTree}
        title="Action governance by default role"
        subtitle={`${totalCoords} grantable coordinates · tri-state per role`}
      >
        {unresolved.length > 0 && (
          <p className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            <Info className="h-3 w-3" />
            {unresolved.map((r) => r.name).join(', ')} — stored matrix unavailable; rendered as — across the column.
          </p>
        )}
        <div className="overflow-x-auto">
          {actionMatrix.length > 0 ? (
            <AuditTable rows={actionMatrix} columns={['Module', 'Page', 'Tab', 'Action', ...roleCols]} pageSize={15} />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No grantable action coordinates registered — —
            </p>
          )}
        </div>
      </PanelCard>

      {adminRoles.length > 0 && (
        <p className="text-[10px] text-slate-400">
          {adminRoles.length} Snowflake admin role(s) shown for completeness — their effective access is granted by the
          runtime bypass, not by the stored cells above.
        </p>
      )}
    </div>
  );
}
