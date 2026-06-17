'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FolderOpen, Plus, Search, Loader2, Clock, User, Lock,
  Sparkles, Wrench, LayoutTemplate, GitBranch, Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listProjects } from '@/app/services/api/projectsApi';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import type { Project as ApiProject } from '@/app/services/api/types';
import UnifiedProjectWizard, {
  type UnifiedProjectWizardResult,
} from '@/components/project-onboarding/UnifiedProjectWizard';
import {
  PROJECT_PAGE_SIZE,
  getLastUsedMap,
  recordProjectUsed,
  getMineOnlyPref,
  setMineOnlyPref,
  sortByLastUsedThenCreated,
  formatProjectTimestamp,
  getBuildModeChip,
  getDisplayTags,
} from '@/components/project-onboarding/project-listing-utils';

interface WorkflowProjectGateProps {
  /** When true, the inline gate is rendered in the page flow. */
  isOpen: boolean;
  /** Called when the user selects an existing workflow. */
  onSelect: (workflowId: string, workflowName: string) => void;
  /**
   * Called when a new workflow is created through the UnifiedProjectWizard.
   * Carries the explicit build mode so the host can branch (open the AI
   * wizard / apply a template / land on a blank canvas).
   */
  onCreated: (result: UnifiedProjectWizardResult) => void;
  /** Optional className for the inline gate wrapper. */
  className?: string;
}

interface ProjectRow {
  project_id: string;
  name: string;
  created_by: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  current_version_num: number | null;
  deployment_version: number | null;
  tags: string[] | null;
}

/** Module key used for the per-module `mine_only` localStorage preference. */
const MODULE_KEY = 'workflow';

function toRow(p: ApiProject): ProjectRow {
  return {
    project_id: p.project_id,
    name: p.project_name,
    created_by: p.created_by,
    status: p.status,
    created_at: p.created_at,
    updated_at: p.updated_at,
    current_version_num: p.current_version_num,
    deployment_version: p.deployment_version,
    tags: p.tags,
  };
}

/**
 * Backend Gap note — replicates the violet `BackendGapNote` style from
 * `WizardPreflightPanel.tsx`. Surfaced once below the pick list to tell the
 * backend team exactly which fields would make this listing genuinely useful.
 *
 * Intentionally duplicated in explore-design's `ProjectSelector` (rather than
 * cross-imported) so neither module depends on the other's internals.
 */
function ProjectListingBackendGap() {
  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-violet-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — UX target
        </p>
      </div>
      <dl className="mt-2 space-y-1.5 text-[11px]">
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Response</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">
            GET /projects → add last_used_at, table_count, version_count, last_deployed_at
          </dd>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Request</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">
            ?sort_by=last_used &amp; ?search=&lt;text&gt;
          </dd>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
          <dd className="text-slate-700 dark:text-slate-300">
            Last-used ordering and search currently run client-side over the loaded
            pages only — a frequently-used project on an unloaded page won&apos;t
            surface. Server-side <code className="font-mono">sort_by=last_used</code> and{' '}
            <code className="font-mono">search</code> would make ordering and discovery
            correct across the full project set. Row metadata (table / version /
            deploy counts) is rendered only where the field exists today.
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Small build-mode chip — AI-built / Manual / Template. */
function BuildModeBadge({ tags }: { tags: string[] | null }) {
  const chip = getBuildModeChip(tags);
  if (!chip) return null;
  const Icon =
    chip.kind === 'ai' ? Sparkles : chip.kind === 'template' ? LayoutTemplate : Wrench;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        chip.kind === 'ai' && 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
        chip.kind === 'template' && 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
        chip.kind === 'manual' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {chip.label}
    </span>
  );
}

/**
 * Project gate for the Workflow module.
 *
 * A workflow IS a project (project_type='workflow'), so this gate fills the
 * canvas — as an inline, non-blocking empty-state (no portal, no
 * `fixed inset-0` backdrop) — until the user either selects an existing
 * workflow or creates a new one. It is mandatory: there is no dismiss/close
 * affordance, so it does not handle Escape. Mirrors the UX of Explore &
 * Design's ProjectSelector without lifting the full ProjectSelector component
 * (it's tied to explore_design endpoints).
 */
export default function WorkflowProjectGate({
  isOpen,
  onSelect,
  onCreated,
  className,
}: WorkflowProjectGateProps) {
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  // Mine-only filter — persisted per module so it survives reloads.
  const [mineOnly, setMineOnly] = useState(false);
  useEffect(() => {
    setMineOnly(getMineOnlyPref(MODULE_KEY));
  }, []);

  // Last-used map drives the "used 2h ago" labels + sort order. Refreshed
  // whenever the modal opens so a project picked in another tab reflects.
  const [lastUsed, setLastUsed] = useState(() => getLastUsedMap());

  // Pagination — useCacheAwareQuery fetches page 1; "Load more" pages are
  // fetched directly and accumulated here. `total` comes from the API when
  // available so we can render "20 of N".
  const [extraPages, setExtraPages] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Fetch page 1 of workflow projects. Re-fires via refetch() when `mineOnly`
  // changes — fetchFnRef inside the hook always reflects the latest closure.
  const fetchFn = useCallback(async (): Promise<ProjectRow[]> => {
    const res = await listProjects({
      project_type: 'workflow',
      mine_only: mineOnly,
      limit: PROJECT_PAGE_SIZE,
      offset: 0,
    });
    const items = Array.isArray(res?.projects) ? res.projects : [];
    setTotal(typeof res?.total === 'number' ? res.total : null);
    setHasMore(items.length === PROJECT_PAGE_SIZE);
    setExtraPages([]);
    return items.map(toRow);
  }, [mineOnly]);

  const { data: projects, loading, refetch } = useCacheAwareQuery<ProjectRow[]>(
    fetchFn,
    { cacheKeys: [CACHE_KEYS.WORKFLOWS], initialData: [] },
  );

  // Re-fetch page 1 whenever the mine-only filter flips.
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly]);

  const loadedProjects = useMemo(
    () => [...(projects ?? []), ...extraPages],
    [projects, extraPages],
  );

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await listProjects({
        project_type: 'workflow',
        mine_only: mineOnly,
        limit: PROJECT_PAGE_SIZE,
        offset: loadedProjects.length,
      });
      const items = Array.isArray(res?.projects) ? res.projects : [];
      setExtraPages((prev) => [...prev, ...items.map(toRow)]);
      if (typeof res?.total === 'number') setTotal(res.total);
      setHasMore(items.length === PROJECT_PAGE_SIZE);
    } catch (err) {
      console.error('[WorkflowProjectGate] Load more failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [mineOnly, loadedProjects.length]);

  const handleMineOnlyChange = useCallback((value: boolean) => {
    setMineOnly(value);
    setMineOnlyPref(MODULE_KEY, value);
  }, []);

  // Sort by last-used then created_at, then apply client-side search.
  const sorted = useMemo(
    () => sortByLastUsedThenCreated(loadedProjects, lastUsed),
    [loadedProjects, lastUsed],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) => p.name.toLowerCase().includes(q) || p.created_by.toLowerCase().includes(q),
    );
  }, [sorted, search]);

  // Reset search + refresh last-used when the modal becomes visible again.
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setLastUsed(getLastUsedMap());
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (projectId: string, projectName: string) => {
      recordProjectUsed(projectId);
      onSelect(projectId, projectName);
    },
    [onSelect],
  );

  const handleWizardCreated = (result: UnifiedProjectWizardResult) => {
    setWizardOpen(false);
    if (result?.projectId) recordProjectUsed(result.projectId);
    refetch();
    onCreated(result);
  };

  // Gate is mandatory — render nothing when closed. Placed after all hooks so
  // React's rules-of-hooks hold. The parent also conditionally mounts this, so
  // this is belt-and-suspenders while keeping the `isOpen` prop honest.
  if (!isOpen) return null;

  return (
    <>
    {/* Inline, non-blocking gate — fills the canvas as a centred empty-state
        card in normal document flow (no portal, no `fixed inset-0` backdrop).
        Labelled region (not a dialog): mandatory gate, so no dismiss/Escape. */}
    <section
      role="region"
      aria-labelledby="workflow-project-gate-heading"
      className={cn('flex-1 overflow-auto flex items-start justify-center p-6', className)}
    >
      <div className="w-full max-w-2xl mt-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
      <div className="p-5">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="workflow-project-gate-heading"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
            >
              <FolderOpen className="h-5 w-5 text-indigo-500" />
              Choose a workflow project
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Pick an existing workflow to continue, or create a new one.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Create new
          </button>
        </div>

        <div>
            {/* Filter row — mine-only segmented control + search */}
            <div className="mb-3 flex items-center gap-2">
              <div
                role="radiogroup"
                aria-label="Project ownership filter"
                className="flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
              >
                {([
                  { value: false, label: 'All projects' },
                  { value: true, label: 'My projects' },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="radio"
                    aria-checked={mineOnly === opt.value}
                    onClick={() => handleMineOnlyChange(opt.value)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                      mineOnly === opt.value
                        ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search workflows by name or owner..."
                  className={cn(
                    'w-full pl-9 pr-3 py-2 text-sm rounded-lg',
                    'border border-slate-200 dark:border-slate-700',
                    'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100',
                    'placeholder:text-slate-400',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400',
                  )}
                  aria-label="Search workflows"
                />
              </div>
            </div>
            {search.trim() && (
              <p className="-mt-1 mb-2 text-[11px] italic text-slate-400 dark:text-slate-500">
                Search filters the {loadedProjects.length} loaded workflow
                {loadedProjects.length === 1 ? '' : 's'} only — load more to widen it.
              </p>
            )}

            {/* List */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[320px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading workflows...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {loadedProjects.length === 0 ? 'No workflows yet' : 'No workflows match your search'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {loadedProjects.length === 0
                      ? 'Create your first workflow to get started.'
                      : 'Try a different search term.'}
                  </p>
                  {loadedProjects.length === 0 && (
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                      onClick={() => setWizardOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create workflow
                    </button>
                  )}
                </div>
              ) : (
                <ul role="listbox" aria-label="Available workflows" className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filtered.map((p) => {
                    const displayTags = getDisplayTags(p.tags);
                    return (
                      <li key={p.project_id} role="option" aria-selected={false}>
                        <button
                          type="button"
                          onClick={() => handleSelect(p.project_id, p.name)}
                          className={cn(
                            'w-full text-left px-4 py-3 flex items-center gap-3',
                            'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors',
                            'focus:outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20',
                          )}
                        >
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex-shrink-0">
                            <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {p.name}
                              </span>
                              <BuildModeBadge tags={p.tags} />
                            </div>
                            {/* Line 1 — owner + timestamp */}
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {p.created_by}
                              </span>
                              {formatProjectTimestamp(p, lastUsed) && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatProjectTimestamp(p, lastUsed)}
                                </span>
                              )}
                            </div>
                            {/* Line 2 — metadata: status, version, deployed, tags */}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {p.status}
                              </span>
                              {p.current_version_num != null && (
                                <span className="inline-flex items-center gap-0.5">
                                  <GitBranch className="h-2.5 w-2.5" />
                                  v{p.current_version_num}
                                </span>
                              )}
                              {p.deployment_version != null && (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                  <Rocket className="h-2.5 w-2.5" />
                                  deployed v{p.deployment_version}
                                </span>
                              )}
                              {displayTags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Load more — only when not searching (search is loaded-set only) */}
              {!loading && !search.trim() && hasMore && (
                <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>Load more workflows</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Backend Gap note — shown once below the list */}
            <ProjectListingBackendGap />

            <div className="mt-3 flex justify-between items-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {total != null
                  ? `${loadedProjects.length} of ${total} workflow${total === 1 ? '' : 's'}`
                  : `${loadedProjects.length} workflow${loadedProjects.length === 1 ? '' : 's'} loaded`}
              </p>
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                New workflow
              </button>
            </div>
          </div>
      </div>
      </div>
    </section>

    {/* Unified creation flow — explicit manual / AI / template fork. */}
    <UnifiedProjectWizard
      open={wizardOpen}
      onOpenChange={setWizardOpen}
      module="workflow"
      onCreated={handleWizardCreated}
    />
    </>
  );
}
