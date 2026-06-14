'use client';

/**
 * Access Control Center (G9) — ONE unified module → page → tab → feature →
 * action management surface, consolidating the three fragmented RBAC surfaces:
 *   1. Governance → Grants (advisory module visibility)
 *   2. Admin → Action RBAC (enforced per-(module,page,tab,action) ALLOW matrix)
 *   3. Administration → Feature Governance (module × feature entitlements)
 *
 * Layout: left role/user rail · centre action tree (tri-state per role, inline
 * entitlement + usage chips) · right detail inspector (shared RightTabPanel).
 *
 * All feeds are live (apiClient + existing governance/admin services). Feeds
 * that are not deployed / unattributed degrade to a quiet "—" — never fabricated.
 * Account-global scope only in v1 (my-permissions is account-global anyway).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  User,
  Users,
  Wand2,
  Save,
  ShieldCheck,
  Lock,
  Layers,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dash } from '@/app/shared/ui/format';
import { getApiErrorMessage } from '@/lib/api-client';
import { GlassPanel } from '@/app/shared/glass';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { invalidateMyPermissions } from '@/hooks/useCanPerform';
import {
  getActionRegistry,
  getD360Roles,
  getD360RoleTemplates,
  getRolePermissions,
  setRolePermissions,
  applyTemplate,
  getEffectiveUserPermissions,
  type ActionRegistryResponse,
  type D360Role,
  type D360RoleTemplate,
} from '@/app/services/governance/fetch_roles';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';
import {
  getEntitlements,
  getGovernancePosture,
  setEntitlement,
  type EntitlementsMatrix,
  type EntitlementFeature,
  type GovernancePosture,
  type PostureRow,
} from '@/app/services/administration/entitlements';
import { getEndpointUsage, type EndpointUsageRow } from '@/app/services/admin-visibility';
import type { StatusPillSpec, QuickAction } from '@/app/shared/governance/right-tab-panel';
import ModuleTree from './ModuleTree';
import AccessInspector from './AccessInspector';
import {
  buildPermMap,
  backendModuleKey,
  cycleLevel,
  keyOf,
  mapsDiffer,
  permMapToPermissions,
  usageByModule,
  usageFromActivity,
  Spinner,
  ErrBox,
  Chip,
  type ModuleUsage,
  type PermMap,
} from './shared';

const ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];
type Phase = 'idle' | 'loading' | 'ready' | 'error';

export default function AccessControlCenter() {
  const { role: authRole } = useAuth();
  const isAdmin = ADMIN_ROLES.includes((authRole || '').toUpperCase());

  // ── Core catalog (required) ────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('loading');
  const [coreError, setCoreError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ActionRegistryResponse | null>(null);
  const [roles, setRoles] = useState<D360Role[]>([]);
  const [templates, setTemplates] = useState<D360RoleTemplate[]>([]);
  const [users, setUsers] = useState<UserGrantTableData[]>([]);

  // ── Governance feeds (best-effort; null/empty → honest "—") ────────────────
  const [ent, setEnt] = useState<EntitlementsMatrix | null>(null);
  const [canGovern, setCanGovern] = useState(false);
  const [posture, setPosture] = useState<GovernancePosture | null>(null);
  const [usageRows, setUsageRows] = useState<EndpointUsageRow[]>([]);

  // ── Subject selection ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<'role' | 'user'>('role');
  const [selectedRole, setSelectedRole] = useState('');
  const [isSystemRole, setIsSystemRole] = useState(false);
  const [original, setOriginal] = useState<PermMap>(new Map());
  const [draft, setDraft] = useState<PermMap>(new Map());
  const [permPhase, setPermPhase] = useState<Phase>('idle');
  const [permError, setPermError] = useState<string | null>(null);

  const [previewUser, setPreviewUser] = useState('');
  const [effectiveMap, setEffectiveMap] = useState<PermMap>(new Map());
  const [effRole, setEffRole] = useState('');
  const [effSnowflake, setEffSnowflake] = useState<string[]>([]);
  const [effPhase, setEffPhase] = useState<Phase>('idle');
  const [effError, setEffError] = useState<string | null>(null);

  // ── Inspector + write state ────────────────────────────────────────────────
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [inspectorSection, setInspectorSection] = useState('roles');
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    null | { kind: 'save' } | { kind: 'template'; template: string }
  >(null);
  const [templateMenu, setTemplateMenu] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadCore = useCallback(async () => {
    setPhase('loading');
    setCoreError(null);
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
      setPhase('ready');
    } catch (e) {
      setCoreError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  const loadFeeds = useCallback(async () => {
    const [entR, postR, useR] = await Promise.allSettled([
      getEntitlements(),
      getGovernancePosture(),
      getEndpointUsage(7, 300),
    ]);
    let cg = false;
    if (entR.status === 'fulfilled') {
      setEnt(entR.value.matrix);
      cg = cg || entR.value.canGovern;
    }
    if (postR.status === 'fulfilled') {
      setPosture(postR.value.posture);
      cg = cg || postR.value.canGovern;
    }
    if (useR.status === 'fulfilled') setUsageRows(useR.value.endpoints ?? []);
    setCanGovern(cg);
  }, []);

  useEffect(() => {
    void loadCore();
    void loadFeeds();
  }, [loadCore, loadFeeds]);

  const loadPerms = useCallback(async (roleName: string) => {
    if (!roleName) {
      setPermPhase('idle');
      setOriginal(new Map());
      setDraft(new Map());
      return;
    }
    setPermPhase('loading');
    setPermError(null);
    try {
      const res = await getRolePermissions(roleName);
      const m = buildPermMap(res.permissions);
      setOriginal(new Map(m));
      setDraft(new Map(m));
      setIsSystemRole(Boolean(res.is_system));
      setPermPhase('ready');
    } catch (e) {
      setPermError(getApiErrorMessage(e));
      setPermPhase('error');
    }
  }, []);

  const loadEffective = useCallback(async (username: string) => {
    if (!username) {
      setEffPhase('idle');
      setEffectiveMap(new Map());
      setEffRole('');
      setEffSnowflake([]);
      return;
    }
    setEffPhase('loading');
    setEffError(null);
    try {
      const res = await getEffectiveUserPermissions(username);
      const m: PermMap = new Map();
      for (const p of res.permissions) {
        if (p.decision === 'allow') m.set(keyOf(p.module, p.page, p.tab ?? '*', p.action), 'allow');
        else if (p.decision === 'deny') m.set(keyOf(p.module, p.page, p.tab ?? '*', p.action), 'deny');
      }
      setEffectiveMap(m);
      setEffRole(res.d360_role || '');
      setEffSnowflake(res.snowflake_roles || []);
      setEffPhase('ready');
    } catch (e) {
      setEffError(getApiErrorMessage(e));
      setEffPhase('error');
    }
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const dirty = useMemo(() => mapsDiffer(draft, original), [draft, original]);
  const editable = mode === 'role' && isAdmin && Boolean(selectedRole) && !isSystemRole;
  const activeMap = mode === 'role' ? draft : effectiveMap;
  const subjectName = mode === 'role' ? selectedRole : effRole || previewUser;

  const affectedUsers = useMemo(() => {
    if (!selectedRole) return 0;
    const t = selectedRole.toUpperCase();
    return users.filter((u) => (u.roles ?? []).some((r) => String(r).toUpperCase() === t)).length;
  }, [users, selectedRole]);

  const usageMap = useMemo(() => usageByModule(usageRows), [usageRows]);
  const postureByModule = useMemo(() => {
    const m = new Map<string, PostureRow>();
    (posture?.posture ?? []).forEach((p) => m.set(p.module, p));
    return m;
  }, [posture]);

  /** Posture row for a registry module key (via the backend key-space bridge). */
  const postureFor = useCallback(
    (moduleKey: string): PostureRow | undefined => postureByModule.get(backendModuleKey(moduleKey)),
    [postureByModule],
  );

  const entitlementSummary = useCallback(
    (moduleKey: string): { on: number; total: number } | null => {
      const feats = ent?.modules?.[backendModuleKey(moduleKey)];
      if (!feats || feats.length === 0) return null;
      return { on: feats.filter((f) => f.enabled).length, total: feats.length };
    },
    [ent],
  );

  /**
   * Per-module usage rollup (best-effort): per-route endpoint-usage attribution
   * first, falling back to the governance-posture activity row. Either may be
   * absent in this environment → undefined → honest "—".
   */
  const resolveUsage = useCallback(
    (moduleKey: string): ModuleUsage | undefined =>
      usageMap.get(moduleKey) ??
      usageMap.get(backendModuleKey(moduleKey)) ??
      usageFromActivity(postureFor(moduleKey)?.usage),
    [usageMap, postureFor],
  );

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const onCycle = useCallback(
    (m: string, p: string, t: string, a: string) => {
      if (!editable) return;
      const k = keyOf(m, p, t, a);
      setDraft((prev) => {
        const next = new Map(prev);
        const nl = cycleLevel(next.get(k));
        if (nl === undefined) next.delete(k);
        else next.set(k, nl);
        return next;
      });
    },
    [editable],
  );

  const doSave = useCallback(async () => {
    setConfirm(null);
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await setRolePermissions(selectedRole, permMapToPermissions(draft));
      setOriginal(new Map(draft));
      invalidateMyPermissions();
      toast({ title: `${selectedRole}: ${res.permissions_set} permission(s) saved` });
    } catch (e) {
      toast({ title: getApiErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  }, [selectedRole, draft]);

  const doApplyTemplate = useCallback(
    async (template: string) => {
      setConfirm(null);
      if (!selectedRole) return;
      setSaving(true);
      try {
        const res = await applyTemplate(selectedRole, template, 'replace');
        invalidateMyPermissions();
        toast({
          title: `Applied "${template}" → ${selectedRole} (${dash(res.permissions_applied)} perms)`,
        });
        await loadPerms(selectedRole);
      } catch (e) {
        toast({ title: getApiErrorMessage(e) });
      } finally {
        setSaving(false);
      }
    },
    [selectedRole, loadPerms],
  );

  const onToggleFeature = useCallback(
    async (feat: EntitlementFeature) => {
      if (!canGovern) return;
      const ck = `${feat.module}:${feat.feature_key}`;
      const next = !feat.enabled;
      setTogglingKey(ck);
      try {
        await setEntitlement(feat.module, feat.feature_key, { enabled: next });
        setEnt((prev) => {
          if (!prev) return prev;
          const rows = prev.modules[feat.module] ?? [];
          const updated = rows.map((r) =>
            r.feature_key === feat.feature_key
              ? { ...r, enabled: next, source: 'override' as const }
              : r,
          );
          return { ...prev, modules: { ...prev.modules, [feat.module]: updated } };
        });
        toast({ title: `${feat.label} ${next ? 'enabled' : 'disabled'}` });
      } catch (e) {
        toast({ title: getApiErrorMessage(e) });
      } finally {
        setTogglingKey(null);
      }
    },
    [canGovern],
  );

  // ── Inspector wiring ───────────────────────────────────────────────────────
  const moduleLabel = selectedModule
    ? registry?.registry?.[selectedModule]?.label || selectedModule
    : '';
  const moduleCounts = useMemo(() => {
    if (!selectedModule) return { allow: 0, deny: 0 };
    let allow = 0;
    let deny = 0;
    for (const [k, v] of activeMap) {
      if (k.startsWith(`${selectedModule}:`)) {
        if (v === 'allow') allow += 1;
        else if (v === 'deny') deny += 1;
      }
    }
    return { allow, deny };
  }, [selectedModule, activeMap]);

  const statusPill: StatusPillSpec = !editable
    ? { label: 'Read-only', tone: 'draft' }
    : dirty
      ? { label: 'Unsaved', tone: 'warn' }
      : { label: 'Saved', tone: 'ok' };

  const quickActions: QuickAction[] = [
    {
      id: 'apply-template',
      label: 'Apply template',
      icon: Wand2,
      onClick: () => setTemplateMenu(true),
      disabled: !editable || saving || templates.length === 0,
    },
    {
      id: 'save',
      label: saving ? 'Saving…' : 'Save',
      icon: Save,
      tone: 'primary',
      onClick: () => setConfirm({ kind: 'save' }),
      disabled: !editable || !dirty || saving,
    },
  ];

  // ── Render: loading / error gates ──────────────────────────────────────────
  if (phase === 'loading' || phase === 'idle') return <Spinner label="Loading action registry…" />;
  if (phase === 'error' || !registry)
    return <ErrBox message={coreError ?? 'Failed to load action registry'} onRetry={() => void loadCore()} />;

  const features: EntitlementFeature[] = selectedModule
    ? ent?.modules?.[backendModuleKey(selectedModule)] ?? []
    : [];

  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row">
      {/* ── Left rail: subject selection ── */}
      <aside className="w-full shrink-0 space-y-3 lg:w-[264px]">
        <GlassPanel depth={1} radius="xl" className="space-y-3 p-3">
          {/* Gate banner */}
          {isAdmin ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-[10px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Admin (<span className="font-semibold">{authRole}</span>) — enforced edits are live.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Read-only — an account admin role is required to edit grants.</span>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {(
              [
                ['role', 'Edit role', KeyRound],
                ['user', 'Test user', User],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
                  mode === v
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'role' ? (
            <>
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

              {selectedRole && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {isSystemRole ? (
                    <Chip tone="slate" title="System roles are read-only templates">
                      <Lock className="h-3 w-3" /> read-only template
                    </Chip>
                  ) : (
                    <Chip tone={dirty ? 'amber' : 'emerald'}>
                      {dirty ? 'unsaved changes' : 'in sync'}
                    </Chip>
                  )}
                  {!isSystemRole && (
                    <span className="text-[10px] text-slate-400" title="Users holding this role">
                      {affectedUsers} user(s)
                    </span>
                  )}
                </div>
              )}

              {/* Apply template + Save */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!editable || templates.length === 0}
                  onClick={() => setTemplateMenu(true)}
                  title={
                    !editable ? 'Select a custom role to edit' : 'Apply a system template'
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Wand2 className="h-3 w-3" /> Template
                </button>
                <button
                  type="button"
                  disabled={!editable || !dirty || saving}
                  onClick={() => setConfirm({ kind: 'save' })}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[hsl(var(--primary))] px-2 py-1 text-[10px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save className="h-3 w-3" /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                </button>
              </div>

              {isSystemRole && selectedRole && (
                <p className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  <Lock className="mr-1 inline h-3 w-3" />
                  System role — its matrix is a read-only template. Create a custom role in Governance →
                  Grants to edit.
                </p>
              )}
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Test as user
                </span>
                <select
                  value={previewUser}
                  onChange={(e) => {
                    setPreviewUser(e.target.value);
                    void loadEffective(e.target.value);
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

              {previewUser && effPhase === 'ready' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <KeyRound className="h-3 w-3" /> resolves to
                    <Chip tone="violet">{effRole || '—'}</Chip>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                    <Users className="h-3 w-3" /> snowflake:
                    {effSnowflake.length === 0 ? (
                      <span className="italic">none</span>
                    ) : (
                      effSnowflake.map((r) => (
                        <Chip key={r} tone="slate">
                          {r}
                        </Chip>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Exact effective decision (mirrors runtime enforcement). Read-only.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-slate-800">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-4 rounded bg-emerald-500/90" /> allow
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-4 rounded bg-slate-200 dark:bg-slate-700" /> inherit
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-4 rounded bg-rose-500/90" /> deny
            </span>
          </div>
        </GlassPanel>

        {/* Feeds availability (honest) */}
        <GlassPanel depth={1} radius="xl" className="space-y-1 p-3 text-[10px]">
          <p className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-400">
            <Layers className="h-3 w-3" /> Live feeds
          </p>
          <FeedRow label="Action registry" ok={Boolean(registry)} />
          <FeedRow label="Role matrix (PUT)" ok={isAdmin} note={isAdmin ? 'enforced' : 'read-only'} />
          <FeedRow label="Entitlements" ok={Boolean(ent)} note={ent ? (canGovern ? 'govern' : 'read') : '—'} />
          <FeedRow label="Governance posture" ok={Boolean(posture)} />
          <FeedRow label="Usage attribution" ok={usageRows.length > 0} note={usageRows.length > 0 ? `${usageRows.length} routes` : '—'} />
        </GlassPanel>
      </aside>

      {/* ── Centre: the module → page → tab → action tree ── */}
      <div className="min-w-0 flex-1 space-y-3">
        {mode === 'role' && !selectedRole ? (
          <EmptyState icon={KeyRound} compact title="Select a role to view & edit its action matrix" />
        ) : mode === 'role' && (permPhase === 'loading' || permPhase === 'idle') ? (
          <Spinner label="Loading role matrix…" />
        ) : mode === 'role' && permPhase === 'error' ? (
          <ErrBox message={permError ?? 'Failed'} onRetry={() => void loadPerms(selectedRole)} />
        ) : mode === 'user' && !previewUser ? (
          <EmptyState icon={User} compact title="Pick a user to preview their exact effective access" />
        ) : mode === 'user' && (effPhase === 'loading' || effPhase === 'idle') ? (
          <Spinner label="Resolving effective permissions…" />
        ) : mode === 'user' && effPhase === 'error' ? (
          <ErrBox message={effError ?? 'Failed'} onRetry={() => void loadEffective(previewUser)} />
        ) : (
          <ModuleTree
            registry={registry}
            stateOf={(k) => activeMap.get(k)}
            editable={editable}
            onCycle={onCycle}
            selectedModule={selectedModule}
            onSelectModule={(m) => setSelectedModule(m)}
            entitlementSummary={entitlementSummary}
            usage={resolveUsage}
          />
        )}
      </div>

      {/* ── Right: detail inspector ── */}
      {selectedModule && (
        <AccessInspector
          moduleKey={selectedModule}
          moduleLabel={moduleLabel}
          selectedRole={subjectName}
          roleAllow={moduleCounts.allow}
          roleDeny={moduleCounts.deny}
          features={features}
          canGovern={canGovern}
          togglingKey={togglingKey}
          onToggleFeature={onToggleFeature}
          usage={resolveUsage(selectedModule)}
          posture={postureFor(selectedModule)}
          statusPill={statusPill}
          quickActions={quickActions}
          activeSection={inspectorSection}
          onSectionChange={setInspectorSection}
          onClose={() => setSelectedModule(null)}
        />
      )}

      {/* ── Dialogs ── */}
      {confirm?.kind === 'save' && (
        <ConfirmDialog
          open
          destructive={false}
          title="Save action permissions?"
          message={`Replace the entire action matrix for "${selectedRole}" with ${draft.size} stored rule(s) (ALLOW + DENY). This is the ENFORCED allow-set and affects ${affectedUsers} user(s) currently holding this role.`}
          confirmLabel="Save matrix"
          onConfirm={() => void doSave()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'template' && (
        <ConfirmDialog
          open
          destructive={false}
          title="Apply template?"
          message={`Replace "${selectedRole}"'s action matrix with the "${confirm.template}" template. This overwrites existing grants and affects ${affectedUsers} user(s) holding this role.`}
          confirmLabel="Apply template"
          onConfirm={() => void doApplyTemplate(confirm.template)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Template chooser */}
      {templateMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setTemplateMenu(false)}
        >
          <GlassPanel
            depth={3}
            radius="2xl"
            className="w-full max-w-sm p-4"
            // stop propagation so clicks inside don't dismiss
          >
            <div onClick={(e) => e.stopPropagation()}>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Wand2 className="h-4 w-4 text-[hsl(var(--primary))]" /> Apply a system template
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Seeds <span className="font-semibold">{selectedRole || 'the role'}</span> with a standard
                template (wholesale replace).
              </p>
              <div className="mt-3 max-h-64 space-y-1 overflow-auto">
                {templates.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No templates available — —</p>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => {
                        setTemplateMenu(false);
                        setConfirm({ kind: 'template', template: t.name });
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-[11px] text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span className="font-medium">{t.display_name || t.name}</span>
                      {typeof t.permission_count === 'number' && (
                        <Chip tone="slate">{t.permission_count} perms</Chip>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setTemplateMenu(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

function FeedRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
        <Info className="h-3 w-3 text-slate-300 dark:text-slate-600" /> {label}
      </span>
      <span
        className={cn(
          'font-semibold',
          ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400',
        )}
      >
        {note ?? (ok ? 'live' : '—')}
      </span>
    </div>
  );
}
