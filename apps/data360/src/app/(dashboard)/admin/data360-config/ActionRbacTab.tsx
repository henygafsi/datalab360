'use client';

/**
 * Action-RBAC editor + cross-module preview (System 2 — the *enforced* path).
 *
 * Two surfaces, both backed by real endpoints in services/governance/fetch_roles:
 *   - Editor:  per-(module,page,tab,action) ALLOW toggles for a CUSTOM role,
 *              + "apply template", with a confirm dialog that reports blast radius.
 *   - Preview: "test as role | user" — effective permissions across ALL modules.
 *
 * This lives next to the legacy GUI page-visibility hints (System 1, advisory).
 * Unlike those, edits here target D360_ROLE_ACTIONS, the enforced allow-set.
 *
 * PROJECT_ID: the backend permission model is account-global today, so the
 * project selector is rendered disabled with a "migration required" tooltip.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  User,
  Users,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { GlassPanel } from '@/app/shared/glass';
import { toast } from '@/hooks/use-toast';
import { invalidateMyPermissions } from '@/hooks/useCanPerform';
import {
  getActionRegistry,
  getRolePermissions,
  setRolePermissions,
  applyTemplate,
  getD360Roles,
  getD360RoleTemplates,
  type ActionRegistryResponse,
  type RolePermission,
  type D360Role,
  type D360RoleTemplate,
} from '@/app/services/governance/fetch_roles';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

const keyOf = (m: string, p: string, t: string, a: string) => `${m}:${p}:${t}:${a}`;

function allowSet(perms: RolePermission[]): Set<string> {
  const s = new Set<string>();
  for (const p of perms) {
    if (String(p.access_level || 'ALLOW').toUpperCase() === 'ALLOW') {
      s.add(keyOf(p.module, p.page, p.tab ?? '*', p.action));
    }
  }
  return s;
}

function setToPermissions(set: Set<string>): RolePermission[] {
  return [...set].map((k) => {
    const [module, page, tab, action] = k.split(':');
    return { module, page, tab, action, access_level: 'ALLOW' as const };
  });
}

function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-6 text-xs text-slate-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
      {label}
    </div>
  );
}

function ErrBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-200"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function EnforcedBanner() {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <span className="font-semibold">Action-level RBAC (enforced path).</span> These grants live
        in <code className="font-mono">D360_ROLE_ACTIONS</code> — the allow-set the backend{' '}
        <code className="font-mono">require_action</code> gate reads. Editing here changes what a
        role can actually do (not just UI hints). System roles are read-only templates; only{' '}
        <span className="font-semibold">custom</span> roles can be edited.
      </p>
    </div>
  );
}

/** Disabled project selector — PROJECT_ID is not yet accepted by the backend. */
function ProjectSelector() {
  return (
    <label
      className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400"
      title="Per-project scoping requires the backend PROJECT_ID migration (D360_ROLE_ACTIONS is account-global today)."
    >
      <Layers className="h-3.5 w-3.5" /> Project
      <select
        disabled
        className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800/50"
      >
        <option>Global (account-wide)</option>
      </select>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        migration required
      </span>
    </label>
  );
}

// ===========================================================================
// Editor
// ===========================================================================

function ActionRbacEditor({
  registry,
  roles,
  templates,
  users,
}: {
  registry: ActionRegistryResponse;
  roles: D360Role[];
  templates: D360RoleTemplate[];
  users: UserGrantTableData[];
}) {
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [permState, setPermState] = useState<AsyncState>('idle');
  const [permError, setPermError] = useState<string | null>(null);
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [isSystem, setIsSystem] = useState(false);
  const [source, setSource] = useState<string>('db');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'save' } | { kind: 'template'; template: string }>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const roleMeta = useMemo(
    () => roles.find((r) => r.role_name === selectedRole) ?? null,
    [roles, selectedRole],
  );

  // Users carrying the selected role → confirm dialog blast radius.
  const affectedUsers = useMemo(() => {
    if (!selectedRole) return 0;
    const target = selectedRole.toUpperCase();
    return users.filter((u) =>
      (u.roles ?? []).some((r) => String(r).toUpperCase() === target),
    ).length;
  }, [users, selectedRole]);

  const loadPerms = useCallback(async (role: string) => {
    if (!role) {
      setPermState('idle');
      setOriginal(new Set());
      setAllowed(new Set());
      return;
    }
    setPermState('running');
    setPermError(null);
    try {
      const res = await getRolePermissions(role);
      const s = allowSet(res.permissions);
      setOriginal(new Set(s));
      setAllowed(new Set(s));
      setIsSystem(res.is_system);
      setSource(res.source);
      setPermState('done');
    } catch (e) {
      setPermError(getApiErrorMessage(e));
      setPermState('error');
    }
  }, []);

  const dirty = useMemo(() => {
    if (original.size !== allowed.size) return true;
    for (const k of allowed) if (!original.has(k)) return true;
    return false;
  }, [original, allowed]);

  const readOnly = isSystem;

  const toggleCell = useCallback(
    (m: string, p: string, t: string, a: string) => {
      if (readOnly) return;
      const k = keyOf(m, p, t, a);
      setAllowed((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
    },
    [readOnly],
  );

  const toggleModule = (m: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  const doSave = useCallback(async () => {
    setConfirm(null);
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await setRolePermissions(selectedRole, setToPermissions(allowed));
      setOriginal(new Set(allowed));
      invalidateMyPermissions(); // admin may have edited their own effective role
      toast({ title: `${selectedRole}: ${res.permissions_set} permissions saved` });
      setSource('db');
    } catch (e) {
      toast({ title: getApiErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  }, [selectedRole, allowed]);

  const doApplyTemplate = useCallback(
    async (template: string) => {
      setConfirm(null);
      if (!selectedRole) return;
      setSaving(true);
      try {
        const res = await applyTemplate(selectedRole, template, 'replace');
        invalidateMyPermissions();
        toast({ title: `Applied "${template}" → ${selectedRole} (${res.permissions_applied ?? 0} perms)` });
        await loadPerms(selectedRole);
      } catch (e) {
        toast({ title: getApiErrorMessage(e) });
      } finally {
        setSaving(false);
      }
    },
    [selectedRole, loadPerms],
  );

  const modules = Object.entries(registry.registry);

  return (
    <div className="space-y-3">
      <EnforcedBanner />

      <GlassPanel depth={1} radius="xl" className="space-y-3 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> Role
            </span>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                void loadPerms(e.target.value);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.role_name} value={r.role_name}>
                  {r.role_name}
                  {r.is_system ? ' (system)' : ''}
                </option>
              ))}
            </select>
          </label>

          <ProjectSelector />

          {/* Apply template */}
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Apply template
            </span>
            <select
              value=""
              disabled={!selectedRole || readOnly || saving}
              title={readOnly ? 'System roles are read-only templates' : undefined}
              onChange={(e) => {
                if (e.target.value) setConfirm({ kind: 'template', template: e.target.value });
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.display_name || t.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {selectedRole && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  readOnly
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                )}
                title={readOnly ? 'System role — read-only template' : `Source: ${source}`}
              >
                {readOnly ? (
                  <>
                    <Lock className="mr-1 inline h-3 w-3" />
                    read-only template
                  </>
                ) : (
                  `editable · ${allowed.size} allowed`
                )}
              </span>
            )}
            <button
              type="button"
              disabled={!selectedRole || readOnly || !dirty || saving}
              onClick={() => setConfirm({ kind: 'save' })}
              title={
                readOnly
                  ? 'System roles cannot be edited'
                  : !dirty
                    ? 'No pending changes'
                    : 'Save the permission matrix'
              }
              className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        </div>

        {readOnly && selectedRole && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            <Lock className="mr-1 inline h-3 w-3" />
            <span className="font-semibold">{selectedRole}</span> is a system role. Its matrix is the
            hardcoded template (read-only). To customize it: create a custom role in{' '}
            <span className="font-mono">Governance → Grants → D360 roles</span> (optionally from this
            template), then edit it here.
          </div>
        )}
      </GlassPanel>

      {!selectedRole ? (
        <EmptyState icon={KeyRound} compact title="Select a role to edit its action matrix" />
      ) : permState === 'running' || permState === 'idle' ? (
        <Spinner label="Loading role matrix…" />
      ) : permState === 'error' ? (
        <ErrBox message={permError ?? 'Failed'} onRetry={() => void loadPerms(selectedRole)} />
      ) : (
        <div className="space-y-2">
          {modules.map(([mKey, mData]) => {
            const isCollapsed = collapsed.has(mKey);
            const pages = Object.entries(mData.pages ?? {});
            const mAllowed = [...allowed].filter((k) => k.startsWith(`${mKey}:`)).length;
            return (
              <GlassPanel key={mKey} depth={1} radius="xl" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleModule(mKey)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <span className="text-slate-400">{isCollapsed ? '▸' : '▾'}</span>
                    {mData.label || mKey}
                    <span className="font-mono text-[10px] font-normal text-slate-400">{mKey}</span>
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {mAllowed} allowed
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-3 border-t border-white/30 px-3 py-2 dark:border-white/10">
                    {pages.map(([pKey, pData]) => {
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
                                    {actions.map((a) => {
                                      const on = allowed.has(keyOf(mKey, pKey, t, a));
                                      return (
                                        <td key={a} className="px-1 py-0.5 text-center">
                                          <button
                                            type="button"
                                            disabled={readOnly}
                                            onClick={() => toggleCell(mKey, pKey, t, a)}
                                            title={`${mKey}:${pKey}:${t}:${a} = ${on ? 'ALLOW' : '—'}${readOnly ? ' (read-only)' : ' (click to toggle)'}`}
                                            className={cn(
                                              'h-5 w-7 rounded text-[9px] font-bold transition-colors',
                                              on
                                                ? 'bg-emerald-500/90 text-white hover:bg-emerald-500'
                                                : 'bg-slate-200/70 text-slate-400 hover:bg-slate-300 dark:bg-slate-700/60 dark:text-slate-500',
                                              readOnly && 'cursor-not-allowed opacity-60 hover:bg-current',
                                            )}
                                          >
                                            {on ? '✓' : '·'}
                                          </button>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>
      )}

      {confirm?.kind === 'save' && (
        <ConfirmDialog
          open
          destructive={false}
          title="Save action permissions?"
          message={`Replace the entire action matrix for "${selectedRole}" with ${allowed.size} ALLOW grant(s). This is the ENFORCED allow-set and affects ${affectedUsers} user(s) currently holding this role.`}
          confirmLabel="Save matrix"
          onConfirm={() => void doSave()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'template' && (
        <ConfirmDialog
          open
          title="Apply template?"
          message={`Replace "${selectedRole}"'s action matrix with the "${confirm.template}" template. This overwrites existing grants and affects ${affectedUsers} user(s) holding this role.`}
          confirmLabel="Apply template"
          onConfirm={() => void doApplyTemplate(confirm.template)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Preview ("test as role | user") — cross-module effective permissions
// ===========================================================================

function ActionRbacPreview({
  registry,
  roles,
  users,
}: {
  registry: ActionRegistryResponse;
  roles: D360Role[];
  users: UserGrantTableData[];
}) {
  const [mode, setMode] = useState<'role' | 'user'>('role');
  const [pickedRole, setPickedRole] = useState('');
  const [pickedUser, setPickedUser] = useState('');
  const [state, setState] = useState<AsyncState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [contributingRoles, setContributingRoles] = useState<string[]>([]);

  const loadForRole = useCallback(async (role: string) => {
    if (!role) {
      setState('idle');
      setAllowed(new Set());
      return;
    }
    setState('running');
    setError(null);
    setContributingRoles([role]);
    try {
      const res = await getRolePermissions(role);
      setAllowed(allowSet(res.permissions));
      setState('done');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setState('error');
    }
  }, []);

  // For a user we union their assigned roles' matrices. Runtime enforcement
  // resolves to a single highest-priority D360 role, so this is the OPTIMISTIC
  // upper bound — labelled as such below.
  const loadForUser = useCallback(
    async (username: string) => {
      if (!username) {
        setState('idle');
        setAllowed(new Set());
        return;
      }
      const user = users.find((u) => u.username === username);
      const userRoles = (user?.roles ?? []).map((r) => String(r));
      // Only roles that exist as D360 roles can be resolved against the matrix.
      const known = userRoles.filter((r) =>
        roles.some((dr) => dr.role_name.toUpperCase() === r.toUpperCase()),
      );
      setContributingRoles(known);
      if (known.length === 0) {
        setAllowed(new Set());
        setState('done');
        return;
      }
      setState('running');
      setError(null);
      try {
        const results = await Promise.allSettled(known.map((r) => getRolePermissions(r)));
        const union = new Set<string>();
        for (const r of results) {
          if (r.status === 'fulfilled') {
            for (const k of allowSet(r.value.permissions)) union.add(k);
          }
        }
        setAllowed(union);
        setState('done');
      } catch (e) {
        setError(getApiErrorMessage(e));
        setState('error');
      }
    },
    [users, roles],
  );

  // Per-module rollup: allowed vs total actions in the registry.
  const rollup = useMemo(() => {
    return Object.entries(registry.registry).map(([mKey, mData]) => {
      let total = 0;
      const allowedKeys: string[] = [];
      for (const [pKey, pData] of Object.entries(mData.pages ?? {})) {
        const tabs = pData.tabs?.length ? pData.tabs : ['*'];
        for (const t of tabs) {
          for (const a of pData.actions ?? []) {
            total += 1;
            if (allowed.has(keyOf(mKey, pKey, t, a))) allowedKeys.push(`${pKey}:${t}:${a}`);
          }
        }
      }
      return { mKey, label: mData.label || mKey, total, allowed: allowedKeys };
    });
  }, [registry, allowed]);

  const totalAllowed = useMemo(() => rollup.reduce((n, r) => n + r.allowed.length, 0), [rollup]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (m: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Effective Action-RBAC across <span className="font-semibold">all modules</span>. Use this
          to verify what a role (or user) can actually do before rolling it out.
        </p>
      </div>

      <GlassPanel depth={1} radius="xl" className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {(['role', 'user'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setMode(v);
                  setState('idle');
                  setAllowed(new Set());
                  setPickedRole('');
                  setPickedUser('');
                }}
                className={cn(
                  'rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
                  mode === v
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500',
                )}
              >
                As {v}
              </button>
            ))}
          </div>

          {mode === 'role' ? (
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              <KeyRound className="h-3.5 w-3.5" /> Role
              <select
                value={pickedRole}
                onChange={(e) => {
                  setPickedRole(e.target.value);
                  void loadForRole(e.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">Select a role…</option>
                {roles.map((r) => (
                  <option key={r.role_name} value={r.role_name}>
                    {r.role_name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              <User className="h-3.5 w-3.5" /> User
              <select
                value={pickedUser}
                onChange={(e) => {
                  setPickedUser(e.target.value);
                  void loadForUser(e.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </label>
          )}

          {contributingRoles.length > 0 && state === 'done' && (
            <span className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
              <Users className="h-3 w-3" />
              {mode === 'user' ? 'union of roles:' : 'role:'}
              {contributingRoles.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {r}
                </span>
              ))}
            </span>
          )}

          {state === 'done' && (pickedRole || pickedUser) && (
            <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {totalAllowed} actions allowed
            </span>
          )}
        </div>

        {mode === 'user' && (pickedUser || state === 'done') && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Note: runtime enforcement resolves a user to a single highest-priority D360 role. This
            view shows the optimistic UNION of all assigned, recognized roles — an upper bound on
            effective access.
          </p>
        )}
      </GlassPanel>

      {!pickedRole && !pickedUser ? (
        <EmptyState icon={ShieldCheck} compact title="Pick a role or user to preview effective access" />
      ) : state === 'running' ? (
        <Spinner label="Resolving effective permissions…" />
      ) : state === 'error' ? (
        <ErrBox message={error ?? 'Failed'} />
      ) : totalAllowed === 0 ? (
        <EmptyState icon={KeyRound} compact title="No effective Action-RBAC grants for this selection" />
      ) : (
        <div className="space-y-2">
          {rollup
            .filter((r) => r.allowed.length > 0)
            .map((r) => {
              const isExpanded = expanded.has(r.mKey);
              const pct = r.total ? Math.round((r.allowed.length / r.total) * 100) : 0;
              return (
                <GlassPanel key={r.mKey} depth={1} radius="xl" className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(r.mKey)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <span className="text-slate-400">{isExpanded ? '▾' : '▸'}</span>
                      {r.label}
                      <span className="font-mono text-[10px] font-normal text-slate-400">{r.mKey}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <span
                          className="block h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {r.allowed.length}/{r.total}
                      </span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="flex flex-wrap gap-1 border-t border-white/30 px-3 py-2 dark:border-white/10">
                      {r.allowed.map((k) => (
                        <span
                          key={k}
                          className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </GlassPanel>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Shell — loads shared catalog/roles/users once, hosts editor + preview
// ===========================================================================

export default function ActionRbacTab() {
  const [sub, setSub] = useState<'editor' | 'preview'>('editor');
  const [state, setState] = useState<AsyncState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ActionRegistryResponse | null>(null);
  const [roles, setRoles] = useState<D360Role[]>([]);
  const [templates, setTemplates] = useState<D360RoleTemplate[]>([]);
  const [users, setUsers] = useState<UserGrantTableData[]>([]);

  const load = useCallback(async () => {
    setState('running');
    setError(null);
    try {
      const [reg, rl, tpl, us] = await Promise.all([
        getActionRegistry(),
        getD360Roles(),
        getD360RoleTemplates().catch(() => [] as D360RoleTemplate[]),
        getUsersWithRolesAndModules().catch(() => [] as UserGrantTableData[]),
      ]);
      setRegistry(reg);
      setRoles(rl);
      setTemplates(tpl);
      setUsers(us);
      setState('done');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'running' || state === 'idle') return <Spinner label="Loading action registry…" />;
  if (state === 'error' || !registry)
    return <ErrBox message={error ?? 'Failed to load action registry'} onRetry={() => void load()} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
        {([
          ['editor', 'Permission editor'],
          ['preview', 'Test / preview as role · user'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={cn(
              'rounded-md px-3 py-1 text-[11px] font-semibold transition-colors',
              sub === k
                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === 'editor' ? (
        <ActionRbacEditor registry={registry} roles={roles} templates={templates} users={users} />
      ) : (
        <ActionRbacPreview registry={registry} roles={roles} users={users} />
      )}
    </div>
  );
}
