'use client';

/**
 * AdministrationHub — the single, coherent front door for platform administration.
 *
 * Previously `/administration` redirected straight into Access Control and the
 * remaining admin surfaces lived split across `/admin/*` and `/administration/*`
 * with no shared navigation. This hub organizes them into ONE module with 8
 * `?tab=<id>` sections (the sanctioned multi-tab pattern). It is purely additive
 * / non-destructive: every underlying route stays live and reachable — the hub
 * either embeds a self-contained panel or links into the existing page.
 *
 * Tab map:
 *   1. health      Platform Health   — placeholder card (backend endpoint pending) + link to Performance
 *   2. performance Performance       — links to /admin/performance (full page, prod/SVC-heavy)
 *   3. access      Access Control     — links to /administration/access-center + embeds RealAccess/RoleGrants panels
 *   4. projects    Projects           — embeds ProjectsMonitoringPanel (live unified roster) + "Manage projects" → governance.projects
 *   5. featureGov  Entitlements & Feature Governance — links to /administration/feature-governance
 *   6. apiHealth   API Health         — links to /admin/api-health (live route prober)
 *   7. serverMetrics Server Metrics   — embeds ServerMetricsPanel (live in-memory ops view)
 *   8. config      Config & Settings  — links to /admin/data360-config + /admin/platform-settings
 *
 * Cross-module redirects: each tab also exposes secondary "Open in <module>"
 * links (Observability / Account Overview / Data Quality / Governance) so the
 * hub is a launchpad into the wider platform, not just admin sub-pages.
 *
 * Honest by design: no fabricated metrics; data-less / prod-only surfaces say so.
 */
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowRight,
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
import PlatformHealthPanel from './PlatformHealthPanel';
import ProjectsMonitoringPanel from '../access-center/components/ProjectsMonitoringPanel';

type TabId =
  | 'health'
  | 'performance'
  | 'access'
  | 'projects'
  | 'featureGov'
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
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'featureGov', label: 'Entitlements & Feature Governance', icon: ToggleRight },
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
  const { trackTabSwitch, trackFeatureClick } = useTrackEvent();

  const initial = useMemo<TabId>(() => {
    const fromUrl = searchParams.get('tab');
    return TAB_IDS.includes(fromUrl as TabId) ? (fromUrl as TabId) : 'health';
  }, [searchParams]);

  const [tab, setTab] = useState<TabId>(initial);

  const onSelect = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      setTab(next);
      trackTabSwitch(next);
    },
    [tab, trackTabSwitch],
  );

  return (
    <div className="min-h-full space-y-4 p-4 lg:p-6">
      <header>
        <nav className="mb-1 flex items-center gap-1 text-xs text-slate-400" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">Administration</span>
        </nav>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[hsl(var(--primary))]" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Administration</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One place for platform administration — health, performance, access control, entitlements,
          API &amp; server health, and configuration. Each section opens its dedicated surface.
        </p>
      </header>

      {/* Segmented tab strip */}
      <div
        role="tablist"
        aria-label="Administration sections"
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
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
              className={cn(
                '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-semibold transition-colors',
                active
                  ? 'border-[hsl(var(--primary))] text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 1. Platform Health — audit-backed KPIs + granular tables + AI */}
      {tab === 'health' && (
        <div className="space-y-4">
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
                onClick={() => trackFeatureClick('open_account_overview', { from: 'health' })}
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
          <PlatformHealthPanel />
        </div>
      )}

      {/* 2. Performance — existing full page */}
      {tab === 'performance' && (
        <SectionCard
          icon={Gauge}
          title="Performance"
          description="Per-account, multi-axis drill-down: endpoints, users, cache, modules, projects and errors."
          note="Audit-backed metrics are richest in production; some axes rely on a service account and may read as quiet in local dev."
        >
          <div className="space-y-3">
            <OpenLink
              href={routes.adminPerformance.view}
              onClick={() => trackFeatureClick('open_performance', { from: 'performance' })}
            >
              Open Performance
            </OpenLink>
            <CtaRow>
              <OpenLink
                href={routes.observability.dashboard}
                variant="secondary"
                onClick={() => trackFeatureClick('open_observability', { from: 'performance' })}
              >
                Open Observability
              </OpenLink>
              <OpenLink
                href={routes.accountOverview}
                variant="secondary"
                onClick={() => trackFeatureClick('open_account_overview', { from: 'performance' })}
              >
                Open Account Overview
              </OpenLink>
            </CtaRow>
          </div>
        </SectionCard>
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
                onClick={() => trackFeatureClick('open_access_center', { from: 'access' })}
              >
                Open Access Control Center
              </OpenLink>
              <CtaRow>
                <OpenLink
                  href={routes.governance.users}
                  variant="secondary"
                  onClick={() => trackFeatureClick('open_governance_users', { from: 'access' })}
                >
                  Governance · Users
                </OpenLink>
                <OpenLink
                  href={routes.governance.grants}
                  variant="secondary"
                  onClick={() => trackFeatureClick('open_governance_grants', { from: 'access' })}
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
                  onClick={() => trackFeatureClick('open_governance_users', { from: 'projects' })}
                >
                  Open Governance
                </OpenLink>
                <OpenLink
                  href={routes.dataQuality.viewReports}
                  variant="secondary"
                  onClick={() => trackFeatureClick('open_data_quality', { from: 'projects' })}
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

      {/* 5. Entitlements & Feature Governance — existing page */}
      {tab === 'featureGov' && (
        <SectionCard
          icon={ToggleRight}
          title="Entitlements & Feature Governance"
          description="Per-account feature & addon enablement — govern who can create, run, deploy and manage charts & projects."
        >
          <div className="space-y-3">
            <OpenLink
              href="/administration/feature-governance"
              onClick={() => trackFeatureClick('open_feature_governance', { from: 'featureGov' })}
            >
              Open Feature Governance
            </OpenLink>
            <CtaRow>
              <OpenLink
                href={routes.governance.policies}
                variant="secondary"
                onClick={() => trackFeatureClick('open_governance', { from: 'featureGov' })}
              >
                Open Governance
              </OpenLink>
            </CtaRow>
          </div>
        </SectionCard>
      )}

      {/* 6. API Health — existing page */}
      {tab === 'apiHealth' && (
        <SectionCard
          icon={Activity}
          title="API Health"
          description="Live route prober — endpoint reachability and response health across the API surface."
        >
          <OpenLink
            href={routes.adminApiHealth.view}
            onClick={() => trackFeatureClick('open_api_health', { from: 'apiHealth' })}
          >
            Open API Health
          </OpenLink>
        </SectionCard>
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

      {/* 8. Config & Settings — two existing pages */}
      {tab === 'config' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SectionCard
            icon={Settings2}
            title="Config Data360"
            description="Metadata, tables, date columns, cache and refresh controls."
          >
            <OpenLink
              href={routes.data360Config.view}
              onClick={() => trackFeatureClick('open_data360_config', { from: 'config' })}
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
              onClick={() => trackFeatureClick('open_platform_settings', { from: 'config' })}
            >
              Open Platform Settings
            </OpenLink>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
