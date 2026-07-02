'use client';

/**
 * AdminOverviewHeader — the persistent command-center header above the
 * Administration section tabs.
 *
 * A live KPI strip (roles · users · governable features · bound policies ·
 * requests · governed modules), a compact governance-posture ADN card (rendered
 * only for axes whose feed actually resolved — an absent feed is omitted, never
 * scored as a fabricated number), and coherent navigation cards into the other
 * Administration surfaces (Feature Governance · Performance · Config).
 *
 * Self-contained, best-effort feeds (Promise.allSettled). Anything missing or
 * not-deployed degrades to an honest "—". Read-only overview — nothing gated;
 * the nav cards are plain navigation (each target has its own gate).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import Link from 'next/link';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  ArrowRight,
  Boxes,
  Gauge,
  KeyRound,
  Settings2,
  ShieldCheck,
  ToggleRight,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { GlassPanel } from '@/app/shared/glass';
import AdnScoreCard, { type ScoreAxis } from '@/app/shared/command-center/AdnScoreCard';
import { routes } from '@/config/routes';
import { getD360Roles, type D360Role } from '@/app/services/governance/fetch_roles';
import {
  getUsersWithRolesAndModules,
  type UserGrantTableData,
} from '@/app/services/governance/user_roles';
import {
  getEntitlements,
  getGovernancePosture,
  type EntitlementsMatrix,
  type GovernancePosture,
} from '@/app/services/administration/entitlements';
import { getUsageBy, type UsageByRow } from '@/app/services/admin-visibility';

interface KpiSpec {
  icon: LucideIcon;
  label: string;
  value: string | number | null;
  sub?: string;
}

function KpiCard({ icon: Icon, label, value, sub }: KpiSpec) {
  const display = value === null || value === undefined || value === '' ? '—' : value;
  return (
    <GlassPanel depth={1} radius="xl" className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{display}</div>
      <div className="min-h-[14px] text-[10px] text-slate-400">{sub ?? ''}</div>
    </GlassPanel>
  );
}

// Feature Governance and Performance are now first-class section tabs on this
// same page, so their old nav-cards (which duplicated the tabs) are removed.
// Config Data360 is the only genuinely separate route, so it stays a nav-card.
const NAV_CARDS: { label: string; description: string; href: string; icon: LucideIcon }[] = [
  {
    label: 'Config Data360',
    description: 'Metadata · tables · date columns · cache & refresh',
    href: routes.data360Config.view,
    icon: Settings2,
  },
];

export default function AdminOverviewHeader() {
  const [roles, setRoles] = useState<D360Role[] | null>(null);
  const [users, setUsers] = useState<UserGrantTableData[] | null>(null);
  const [ent, setEnt] = useState<EntitlementsMatrix | null>(null);
  const [posture, setPosture] = useState<GovernancePosture | null>(null);
  const [usageBy, setUsageBy] = useState<UsageByRow[] | null>(null);

  const load = useCallback(async () => {
    const [rl, us, en, po, ub] = await Promise.allSettled([
      getD360Roles(),
      getUsersWithRolesAndModules(),
      getEntitlements(),
      getGovernancePosture(),
      getUsageBy('module', 7),
    ]);
    if (rl.status === 'fulfilled') setRoles(rl.value);
    if (us.status === 'fulfilled') setUsers(us.value);
    if (en.status === 'fulfilled') setEnt(en.value.matrix);
    if (po.status === 'fulfilled') setPosture(po.value.posture);
    if (ub.status === 'fulfilled') setUsageBy(ub.value.rows ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time refresh: when another admin mutates users / roles / grants /
  // permissions, the shared cache-invalidation SSE stream fires the relevant
  // key — re-run the best-effort feeds (load() has no loading phase, so this
  // refreshes silently with no skeleton flash). Reads the shared provider atom,
  // so it does NOT open a second SSE connection.
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
      CACHE_KEYS.GRANTS,
      CACHE_KEYS.USER_PERMISSIONS,
      'permissions',
    ];
    if (lastInvalidation.keys.some((k) => relevant.includes(k))) {
      void loadRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  // ── Derived KPIs (honest "—" when the feed didn't resolve) ──────────────────
  const systemRoles = roles?.filter((r) => r.is_system).length ?? 0;
  const customRoles = roles ? roles.length - systemRoles : 0;
  const activeUsers = users?.filter((u) => u.status === 'Active').length ?? 0;
  const disabledUsers = users ? users.length - activeUsers : 0;

  const featEnabled = useMemo(
    () => (ent ? Object.values(ent.modules).flat().filter((f) => f.enabled).length : null),
    [ent],
  );
  const featTotal = ent?.feature_count ?? (ent ? Object.values(ent.modules).flat().length : null);

  const usageTotals = useMemo(() => {
    if (!usageBy) return null;
    let requests = 0;
    let errors = 0;
    for (const r of usageBy) {
      requests += r.requests ?? 0;
      errors += r.errors ?? 0;
    }
    return { requests, errors };
  }, [usageBy]);

  const governedModules = posture?.posture?.length ?? ent?.module_count ?? null;
  const boundPolicies = posture?.policy_bindings?.total_active ?? null;

  const kpis: KpiSpec[] = [
    {
      icon: KeyRound,
      label: 'Roles',
      value: roles?.length ?? null,
      sub: roles ? `${systemRoles} system · ${customRoles} custom` : undefined,
    },
    {
      icon: Users,
      label: 'Users',
      value: users?.length ?? null,
      sub: users ? `${activeUsers} active · ${disabledUsers} disabled` : undefined,
    },
    {
      icon: ToggleRight,
      label: 'Governable features',
      value: featEnabled != null && featTotal != null ? `${featEnabled}/${featTotal}` : null,
      sub: ent ? 'enabled / total' : undefined,
    },
    {
      icon: ShieldCheck,
      label: 'Bound policies',
      value: boundPolicies,
      sub: boundPolicies != null ? 'account-scoped' : undefined,
    },
    {
      icon: Gauge,
      label: 'Requests (7d)',
      value: usageTotals ? usageTotals.requests.toLocaleString() : null,
      sub: usageTotals ? `${usageTotals.errors.toLocaleString()} errors` : undefined,
    },
    {
      icon: Boxes,
      label: 'Governed modules',
      value: governedModules,
      sub: governedModules != null ? 'in RBAC + governance' : undefined,
    },
  ];

  // ── ADN axes — only for feeds that resolved ──────────
  const axes: ScoreAxis[] = useMemo(() => {
    const out: ScoreAxis[] = [];
    if (featTotal != null && featTotal > 0 && featEnabled != null) {
      out.push({
        key: 'DQ',
        label: 'Coverage',
        score: Math.round((featEnabled / featTotal) * 100),
        desc: 'Share of governable features enabled for this account.',
      });
    }
    if (usageTotals && usageTotals.requests > 0) {
      out.push({
        key: 'PERF',
        label: 'Reliability',
        score: Math.max(0, Math.min(100, Math.round((1 - usageTotals.errors / usageTotals.requests) * 100))),
        desc: 'Success rate across module requests (last 7 days).',
      });
    }
    if (users && users.length > 0) {
      out.push({
        key: 'SEC',
        label: 'Provisioning',
        score: Math.round((activeUsers / users.length) * 100),
        desc: 'Share of provisioned users that are active (not disabled).',
      });
    }
    return out;
  }, [featTotal, featEnabled, usageTotals, users, activeUsers]);

  return (
    <div className="space-y-3">
      {/* KPI strip + ADN */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
        {axes.length > 0 && (
          <div className="lg:pt-0.5">
            <AdnScoreCard axes={axes} title="GOV ADN" compact />
          </div>
        )}
      </div>

      {/* Coherent navigation into the rest of Administration */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {NAV_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-[hsl(var(--primary))]/40 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-[hsl(var(--primary))]/10 group-hover:text-[hsl(var(--primary))] dark:bg-slate-800 dark:text-slate-400">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                  {c.label}
                </span>
                <span className="block truncate text-[10px] text-slate-400">{c.description}</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[hsl(var(--primary))] dark:text-slate-600" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
