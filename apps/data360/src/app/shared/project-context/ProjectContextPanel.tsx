'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  ArrowRight,
  Download,
  RefreshCw,
  Database,
  BarChart3,
  Boxes,
  CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dash } from '@/app/shared/ui/format';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import {
  getCommandCenterRecommendations,
  type CommandCenterRecommendations,
  type Recommendation,
  type RecommendationSeverity,
} from '@/app/services/command-center/recommendations';
import { getProject360, type Project360 } from '@/app/services/projects/context360';

export type ProjectContextTabId = 'overview' | 'deployment' | 'versions' | 'history' | 'grants' | 'errors' | 'recos';

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
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'deployment', label: 'Deployment', icon: Rocket },
  { id: 'versions', label: 'Versions', icon: GitBranch },
  { id: 'history', label: 'History', icon: History },
  { id: 'grants', label: 'Grants', icon: Shield },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'recos', label: 'Cortex Recommendations', icon: Sparkles },
];

// Versioned, minimal localStorage key (client-localstorage-schema): persist the
// user's last-viewed tab ("draft of menu") so it is preselected on return.
// Validated against the known tab ids so a stale/invalid value is ignored.
const ACTIVE_TAB_KEY = 'data360.projectContext.tab.v1';
const TAB_IDS = new Set<ProjectContextTabId>(TAB_CONFIG.map((t) => t.id));

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
  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<ProjectContextTabId>('overview');
  const [recosLoading, setRecosLoading] = useState(false);

  // Project-360 context — fetched once per project (server-side cached 60s), so
  // the panel LEADS with what the project IS instead of dead placeholder tabs.
  const [ctx360, setCtx360] = useState<Project360 | null>(null);
  const [ctx360Loading, setCtx360Loading] = useState(false);
  const [ctx360Gap, setCtx360Gap] = useState(false);
  const ctx360ForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId || ctx360ForRef.current === projectId) return;
    ctx360ForRef.current = projectId;
    setCtx360Loading(true);
    setCtx360Gap(false);
    getProject360(projectId)
      .then((c) => setCtx360(c))
      .catch((err) => {
        if (isUnavailable(err)) setCtx360Gap(true);
        setCtx360(null);
      })
      .finally(() => setCtx360Loading(false));
  }, [projectId]);

  // Restore the last-used tab ONCE on mount (draft → preselect). Done in an
  // effect (not a lazy initializer) so server and client first-render agree —
  // localStorage is only touched after hydration. Declared BEFORE the persist
  // effect so the default value isn't written back before this reads.
  const tabRestoredRef = useRef(false);
  useEffect(() => {
    if (tabRestoredRef.current) return;
    tabRestoredRef.current = true;
    try {
      const saved = window.localStorage.getItem(ACTIVE_TAB_KEY);
      if (saved && TAB_IDS.has(saved as ProjectContextTabId)) {
        setActiveTab(saved as ProjectContextTabId);
      }
    } catch {
      /* storage unavailable — keep the default tab */
    }
    // run-once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the active tab as it changes.
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  const [recosError, setRecosError] = useState<string | null>(null);
  // 404/501 from the recommendations endpoint — quiet "not on this backend"
  // note instead of a loud error (InsightActionButton degradation rule).
  const [recosGap, setRecosGap] = useState(false);
  const [recos, setRecos] = useState<CommandCenterRecommendations | null>(null);
  const [ctaBusy, setCtaBusy] = useState<string | null>(null);

  // After a deployment, the Verify step emits this event so we can switch the
  // user to the relevant tab (and expand the panel) — making the freshly
  // created version / history immediately visible without a manual click.
  useEffect(() => {
    function onOpenTab(e: Event) {
      const detail = (e as CustomEvent).detail as { tab?: ProjectContextTabId } | undefined;
      if (detail?.tab) {
        setActiveTab(detail.tab);
        setExpanded(true);
      }
    }
    window.addEventListener('explore-design:open-context-tab', onOpenTab);
    return () => window.removeEventListener('explore-design:open-context-tab', onOpenTab);
  }, []);

  // Fetch structured command-center recommendations when the Recos tab is active
  // and no custom slot is provided.
  const loadRecos = useCallback(async () => {
    setRecosLoading(true);
    setRecosError(null);
    setRecosGap(false);
    try {
      const res = await getCommandCenterRecommendations();
      setRecos(res);
    } catch (err) {
      if (isUnavailable(err)) setRecosGap(true);
      else setRecosError(getApiErrorMessage(err));
      setRecos(null);
    } finally {
      setRecosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'recos' || recosSlot != null) return;
    void loadRecos();
  }, [activeTab, recosSlot, loadRecos]);

  // Dispatch a recommendation's CTA by its declared action.
  const handleCta = useCallback(
    async (reco: Recommendation) => {
      const { action, target } = reco.cta;
      if (action === 'navigate') {
        if (target) router.push(target);
        return;
      }
      if (action === 'refresh') {
        await loadRecos();
        return;
      }
      if (action === 'install') {
        if (!target) return;
        setCtaBusy(reco.id);
        setRecosError(null);
        try {
          await apiClient.post(target);
          await loadRecos();
        } catch (err) {
          setRecosError(getApiErrorMessage(err));
        } finally {
          setCtaBusy(null);
        }
      }
    },
    [router, loadRecos],
  );

  const hasProject = !!projectId || !!projectName;
  if (hideWhenEmpty && !hasProject) return null;

  const tabsWithContent = TAB_CONFIG;

  // Fallbacks now DISPLAY DATA from the 360 context (or a contextual link),
  // never dead "appears here when available" text.
  const placeholders: Record<ProjectContextTabId, React.ReactNode> = {
    overview: null, // built-in below
    deployment: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Use the <b>Deploy</b> affordance in Overview, or open the deployment wizard.</div>,
    versions: <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{ctx360?.project.version != null ? `Current version v${ctx360.project.version}. Version compare & rollback open from the deployment wizard.` : 'No version yet — deploy to create one.'}</div>,
    history: <EventsList events={ctx360?.recent_events} loading={ctx360Loading} />,
    grants: <GrantsSummary ctx={ctx360} onNavigate={(p) => router.push(p)} />,
    errors: <EventsList events={(ctx360?.recent_events ?? []).filter((e) => (e.status ?? '').toUpperCase().includes('FAIL') || (e.status ?? '').toUpperCase().includes('ERROR'))} loading={ctx360Loading} emptyLabel="No recent errors — all traced events succeeded." />,
    recos: null, // built-in below
  };

  const currentContent = (() => {
    if (activeTab === 'overview') {
      return <Project360Overview ctx={ctx360} loading={ctx360Loading} gap={ctx360Gap}
                                 projectId={projectId} variant={variant} onNavigate={(p) => router.push(p)} />;
    }
    if (activeTab === 'deployment') return deploymentSlot ?? placeholders.deployment;
    if (activeTab === 'versions') return versionsSlot ?? placeholders.versions;
    if (activeTab === 'history') return historySlot ?? placeholders.history;
    if (activeTab === 'grants') return grantsSlot ?? placeholders.grants;
    if (activeTab === 'errors') return errorsSlot ?? placeholders.errors;
    if (activeTab === 'recos') {
      if (recosSlot) return recosSlot;
      return (
        <RecosTab
          recos={recos}
          loading={recosLoading}
          error={recosError}
          gap={recosGap}
          ctaBusy={ctaBusy}
          onReload={loadRecos}
          onCta={handleCta}
        />
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

// ---------------------------------------------------------------------------
// Recos tab — structured command-center recommendations (severity + CTA).
// ---------------------------------------------------------------------------

const SEVERITY_TINT: Record<RecommendationSeverity, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function RecosTab({
  recos,
  loading,
  error,
  gap,
  ctaBusy,
  onReload,
  onCta,
}: {
  recos: CommandCenterRecommendations | null;
  loading: boolean;
  error: string | null;
  gap: boolean;
  ctaBusy: string | null;
  onReload: () => void | Promise<void>;
  onCta: (reco: Recommendation) => void | Promise<void>;
}) {
  if (gap) {
    return (
      <div className="p-4">
        <p role="status" className="text-sm italic text-slate-400 dark:text-slate-500">
          Recommendations aren&apos;t available on this backend yet.
        </p>
      </div>
    );
  }

  if (loading && recos == null) {
    return (
      <div className="p-4 space-y-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Could not load recommendations</p>
            <p className="break-words">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void onReload()}
            className="rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const items = recos?.recommendations ?? [];

  return (
    <div className="p-4 space-y-3">
      {/* Counts badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            <Sparkles className="h-3 w-3" />
            {dash(recos?.total_open)} open
          </span>
          {(recos?.total_critical ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {recos!.total_critical} critical
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onReload()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4 text-center text-sm text-slate-500 dark:text-slate-400">
          No open recommendations. The platform is healthy.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const busy = ctaBusy === r.id;
            const CtaIcon =
              r.cta.action === 'navigate'
                ? ArrowRight
                : r.cta.action === 'install'
                  ? Download
                  : RefreshCw;
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        SEVERITY_TINT[r.severity] ?? SEVERITY_TINT.info,
                      )}
                    >
                      {r.severity}
                    </span>
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      {r.title}
                    </p>
                  </div>
                  {r.detail && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.detail}</p>
                  )}
                </div>
                {r.cta?.label && (
                  <button
                    type="button"
                    onClick={() => void onCta(r)}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-200 disabled:opacity-60 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CtaIcon className="h-3 w-3" />}
                    {r.cta.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline CTA affordance — looks like a button, is a contextual link. Per the
// design rule: "call-to-actions button-like, not real buttons" — these NAVIGATE
// within the governed project's context, they don't submit forms.
// ---------------------------------------------------------------------------
function Cta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800 dark:hover:bg-indigo-900/50"
    >
      {label}
      <ArrowRight className="h-3 w-3" />
    </button>
  );
}

const SCORE_KEYS: { key: string; label: string }[] = [
  { key: 'quality', label: 'DQ' },
  { key: 'governance', label: 'GOV' },
  { key: 'finops', label: 'COST' },
  { key: 'modeling', label: 'MODEL' },
  { key: 'ml_ready', label: 'ML' },
];

function scoreTint(v: number): string {
  if (v >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (v >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

// The headline "talking" panel: shows what the project IS + contextual CTAs.
function Project360Overview({
  ctx, loading, gap, projectId, variant, onNavigate,
}: {
  ctx: Project360 | null;
  loading: boolean;
  gap: boolean;
  projectId: string | null;
  variant: 'workflow' | 'explore-design';
  onNavigate: (path: string) => void;
}) {
  if (gap) {
    return <p role="status" className="p-4 text-sm italic text-slate-400">Project context isn&apos;t available on this backend yet.</p>;
  }
  if (loading && !ctx) {
    return (
      <div className="space-y-2 p-4" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
      </div>
    );
  }
  if (!ctx) {
    return <p className="p-4 text-sm text-slate-500">Select a project to see its purpose, sources and scores.</p>;
  }
  const p = ctx.project;
  const scores = ctx.scores ?? {};
  const designPath = variant === 'workflow' ? '/workflow' : '/explore-design';
  return (
    <div className="space-y-4 p-4">
      {/* Purpose — the project talking about itself */}
      <div>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {p.purpose || <span className="italic text-slate-400">No purpose set — describe what this project delivers.</span>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{p.type}</span>
          {p.status && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{p.status}</span>}
          {p.version != null && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">v{p.version}</span>}
          {p.owner && <span>owner {p.owner}</span>}
        </div>
      </div>

      {/* Scores — already-computed, shown by default (no click needed) */}
      {ctx.scores && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          {SCORE_KEYS.map(({ key, label }) => {
            const v = scores[key];
            if (v == null) return null;
            return (
              <div key={key} className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
                <span className={cn('text-sm font-bold tabular-nums', scoreTint(Number(v)))}>{Math.round(Number(v))}</span>
              </div>
            );
          })}
          {scores.trust_score != null && (
            <div className="ml-auto flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Trust</span>
              <span className={cn('text-sm font-bold tabular-nums', scoreTint(Number(scores.trust_score)))}>{Math.round(Number(scores.trust_score))}</span>
            </div>
          )}
        </div>
      )}

      {/* Sources / blocks / charts — the composition, described not hidden */}
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <Facet icon={Database} label="Sources" n={ctx.sources?.length ?? 0} />
        {ctx.etl_blocks != null && <Facet icon={Boxes} label="ETL blocks" n={ctx.etl_blocks.length} />}
        {ctx.charts != null && <Facet icon={BarChart3} label="Charts" n={ctx.charts.length} />}
      </div>

      {/* Contextual CTAs — button-like, navigate within this project's context */}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Cta label={`Open in ${variant === 'workflow' ? 'Workflow' : 'Explore & Design'}`} onClick={() => onNavigate(designPath)} />
        <Cta label="Data Quality" onClick={() => onNavigate('/data-quality')} />
        <Cta label="Governance" onClick={() => onNavigate('/governance/projects' + (projectId ? `?project=${projectId}` : ''))} />
        <Cta label="Lineage" onClick={() => onNavigate('/observability/lineage')} />
      </div>
    </div>
  );
}

function Facet({ icon: Icon, label, n }: { icon: React.ElementType; label: string; n: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-700">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-slate-700 dark:text-slate-200">{n}</span>
    </div>
  );
}

// Recent events — the valuable trace (data-touching actions), not per-access UI hits.
function EventsList({ events, loading, emptyLabel }: {
  events?: Project360['recent_events']; loading?: boolean; emptyLabel?: string;
}) {
  if (loading && !events) {
    return <div className="space-y-2 p-4" aria-hidden="true">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}</div>;
  }
  const items = events ?? [];
  if (items.length === 0) {
    return <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{emptyLabel ?? 'No recent activity on this project.'}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 p-2 dark:divide-slate-800">
      {items.map((e, i) => {
        const failed = (e.status ?? '').toUpperCase().includes('FAIL') || (e.status ?? '').toUpperCase().includes('ERROR');
        return (
          <li key={i} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <CircleDot className={cn('h-3 w-3 shrink-0', failed ? 'text-red-500' : 'text-emerald-500')} />
            <span className="font-medium text-slate-700 dark:text-slate-200">{e.type ?? 'event'}</span>
            <span className="text-slate-400">{e.status}</span>
            {e.by && <span className="ml-auto text-slate-400">{e.by}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// Grants: describe the project's ownership + governance posture from 360, with
// a contextual jump to the governance surface — not a dead cross-reference.
function GrantsSummary({ ctx, onNavigate }: { ctx: Project360 | null; onNavigate: (p: string) => void }) {
  if (!ctx) return <p className="p-4 text-sm text-slate-500">Grants load with the project context.</p>;
  const gov = ctx.scores?.governance;
  return (
    <div className="space-y-3 p-4 text-sm">
      <p className="text-slate-700 dark:text-slate-200">
        Owned by <b>{ctx.project.owner ?? 'unknown'}</b>
        {gov != null && <> · governance score <b className={scoreTint(Number(gov))}>{Math.round(Number(gov))}</b></>}.
      </p>
      {ctx.project.tags && ctx.project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">{ctx.project.tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t}</span>
        ))}</div>
      )}
      <Cta label="Manage grants in Governance" onClick={() => onNavigate('/governance/grants')} />
    </div>
  );
}

export default ProjectContextPanel;
