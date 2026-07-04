'use client';

/**
 * DeploymentBoard — "All projects · deployment status".
 *
 * A read-only, cross-module overview that answers "where does every project
 * stand in its deployment lifecycle?" on the project landing page. It renders
 * one row per project with a colored deploy-state chip, a top summary strip
 * (total / deployed / awaiting / blocked-failed) and client-side filters.
 *
 * Fast by construction — it NEVER blocks the page on slow per-project calls:
 *   1. ONE list request (GET /projects/unified) seeds every row. A COARSE deploy
 *      state is derived instantly from the list payload (deployment_version +
 *      status), so every chip shows something real on first paint.
 *   2. RICHER readiness (the real latest-deployment status) is lazy-loaded only
 *      for the first ~15 rows via Promise.allSettled, then extended in batches
 *      by "Load more". Each refining row keeps its coarse chip and shows a small
 *      spinner until its own fetch settles — no blank skeletons, no fan-out over
 *      every project.
 *
 * Reuses the Explore & Design lifecycle vocabulary: the exported
 * `deriveDeployState` + `DeployState` union + color intent. Chip LABELS are
 * status nouns (a chip states a fact) rather than the button's action verbs.
 *
 * Gating: intentionally NOT wrapped in useCanPerform. The board is read-only,
 * spans three modules (explore_design / workflow / bi_dashboard) with no single
 * correct action key, and sits beside the ungated Project Summary showing the
 * same rows — a narrow/wrong gate key would silently hide it. The only action,
 * "Open", is navigation to a page that self-gates. Any future inline mutation
 * MUST gate itself with useCanPerform.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAtomValue } from 'jotai';
import {
  AlertTriangle,
  ExternalLink,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import cn from '@core/utils/class-names';
import WidgetCard from '@core/components/cards/widget-card';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getUnifiedProjects,
  type UnifiedProject,
} from '@/app/services/api/projectsApi';
import {
  listProjectDeployments,
  type CollabDeployment,
} from '@/app/services/projects/collaboration';
import {
  deriveDeployState,
  type DeployState,
  type DeployStateInput,
} from '@/app/(dashboard)/explore-design/components/DeployStateButton';
import { routes } from '@/config/routes';

// ── Chip vocabulary — status NOUNS + color intent (not the button's verbs) ────

type ChipTone = 'red' | 'amber' | 'blue' | 'emerald' | 'slate';

const STATE_CHIP: Record<DeployState, { label: string; tone: ChipTone }> = {
  failed: { label: 'Failed', tone: 'red' },
  blocked: { label: 'Blocked', tone: 'red' },
  'awaiting-approval': { label: 'Awaiting approval', tone: 'amber' },
  'checks-not-run': { label: 'Checks pending', tone: 'amber' },
  'ready-not-approved': { label: 'Ready', tone: 'blue' },
  approved: { label: 'Approved', tone: 'emerald' },
  deployed: { label: 'Deployed', tone: 'emerald' },
  draft: { label: 'Draft', tone: 'blue' },
  'no-changes': { label: 'Idle', tone: 'slate' },
};

// Literal class strings per tone (Tailwind purge-safe — no interpolation).
const TONE_CLASS: Record<ChipTone, string> = {
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30',
  amber:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30',
  emerald:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  slate:
    'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600/40',
};

const DOT_CLASS: Record<ChipTone, string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  slate: 'bg-slate-400',
};

// Sort order — most-urgent (needs attention) first, done last.
const STATE_RANK: Record<DeployState, number> = {
  failed: 0,
  blocked: 1,
  'awaiting-approval': 2,
  'checks-not-run': 3,
  'ready-not-approved': 4,
  draft: 5,
  approved: 6,
  deployed: 7,
  'no-changes': 8,
};

// ── State derivation ─────────────────────────────────────────────────────────

/** COARSE state from the list payload alone — no per-project call. */
function coarseState(p: UnifiedProject): DeployState {
  if (p.deployment_version != null && p.deployment_version > 0) return 'deployed';
  const s = (p.status || '').toLowerCase();
  if (s === 'draft' || s === 'active') return 'draft';
  // archived / unknown → idle (archived ≠ shipped).
  return 'no-changes';
}

/** Map a deployment record's status → the earliest input deriveDeployState can
 *  prove. Returns null for statuses with no clean lifecycle mapping
 *  (cancelled / rolled_back / unknown) so the coarse state is kept. */
function inputFromDeploymentStatus(status: string): DeployStateInput | null {
  switch (status.toLowerCase()) {
    case 'failed':
      return { deployStatus: 'failed' };
    case 'deployed':
      return { deployStatus: 'deployed' };
    case 'in_progress':
    case 'approved':
      return { approvalStatus: 'approved' };
    case 'pending_approval':
    case 'pending':
    case 'requested':
    case 'scheduled':
      return { approvalStatus: 'submitted' };
    case 'rejected':
      return { approvalStatus: 'rejected', blockers: 1 };
    default:
      return null;
  }
}

/** RICHER state — only overrides coarse when a real deployment record exists. */
function refineState(deployments: CollabDeployment[], coarse: DeployState): DeployState {
  const latest = deployments[0]; // list is DESC (collaboration.ts convention)
  if (!latest) return coarse;
  const input = inputFromDeploymentStatus(String(latest.status));
  if (!input) return coarse;
  return deriveDeployState(input);
}

// ── Small helpers ────────────────────────────────────────────────────────────

function typeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'explore_design':
      return 'Explore & Design';
    case 'workflow':
      return 'Workflow';
    case 'bi_dashboard':
      return 'BI dashboard';
    default:
      return t ? t.replace(/[_-]/g, ' ') : '—';
  }
}

/** Compact relative time — mirrors the project-summary column formatter. */
function relativeTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '—';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Prefer the backend-provided deep link; if it is empty, fall back to the
 *  correct MODULE page for the project's type (routing a workflow/BI project to
 *  the governance projects page would be the wrong destination). */
function openHref(p: UnifiedProject): string {
  if (p.page_url && p.page_url.startsWith('/')) return p.page_url;
  const id = encodeURIComponent(p.project_id);
  switch (p.type) {
    case 'bi_dashboard':
      return routes.biDashboard.project(p.project_id);
    case 'explore_design':
      return `${routes.exploreDesign.view}?project=${id}`;
    case 'workflow':
      return `${routes.workflow.ViewWorkflow}?project=${id}`;
    default:
      return routes.governance.projectDeepLink(p.project_id);
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────

type StateFilter = 'all' | 'attention' | 'awaiting' | 'progress' | 'deployed';

const STATE_FILTERS: { key: StateFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Blocked / failed' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'progress', label: 'In progress' },
  { key: 'deployed', label: 'Deployed' },
];

function inStateBucket(s: DeployState, f: StateFilter): boolean {
  if (f === 'all') return true;
  if (f === 'attention') return s === 'blocked' || s === 'failed';
  if (f === 'awaiting') return s === 'awaiting-approval';
  if (f === 'deployed') return s === 'deployed';
  // 'progress' — everything else that is in-flight / idle.
  return (
    s === 'draft' ||
    s === 'checks-not-run' ||
    s === 'ready-not-approved' ||
    s === 'approved' ||
    s === 'no-changes'
  );
}

const BATCH = 15;
type LoadState = 'loading' | 'error' | 'ready';

// ── Chip ─────────────────────────────────────────────────────────────────────

function DeployChip({ state, refining }: { state: DeployState; refining?: boolean }) {
  const spec = STATE_CHIP[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASS[spec.tone],
      )}
      title={refining ? `${spec.label} · refining…` : spec.label}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[spec.tone])} />
      {spec.label}
      {refining && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
    </span>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────

export default function DeploymentBoard({ className }: { className?: string }) {
  const [projects, setProjects] = useState<UnifiedProject[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  // Richer-readiness store + refining set (mirrored in refs for idempotent,
  // StrictMode-safe batch loading).
  const [richer, setRicher] = useState<Record<string, DeployState>>({});
  const [refiningIds, setRefiningIds] = useState<Set<string>>(new Set());
  const richerRef = useRef<Record<string, DeployState>>({});
  const refiningRef = useRef<Set<string>>(new Set());
  const [windowSize, setWindowSize] = useState(BATCH);

  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // ── Fetch the account-wide project list (one request) ──────────────────────
  useEffect(() => {
    let ignore = false;
    setState('loading');
    // Reset the richer-load window on every (re)fetch.
    richerRef.current = {};
    refiningRef.current = new Set();
    setRicher({});
    setRefiningIds(new Set());
    setWindowSize(BATCH);
    getUnifiedProjects({ mine_only: false, limit: 100, offset: 0 })
      .then((res) => {
        if (ignore) return;
        const live = (res?.projects ?? []).filter((p) => p.status !== 'deleted');
        setProjects(live);
        setState('ready');
      })
      .catch(() => {
        if (!ignore) setState('error');
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // Real-time refresh — refetch when the backend broadcasts a PROJECTS cache
  // invalidation over the shared SSE connection (no extra connection opened).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  const seenInvalidationRef = useRef(lastInvalidation);
  useEffect(() => {
    if (lastInvalidation === seenInvalidationRef.current) return;
    seenInvalidationRef.current = lastInvalidation;
    if (lastInvalidation?.keys.includes(CACHE_KEYS.PROJECTS)) {
      setReloadKey((k) => k + 1);
    }
  }, [lastInvalidation]);

  // ── Lazy richer-readiness loader (idempotent; skips loaded/in-flight ids) ───
  const loadRicher = useCallback((slice: UnifiedProject[]) => {
    const batch = slice.filter(
      (p) =>
        !(p.project_id in richerRef.current) && !refiningRef.current.has(p.project_id),
    );
    if (batch.length === 0) return;
    const ids = batch.map((p) => p.project_id);
    ids.forEach((id) => refiningRef.current.add(id));
    setRefiningIds(new Set(refiningRef.current));
    void Promise.allSettled(
      batch.map(async (p) => ({
        id: p.project_id,
        state: refineState(await listProjectDeployments(p.project_id, 5), coarseState(p)),
      })),
    ).then((results) => {
      for (const r of results) {
        if (r.status === 'fulfilled') richerRef.current[r.value.id] = r.value.state;
      }
      ids.forEach((id) => refiningRef.current.delete(id));
      setRicher({ ...richerRef.current });
      setRefiningIds(new Set(refiningRef.current));
    });
  }, []);

  // Kick / extend the richer window whenever the list or window size changes.
  useEffect(() => {
    if (state === 'ready' && projects.length > 0) {
      loadRicher(projects.slice(0, windowSize));
    }
  }, [state, projects, windowSize, loadRicher]);

  // ── Derived: summary counts, present types, filtered+sorted rows ───────────
  const counts = useMemo(() => {
    let deployed = 0;
    let awaiting = 0;
    let attention = 0;
    for (const p of projects) {
      const s = richer[p.project_id] ?? coarseState(p);
      if (s === 'deployed') deployed += 1;
      else if (s === 'awaiting-approval') awaiting += 1;
      else if (s === 'blocked' || s === 'failed') attention += 1;
    }
    return { total: projects.length, deployed, awaiting, attention };
  }, [projects, richer]);

  const presentTypes = useMemo(
    () => Array.from(new Set(projects.map((p) => p.type).filter(Boolean))),
    [projects],
  );

  const rows = useMemo(() => {
    const withState = projects.map((p) => ({
      p,
      s: richer[p.project_id] ?? coarseState(p),
    }));
    const filtered = withState.filter(
      ({ p, s }) =>
        inStateBucket(s, stateFilter) && (typeFilter === 'all' || p.type === typeFilter),
    );
    filtered.sort((a, b) => {
      const rank = STATE_RANK[a.s] - STATE_RANK[b.s];
      if (rank !== 0) return rank;
      const ta = a.p.updated_at ? new Date(a.p.updated_at).getTime() : 0;
      const tb = b.p.updated_at ? new Date(b.p.updated_at).getTime() : 0;
      return tb - ta;
    });
    return filtered;
  }, [projects, richer, stateFilter, typeFilter]);

  // How many projects have had their live deployment status loaded. The Awaiting
  // and Blocked/failed tiles are only truthful over THIS subset — coarse state
  // (from the list payload) cannot express awaiting/blocked/failed, so those
  // tiles are a lower bound until every project is checked. `partial` drives the
  // honest "≥N · X/Y checked" treatment so an unchecked tail never reads a fake 0.
  const checkedCount = Object.keys(richer).length;
  const partial = projects.length > 0 && checkedCount < projects.length;
  const canLoadMore = state === 'ready' && windowSize < projects.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <WidgetCard
      title="Deployment status · all projects"
      description={
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Where every project stands in its deployment lifecycle.
        </p>
      }
      action={
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      }
      headerClassName="mb-5"
      className={cn('dark:bg-gray-100/50', className)}
    >
      {/* Summary strip. Total + Deployed are list-derivable for every project;
          Awaiting + Blocked/failed depend on per-project deployment records, so
          they carry the partial "≥ · X/Y checked" honesty signal until all are
          loaded. */}
      <div className="mb-5 grid grid-cols-2 gap-3 @sm:grid-cols-4">
        <SummaryTile label="Total" value={counts.total} tone="slate" />
        <SummaryTile label="Deployed" value={counts.deployed} tone="emerald" />
        <SummaryTile
          label="Awaiting"
          value={counts.awaiting}
          tone="amber"
          partial={partial}
          checked={checkedCount}
          total={counts.total}
        />
        <SummaryTile
          label="Blocked / failed"
          value={counts.attention}
          tone="red"
          partial={partial}
          checked={checkedCount}
          total={counts.total}
        />
      </div>

      {state === 'loading' && (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {state === 'error' && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Couldn’t load projects.
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && projects.length === 0 && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center">
          <FolderOpen className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No projects yet.</p>
        </div>
      )}

      {state === 'ready' && projects.length > 0 && (
        <>
          {/* Filters */}
          <div className="mb-3 flex flex-col gap-2.5 @lg:flex-row @lg:items-center @lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {STATE_FILTERS.map((f) => (
                <FilterPill
                  key={f.key}
                  active={stateFilter === f.key}
                  onClick={() => setStateFilter(f.key)}
                >
                  {f.label}
                </FilterPill>
              ))}
            </div>
            {presentTypes.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
                  All types
                </FilterPill>
                {presentTypes.map((t) => (
                  <FilterPill
                    key={t}
                    active={typeFilter === t}
                    onClick={() => setTypeFilter(t)}
                  >
                    {typeLabel(t)}
                  </FilterPill>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="max-h-[520px] overflow-auto rounded-lg border border-muted dark:border-gray-200">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-100 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Deployment</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                  <th className="px-4 py-2.5 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted dark:divide-gray-200">
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No projects match these filters.
                    </td>
                  </tr>
                )}
                {rows.map(({ p, s }) => (
                  <tr
                    key={p.project_id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-100/60"
                  >
                    <td className="max-w-[260px] px-4 py-3">
                      <span className="block truncate font-medium text-gray-900 dark:text-gray-100">
                        {p.name || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                      {typeLabel(p.type)}
                    </td>
                    <td className="px-4 py-3">
                      <DeployChip state={s} refining={refiningIds.has(p.project_id)} />
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400"
                      title={p.updated_at ?? undefined}
                    >
                      {relativeTime(p.updated_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={openHref(p)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer — richer-readiness progress + load more */}
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {rows.length} shown · live deployment status for {checkedCount} of{' '}
              {projects.length}
            </span>
            {canLoadMore && (
              <button
                type="button"
                onClick={() => setWindowSize((w) => Math.min(w + BATCH, projects.length))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Load more status
              </button>
            )}
          </div>
        </>
      )}
    </WidgetCard>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TILE_TONE: Record<ChipTone, string> = {
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  blue: 'text-blue-600 dark:text-blue-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  slate: 'text-gray-900 dark:text-gray-100',
};

function SummaryTile({
  label,
  value,
  tone,
  partial,
  checked,
  total,
}: {
  label: string;
  value: number;
  tone: ChipTone;
  /** True when this metric only reflects the subset whose live status loaded. */
  partial?: boolean;
  checked?: number;
  total?: number;
}) {
  // Honest display: over a partial subset a positive count is a lower bound
  // ("≥N"); a zero is unknown, not a proven zero, so it renders "—".
  const display = !partial ? String(value) : value > 0 ? `≥${value}` : '—';
  return (
    <div className="rounded-lg border border-muted bg-gray-0 px-3.5 py-3 dark:border-gray-200 dark:bg-gray-100">
      <div className={cn('text-2xl font-semibold leading-none', TILE_TONE[tone])}>
        {display}
      </div>
      <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{label}</div>
      {partial && (
        <div className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
          {checked ?? 0}/{total ?? 0} checked
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-gray-50'
          : 'border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800',
      )}
    >
      {children}
    </button>
  );
}
