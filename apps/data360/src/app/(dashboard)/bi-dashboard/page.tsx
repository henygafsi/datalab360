'use client';

import { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import RouteFallback from '@/components/ui/RouteFallback';
import { BarChart2, GitBranch, Compass, Layers, Plus, ChartBar, Copy, Sparkles, Wand2, ExternalLink, Clock, Rocket, AlertTriangle, RefreshCw, Pencil, Trash2, Loader2, Eye, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useModuleAccess } from '@/hooks/useCapability';
import { getModuleDisplayName } from '@/config/modules';
import { CACHE_KEYS, useCacheInvalidationSubscription as useCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { createDashboard, updateDashboard, deleteDashboard } from '@/app/services/api/biDashboardApi';
import { getUnifiedProjects, type UnifiedProject } from '@/app/services/api/projectsApi';
import ActionRail from '@/app/shared/action-rail/ActionRail';
import ScoreCards from '@/app/shared/score-cards/ScoreCards';
import AiBuildLaunchRail from './components/AiBuildLaunchRail';
import CloneDashboardButton from './components/CloneDashboardButton';
import { BiLandingCockpit, BiLandingKpis, useBiLandingSignals } from './components/LandingCockpit';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onCreate, hideCreate = false }: { onCreate: () => void; hideCreate?: boolean }) {
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
      {/* Module read-only → the create CTA is hidden entirely (a permanently
          disabled empty-state button is noise; the page banner carries the why). */}
      {!hideCreate && (
        <button
          onClick={onCreate}
          disabled={!canCreate}
          title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
        >
          <Plus className="w-4 h-4" />
          New Dashboard
        </button>
      )}
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

// Shared denied-reason copy for the per-card edit/delete gates.
const EDIT_DENIED_REASON = 'Requires the "edit" permission on Business Reporting.';
const DELETE_DENIED_REASON = 'Requires the "delete" permission on Business Reporting.';

/**
 * One dashboard card with in-place CRUD — no popups:
 *  - view           : navigating card + hover actions (rename / delete / clone)
 *  - edit           : pencil flips the card itself into a name+description form
 *                     (PUT /bi-dashboard/{id})
 *  - confirm-delete : trash flips the card footer into an inline confirm row
 *                     (DELETE /bi-dashboard/{id})
 * Both mutations are Action-RBAC gated (bi_reporting edit/delete — fail-open
 * while the allow-set loads, honest disabled + tooltip on a resolved deny),
 * toast the outcome, and refetch the list via onChanged.
 */
function DashboardCard({
  p,
  isHighlighted,
  highlightRef,
  onChanged,
}: {
  p: UnifiedProject;
  isHighlighted: boolean;
  highlightRef: React.MutableRefObject<HTMLAnchorElement | null>;
  onChanged: () => void;
}) {
  const { trackFeatureClick } = useTrackEvent();
  const editPerm = useCanPerform('bi_reporting', 'edit');
  const canEdit = editPerm.allowed || editPerm.loading;
  const deletePerm = useCanPerform('bi_reporting', 'delete');
  const canDelete = deletePerm.allowed || deletePerm.loading;

  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? '');

  const overlayAction = (fn: () => void) => (e: React.MouseEvent) => {
    // The actions sit next to a navigating <Link> — never let a click bubble
    // into the card navigation.
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const startEdit = () => {
    setName(p.name);
    setDescription(p.description ?? '');
    setMode('edit');
  };

  const saveEdit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await updateDashboard(p.project_id, {
        project_name: name.trim(),
        description: description.trim() || null,
      });
      toast.success('Dashboard updated.');
      trackFeatureClick('bi_dashboard_renamed', { projectId: p.project_id });
      setMode('view');
      onChanged();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteDashboard(p.project_id);
      toast.success(`Deleted "${p.name}".`);
      trackFeatureClick('bi_dashboard_deleted', { projectId: p.project_id });
      // The card disappears via the refetch — keep it inert until then.
      onChanged();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      setBusy(false);
      setMode('view');
    }
  };

  // ---- edit mode: the card itself becomes the form (no modal) --------------
  if (mode === 'edit') {
    return (
      <div className="p-4 rounded-xl border border-cyan-400 dark:border-cyan-500 ring-2 ring-cyan-400/40 dark:ring-cyan-500/30 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <Pencil className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Rename dashboard</span>
        </div>
        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveEdit();
            if (e.key === 'Escape') setMode('view');
          }}
          autoFocus
          className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
        <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-2 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMode('view');
          }}
          rows={2}
          placeholder="Optional description"
          className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
        />
        <div className="mt-2.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setMode('view')}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveEdit()}
            disabled={busy || !name.trim() || !canEdit}
            title={!canEdit ? EDIT_DENIED_REASON : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  // ---- confirm-delete mode: inline confirm row, card stays in place --------
  if (mode === 'confirm-delete') {
    return (
      <div className="p-4 rounded-xl border border-red-300 dark:border-red-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart2 className="w-4 h-4 text-gray-400 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 truncate line-through decoration-red-400/60">
            {p.name}
          </h3>
        </div>
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          Delete this dashboard? Its pages and widgets are removed permanently — this can&apos;t be undone.
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setMode('view')}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={busy || !canDelete}
            title={!canDelete ? DELETE_DENIED_REASON : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    );
  }

  // ---- view mode ------------------------------------------------------------
  return (
    <div className="group relative">
      {/* Card actions — rename / delete / clone. Overlaid so buttons never nest
          inside the navigating <a>. */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md bg-white/95 shadow-sm dark:bg-gray-900/95 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={overlayAction(startEdit)}
          disabled={!canEdit}
          aria-label={`Rename dashboard ${p.name}`}
          title={!canEdit ? EDIT_DENIED_REASON : 'Rename / edit description'}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-cyan-50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-cyan-900/20"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={overlayAction(() => setMode('confirm-delete'))}
          disabled={!canDelete}
          aria-label={`Delete dashboard ${p.name}`}
          title={!canDelete ? DELETE_DENIED_REASON : 'Delete dashboard'}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <CloneDashboardButton projectId={p.project_id} projectName={p.name} />
      </div>
      <Link
        ref={isHighlighted ? highlightRef : undefined}
        href={`/bi-dashboard/${p.project_id}`}
        className={cn(
          'block p-4 rounded-xl border bg-white dark:bg-gray-900 hover:border-cyan-400 dark:hover:border-cyan-500 hover:shadow-sm transition-all',
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
    </div>
  );
}

function ProjectList({
  projects,
  isLoading,
  highlightId,
  onChanged,
}: {
  projects: UnifiedProject[];
  isLoading: boolean;
  /** G8: project id from `?project=<id>` — ring + scroll into view on deep-link. */
  highlightId?: string | null;
  /** Refetch after an in-place rename/delete. */
  onChanged: () => void;
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
      {projects.map((p) => (
        <DashboardCard
          key={p.project_id}
          p={p}
          isHighlighted={!!highlightId && p.project_id === highlightId}
          highlightRef={highlightRef}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

// Shared denied-reason copy for the create-dashboard gates.
const CREATE_DENIED_REASON = 'Requires the "create" permission on Business Reporting.';

/** sessionStorage key: per-session dismissal of the read-only module notice. */
const RO_NOTICE_KEY = 'd360.read-only-notice.bi_reporting';

// ---------------------------------------------------------------------------
// Viewport-fit tabs ("no one page and lifetime scroll" directive 2026-07-10).
// The landing's content zones are grouped into tabs — each fits ONE viewport
// (the tab panel scrolls internally, the page itself never scrolls):
//   dashboards — ScoreCards (health row) + the dashboard cards grid
//   discover   — cross-module Related links + the capability feature grid
// ?tab= is parsed once on mount (deep links keep working); switching is pure
// state + history.replaceState — no navigation, no remount.
// ---------------------------------------------------------------------------

type LandingTab = 'dashboards' | 'discover';

const LANDING_TABS: { id: LandingTab; label: string }[] = [
  { id: 'dashboards', label: 'Dashboards' },
  { id: 'discover', label: 'Capabilities' },
];

function parseLandingTab(v: string | null): LandingTab {
  return v === 'discover' ? 'discover' : 'dashboards';
}

function BIDashboardPage() {
  const { trackFeatureClick } = useTrackEvent();
  // Action-RBAC gate (System 2): creating / auto-creating a dashboard hits POST
  // /bi-dashboard (and /auto-create) which the backend gates with
  // require_action('bi_reporting','create'). Fail-open while the allow-set
  // loads; honest disabled + tooltip on a resolved deny.
  const createPerm = useCanPerform('bi_reporting', 'create');
  // Module-level posture (my-module-access) layered ON TOP of action-RBAC: a
  // resolved 'read' disables the landing's create CTAs. undefined (loading /
  // hard error / module absent from the map) fails OPEN — zero visual change
  // until the map actually resolves to 'read' (no flash).
  const readOnly = useModuleAccess('bi_reporting') === 'read';
  const canCreate = (createPerm.allowed || createPerm.loading) && !readOnly;
  const createDeniedReason = readOnly
    ? `Read-only access — ask an admin for write access to ${getModuleDisplayName('bi_reporting')}`
    : CREATE_DENIED_REASON;

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
  // G8: an inbound `?project=<id>` deep-link scopes the health score cards to
  // that project and rings/scrolls its card — additive, no redirect, no new
  // selection UI. Opening a project still routes to `/bi-dashboard/[projectId]`.
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('project');
  // Viewport-fit tabs — ?tab= read once on mount; switches sync the URL via
  // history.replaceState (no navigation) and preserve other params (?project=).
  const [tab, setTabState] = useState<LandingTab>(() => parseLandingTab(searchParams.get('tab')));
  const setTab = useCallback(
    (next: LandingTab) => {
      setTabState(next);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', next);
        window.history.replaceState(null, '', url.toString());
      } catch {
        /* URL sync is best-effort */
      }
      trackFeatureClick('bi_landing_tab', { tab: next });
    },
    [trackFeatureClick],
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showAiBuild, setShowAiBuild] = useState(false);
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

  // In-place card mutations (rename / delete) refetch silently — the SSE
  // invalidation would eventually do it too, but don't make the user wait.
  const handleListChanged = useCallback(() => {
    loadProjects({ background: true });
  }, [loadProjects]);

  // --- Landing cockpit (AxisCockpit) — overview/cost/governance/history/ai.
  // Auto-opens on the Overview axis (purposeful default, no blank-until-select);
  // cost + governance signals are fetched lazily the first time their axis
  // opens, and the KPI strip reuses the same data ("—" until known).
  const signals = useBiLandingSignals(projects, projectsLoading);
  const { loadGov, loadCost } = signals;
  const [cockpitOpen, setCockpitOpen] = useState(true);
  const [activeAxis, setActiveAxis] = useState<string | null>('overview');
  const openAxis = useCallback(
    (id: string) => {
      setActiveAxis(id);
      setCockpitOpen(true);
      trackFeatureClick('bi_landing_axis_open', { axis: id });
    },
    [trackFeatureClick],
  );
  // Lazy signal fetch: fires when the cost/governance axis is open AND the
  // list is in (covers axis-opened-while-list-loading; loaders are idempotent).
  useEffect(() => {
    if (projectsLoading || !cockpitOpen) return;
    if (activeAxis === 'governance') loadGov();
    if (activeAxis === 'cost') loadCost();
  }, [projectsLoading, cockpitOpen, activeAxis, loadGov, loadCost]);

  // Docked AI Build hand-off — the rail creates the dashboard (shell or
  // auto-created from a source) and gives back the destination: the editor,
  // where the AI Build section generates the charts straight onto the grid.
  const handleAiBuildLaunch = useCallback(
    (href: string, meta: { projectId: string; mode: 'describe' | 'source' }) => {
      trackFeatureClick('bi_dashboard_ai_build_created', meta);
      setShowAiBuild(false);
      window.location.href = href;
    },
    [trackFeatureClick],
  );

  return (
    <ErrorBoundary>
      {/* Viewport-fit shell — the page itself never scrolls; the active tab
          panel scrolls internally. (Replaces the former min-h-screen column.)
          248px = app header (64) + layout main pt/pb (24+48) + layout footer
          (~110) + 2px border budget, so the WHOLE document fits 100dvh. */}
      <div className="flex h-[calc(100dvh-224px)] min-h-[540px] overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3">
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
              {/* Single docked AI entry — replaces the "AI Wizard" modal and the
                  "Auto-create" portal drawer (both kept exported, unmounted). */}
              <button
                onClick={() => {
                  trackFeatureClick('bi_dashboard_open_ai_build');
                  setShowAiBuild(true);
                }}
                disabled={!canCreate}
                title={!canCreate ? createDeniedReason : undefined}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="w-4 h-4" />
                AI Build
              </button>
              <button
                onClick={() => {
                  trackFeatureClick('bi_dashboard_open_create');
                  setShowCreate(true);
                }}
                disabled={!canCreate}
                title={!canCreate ? createDeniedReason : undefined}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-cyan-600"
              >
                <Plus className="w-4 h-4" />
                New Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Viewer-safe read-only notice — only after my-module-access resolves
            to 'read'; dismissable for the session. Write/unknown → not rendered. */}
        {readOnly && !roNoticeDismissed && (
          <div className="shrink-0 px-6 pt-3">
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
          </div>
        )}

        {/* Unified KPI strip — honest "—" until a value is genuinely known;
            Published / Shares / Est. cost fill in from the lazily-fetched
            cockpit signals and click through to their owning axis. */}
        <div className="shrink-0">
          <BiLandingKpis
            projects={projects}
            listLoading={projectsLoading}
            signals={signals}
            onJumpAxis={openAxis}
          />
        </div>

        {/* Tab bar — viewport-fit tabs; each panel scrolls internally. */}
        <div
          role="tablist"
          aria-label="BI dashboard landing tabs"
          data-testid="bi-landing-tabs"
          className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-6 pt-2 dark:border-gray-800 dark:bg-gray-900"
        >
          {LANDING_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`bi-landing-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-cyan-600 text-cyan-700 dark:border-cyan-400 dark:text-cyan-300'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
              )}
            >
              {t.label}
              {t.id === 'dashboards' && (
                <span
                  className={cn(
                    'ml-1.5 tabular-nums text-xs',
                    tab === t.id ? 'text-cyan-500' : 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  {projectsLoading ? '…' : projects.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active tab panel — the ONLY scroll container of the main column. */}
        <div
          role="tabpanel"
          id={`bi-landing-panel-${tab}`}
          data-testid={`bi-landing-panel-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {tab === 'dashboards' && (
            <div className="mx-auto max-w-5xl p-6">
              {/* Cross-module health score cards (Data360 G6). A `?project=` deep-link
                  scopes them to that project; otherwise account-wide. We exclude the
                  not-yet-backed PREVISION placeholder so no "coming soon" tile ships
                  on the flagship landing (the project path never returns it anyway). */}
              <div className="mb-6">
                <ScoreCards
                  projectId={urlProjectId ?? undefined}
                  dimensions={['dq', 'cost', 'perf', 'gov']}
                />
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
                <EmptyState onCreate={() => { setShowCreate(true); }} hideCreate={readOnly} />
              )}
              {!projectsError && (
                <ProjectList
                  projects={projects}
                  isLoading={projectsLoading}
                  highlightId={urlProjectId}
                  onChanged={handleListChanged}
                />
              )}
            </div>
          )}
          {tab === 'discover' && (
            <div className="mx-auto max-w-5xl p-6">
              {/* Cross-module context (formerly the slim strip under the KPI row). */}
              <div className="flex items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
                <span>Related:</span>
                <Link href="/explore-design" className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Explore &amp; Design (Source Tables)
                </Link>
                <Link href="/workflow" className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
                  <GitBranch className="w-3 h-3" /> Workflow (ETL Pipelines)
                </Link>
              </div>
              <FeatureGrid />
            </div>
          )}
        </div>
        </div>

        {/* Right-edge cockpit — the unified AxisCockpit (overview / cost /
            governance / history / AI). Fills the viewport-fit shell's height
            (no page-level sticky needed — the page no longer scrolls).
            Hidden only on phones where the panel would crush the list. */}
        <div className="hidden h-full shrink-0 sm:block">
          <BiLandingCockpit
            projects={projects}
            listLoading={projectsLoading}
            listError={projectsError}
            signals={signals}
            open={cockpitOpen}
            activeAxis={activeAxis}
            onOpenAxis={openAxis}
            onClose={() => setCockpitOpen(false)}
            canCreate={canCreate}
            createDeniedReason={createDeniedReason}
            onNewDashboard={() => {
              trackFeatureClick('bi_dashboard_open_create');
              setShowCreate(true);
            }}
            onAiBuild={() => {
              trackFeatureClick('bi_dashboard_open_ai_build');
              setShowAiBuild(true);
            }}
            className="h-full"
          />
        </div>

        {/* Create modal */}
        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
          />
        )}

        {/* AI Build — docked (ActionRail): Describe → dashboard shell → editor's
            AI Build section generates onto the grid; or From source →
            POST /bi-dashboard/auto-create. Rendered only while open:
            useDataSourcePicker fetches databases on mount, so keeping it
            unmounted avoids that cost on every landing-page load. */}
        {showAiBuild && (
          <AiBuildLaunchRail
            isOpen
            onClose={() => setShowAiBuild(false)}
            onLaunch={handleAiBuildLaunch}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// useSearchParams() requires a Suspense boundary in the App Router.
export default function BIDashboardPageWrapper() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <BIDashboardPage />
    </Suspense>
  );
}
