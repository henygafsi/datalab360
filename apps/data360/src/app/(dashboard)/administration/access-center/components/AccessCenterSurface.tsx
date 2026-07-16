'use client';

/**
 * AccessCenterSurface — the Access Control Center as an EMBEDDABLE surface.
 *
 * This is the former `/administration/access-center` page content, extracted so
 * the Administration HUB can render it inline as its "Access" tab (sub-pages →
 * tabs, per the data360 tab-minimized cockpit pattern). The standalone route now
 * redirects to `/administration?tab=access`.
 *
 * Key difference vs. the old page: internal section state is LOCAL (`useState`),
 * NOT synced to the URL `?tab=` param — the hub already owns `?tab=` for its
 * top-level tabs, so a second writer would collide. Deep-linking into a specific
 * access section is intentionally dropped in favor of the hub's top-level tabs.
 *
 * `exclude` lets the hub hide sub-tabs that already exist as hub top-level tabs
 * (Feature Governance, Projects) so nothing is duplicated. NOTE: the Performance
 * & Monitoring sub-tab (PerformancePanel — warehouse/query/cross-module
 * intelligence) is NOT excluded: it is a DIFFERENT component from the hub's
 * top-level Performance tab (LatencyFreshnessPanel + PerformanceKpiPanel), so
 * excluding it would orphan that surface.
 */
import { useMemo, useState } from 'react';
import { Activity, Database, FolderKanban, Gauge, Inbox, KeyRound, Lock, ListTree, ToggleRight, UserCog, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import AccessControlCenter from './AccessControlCenter';
import CacheMetricsPanel from './CacheMetricsPanel';
import CacheGovernancePanel from './CacheGovernancePanel';
import AdminOverviewHeader from './AdminOverviewHeader';
import RolesPermissionsPanel from './RolesPermissionsPanel';
import UsageAuditPanel from './UsageAuditPanel';
import ProvisioningPanel from './ProvisioningPanel';
import PerformancePanel from './PerformancePanel';
import DefaultRoleGovernancePanel from './DefaultRoleGovernancePanel';
import ProjectsMonitoringPanel from './ProjectsMonitoringPanel';
import FeatureGovernanceMatrix from '../../feature-governance/FeatureGovernanceMatrix';
import AccessRequestInboxPanel from './AccessRequestInboxPanel';

export type AccessTabId =
  | 'access'
  | 'roles'
  | 'featureGov'
  | 'roleGovernance'
  | 'performance'
  | 'cacheCalls'
  | 'usage'
  | 'provisioning'
  | 'projects'
  | 'accessRequests';

const ALL_TABS: { id: AccessTabId; label: string; icon: LucideIcon }[] = [
  { id: 'access', label: 'Access Control', icon: Lock },
  { id: 'roles', label: 'Roles & Permissions', icon: KeyRound },
  { id: 'featureGov', label: 'Feature Governance', icon: ToggleRight },
  { id: 'roleGovernance', label: 'Role Governance', icon: ListTree },
  { id: 'performance', label: 'Performance & Monitoring', icon: Gauge },
  { id: 'cacheCalls', label: 'Cache & Calls', icon: Database },
  { id: 'usage', label: 'Usage & Audit', icon: Activity },
  { id: 'provisioning', label: 'Provisioning', icon: UserCog },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'accessRequests', label: 'Access Requests', icon: Inbox },
];

interface AccessCenterSurfaceProps {
  /** Sub-tab ids to hide (already surfaced as hub top-level tabs) — avoids duplication. */
  exclude?: AccessTabId[];
  /** Render the KPI/governance overview header above the tabs. Default true. */
  showOverviewHeader?: boolean;
}

export default function AccessCenterSurface({
  exclude = ['featureGov', 'projects'],
  showOverviewHeader = true,
}: AccessCenterSurfaceProps) {
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !exclude.includes(t.id)),
    [exclude],
  );
  const [tab, setTab] = useState<AccessTabId>(() => tabs[0]?.id ?? 'access');
  const { trackTabSwitch } = useTrackEvent();

  const onSelect = (next: AccessTabId) => {
    if (next === tab) return;
    setTab(next);
    trackTabSwitch(`access:${next}`);
  };

  return (
    <div className="space-y-4">
      {showOverviewHeader && <AdminOverviewHeader />}

      {/* Section sub-tabs (local state — the hub owns the URL ?tab=) */}
      <div
        role="tablist"
        aria-label="Access control sections"
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
      >
        {tabs.map((t) => {
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

      {/* Active section (only the active panel mounts → lazy, isolated fetch) */}
      {tab === 'access' && <AccessControlCenter />}
      {tab === 'roles' && <RolesPermissionsPanel />}
      {tab === 'featureGov' && <FeatureGovernanceMatrix />}
      {tab === 'roleGovernance' && <DefaultRoleGovernancePanel />}
      {tab === 'performance' && <PerformancePanel />}
      {tab === 'cacheCalls' && (
        <div className="space-y-6">
          <CacheGovernancePanel />
          <CacheMetricsPanel />
        </div>
      )}
      {tab === 'usage' && <UsageAuditPanel />}
      {tab === 'provisioning' && <ProvisioningPanel />}
      {tab === 'projects' && <ProjectsMonitoringPanel />}
      {tab === 'accessRequests' && <AccessRequestInboxPanel />}
    </div>
  );
}
