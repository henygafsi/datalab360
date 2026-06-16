'use client';

/**
 * Administration → Access Control Center (G9), reframed as the Admin command
 * center.
 *
 * One coherent surface with a persistent overview header (KPI strip + governance
 * ADN + nav into Feature Governance / Performance / Config) and section tabs that
 * mirror the sanctioned `?tab=<id>` pattern (intelligent / observability):
 *   - Access Control  → the unified module→page→tab→feature→action RBAC matrix
 *                       (AccessControlCenter — unchanged; the editable/enforced
 *                       surface, gated internally).
 *   - Roles & Perms   → the live role×module access matrix + roles roster +
 *                       action catalog (paginated AuditTables).
 *   - Usage & Audit   → request volume (module/role/user) + endpoint usage.
 *   - Provisioning    → every user with granted roles + activation status.
 *
 * All feeds are live (existing governance / administration service getters).
 * Absent / not-deployed feeds degrade to honest "—" / quiet empty states.
 */
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Database, FolderKanban, Gauge, KeyRound, Lock, ShieldCheck, ListTree, ToggleRight, UserCog, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import AccessControlCenter from './components/AccessControlCenter';
import CacheMetricsPanel from './components/CacheMetricsPanel';
import AdminOverviewHeader from './components/AdminOverviewHeader';
import RolesPermissionsPanel from './components/RolesPermissionsPanel';
import UsageAuditPanel from './components/UsageAuditPanel';
import ProvisioningPanel from './components/ProvisioningPanel';
import PerformancePanel from './components/PerformancePanel';
import DefaultRoleGovernancePanel from './components/DefaultRoleGovernancePanel';
import ProjectsMonitoringPanel from './components/ProjectsMonitoringPanel';
import FeatureGovernanceMatrix from '../feature-governance/FeatureGovernanceMatrix';

type TabId =
  | 'access'
  | 'roles'
  | 'featureGov'
  | 'roleGovernance'
  | 'performance'
  | 'cacheCalls'
  | 'usage'
  | 'provisioning'
  | 'projects';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'access', label: 'Access Control', icon: Lock },
  { id: 'roles', label: 'Roles & Permissions', icon: KeyRound },
  { id: 'featureGov', label: 'Feature Governance', icon: ToggleRight },
  { id: 'roleGovernance', label: 'Role Governance', icon: ListTree },
  { id: 'performance', label: 'Performance & Monitoring', icon: Gauge },
  { id: 'cacheCalls', label: 'Cache & Calls', icon: Database },
  { id: 'usage', label: 'Usage & Audit', icon: Activity },
  { id: 'provisioning', label: 'Provisioning', icon: UserCog },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
];

const TAB_IDS = TABS.map((t) => t.id);

export default function AccessCenterPage() {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get('tab');
  // Back-compat: the old bare `governance` id was renamed to `roleGovernance`;
  // keep existing `?tab=governance` deep-links landing on the same surface.
  const aliased = fromUrl === 'governance' ? 'roleGovernance' : fromUrl;
  const initial: TabId = TAB_IDS.includes(aliased as TabId) ? (aliased as TabId) : 'access';
  const [tab, setTab] = useState<TabId>(initial);

  return (
    <div className="min-h-full space-y-4 p-4 lg:p-6">
      <header>
        <nav className="mb-1 flex items-center gap-1 text-xs text-slate-400" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden>/</span>
          <span>Administration</span>
          <span aria-hidden>/</span>
          <span className="font-medium text-slate-700 dark:text-slate-200">Access Control Center</span>
        </nav>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[hsl(var(--primary))]" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Access Control Center</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One surface to govern access — module → page → tab → feature → action — with per-role grants,
          feature entitlements, roles, usage and provisioning, across every Data360 module.
        </p>
      </header>

      <AdminOverviewHeader />

      {/* Section tabs */}
      <div role="tablist" aria-label="Administration sections" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
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
      {tab === 'cacheCalls' && <CacheMetricsPanel />}
      {tab === 'usage' && <UsageAuditPanel />}
      {tab === 'provisioning' && <ProvisioningPanel />}
      {tab === 'projects' && <ProjectsMonitoringPanel />}
    </div>
  );
}
