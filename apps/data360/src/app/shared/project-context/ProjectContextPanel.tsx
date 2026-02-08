'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Rocket,
  History,
  Shield,
  AlertTriangle,
  Sparkles,
  FolderOpen,
  Loader2,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCortexRecommend } from '@/app/services/cortex';
import * as ExploreDesignService from '@/app/services/explore-design';
import * as GouvernanceService from '@/app/services/gouvernance';

export type ProjectContextTabId = 'deployment' | 'versions' | 'history' | 'grants' | 'errors' | 'recos';

export interface ProjectContextPanelProps {
  /** Project or workflow identifier */
  projectId: string | null;
  /** Display name (project name or workflow name) */
  projectName: string;
  /** Context: workflow (ETL) or explore-design (mapping) */
  variant: 'workflow' | 'explore-design';
  /** Default expanded state of the panel body */
  defaultExpanded?: boolean;
  /** Hide the entire bar when no project is selected */
  hideWhenEmpty?: boolean;
  /** Tab content slots: pass your existing components */
  deploymentSlot?: React.ReactNode;
  /** Versions list + switch/rollback (workflow: VersionHistory, explore-design: schema versions) */
  versionsSlot?: React.ReactNode;
  historySlot?: React.ReactNode;
  grantsSlot?: React.ReactNode;
  errorsSlot?: React.ReactNode;
  /** If not provided, a built-in Recos section fetches errors + Cortex */
  recosSlot?: React.ReactNode;
  className?: string;
}

const TAB_CONFIG: { id: ProjectContextTabId; label: string; icon: React.ElementType }[] = [
  { id: 'deployment', label: 'Deployment', icon: Rocket },
  { id: 'versions', label: 'Versions', icon: GitBranch },
  { id: 'history', label: 'History', icon: History },
  { id: 'grants', label: 'Grants', icon: Shield },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'recos', label: 'Recos (Cortex)', icon: Sparkles },
];

export function ProjectContextPanel({
  projectId,
  projectName,
  variant,
  defaultExpanded = false,
  hideWhenEmpty = false,
  deploymentSlot,
  versionsSlot,
  historySlot,
  grantsSlot,
  errorsSlot,
  recosSlot,
  className,
}: ProjectContextPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<ProjectContextTabId>('deployment');
  const [recosLoading, setRecosLoading] = useState(false);
  const [recosText, setRecosText] = useState<string | null>(null);
  const [recentErrors, setRecentErrors] = useState<ExploreDesignService.RecentDeploymentError[]>([]);

  // Fetch recent deployment errors for Recos (when Recos tab is active and no custom slot)
  useEffect(() => {
    if (activeTab !== 'recos' || recosSlot != null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await ExploreDesignService.getRecentDeploymentErrors(10);
        if (!cancelled) setRecentErrors(res?.errors ?? []);
      } catch {
        if (!cancelled) setRecentErrors([]);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, recosSlot]);

  const hasProject = !!projectId || !!projectName;
  if (hideWhenEmpty && !hasProject) return null;

  const tabsWithContent = TAB_CONFIG;

  const loadCortexRecos = async () => {
    setRecosLoading(true);
    setRecosText(null);
    try {
      if (recentErrors.length > 0) {
        const errorContext = recentErrors.map((e) => e.error_message).join('\n---\n');
        const result = await getCortexRecommend({ error_context: errorContext });
        setRecosText(result?.response ?? 'No recommendations generated.');
      } else {
        const res = await GouvernanceService.getDashboardErrors({ limit: 20 });
        const errors = res?.errors ?? [];
        if (errors.length === 0) {
          setRecosText('No recent errors to analyze. The platform is healthy.');
          return;
        }
        const result = await getCortexRecommend({ events: errors });
        setRecosText(result?.response ?? 'No recommendations generated.');
      }
    } catch (err: any) {
      setRecosText(`Failed to get recommendations: ${err?.message || err}. Ensure Cortex LLM is available.`);
    } finally {
      setRecosLoading(false);
    }
  };

  const placeholders: Record<ProjectContextTabId, React.ReactNode> = {
    deployment: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Deployment: use the Deploy button above or open the deployment panel.</div>,
    versions: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Versions: version history and switch/rollback appear here when available.</div>,
    history: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">History: runs and events appear here when available.</div>,
    grants: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Grants: see Gouvernance → Roles & permissions for project-related grants.</div>,
    errors: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Errors: recent deployment or run errors will appear here.</div>,
    recos: null, // built-in below
  };

  const currentContent = (() => {
    if (activeTab === 'deployment') return deploymentSlot ?? placeholders.deployment;
    if (activeTab === 'versions') return versionsSlot ?? placeholders.versions;
    if (activeTab === 'history') return historySlot ?? placeholders.history;
    if (activeTab === 'grants') return grantsSlot ?? placeholders.grants;
    if (activeTab === 'errors') return errorsSlot ?? placeholders.errors;
    if (activeTab === 'recos') {
      if (recosSlot) return recosSlot;
      return (
        <div className="p-4 space-y-3">
          {recentErrors.length > 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {recentErrors.length} recent deployment error(s) — use button below for Cortex-based recommendations.
            </p>
          )}
          <button
            type="button"
            onClick={loadCortexRecos}
            disabled={recosLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 text-sm font-medium disabled:opacity-60"
          >
            {recosLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {recosLoading ? 'Loading…' : 'Get Cortex recommendations from errors & run metrics'}
          </button>
          {recosText != null && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 border border-slate-200 dark:border-slate-700">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Recommendations</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{recosText}</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  })();

  return (
    <div className={cn('border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900', className)}>
      {/* Bar: project name + tabs + expand toggle */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="h-4 w-4 text-slate-500 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            Project: {projectName || (projectId ?? '—')}
          </span>
          <span className="text-xs text-slate-500 flex-shrink-0">
            {variant === 'workflow' ? 'Workflow' : 'Explore & Design'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {tabsWithContent.map((t) => {
            const Icon = t.icon;
            return (
              <span
                key={t.id}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                  activeTab === t.id
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-500 dark:text-slate-400'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(t.id);
                  if (!expanded) setExpanded(true);
                }}
              >
                <Icon className="h-3 w-3" />
                {t.label}
              </span>
            );
          })}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500 ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500 ml-1" />
          )}
        </div>
      </div>

      {/* Expandable content */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 max-h-[min(60vh,480px)] overflow-auto">
          {currentContent}
        </div>
      )}
    </div>
  );
}

export default ProjectContextPanel;
