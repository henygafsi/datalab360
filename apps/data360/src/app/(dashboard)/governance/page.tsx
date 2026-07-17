'use client';

/**
 * /governance — the governance LANDING, presented as the unified cockpit
 * (2026-07-02 redesign). Replaces the former bare redirect to /governance/policies.
 *
 * Layout:
 *  - main column: header → <KpiStrip> (compliance · policies · users · roles ·
 *    MFA gaps · orphan grants) → a directory of the governance sub-pages, so
 *    every CRUD flow (create/edit/delete/grant/revoke for users & roles) stays
 *    reachable in ≤ 2 clicks;
 *  - right edge: the shared <AxisCockpit> with the module's axes
 *    (Overview / Policies / Users&Owners / Access / History / AI).
 *
 * Data honesty: one core snapshot feeds both the KPI strip and the core axes
 * (no duplicate GETs); every undetermined value renders "—", never a fake 0.
 * History / AI / project owners lazy-load on first axis open. No popups —
 * everything is docked. Mutating quick actions gate on
 * useCanPerform('gouvernance','create').
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { toast } from 'react-hot-toast';
import {
  Eye,
  Fingerprint,
  FolderKanban,
  Zap,
  Gauge,
  Grid3x3,
  History,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  X,
} from 'lucide-react';

import AxisCockpit, {
  type AxisDef,
  type AxisSeverity,
} from '@/app/shared/cockpit/AxisCockpit';
import KpiStrip, { type KpiItem } from '@/app/shared/cockpit/KpiStrip';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getModuleDisplayName } from '@/config/modules';
import { routes } from '@/config/routes';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useModuleAccess } from '@/hooks/useCapability';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import GovernanceEntitySurface, { type GovernanceTabId } from './components/GovernanceEntitySurface';
import {
  addRolePanelOpenAtom,
  addUserPanelOpenAtom,
} from '@/app/shared/governance/create-panel-atoms';
import {
  getAccessReviewSummary,
  getComplianceScore,
} from '@/app/services/governance/posture';
import { listPoliciesEnriched } from '@/app/services/governance/policies';
import { getUsers } from '@/app/services/governance/fetch_users';
import { getRoles } from '@/app/services/governance/fetch_roles';
import {
  AccessAxisBody,
  AiAxisBody,
  HistoryAxisBody,
  OverviewAxisBody,
  PoliciesAxisBody,
  UsersOwnersAxisBody,
  type GovCore,
} from './components/GovernanceCockpitAxes';

// ─────────────────────────────────────────────────────────────────────────────

type AxisId = 'overview' | 'policies' | 'users' | 'access' | 'history' | 'ai';
const AXIS_IDS: AxisId[] = ['overview', 'policies', 'users', 'access', 'history', 'ai'];

/** sessionStorage key: per-session dismissal of the read-only module notice. */
const RO_NOTICE_KEY = 'd360.read-only-notice.gouvernance';

const EMPTY_CORE: GovCore = {
  loading: true,
  compliance: null,
  accessReview: null,
  users: null,
  roles: null,
  masking: null,
  rowAccess: null,
  aggregation: null,
};

/** Sub-page directory — the HEAVY self-contained pages only. Users / Roles /
 *  Grants / Access-matrix moved INTO the landing as embedded tabs
 *  (GovernanceEntitySurface, 2026-07-16 consolidation). */
const DIRECTORY: {
  href: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  countKey?: 'users' | 'roles' | 'policies';
}[] = [
  { href: routes.governance.policies, icon: ShieldCheck, title: 'Policies', desc: 'Masking, row access, aggregation, network, tags', countKey: 'policies' },
  { href: routes.governance.securityMatrix, icon: Fingerprint, title: 'Security matrix', desc: 'Row-level axes, enterprise identities, posture' },
  { href: routes.governance.oauth, icon: Lock, title: 'Authentication', desc: 'SSO integrations, network policies, service keys' },
  { href: routes.governance.projects, icon: FolderKanban, title: 'Project governance', desc: 'Owners, contributors, versions, deployments' },
  { href: routes.governance.actions, icon: Zap, title: 'All actions', desc: 'Every governance capability as a governed action — search, run, verify' },
];

export default function GovernanceLandingPage() {
  useTrackEvent(); // fire-and-forget PAGE_VIEW on mount/route change
  const router = useRouter();
  // ?tab= deep-link into the embedded entity surface (read ONCE on mount via
  // window.location — same idiom as ?axis=; the surface owns the state after).
  const [initialEntityTab] = useState<GovernanceTabId | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'users' || tab === 'roles' || tab === 'grants' || tab === 'access'
      ? tab : undefined;
  });
  const setAddUserOpen = useSetAtom(addUserPanelOpenAtom);
  const setAddRoleOpen = useSetAtom(addRolePanelOpenAtom);

  // Mutating quick actions gate on gouvernance:create (fail-open while loading,
  // same pattern as the sibling governance pages — no flash of disabled CTAs).
  const createPerm = useCanPerform('gouvernance', 'create');
  // Module-level posture (my-module-access) layered ON TOP of action-RBAC:
  // a resolved 'read' disables the landing's mutating quick actions. undefined
  // (loading / hard error / module absent from the map) fails OPEN — zero
  // visual change until the map actually resolves to 'read' (no flash).
  const readOnly = useModuleAccess('gouvernance') === 'read';
  const canCreate = (createPerm.allowed || createPerm.loading) && !readOnly;
  const createDeniedTitle = canCreate
    ? undefined
    : readOnly
      ? `Read-only access — ask an admin for write access to ${getModuleDisplayName('gouvernance')}`
      : 'Requires the governance create permission';

  // Slim per-session read-only notice (dismiss persists in sessionStorage).
  const [roNoticeDismissed, setRoNoticeDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(RO_NOTICE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const dismissRoNotice = useCallback(() => {
    setRoNoticeDismissed(true);
    try {
      window.sessionStorage.setItem(RO_NOTICE_KEY, '1');
    } catch {
      /* best-effort */
    }
  }, []);

  // ── Cockpit state — auto-opens on the Overview axis (purposeful, not blank).
  const [open, setOpen] = useState(true);
  const [activeAxis, setActiveAxis] = useState<AxisId>('overview');

  const openAxis = useCallback((id: AxisId) => {
    setActiveAxis(id);
    setOpen(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('axis', id);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* URL sync is best-effort */
    }
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('axis');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* URL sync is best-effort */
    }
  }, []);

  // Deep link: /governance?axis=<id> opens that axis on arrival. One-shot read
  // of window.location (no useSearchParams → no Suspense deopt at build).
  useEffect(() => {
    const axis = new URLSearchParams(window.location.search).get('axis');
    if (axis && (AXIS_IDS as string[]).includes(axis)) {
      setActiveAxis(axis as AxisId);
      setOpen(true);
    }
  }, []);

  // ── Core snapshot — one load feeds the KPI strip AND the core axes.
  const [core, setCore] = useState<GovCore>(EMPTY_CORE);

  const loadCore = useCallback(async (notify = false) => {
    setCore((c) => ({ ...c, loading: true }));
    const [compliance, accessReview, users, roles, masking, rowAccess, aggregation] =
      await Promise.allSettled([
        getComplianceScore(), // degrades internally → { available:false }
        getAccessReviewSummary(), // degrades internally → { available:false }
        getUsers(),
        getRoles(),
        listPoliciesEnriched('MASKING'),
        listPoliciesEnriched('ROW_ACCESS'),
        listPoliciesEnriched('AGGREGATION'),
      ]);
    const val = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    const complianceV = val(compliance);
    const accessReviewV = val(accessReview);
    setCore({
      loading: false,
      compliance: complianceV,
      accessReview: accessReviewV,
      users: val(users),
      roles: val(roles),
      masking: val(masking)?.length ?? null,
      rowAccess: val(rowAccess)?.length ?? null,
      aggregation: val(aggregation)?.length ?? null,
    });

    if (notify) {
      const failed =
        [users, roles, masking, rowAccess, aggregation].filter(
          (r) => r.status === 'rejected',
        ).length +
        (complianceV?.available === false ? 1 : 0) +
        (accessReviewV?.available === false ? 1 : 0);
      if (failed === 0) toast.success('Governance metrics refreshed');
      else
        toast.error(
          `Refreshed — ${failed} source${failed > 1 ? 's' : ''} unavailable (shown as “—”)`,
        );
    }
  }, []);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  // ── Quick actions: pre-arm the docked create panel, then land on the page.
  const quickAddUser = useCallback(() => {
    setAddUserOpen(true);
    router.push(routes.governance.users);
  }, [router, setAddUserOpen]);

  const quickAddRole = useCallback(() => {
    setAddRoleOpen(true);
    router.push(routes.governance.roles);
  }, [router, setAddRoleOpen]);

  // ── Derived severities / counts ────────────────────────────────────────────
  const cs = core.compliance;
  const ar = core.accessReview;

  const scoreKnown = Boolean(cs?.available);
  const score = scoreKnown && cs ? Math.round(cs.score) : null;
  const mfaGaps = ar?.available ? ar.mfa_gaps.length : null;
  const expiring = ar?.available ? ar.expiring_policies.length : null;
  const orphans = ar?.available ? ar.orphan_grants.length : null;
  // Honest total: undetermined ("—") unless ALL three type counts resolved —
  // a partial sum would silently under-count the active policies.
  const policiesTotal =
    core.masking !== null && core.rowAccess !== null && core.aggregation !== null
      ? core.masking + core.rowAccess + core.aggregation
      : null;

  const overviewSeverity: AxisSeverity = !scoreKnown
    ? 'idle'
    : (score ?? 0) >= 75
      ? 'ok'
      : (score ?? 0) >= 50
        ? 'warn'
        : 'blocker';

  // Spec: MFA gaps>0 → blocker · expiring>0 → warn · else ok (idle when unknown).
  const accessSeverity: AxisSeverity = !ar?.available
    ? 'idle'
    : (mfaGaps ?? 0) > 0
      ? 'blocker'
      : (expiring ?? 0) > 0
        ? 'warn'
        : 'ok';

  const policiesSeverity: AxisSeverity = policiesTotal === null ? 'idle' : 'ok';
  const usersSeverity: AxisSeverity =
    core.users === null && core.roles === null ? 'idle' : 'ok';

  const needsReview = (mfaGaps ?? 0) + (expiring ?? 0) + (orphans ?? 0);

  // ── Axes (render bodies are lazy: only the active axis is rendered) ────────
  const axes: AxisDef[] = useMemo(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        railLabel: 'Posture',
        icon: Gauge,
        severity: overviewSeverity,
        badge: scoreKnown ? `${score}/100` : undefined,
        render: () => (
          <OverviewAxisBody core={core} onOpenAccess={() => openAxis('access')} />
        ),
        primaryCta: {
          label: 'Security matrix',
          onClick: () => router.push(routes.governance.securityMatrix),
          tone: 'neutral',
        },
      },
      {
        id: 'policies',
        label: 'Policies',
        railLabel: 'Policies',
        icon: ShieldCheck,
        severity: policiesSeverity,
        badge: policiesTotal !== null ? `${policiesTotal} active` : undefined,
        render: () => <PoliciesAxisBody core={core} />,
        primaryCta: {
          label: 'Manage',
          onClick: () => router.push(routes.governance.policies),
          tone: 'neutral',
        },
      },
      {
        id: 'users',
        label: 'Users & Owners',
        railLabel: 'Users',
        icon: Users,
        severity: usersSeverity,
        badge: core.users ? `${core.users.length} users` : undefined,
        render: () => (
          <UsersOwnersAxisBody
            core={core}
            canCreate={canCreate}
            createDeniedTitle={createDeniedTitle}
            onAddUser={quickAddUser}
            onAddRole={quickAddRole}
          />
        ),
        primaryCta: {
          label: 'Add user',
          onClick: quickAddUser,
          disabled: !canCreate,
          title: createDeniedTitle,
          tone: 'primary',
        },
      },
      {
        id: 'access',
        label: 'Access review',
        railLabel: 'Access',
        icon: KeyRound,
        severity: accessSeverity,
        badge:
          ar?.available && needsReview > 0 ? `${needsReview} to review` : undefined,
        render: () => <AccessAxisBody core={core} />,
        primaryCta: ar?.available
          ? {
              label: 'Review gaps',
              onClick: () => {
                const drill =
                  (mfaGaps ?? 0) > 0
                    ? 'mfa'
                    : (expiring ?? 0) > 0
                      ? 'expiring'
                      : (orphans ?? 0) > 0
                        ? 'orphan'
                        : null;
                router.push(
                  drill
                    ? `${routes.governance.securityMatrix}?drill=${drill}`
                    : routes.governance.securityMatrix,
                );
              },
              tone: accessSeverity === 'blocker' ? 'danger' : 'neutral',
            }
          : undefined,
      },
      {
        id: 'history',
        label: 'Activity',
        railLabel: 'History',
        icon: History,
        render: () => <HistoryAxisBody />,
      },
      {
        id: 'ai',
        label: 'AI insights',
        railLabel: 'AI',
        icon: Sparkles,
        render: () => <AiAxisBody />,
      },
    ],
    [
      core,
      scoreKnown,
      score,
      policiesTotal,
      overviewSeverity,
      policiesSeverity,
      usersSeverity,
      accessSeverity,
      ar,
      mfaGaps,
      expiring,
      orphans,
      needsReview,
      canCreate,
      createDeniedTitle,
      openAxis,
      quickAddUser,
      quickAddRole,
      router,
    ],
  );

  // ── KPI strip — same snapshot, click-through opens the owning axis ─────────
  const kpis: KpiItem[] = useMemo(
    () => [
      {
        label: 'Compliance score',
        value: core.loading ? null : score,
        dot: !scoreKnown
          ? 'idle'
          : (score ?? 0) >= 75
            ? 'ok'
            : (score ?? 0) >= 50
              ? 'warn'
              : 'blocker',
        sub: 'weighted posture /100',
        onClick: () => openAxis('overview'),
        title: 'Open the posture overview',
      },
      {
        label: 'Active policies',
        value: core.loading ? null : policiesTotal,
        sub: 'masking · row access · aggregation',
        onClick: () => openAxis('policies'),
        title: 'Open the policies axis',
      },
      {
        label: 'Users',
        value: core.loading ? null : (core.users?.length ?? null),
        onClick: () => openAxis('users'),
        title: 'Open users & owners',
      },
      {
        label: 'Roles',
        value: core.loading ? null : (core.roles?.length ?? null),
        onClick: () => openAxis('users'),
        title: 'Open users & owners',
      },
      {
        label: 'MFA gaps',
        value: core.loading ? null : mfaGaps,
        dot: mfaGaps === null ? 'idle' : mfaGaps > 0 ? 'blocker' : 'ok',
        onClick: () => openAxis('access'),
        title: 'Open the access review',
      },
      {
        label: 'Orphan grants',
        value: core.loading ? null : orphans,
        dot: orphans === null ? 'idle' : orphans > 0 ? 'warn' : 'ok',
        onClick: () => openAxis('access'),
        title: 'Open the access review',
      },
    ],
    [core, score, scoreKnown, policiesTotal, mfaGaps, orphans, openAxis],
  );

  const countFor = (key?: 'users' | 'roles' | 'policies'): string | null => {
    if (!key) return null;
    if (core.loading) return '…';
    const n =
      key === 'users'
        ? (core.users?.length ?? null)
        : key === 'roles'
          ? (core.roles?.length ?? null)
          : policiesTotal;
    return n === null ? '—' : n.toLocaleString();
  };

  return (
    <ErrorBoundary>
      <div className="flex items-start">
        {/* ── Main column ── */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Breadcrumb */}
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <Link href="/" className="hover:text-blue-600">
              Home
            </Link>{' '}
            / <span className="text-slate-700 dark:text-slate-300">Governance</span>
          </div>

          <PageHeader
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Governance"
            subtitle="Policies, people and access posture for your data platform — one cockpit"
            color="violet"
            actions={
              <button
                type="button"
                onClick={() => void loadCore(true)}
                disabled={core.loading}
                title="Refresh governance metrics"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw
                  className={`h-4 w-4 ${core.loading ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                Refresh
              </button>
            }
          />

          {/* Viewer-safe read-only notice — only after my-module-access resolves
              to 'read'; dismissable for the session. Write/unknown → not rendered. */}
          {readOnly && !roNoticeDismissed && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                You have read-only access to this module
              </span>
              <button
                type="button"
                onClick={dismissRoNotice}
                aria-label="Dismiss read-only notice"
                className="rounded p-0.5 text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}

          {/* KPI strip — skeletons while loading (data-first), then honest "—"
              for anything genuinely empty; click → axis. */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800">
            <KpiStrip items={kpis} loading={core.loading} />
          </div>

          {/* Users · Roles · Grants · Access matrix — consolidated as embedded
              tabs (the entities live HERE now; old routes stay as deep links). */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Users, roles &amp; access
            </h2>
            <GovernanceEntitySurface initialTab={initialEntityTab} />
          </div>

          {/* Sub-page directory — heavy self-contained pages. */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Governance areas
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {DIRECTORY.map((d) => {
                const count = countFor(d.countKey);
                return (
                  <Link
                    key={d.href}
                    href={d.href}
                    className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10 dark:bg-indigo-950/50 dark:text-indigo-400">
                        <d.icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">
                        {d.title}
                      </span>
                      {count !== null && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {count}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {d.desc}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right-edge cockpit (docked, no popups) ── */}
        <aside
          aria-label="Governance cockpit"
          className="sticky top-20 ml-5 hidden h-[calc(100vh-6.5rem)] shrink-0 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex"
        >
          <AxisCockpit
            axes={axes}
            open={open}
            activeAxis={activeAxis}
            onOpenAxis={(id) => openAxis(id as AxisId)}
            onClose={closePanel}
            className="h-full"
          />
        </aside>
      </div>
    </ErrorBoundary>
  );
}
