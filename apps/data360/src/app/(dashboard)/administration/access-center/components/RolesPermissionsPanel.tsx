'use client';

/**
 * RolesPermissionsPanel — the "Roles & Permissions" section of the Admin
 * command center.
 *
 * Headline: a ROLE SWITCHER → per-action allow/DENY grid. Green cells are an
 * explicit ALLOW the role grants, red cells an explicit DENY (gated), muted dots
 * are "no stored rule" (inherit → resolved by the role default at runtime —
 * gray is NOT a denial). This is the honest split: it consumes BOTH the allow
 * and deny rows the backend now returns, so a role like Data Engineer surfaces
 * its real denies (clone / rotate-credentials / revoke) instead of reading as
 * an all-green, ACCOUNTADMIN-like matrix.
 *
 * Plus three honest, paginated AuditTables from the same live governance feeds:
 *   1. Role × module summary — rows = D360 roles, columns = registry modules,
 *      cell = count of explicit ALLOW grants, with separate Granted / Denied
 *      totals (so the deny dimension is never hidden). A role whose stored
 *      matrix fails to resolve renders "—" across its cells (never a fake 0).
 *   2. Roles roster — name · type (system/custom) · permission count · created.
 *   3. Action catalog — every grantable (module · page · tab · action) coordinate.
 *
 * Read-only: no mutations here (the editable matrix lives in the Access Control
 * tab). Every role's permission matrix is fetched ONCE on mount and cached, so
 * switching roles is instant (no refetch). Honesty: explicit ALLOW → green,
 * explicit DENY → red, no-rule → muted; unresolved role → "—" / honest error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { ChevronRight, KeyRound, Layers, ListTree, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import {
  getActionRegistry,
  getD360Roles,
  getRolePermissions,
  type ActionRegistryResponse,
  type D360Role,
  type RolePermissionsResponse,
} from '@/app/services/governance/fetch_roles';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { Spinner, ErrBox, Chip, buildPermMap, keyOf, type PermMap, type PermLevel } from './shared';

type Phase = 'loading' | 'ready' | 'error';

interface MatrixData {
  rows: Row[];
  columns: string[];
  resolvedRoles: number;
  failedRoles: number;
}

/**
 * Build the allow/deny lookup for a role, CONSUMING THE allow[]/deny[] SPLIT the
 * backend now returns. We seed from `permissions[]` (covers deploys that carry
 * the level there) then overlay the explicit allow[] and deny[] subsets, with
 * DENY authoritative. This way a gated action renders red regardless of which
 * path a given backend build populates — the deny dimension is never lost.
 */
function mapFromResponse(res: RolePermissionsResponse): PermMap {
  const map = buildPermMap(res.permissions);
  for (const p of res.allow ?? []) map.set(keyOf(p.module, p.page, p.tab ?? '*', p.action), 'allow');
  for (const p of res.deny ?? []) map.set(keyOf(p.module, p.page, p.tab ?? '*', p.action), 'deny');
  return map;
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

/** One read-only allow/deny/inherit cell — mirrors the Access Control tree. */
function GridCell({ level, label }: { level: PermLevel | undefined; label: string }) {
  const tip =
    level === 'allow'
      ? `${label} = explicit ALLOW (role grants this)`
      : level === 'deny'
        ? `${label} = explicit DENY (gated)`
        : `${label} = no stored rule → inherits the role default at runtime (gray is NOT a denial)`;
  return (
    <span
      title={tip}
      className={cn(
        'inline-flex h-5 w-7 items-center justify-center rounded text-[9px] font-bold',
        level === 'allow' && 'bg-emerald-500/90 text-white',
        level === 'deny' && 'bg-rose-500/90 text-white',
        level === undefined && 'bg-slate-200/70 text-slate-400 dark:bg-slate-700/60 dark:text-slate-500',
      )}
    >
      {level === 'allow' ? '✓' : level === 'deny' ? '✕' : '·'}
    </span>
  );
}

/**
 * Per-role action grid: module → page → (tab × action) cells colored from the
 * role's stored matrix. Iteration matches `buildPermMap` exactly (tab fallback
 * `'*'`) so the lookup never misses and silently renders all-muted.
 *
 * Modules that carry at least one explicit DENY start EXPANDED so the gated
 * actions are visible at a glance; the rest start collapsed (counts only).
 */
function RoleActionGrid({
  registry,
  permMap,
}: {
  registry: ActionRegistryResponse;
  permMap: PermMap;
}) {
  const modules = Object.entries(registry.registry);

  // Per-module rollup + whether the module holds any explicit deny.
  const summary = useMemo(() => {
    const out = new Map<string, { allow: number; deny: number }>();
    for (const [mKey, mData] of modules) {
      let allow = 0;
      let deny = 0;
      for (const [pKey, pData] of Object.entries(mData.pages ?? {})) {
        const tabs = pData.tabs?.length ? pData.tabs : ['*'];
        for (const t of tabs) {
          for (const a of pData.actions ?? []) {
            const lvl = permMap.get(keyOf(mKey, pKey, t, a));
            if (lvl === 'allow') allow += 1;
            else if (lvl === 'deny') deny += 1;
          }
        }
      }
      out.set(mKey, { allow, deny });
    }
    return out;
  }, [modules, permMap]);

  // Initial collapse: keep modules WITHOUT a deny collapsed; auto-expand any
  // module that gates something so its red cells are immediately visible.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(modules.filter(([k]) => (summary.get(k)?.deny ?? 0) === 0).map(([k]) => k)),
  );

  const toggle = (m: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  return (
    <div className="space-y-2">
      {modules.map(([mKey, mData]) => {
        const isCollapsed = collapsed.has(mKey);
        const { allow, deny } = summary.get(mKey) ?? { allow: 0, deny: 0 };
        const pages = Object.entries(mData.pages ?? {});
        return (
          <div
            key={mKey}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => toggle(mKey)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                  !isCollapsed && 'rotate-90',
                )}
              />
              <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                {mData.label || mKey}
              </span>
              <span className="shrink-0 font-mono text-[10px] font-normal text-slate-400">{mKey}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {allow > 0 && (
                  <Chip tone="emerald" title="Explicit ALLOW grants in this module">
                    {allow} allow
                  </Chip>
                )}
                {deny > 0 && (
                  <Chip tone="rose" title="Explicit DENY rules in this module (gated actions)">
                    {deny} deny
                  </Chip>
                )}
                {allow === 0 && deny === 0 && (
                  <span className="text-[10px] text-slate-400" title="No stored rule in this module → inherits the role default">
                    no stored rule
                  </span>
                )}
              </span>
            </button>

            {!isCollapsed && (
              <div className="space-y-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                {pages.length === 0 ? (
                  <p className="text-[10px] italic text-slate-400">No pages registered.</p>
                ) : (
                  pages.map(([pKey, pData]) => {
                    const tabs = pData.tabs?.length ? pData.tabs : ['*'];
                    const actions = pData.actions ?? [];
                    return (
                      <div key={pKey}>
                        <p className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {pData.label || pKey}{' '}
                          <span className="font-mono text-[9px] font-normal text-slate-400">{pKey}</span>
                        </p>
                        <div className="scrollbar-thin overflow-x-auto">
                          <table className="border-collapse text-[10px]">
                            <thead>
                              <tr>
                                <th className="sticky left-0 z-10 bg-white/80 px-2 py-1 text-left font-semibold text-slate-500 backdrop-blur dark:bg-slate-900/70 dark:text-slate-400">
                                  tab \ action
                                </th>
                                {actions.map((a) => (
                                  <th
                                    key={a}
                                    className="whitespace-nowrap px-1.5 py-1 text-center font-semibold text-slate-500 dark:text-slate-400"
                                  >
                                    {a}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tabs.map((t) => (
                                <tr key={t} className="odd:bg-slate-50/40 dark:odd:bg-slate-800/20">
                                  <td className="sticky left-0 z-10 max-w-[160px] truncate bg-white/80 px-2 py-1 font-mono text-slate-600 backdrop-blur dark:bg-slate-900/70 dark:text-slate-300">
                                    {t}
                                  </td>
                                  {actions.map((a) => (
                                    <td key={a} className="px-1 py-0.5 text-center">
                                      <GridCell
                                        level={permMap.get(keyOf(mKey, pKey, t, a))}
                                        label={`${mKey}:${pKey}:${t}:${a}`}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RolesPermissionsPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ActionRegistryResponse | null>(null);
  const [roles, setRoles] = useState<D360Role[]>([]);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  // Every role's resolved matrix, cached on mount → switching roles is instant.
  const [permsByRole, setPermsByRole] = useState<Map<string, RolePermissionsResponse>>(new Map());
  const [selectedRole, setSelectedRole] = useState('');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setPhase('loading');
    setError(null);
    try {
      const [reg, rl] = await Promise.all([getActionRegistry(), getD360Roles()]);
      setRegistry(reg);
      setRoles(rl);

      const labelOf = (k: string): string => reg.modules?.[k] || reg.registry?.[k]?.label || k;
      const moduleKeys = Object.keys(reg.registry ?? {});
      // Resolve every role's stored matrix in parallel (bounded — admin page).
      const results = await Promise.allSettled(rl.map((r) => getRolePermissions(r.role_name)));

      const cache = new Map<string, RolePermissionsResponse>();
      const denyByRole = new Map<string, number>();
      let resolvedRoles = 0;
      let failedRoles = 0;
      const rows: Row[] = rl.map((r, i) => {
        const res = results[i];
        const row: Row = { Role: r.role_name, Type: r.is_system ? 'System' : 'Custom' };
        if (res.status === 'fulfilled') {
          resolvedRoles += 1;
          cache.set(r.role_name, res.value);
          // Build from the allow/deny SPLIT (deny authoritative) so denies count
          // even when the backend leaves them out of the legacy permissions[].
          const map = mapFromResponse(res.value);
          const allowByModule: Record<string, number> = {};
          let granted = 0;
          let denied = 0;
          for (const [k, lvl] of map) {
            const mod = k.slice(0, k.indexOf(':'));
            if (lvl === 'allow') {
              allowByModule[mod] = (allowByModule[mod] ?? 0) + 1;
              granted += 1;
            } else if (lvl === 'deny') {
              denied += 1;
            }
          }
          for (const mk of moduleKeys) row[labelOf(mk)] = allowByModule[mk] ?? 0;
          row.Granted = granted;
          row.Denied = denied;
          denyByRole.set(r.role_name, denied);
        } else {
          // Honest: failed resolution → "—" across the row, not a fake 0.
          failedRoles += 1;
          for (const mk of moduleKeys) row[labelOf(mk)] = null;
          row.Granted = null;
          row.Denied = null;
        }
        return row;
      });

      const columns = ['Role', 'Type', ...moduleKeys.map(labelOf), 'Granted', 'Denied'];
      setMatrix({ rows, columns, resolvedRoles, failedRoles });
      setPermsByRole(cache);
      // Default the switcher to the role with the MOST denies so the allow/deny
      // differentiation is visible on first paint (never landing on an all-allow
      // admin role that would look like the old all-green bug). Fall back to the
      // first resolved role, then the first role.
      let defaultRole = '';
      let maxDeny = -1;
      for (const [name, d] of denyByRole) {
        if (d > maxDeny) {
          maxDeny = d;
          defaultRole = name;
        }
      }
      const fallbackRole = rl.find((r) => cache.has(r.role_name))?.role_name || rl[0]?.role_name || '';
      setSelectedRole((cur) => cur || (maxDeny > 0 ? defaultRole : fallbackRole));
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
  // role matrix silently (preserves the selected role; no skeleton flash; no
  // second SSE connection).
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

  // Retry a single role that failed in the initial batch (without a full reload).
  const reloadRole = useCallback(async (roleName: string) => {
    try {
      const res = await getRolePermissions(roleName);
      setPermsByRole((prev) => new Map(prev).set(roleName, res));
    } catch {
      /* leave it unresolved — the inline error + retry persists */
    }
  }, []);

  const selectedPerms = selectedRole ? permsByRole.get(selectedRole) : undefined;
  const selectedMap = useMemo(
    () => (selectedPerms ? mapFromResponse(selectedPerms) : null),
    [selectedPerms],
  );
  const selectedCounts = useMemo(() => {
    if (!selectedMap) return { allow: 0, deny: 0 };
    let allow = 0;
    let deny = 0;
    for (const v of selectedMap.values()) {
      if (v === 'allow') allow += 1;
      else if (v === 'deny') deny += 1;
    }
    return { allow, deny };
  }, [selectedMap]);

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
  const selectedIsSystem = roles.find((r) => r.role_name === selectedRole)?.is_system ?? false;

  return (
    <div className="space-y-5">
      {/* ── Headline: role switcher → per-action allow/DENY grid ── */}
      <PanelCard
        icon={KeyRound}
        title="Role access matrix"
        subtitle="explicit allow / deny per action — pick a role"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <KeyRound className="h-3.5 w-3.5" />
            Role
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {roles.length === 0 && <option value="">No roles registered</option>}
              {roles.map((r) => (
                <option key={r.role_name} value={r.role_name}>
                  {r.role_name}
                  {r.is_system ? ' (system)' : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedRole && selectedMap && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="emerald" title="Explicit ALLOW grants for this role">
                {selectedCounts.allow} allowed
              </Chip>
              <Chip tone="rose" title="Explicit DENY rules for this role (gated actions)">
                {selectedCounts.deny} denied
              </Chip>
              {selectedIsSystem && (
                <Chip tone="slate" title="System roles are read-only templates">
                  <Lock className="h-3 w-3" /> system
                </Chip>
              )}
              {selectedPerms?.source && (
                <span className="text-[10px] text-slate-400" title="Provenance of this matrix">
                  source: {selectedPerms.source}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Legend — honest tri-state: allow / deny / no-rule (NOT a denial). */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          <span className="flex items-center gap-1" title="Explicit ALLOW — the role grants this">
            <span className="inline-block h-3 w-4 rounded bg-emerald-500/90" /> allow
          </span>
          <span className="flex items-center gap-1" title="Explicit DENY — gated">
            <span className="inline-block h-3 w-4 rounded bg-rose-500/90" /> deny
          </span>
          <span
            className="flex items-center gap-1"
            title="No stored rule → resolved by the role default at runtime. Gray does NOT mean denied."
          >
            <span className="inline-block h-3 w-4 rounded bg-slate-200 dark:bg-slate-700" /> no rule
          </span>
        </div>

        {!registry || roles.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            No roles registered — —
          </p>
        ) : selectedRole && selectedMap ? (
          <RoleActionGrid key={selectedRole} registry={registry} permMap={selectedMap} />
        ) : selectedRole ? (
          // Selected role failed to resolve in the batch → honest error + retry.
          <ErrBox
            message={`Could not resolve the stored matrix for "${selectedRole}".`}
            onRetry={() => void reloadRole(selectedRole)}
          />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            Pick a role to view its allow / deny matrix.
          </p>
        )}
      </PanelCard>

      {/* ── Cross-role summary (Granted / Denied split, never all-green) ── */}
      <PanelCard
        icon={Layers}
        title="Role × module summary"
        subtitle={`${roles.length} roles × ${moduleCount} modules · module cells = explicit ALLOW count`}
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
