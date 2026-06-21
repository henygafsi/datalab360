'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { BarChart2, GitBranch, Compass, Layers, Plus, ChartBar, Copy, Sparkles, ExternalLink, Clock, Rocket, AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useCacheInvalidation, CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { createDashboard } from '@/app/services/api/biDashboardApi';
import { getUnifiedProjects, type UnifiedProject } from '@/app/services/api/projectsApi';
import ActionRail from '@/app/shared/action-rail/ActionRail';
import ScoreCards from '@/app/shared/score-cards/ScoreCards';
import AutoCreateModal from './components/AutoCreateModal';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  // Fail-open while loading; honest disabled + tooltip when create is denied.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
        <BarChart2 className="w-10 h-10 text-cyan-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No BI Dashboard yet
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Create project-based dashboards with charts, KPI cards, tables, and NL-to-chart AI generation.
        </p>
      </div>
      <button
        onClick={onCreate}
        disabled={!canCreate}
        title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
      >
        <Plus className="w-4 h-4" />
        New Dashboard
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  // Fail-open while loading; honest disabled + tooltip when create is denied.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createDashboard({
        project_name: name.trim(),
        description: description.trim() || null,
      });
      onCreated(res.project_id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ActionRail
      isOpen
      onClose={onClose}
      title="New BI Dashboard"
      accentClassName="bg-cyan-500"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim() || !canCreate}
            title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Dashboard name <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sales Analytics Q1"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </ActionRail>
  );
}

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: ChartBar,
    title: 'Chart Builder',
    description: 'Bar, line, pie, scatter, heatmap, funnel, gauge and more from any data warehouse table.',
  },
  {
    icon: Sparkles,
    title: 'NL-to-Chart',
    description: 'Describe your question in plain language and get an auto-generated chart config.',
  },
  {
    icon: Copy,
    title: 'Multi-page Dashboards',
    description: 'Organize widgets across pages with grid or freeform layout and global filters.',
  },
  {
    icon: Layers,
    title: 'Template Gallery',
    description: 'Start from pre-built templates: Retail KPIs, FinOps, Pipeline Health, and more.',
  },
];

function FeatureGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 mt-8">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        >
          <f.icon className="w-6 h-6 text-cyan-500 mb-2" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{f.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{f.description}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Project list
// ---------------------------------------------------------------------------

function ProjectList({
  projects,
  isLoading,
  highlightId,
}: {
  projects: UnifiedProject[];
  isLoading: boolean;
  /** G8: project id from `?project=<id>` — ring + scroll into view on deep-link. */
  highlightId?: string | null;
}) {
  const highlightRef = useRef<HTMLAnchorElement | null>(null);

  // Bring a deep-linked project card into view once the list has loaded.
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, projects]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }
  if (projects.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {projects.map((p) => {
        const isHighlighted = !!highlightId && p.project_id === highlightId;
        return (
        <Link
          key={p.project_id}
          ref={isHighlighted ? highlightRef : undefined}
          href={`/bi-dashboard/${p.project_id}`}
          className={cn(
            'block p-4 rounded-xl border bg-white dark:bg-gray-900 hover:border-cyan-400 dark:hover:border-cyan-500 hover:shadow-sm transition-all group',
            isHighlighted
              ? 'border-cyan-400 dark:border-cyan-500 ring-2 ring-cyan-400/60 dark:ring-cyan-500/50'
              : 'border-gray-200 dark:border-gray-700',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart2 className="w-4 h-4 text-cyan-500 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</h3>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-cyan-500 shrink-0" />
          </div>
          {p.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">{p.description}</p>
          )}
          {/* Status + version KPIs — render "—" when a field is missing (no fake 0s). */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400">
            <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {p.status || '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {p.current_version_num != null ? `v${p.current_version_num}` : '—'}
            </span>
            {p.deployment_version != null && p.deployment_version > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Rocket className="w-3 h-3" />
                deployed v{p.deployment_version}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}
            {p.tags?.length > 0 && (
              <span className="ml-auto text-cyan-500">{p.tags.slice(0, 2).join(', ')}</span>
            )}
          </div>
        </Link>
        );
      })}
    </div>
  );
}

// Shared denied-reason copy for the create-dashboard gates.
const CREATE_DENIED_REASON = 'Requires the "create" permission on Business Reporting.';

function BIDashboardPage() {
  const { trackFeatureClick } = useTrackEvent();
  // Action-RBAC gate (System 2): creating / auto-creating a dashboard hits POST
  // /bi-dashboard (and /auto-create) which the backend gates with
  // require_action('bi_reporting','create'). Fail-open while the allow-set
  // loads; honest disabled + tooltip on a resolved deny.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  // G8: an inbound `?project=<id>` deep-link scopes the health score cards to
  // that project and rings/scrolls its card — additive, no redirect, no new
  // selection UI. Opening a project still routes to `/bi-dashboard/[projectId]`.
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('project');
  const [showCreate, setShowCreate] = useState(false);
  const [showAutoCreate, setShowAutoCreate] = useState(false);
  const [projects, setProjects] = useState<UnifiedProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  // A fetch failure must NOT read as "no dashboards yet" (an empty state implies
  // success-with-no-rows). Track the error distinctly so we can render an inline
  // error + retry instead of the misleading empty state.
  const [projectsError, setProjectsError] = useState<string | null>(null);
  // Monotonic request token: a stale (superseded) response is discarded so a
  // slow in-flight fetch can't clobber a newer one — replaces the per-effect
  // `cancelled` guard now that the fetch lives in a reusable callback.
  const reqIdRef = useRef(0);

  useEffect(() => {
    trackFeatureClick('page_view', { module: 'bi_dashboard' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GET /projects/unified?mine_only=false lists ALL account projects — including
  // seeded sample dashboards (SEED_DASH_*) owned by other identities. The
  // response is already in UnifiedProject shape and is cross-type, so we filter
  // to bi_dashboard here. Real KPIs (version / deployment) come from the payload.
  //
  // `background:true` is the real-time refresh path (SSE invalidation): it must
  // NOT toggle the blocking skeleton — re-blanking a populated list to pulse
  // cards on every account-wide event would be a flicker worse than staleness.
  // Foreground (mount / Retry) shows the skeleton and surfaces a distinct error.
  const loadProjects = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background ?? false;
    const reqId = ++reqIdRef.current;
    if (!background) {
      setProjectsLoading(true);
      setProjectsError(null);
    }
    try {
      const res = await getUnifiedProjects({ mine_only: false, limit: 100, offset: 0 });
      if (reqId !== reqIdRef.current) return; // superseded by a newer load
      const rows = Array.isArray(res?.projects) ? res.projects : [];
      setProjects(rows.filter((p) => p.type === 'bi_dashboard' && p.status !== 'deleted'));
      setProjectsError(null);
    } catch {
      if (reqId !== reqIdRef.current) return;
      // A background refresh must not replace a good list with an error banner —
      // only the foreground (mount / Retry) load surfaces the distinct, honest
      // error state (never collapse a fetch failure into the empty state).
      if (!background) {
        setProjectsError("Couldn't load your dashboards. This is a loading error, not an empty workspace.");
      }
    } finally {
      if (reqId === reqIdRef.current && !background) setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Real-time: the project list is otherwise only fetched on mount, so a create
  // / delete from elsewhere (or another user) would go unseen. Subscribe to the
  // backend SSE fan-out and silently background-refresh on a PROJECTS or
  // BI_DASHBOARDS invalidation (a BI create/delete may fire either key).
  const handleInvalidate = useCallback((keys: string[]) => {
    if (keys.includes(CACHE_KEYS.PROJECTS) || keys.includes(CACHE_KEYS.BI_DASHBOARDS)) {
      loadProjects({ background: true });
    }
  }, [loadProjects]);
  useCacheInvalidation({ onInvalidate: handleInvalidate });

  const handleCreated = useCallback((projectId: string) => {
    trackFeatureClick('bi_dashboard_created', { projectId });
    setShowCreate(false);
    window.location.href = `/bi-dashboard/${projectId}`;
  }, [trackFeatureClick]);

  const handleAutoCreated = useCallback((projectId: string) => {
    trackFeatureClick('bi_dashboard_auto_created', { projectId });
    setShowAutoCreate(false);
    window.location.href = `/bi-dashboard/${projectId}`;
  }, [trackFeatureClick]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
                <BarChart2 className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">BI Dashboard</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Self-service analytics — project-based dashboards on your data warehouse
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  trackFeatureClick('bi_dashboard_open_auto_create');
                  setShowAutoCreate(true);
                }}
                disabled={!canCreate}
                title={!canCreate ? CREATE_DENIED_REASON : undefined}
                className="flex items-center gap-2 px-4 py-2 border border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Sparkles className="w-4 h-4" />
                Auto-create
              </button>
              <button
                onClick={() => {
                  trackFeatureClick('bi_dashboard_open_create');
                  setShowCreate(true);
                }}
                disabled={!canCreate}
                title={!canCreate ? CREATE_DENIED_REASON : undefined}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
              >
                <Plus className="w-4 h-4" />
                New Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Cross-module context */}
        <div className="px-6 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>Related:</span>
          <Link href="/explore-design" className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
            <Compass className="w-3 h-3" /> Explore &amp; Design (Source Tables)
          </Link>
          <Link href="/workflow" className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
            <GitBranch className="w-3 h-3" /> Workflow (ETL Pipelines)
          </Link>
        </div>

        {/* Content */}
        <div className="p-6 max-w-5xl mx-auto">
          {/* Cross-module health score cards (Data360 G6). A `?project=` deep-link
              scopes them to that project; otherwise account-wide as before. */}
          <div className="mb-6">
            <ScoreCards projectId={urlProjectId ?? undefined} />
          </div>
          {/* Distinct error state — never collapse a fetch failure into the
              "no dashboards yet" empty state. */}
          {!projectsLoading && projectsError && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-900/10">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <p className="max-w-md text-sm text-red-600 dark:text-red-400">{projectsError}</p>
              <button
                type="button"
                onClick={() => loadProjects()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}
          {!projectsLoading && !projectsError && projects.length === 0 && (
            <EmptyState onCreate={() => { setShowCreate(true); }} />
          )}
          {!projectsError && (
            <ProjectList projects={projects} isLoading={projectsLoading} highlightId={urlProjectId} />
          )}
          {!projectsError && (!projectsLoading || projects.length > 0) && <FeatureGrid />}
        </div>

        {/* Create modal */}
        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
          />
        )}

        {/* Auto-create from table/schema — POST /bi-dashboard/auto-create */}
        <AutoCreateModal
          isOpen={showAutoCreate}
          onClose={() => setShowAutoCreate(false)}
          onCreated={(projectId) => handleAutoCreated(projectId)}
        />
      </div>
    </ErrorBoundary>
  );
}

// useSearchParams() requires a Suspense boundary in the App Router.
export default function BIDashboardPageWrapper() {
  return (
    <Suspense fallback={null}>
      <BIDashboardPage />
    </Suspense>
  );
}
