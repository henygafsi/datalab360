'use client';

/**
 * AdministrationHub — the single, coherent front door for platform administration.
 *
 * Previously `/administration` redirected straight into Access Control and the
 * remaining admin surfaces lived split across `/admin/*` and `/administration/*`
 * with no shared navigation. This hub organizes them into ONE module with 9
 * `?tab=<id>` sections (the sanctioned multi-tab pattern). It is purely additive
 * / non-destructive: every underlying route stays live and reachable — the hub
 * either embeds a self-contained panel or links into the existing page.
 *
 * Tab map:
 *   1. health      Platform Health   — placeholder card (backend endpoint pending) + link to Performance
 *   2. performance Performance       — links to /admin/performance (full page, prod/SVC-heavy)
 *   3. access      Access Control     — links to /administration/access-center + embeds RealAccess/RoleGrants panels
 *   4. costGov     Cost Governance   — spend visibility + real warehouse cost-limit controls
 *   5. projects    Projects           — embeds ProjectsMonitoringPanel (live unified roster) + "Manage projects" → governance.projects
 *   6. featureGov  Entitlements & Feature Governance — embeds FeatureGovernanceMatrix
 *   7. features    Feature Registry   — business-readable catalog of every feature (what/where/
 *                                       endpoints) with per-account activation via entitlements
 *   8. apiHealth   API Health         — links to /admin/api-health (live route prober)
 *   9. serverMetrics Server Metrics   — embeds ServerMetricsPanel (live in-memory ops view)
 *  10. config      Config & Settings  — embeds ConfigSummaryPanel + links to the two editor pages
 *
 * Navigation: vertical option rail (collapsible, icon+label, keyboard-accessible
 * role=tablist/tab + aria-selected + aria-orientation=vertical).
 *
 * Cross-module redirects: each tab also exposes secondary "Open in <module>"
 * links (Observability / Account Overview / Data Quality / Governance) so the
 * hub is a launchpad into the wider platform, not just admin sub-pages.
 */
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  FolderKanban,
  Gauge,
  HeartPulse,
  KeyRound,
  Lock,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  ToggleRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import ServerMetricsPanel from '../../admin/ServerMetricsPanel';
import RealAccessPanel from '../../admin/RealAccessPanel';
import RoleGrantsPanel from '../../admin/RoleGrantsPanel';
import ActivityDashboard from '../../admin/ActivityDashboard';
import PlatformHealthPanel from './PlatformHealthPanel';
import CostGovernancePanel from './CostGovernancePanel';
import ProjectsMonitoringPanel from '../access-center/components/ProjectsMonitoringPanel';
import ApiCatalogPanel from './ApiCatalogPanel';
import PerformanceKpiPanel from './PerformanceKpiPanel';
import LatencyFreshnessPanel from './LatencyFreshnessPanel';
import ServiceHealthPanel from './ServiceHealthPanel';
import ConfigSummaryPanel from './ConfigSummaryPanel';
import FeatureGovernanceMatrix from '../feature-governance/FeatureGovernanceMatrix';
import FeatureRegistryTab from './FeatureRegistryTab';
import RoleGrantsSamplePanel from './RoleGrantsSamplePanel';

type TabId =
  | 'health'
  | 'performance'
  | 'access'
  | 'costGov'
  | 'projects'
  | 'featureGov'
  | 'features'
  | 'apiHealth'
  | 'serverMetrics'
  | 'config';

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'health', label: 'Platform Health', icon: HeartPulse },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'access', label: 'Access Control', icon: Lock },
  { id: 'costGov', label: 'Cost Governance', icon: Coins },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'featureGov', label: 'Entitlements & Feature Gov.', icon: ToggleRight },
  { id: 'features', label: 'Feature Registry', icon: BookOpenText },
  { id: 'apiHealth', label: 'API Health', icon: Activity },
  { id: 'serverMetrics', label: 'Server Metrics', icon: Server },
  { id: 'config', label: 'Config & Settings', icon: Settings2 },
];

const TAB_IDS = TABS.map((t) => t.id);

/**
 * A link into an existing route (non-destructive front door).
 * `primary` = filled CTA into an admin sub-page.
 * `secondary` = outline "Open in <module>" cross-module redirect.
 */
function OpenLink({
  href,
  children,
  onClick,
  variant = 'primary',
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const isSecondary = variant === 'secondary';
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
        isSecondary
          ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
          : 'bg-[hsl(var(--primary))] text-white transition-opacity hover:opacity-90',
      )}
    >
      {children}
      {isSecondary ? (
        <ExternalLink className="h-3.5 w-3.5" />
      ) : (
        <ArrowRight className="h-3.5 w-3.5" />
      )}
    </Link>
  );
}

/** A consistent row of cross-module "Open in <module>" secondary links. */
function CtaRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A section card: title + short description + (optional) note + actions/embed. */
function SectionCard({
  icon: Icon,
  title,
  description,
  note,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[hsl(var(--primary))] dark:bg-slate-800">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          {note ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {note}
            </p>
          ) : null}
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export default function AdministrationHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { trackTabSwitch, trackFeatureClick } = useTrackEvent();
  const [collapsed, setCollapsed] = useState(false);

  const initial = useMemo<TabId>(() => {
    const fromUrl = searchParams.get('tab');
    return TAB_IDS.includes(fromUrl as TabId) ? (fromUrl as TabId) : 'health';
  }, [searchParams]);

  const [tab, setTab] = useState<TabId>(initial);

  const onSelect = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      setTab(next);
      // Keep ?tab= in sync so every section is deep-linkable and back-button-safe
      // (same pattern as /admin/data360-config).
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
      trackTabSwitch(next);
    },
    [tab, trackTabSwitch, router, pathname],
  );

  return (
    <div className="flex min-h-full flex-col">
      {/* Full-width page header */}
      <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-6">
        <nav
          className="mb-1 flex items-center gap-1 text-xs text-slate-400"
          aria-label="Breadcrumb"
        >
          <span>Home</span>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">Administration</span>
        </nav>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[hsl(var(--primary))]" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Administration</h1>
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          One place for platform administration — health, performance, access control, entitlements,
          API &amp; server health, and configuration. Each section opens its dedicated surface.
        </p>
      </header>

      {/* Two-column body: vertical nav rail + content */}
      <div className="flex min-h-0 flex-1">
        {/* Left nav rail */}
        <aside
          className={cn(
            'flex shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-900/50',
            collapsed ? 'w-14' : 'w-52',
          )}
          aria-label="Administration navigation"
        >
          {/* Collapse / expand toggle */}
          <div
            className={cn(
              'flex items-center border-b border-slate-200 px-2 py-2 dark:border-slate-800',
              collapsed ? 'justify-center' : 'justify-end',
            )}
          >
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Vertical tab list */}
          <nav
            role="tablist"
            aria-label="Administration sections"
            aria-orientation="vertical"
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-1.5"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(t.id)}
                  title={collapsed ? t.label : undefined}
                  className={cn(
                    'flex w-full items-center rounded-md px-2 py-2 text-left text-[12px] font-medium transition-colors',
                    collapsed ? 'justify-center gap-0 px-0' : 'gap-2.5',
                    active
                      ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] dark:bg-[hsl(var(--primary))]/20'
                      : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{t.label}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right content panel */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="space-y-4 p-4 lg:p-6">
            {/* 1. Platform Health — audit-backed KPIs + granular tables + AI */}
            {tab === 'health' && (
              <div className="space-y-4">
                {/* Data first — live panels render before navigation CTAs
                    (UX rule: display what's already computed, don't gate it). */}
                <ServiceHealthPanel />
                <PlatformHealthPanel />
                <ActivityDashboard />
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Continue in
                  </p>
                  <CtaRow>
                    <OpenLink
                      href={routes.observability.dashboard}
                      variant="secondary"
                      onClick={() => trackFeatureClick('open_observability', { from: 'health' })}
                    >
                      Open Observability
                    </OpenLink>
                    <OpenLink
                      href={routes.accountOverview}
                      variant="secondary"
                      onClick={() =>
                        trackFeatureClick('open_account_overview', { from: 'health' })
                      }
                    >
                      Open Account Overview
                    </OpenLink>
                    <OpenLink
                      href={routes.dataQuality.viewReports}
                      variant="secondary"
                      onClick={() => trackFeatureClick('open_data_quality', { from: 'health' })}
                    >
                      Open Data Quality
                    </OpenLink>
                  </CtaRow>
                </div>
              </div>
            )}

            {/* 2. Performance — existing full page */}
            {tab === 'performance' && (
              <div className="space-y-3">
                <SectionCard
                  icon={Gauge}
                  title="Performance"
                  description="Real per-endpoint KPIs — usage, errors, distinct users, latency (avg/max) and cache strategy. Live from server metrics + endpoint usage."
                >
                  <CtaRow>
                    <OpenLink
                      href={routes.adminPerformance.view}
                      onClick={() => trackFeatureClick('open_performance', { from: 'performance' })}
                    >
                      Full performance drill-down
                    </OpenLink>
                    <OpenLink
                      href={routes.observability.dashboard}
                      variant="secondary"
                      onClick={() => trackFeatureClick('open_observability', { from: 'performance' })}
                    >
                      Open Observability
                    </OpenLink>
                  </CtaRow>
                </SectionCard>
                <LatencyFreshnessPanel />
                <PerformanceKpiPanel />
              </div>
            )}

            {/* 3. Access Control — link to the center + embedded standalone RBAC panels */}
            {tab === 'access' && (
              <div className="space-y-4">
                <SectionCard
                  icon={Lock}
                  title="Access Control Center"
                  description="Govern access end-to-end — module → page → tab → feature → action — with per-role grants, entitlements, roles, usage and provisioning."
                >
                  <div className="space-y-3">
                    <OpenLink
                      href="/administration/access-center"
                      onClick={() =>
                        trackFeatureClick('open_access_center', { from: 'access' })
                      }
                    >
                      Open Access Control Center
                    </OpenLink>
                    <CtaRow>
                      <OpenLink
                        href={routes.governance.users}
                        variant="secondary"
                        onClick={() =>
                          trackFeatureClick('open_governance_users', { from: 'access' })
                        }
                      >
                        Governance · Users
                      </OpenLink>
                      <OpenLink
                        href={routes.governance.grants}
                        variant="secondary"
                        onClick={() =>
                          trackFeatureClick('open_governance_grants', { from: 'access' })
                        }
                      >
                        Governance · Grants
                      </OpenLink>
                      <OpenLink
                        href={routes.governance.securityMatrix}
                        variant="secondary"
                        onClick={() =>
                          trackFeatureClick('open_governance_security_matrix', { from: 'access' })
                        }
                      >
                        Governance · Security Matrix
                      </OpenLink>
                      <OpenLink
                        href={routes.governance.projects}
                        variant="secondary"
                        onClick={() => trackFeatureClick('manage_projects', { from: 'access' })}
                      >
                        Manage Projects
                      </OpenLink>
                    </CtaRow>
                  </div>
                </SectionCard>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Who really has access
                    </h2>
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    The live access picture — every user and the roles they actually hold.
                  </p>
                  <RealAccessPanel />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Role grants
                    </h2>
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    Pick a role to inspect its object-level privileges and revoke any one live.
                  </p>
                  <RoleGrantsPanel />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Role grants sample
                    </h2>
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    Simulate one of the 7 application data roles: per-module allow/deny from the
                    read-only access simulator, plus the declared capabilities that role can reach.
                  </p>
                  <RoleGrantsSamplePanel />
                </div>
              </div>
            )}

            {/* Cost Governance — spend visibility + real warehouse cost-limit controls */}
            {tab === 'costGov' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Continue in
                  </p>
                  <CtaRow>
                    <OpenLink
                      href={routes.accountOverview}
                      variant="secondary"
                      onClick={() =>
                        trackFeatureClick('open_account_overview', { from: 'costGov' })
                      }
                    >
                      Account Overview · FinOps
                    </OpenLink>
                    <OpenLink
                      href={routes.observability.dashboard}
                      variant="secondary"
                      onClick={() =>
                        trackFeatureClick('open_observability', { from: 'costGov' })
                      }
                    >
                      Open Observability
                    </OpenLink>
                  </CtaRow>
                </div>
                <CostGovernancePanel />
              </div>
            )}

            {/* 4. Projects — embedded account-wide monitoring roster + management CTA */}
            {tab === 'projects' && (
              <div className="space-y-4">
                <SectionCard
                  icon={FolderKanban}
                  title="Projects"
                  description="Account-wide oversight of every real project — name, type, status, owner, members and version, from the live unified feed. Read-only here; manage membership & collaboration in Governance."
                >
                  <div className="space-y-3">
                    <OpenLink
                      href={routes.governance.projects}
                      onClick={() => trackFeatureClick('manage_projects', { from: 'projects' })}
                    >
                      Manage projects
                    </OpenLink>
                    <CtaRow>
                      <OpenLink
                        href={routes.governance.users}
                        variant="secondary"
                        onClick={() =>
                          trackFeatureClick('open_governance_users', { from: 'projects' })
                        }
                      >
                        Open Governance
                      </OpenLink>
                      <OpenLink
                        href={routes.dataQuality.viewReports}
                        variant="secondary"
                        onClick={() =>
                          trackFeatureClick('open_data_quality', { from: 'projects' })
                        }
                      >
                        Open Data Quality
                      </OpenLink>
                    </CtaRow>
                  </div>
                </SectionCard>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <ProjectsMonitoringPanel />
                </div>
              </div>
            )}

            {/* 5. Entitlements & Feature Governance — matrix embedded (no empty tab) */}
            {tab === 'featureGov' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Continue in
                  </p>
                  <CtaRow>
                    <OpenLink
                      href="/administration/feature-governance"
                      variant="secondary"
                      onClick={() =>
                        trackFeatureClick('open_feature_governance', { from: 'featureGov' })
                      }
                    >
                      Open full page
                    </OpenLink>
                    <OpenLink
                      href={routes.governance.policies}
                      variant="secondary"
                      onClick={() => trackFeatureClick('open_governance', { from: 'featureGov' })}
                    >
                      Open Governance
                    </OpenLink>
                  </CtaRow>
                </div>
                <FeatureGovernanceMatrix />
              </div>
            )}

            {/* Feature Registry — business-readable catalog + per-account activation */}
            {tab === 'features' && <FeatureRegistryTab />}

            {/* 6. API Health — existing page */}
            {tab === 'apiHealth' && (
              <div className="space-y-3">
                <SectionCard
                  icon={Activity}
                  title="API Health"
                  description="Every backend endpoint with the frontend file that calls it, coverage, and live status. Open the full prober for deep per-endpoint diagnostics."
                >
                  <OpenLink
                    href={routes.adminApiHealth.view}
                    onClick={() => trackFeatureClick('open_api_health', { from: 'apiHealth' })}
                  >
                    Open full route prober
                  </OpenLink>
                </SectionCard>
                <ApiCatalogPanel />
              </div>
            )}

            {/* 7. Server Metrics — embed the self-contained live panel */}
            {tab === 'serverMetrics' && (
              <div className="space-y-3">
                <SectionCard
                  icon={Server}
                  title="Server Metrics"
                  description="Live, in-process server metrics — top & slowest endpoints, recent errors, active users, request rate, latency percentiles, memory, CPU and uptime."
                  note="In-memory ops view (not audit history): figures reflect the live server process and reset on restart. Auto-refreshes."
                />
                <ServerMetricsPanel />
              </div>
            )}

            {/* 8. Config & Settings — live config summary + the two editor pages */}
            {tab === 'config' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SectionCard
                    icon={Settings2}
                    title="Config Data360"
                    description="Metadata, tables, date columns, cache and refresh controls."
                  >
                    <OpenLink
                      href={routes.data360Config.view}
                      onClick={() =>
                        trackFeatureClick('open_data360_config', { from: 'config' })
                      }
                    >
                      Open Config Data360
                    </OpenLink>
                  </SectionCard>
                  <SectionCard
                    icon={SlidersHorizontal}
                    title="Platform Settings"
                    description="Platform-wide configuration entries with refresh and reset controls."
                  >
                    <OpenLink
                      href={routes.adminPlatformSettings.view}
                      onClick={() =>
                        trackFeatureClick('open_platform_settings', { from: 'config' })
                      }
                    >
                      Open Platform Settings
                    </OpenLink>
                  </SectionCard>
                </div>
                <ConfigSummaryPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
