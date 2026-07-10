'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button, Badge, Input, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  FolderOpen, Plus, RefreshCw, ChevronDown, X, Loader2,
  FolderPlus, Clock, User, Search, Users, Crown, Pencil, Eye,
  Sparkles, ArrowRight, GitBranch, Rocket, Wrench, LayoutTemplate, Lock,
} from 'lucide-react';
import { PiCheckCircleDuotone } from 'react-icons/pi';
import { cn } from '@/lib/utils';
import { listProjects, addContributor } from '@/app/services/api/projectsApi';
import { createExploreProject } from '@/app/services/api/exploreDesignApi';
import type { Project as ApiProject } from '@/app/services/api/types';
import { getUsers } from '@/app/services/governance/fetch_users';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useAuth } from '@/hooks/useAuth';
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

interface Project {
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
const MODULE_KEY = 'explore_design';

function toProject(p: ApiProject): Project {
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

interface TeamMember {
  username: string;
  displayName: string;
  role: 'editor' | 'viewer';
}

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string, projectName: string) => void;
  className?: string;
  /** If provided, auto-select this project once projects are loaded */
  autoSelectProjectId?: string | null;
  /**
   * Slide-1 redesign: when provided, the "+ New project" button emits this
   * callback instead of opening the legacy modal. Hosting page renders the
   * `InlineProjectWizard` inline.
   */
  onCreateRequested?: () => void;
}

function getInitials(username: string): string {
  return username
    .split(/[._\-@]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_OPTIONS = [
  { value: 'viewer' as const, label: 'Viewer', icon: Eye, color: 'text-slate-600' },
  { value: 'editor' as const, label: 'Editor', icon: Pencil, color: 'text-blue-600' },
];

/**
 * Backend Gap note — replicates the violet `BackendGapNote` style from
 * `WizardPreflightPanel.tsx`. Surfaced once below the pick list to tell the
 * backend team which fields would make this listing genuinely useful.
 *
 * Intentionally duplicated (not imported from WorkflowProjectGate) so the
 * explore-design module does not depend on workflow internals — both copies
 * share the same shared `project-listing-utils` for the actual logic.
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

/** Small build-mode chip — AI-built / Manual / Template, derived from tags[]. */
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

export default function ProjectSelector({
  selectedProjectId,
  onProjectSelect,
  className,
  autoSelectProjectId,
  onCreateRequested,
}: ProjectSelectorProps) {
  const { username: currentUsername } = useAuth();

  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedInModal, setSelectedInModal] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Modal tab: 'pick' = list of existing projects (default — what users do
  // 90% of the time), 'create' = the new-project form with team members.
  // When the modal opens and there are zero projects, jump to 'create'
  // automatically so the user doesn't land on an empty list.
  const [modalTab, setModalTab] = useState<'pick' | 'create'>('pick');

  // Form is dirty when user has typed anything into name or description fields
  const isDirty = useMemo(
    () => newProjectName.trim().length > 0 || newProjectDescription.trim().length > 0,
    [newProjectName, newProjectDescription],
  );

  // Team members for new project
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRole, setMemberRole] = useState<'editor' | 'viewer'>('viewer');
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const memberInputRef = useRef<HTMLInputElement>(null);
  // Anchors the non-blocking popover + powers click-outside dismissal.
  const containerRef = useRef<HTMLDivElement>(null);

  // Mine-only filter — persisted per module so it survives reloads.
  // Initial `true` matches getMineOnlyPref's granted-only default so the
  // first fetch isn't a wasted all-projects query.
  const [mineOnly, setMineOnly] = useState(true);
  useEffect(() => {
    setMineOnly(getMineOnlyPref(MODULE_KEY));
  }, []);

  // Last-used map drives the "used 2h ago" labels + sort order.
  const [lastUsed, setLastUsed] = useState(() => getLastUsedMap());

  // Pagination — useCacheAwareQuery fetches page 1; "Load more" pages are
  // fetched directly and accumulated here.
  const [extraPages, setExtraPages] = useState<Project[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Fetch page 1 of explore projects. Re-fires via refetch() when `mineOnly`
  // changes — the hook's fetchFnRef always reflects the latest closure.
  const fetchProjectsFn = useCallback(async (): Promise<Project[]> => {
    // mine_only is now user-controlled via the segmented toggle. Backend's
    // "mine" predicate is contributor-based; account admins may still want
    // "All" to see projects they created but don't contribute to.
    const response = await listProjects({
      project_type: 'explore_design',
      mine_only: mineOnly,
      limit: PROJECT_PAGE_SIZE,
      offset: 0,
    });
    const items = Array.isArray(response?.projects) ? response.projects : [];
    setTotal(typeof response?.total === 'number' ? response.total : null);
    setHasMore(items.length === PROJECT_PAGE_SIZE);
    setExtraPages([]);
    return items.map(toProject);
  }, [mineOnly]);

  const { data: projects, loading, isStale, refetch } = useCacheAwareQuery<Project[]>(
    fetchProjectsFn,
    { cacheKeys: [CACHE_KEYS.PROJECTS], initialData: [] }
  );

  // Re-fetch page 1 whenever the mine-only filter flips.
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineOnly]);

  // All loaded projects (page 1 + accumulated "Load more" pages).
  const safeProjects = useMemo(
    () => [...(projects ?? []), ...extraPages],
    [projects, extraPages],
  );

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const response = await listProjects({
        project_type: 'explore_design',
        mine_only: mineOnly,
        limit: PROJECT_PAGE_SIZE,
        offset: safeProjects.length,
      });
      const items = Array.isArray(response?.projects) ? response.projects : [];
      setExtraPages((prev) => [...prev, ...items.map(toProject)]);
      if (typeof response?.total === 'number') setTotal(response.total);
      setHasMore(items.length === PROJECT_PAGE_SIZE);
    } catch (err) {
      console.error('[ProjectSelector] Load more failed:', err);
      toast.error('Could not load more projects');
    } finally {
      setLoadingMore(false);
    }
  }, [mineOnly, safeProjects.length]);

  const handleMineOnlyChange = useCallback((value: boolean) => {
    setMineOnly(value);
    setMineOnlyPref(MODULE_KEY, value);
  }, []);

  // Sort by last-used then created_at, then apply client-side search.
  const sortedProjects = useMemo(
    () => sortByLastUsedThenCreated(safeProjects, lastUsed),
    [safeProjects, lastUsed],
  );
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return sortedProjects;
    const q = projectSearch.toLowerCase();
    return sortedProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.created_by.toLowerCase().includes(q),
    );
  }, [sortedProjects, projectSearch]);

  // Filtered users for team member dropdown
  const addedUsernames = useMemo(
    () => new Set(teamMembers.map((m) => m.username.toLowerCase())),
    [teamMembers],
  );

  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      const id = u.id.toLowerCase();
      if (id === currentUsername.toLowerCase()) return false;
      if (addedUsernames.has(id)) return false;
      if (!memberSearch) return true;
      const q = memberSearch.toLowerCase();
      return id.includes(q) || u.name.toLowerCase().includes(q);
    });
  }, [allUsers, currentUsername, addedUsernames, memberSearch]);

  // Fetch users once modal opens
  useEffect(() => {
    if (!showModal || allUsers.length > 0) return;
    let cancelled = false;
    setLoadingUsers(true);
    getUsers()
      .then((users) => {
        if (!cancelled) setAllUsers(users.map((u) => ({ id: u.id, name: u.name })));
      })
      .catch((err) => {
        console.error('[ProjectSelector] Failed to fetch users:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => { cancelled = true; };
  }, [showModal, allUsers.length]);

  // Handle project creation + add team members
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsCreating(true);

    try {
      const response = await createExploreProject({
        project_name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
      });

      // Add team members in parallel
      if (teamMembers.length > 0) {
        const memberResults = await Promise.allSettled(
          teamMembers.map((m) =>
            addContributor(response.project_id, { username: m.username, role: m.role }),
          ),
        );
        const failed = memberResults.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          toast.error(`${failed} team member(s) could not be added`);
        }
      }

      toast.success(`Project "${newProjectName}" created successfully!`);

      onProjectSelect(response.project_id, newProjectName.trim());
      refetch();
      resetCreateForm();
      setShowModal(false);
    } catch (error: any) {
      console.error('[ProjectSelector] Error creating project:', error);
      toast.error(`Failed to create project: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewProjectName('');
    setNewProjectDescription('');
    setTeamMembers([]);
    setMemberSearch('');
    setShowMemberDropdown(false);
  };

  // Attempt to close the main modal: if the create form is dirty and no project
  // is currently selected, prompt to confirm discard. Otherwise close immediately.
  const attemptCloseModal = useCallback(() => {
    if (isDirty && !selectedProjectId) {
      setShowDiscardConfirm(true);
      return;
    }
    setShowModal(false);
  }, [isDirty, selectedProjectId]);

  const confirmDiscard = useCallback(() => {
    resetCreateForm();
    setShowDiscardConfirm(false);
    setShowModal(false);
  }, []);

  // Non-blocking dismissal: click anywhere outside the popover, or press Escape,
  // closes it (honouring the dirty-discard guard). Replaces the old modal backdrop.
  useEffect(() => {
    if (!showModal) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        attemptCloseModal();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') attemptCloseModal();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showModal, attemptCloseModal]);

  const handleSelectProject = () => {
    if (!selectedInModal) {
      toast.error('Please select a project');
      return;
    }
    const project = safeProjects.find((p) => p.project_id === selectedInModal);
    if (project) {
      selectProject(project.project_id, project.name);
      setShowModal(false);
      setSelectedInModal(null);
    }
  };

  const addTeamMember = (userId: string, displayName: string) => {
    setTeamMembers((prev) => [...prev, { username: userId, displayName, role: memberRole }]);
    setMemberSearch('');
    setShowMemberDropdown(false);
  };

  const removeTeamMember = (username: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.username !== username));
  };

  const updateMemberRole = (username: string, role: 'editor' | 'viewer') => {
    setTeamMembers((prev) =>
      prev.map((m) => (m.username === username ? { ...m, role } : m)),
    );
  };

  const selectedProject = safeProjects.find((p) => p.project_id === selectedProjectId);
  const autoSelectedRef = useRef(false);

  // Auto-select ONLY from URL query param (deep-linking)
  useEffect(() => {
    if (autoSelectedRef.current || loading || !autoSelectProjectId) return;
    const match = safeProjects.find((p) => p.project_id === autoSelectProjectId);
    if (match) {
      autoSelectedRef.current = true;
      onProjectSelect(match.project_id, match.name);
    }
  }, [loading, safeProjects, autoSelectProjectId, onProjectSelect]);

  // When the modal opens with zero projects available, switch the tab to
  // 'create' so the user doesn't see an empty "Pick existing" list.
  useEffect(() => {
    if (!showModal) return;
    if (!loading && safeProjects.length === 0) setModalTab('create');
  }, [showModal, loading, safeProjects.length]);

  // Refresh the last-used map each time the modal opens so a project picked
  // in another tab reflects in this list's ordering / "used Xh ago" labels.
  useEffect(() => {
    if (showModal) setLastUsed(getLastUsedMap());
  }, [showModal]);

  // Single wrapper for every selection path (button / double-click / Enter)
  // so the last-used timestamp is always stamped exactly once.
  const selectProject = useCallback(
    (projectId: string, projectName: string) => {
      recordProjectUsed(projectId);
      onProjectSelect(projectId, projectName);
    },
    [onProjectSelect],
  );

  // Modal auto-open removed. Previously this forced the popup the moment
  // the page loaded without a selected project, which trapped users behind
  // a modal and (per product feedback) felt aggressive. The page now shows
  // the inline project wizard in the empty state instead; users click the
  // selector button when they want to switch between existing projects.

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {/* Compact Selector Button — visually a dropdown trigger (ChevronDown). */}
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
        aria-haspopup="dialog"
        aria-expanded={showModal}
        className={cn(
          'group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm shadow-sm transition-all',
          'bg-white dark:bg-slate-800 dark:border-slate-700',
          'hover:border-slate-300 hover:shadow-md dark:hover:border-slate-600',
          'min-w-[180px] max-w-[280px]',
          !selectedProjectId && 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20',
        )}
        onClick={() => (showModal ? attemptCloseModal() : setShowModal(true))}
      >
        <FolderOpen
          className={cn(
            'h-4 w-4 flex-shrink-0',
            selectedProjectId ? 'text-blue-500' : 'text-amber-500',
          )}
        />
        <span className="flex-1 text-left truncate">
          {loading ? (
            <span className="text-slate-400 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : selectedProject ? (
            selectedProject.name
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              Select Project
            </span>
          )}
        </span>
        {isStale ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
        ) : (
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-slate-400 transition-transform',
              showModal ? 'rotate-180' : 'group-hover:translate-y-0.5',
            )}
          />
        )}
      </motion.button>

      {/* Anchored, non-blocking project switcher popover.
          Replaces the old centered backdrop Modal (per "no popup project
          selectors"): drops directly under its trigger, dismisses on
          click-outside / Escape, never traps the page behind a backdrop. */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            role="dialog"
            aria-label="Switch project"
            className="absolute left-0 top-full z-[100] mt-2 w-[640px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="relative flex flex-col overflow-hidden">
          {/* Decorative gradient orb behind the header — adds depth without
              compromising legibility. Lives in the modal background only. */}
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 blur-3xl dark:from-blue-500/15 dark:to-indigo-600/15" />
          <div className="pointer-events-none absolute -right-16 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-violet-400/15 to-fuchsia-500/15 blur-3xl dark:from-violet-500/10 dark:to-fuchsia-600/10" />

          {/* ── Header ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative flex items-start justify-between gap-3 px-6 pb-4 pt-5"
          >
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.85, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30"
              >
                <FolderOpen className="h-5 w-5 text-white" />
                <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent" />
              </motion.div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                  Switch project
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Pick an existing project or start a new one
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip content="Refresh projects">
                <motion.button
                  whileHover={{ scale: 1.08, rotate: 90 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  onClick={() => refetch()}
                  disabled={isStale}
                >
                  <RefreshCw className={cn('h-4 w-4', isStale && 'animate-spin')} />
                </motion.button>
              </Tooltip>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={attemptCloseModal}
                aria-label="Close project management"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* ── Tabs with sliding indicator (the modern signature move) ── */}
          <LayoutGroup id="project-modal-tabs">
            <div className="relative flex items-center gap-1 border-b border-slate-200/70 px-5 dark:border-slate-700/70">
              {([
                { id: 'pick', label: 'Pick existing', count: safeProjects.length },
                { id: 'create', label: 'Create new', count: null as number | null },
              ] as const).map((t) => {
                const active = modalTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setModalTab(t.id)}
                    className={cn(
                      'group relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                    )}
                  >
                    <span>{t.label}</span>
                    {t.count !== null && t.count > 0 && (
                      <motion.span
                        layout
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors',
                          active
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                        )}
                      >
                        {t.count}
                      </motion.span>
                    )}
                    {active && (
                      <motion.span
                        layoutId="modal-tab-indicator"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
              {selectedProjectId && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                  </span>
                  <span>Working on</span>
                  <span className="max-w-[140px] truncate font-medium text-slate-700 dark:text-slate-200">
                    {selectedProject?.name}
                  </span>
                </motion.div>
              )}
            </div>
          </LayoutGroup>

          {/* ── Body ────────────────────────────────────────────────── */}
          <div className="relative px-5 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={modalTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >

            {/* ── PICK EXISTING tab ─────────────────────────────────── */}
            {modalTab === 'pick' && (
              <div className="flex flex-col">
                {/* Filter row — mine-only segmented control + search */}
                <div className="mb-1.5 flex items-center gap-2">
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
                          'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
                          mineOnly === opt.value
                            ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-300'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {/* Search field with icon — focus ring uses gradient accent */}
                  <div className="group relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500" />
                    <Input
                      size="md"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder={`Search ${safeProjects.length} loaded project${safeProjects.length === 1 ? '' : 's'}…`}
                      className="pl-9"
                    />
                  </div>
                </div>
                <p className="mb-3 text-[11px] italic text-slate-400 dark:text-slate-500">
                  {projectSearch.trim()
                    ? `Search runs over the ${safeProjects.length} loaded project${safeProjects.length === 1 ? '' : 's'} only — load more to widen it.`
                    : 'Recently opened projects float to the top.'}
                </p>

                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-14">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="h-7 w-7 text-blue-500" />
                    </motion.div>
                    <p className="text-xs text-slate-500">Loading your projects…</p>
                  </div>
                ) : safeProjects.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-slate-50/50 to-white py-12 text-center dark:border-slate-700 dark:from-slate-800/30 dark:to-slate-900"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl" />
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                        <FolderOpen className="h-7 w-7 text-white" />
                      </div>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      No projects yet
                    </p>
                    <p className="mt-1 max-w-[260px] text-xs text-slate-500">
                      Get started by creating your first explore-design project.
                    </p>
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="mt-4">
                      <Button
                        className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700"
                        onClick={() => setModalTab('create')}
                      >
                        <FolderPlus className="h-4 w-4" />
                        Create first project
                      </Button>
                    </motion.div>
                  </motion.div>
                ) : (
                  <div
                    className="custom-scrollbar max-h-[420px] space-y-1.5 overflow-y-auto pr-1"
                    role="listbox"
                    aria-label="Existing projects"
                  >
                    {filteredProjects.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-8 text-center text-xs text-slate-400"
                      >
                        No projects match &ldquo;{projectSearch}&rdquo;
                      </motion.div>
                    ) : (
                      filteredProjects.map((project, idx) => {
                        const isSelected = selectedInModal === project.project_id;
                        const isCurrent = selectedProjectId === project.project_id;
                        const isOwner =
                          project.created_by.toLowerCase() ===
                          currentUsername.toLowerCase();
                        return (
                          <motion.button
                            key={project.project_id}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={0}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.22,
                              delay: Math.min(idx * 0.03, 0.18),
                              ease: 'easeOut',
                            }}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.985 }}
                            className={cn(
                              'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
                              isSelected
                                ? 'border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/40 shadow-sm shadow-blue-500/10 dark:border-blue-700/50 dark:from-blue-900/30 dark:to-indigo-900/20'
                                : 'border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-800/70',
                            )}
                            onClick={() => setSelectedInModal(project.project_id)}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              setSelectedInModal(project.project_id);
                              selectProject(project.project_id, project.name);
                              setShowModal(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                setSelectedInModal(project.project_id);
                                selectProject(project.project_id, project.name);
                                setShowModal(false);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const next = filteredProjects[idx + 1];
                                if (next) {
                                  setSelectedInModal(next.project_id);
                                  const el = e.currentTarget.parentElement
                                    ?.children[idx + 1] as HTMLElement | undefined;
                                  el?.focus();
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const prev = filteredProjects[idx - 1];
                                if (prev) {
                                  setSelectedInModal(prev.project_id);
                                  const el = e.currentTarget.parentElement
                                    ?.children[idx - 1] as HTMLElement | undefined;
                                  el?.focus();
                                }
                              }
                            }}
                          >
                            {/* Left accent bar for selected row */}
                            {isSelected && (
                              <motion.span
                                layoutId="row-accent"
                                className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-indigo-500"
                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                              />
                            )}
                            <div
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                                isSelected
                                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/30'
                                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-400 dark:group-hover:bg-slate-700',
                              )}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'truncate text-sm font-semibold',
                                    isSelected
                                      ? 'text-blue-700 dark:text-blue-200'
                                      : 'text-slate-800 dark:text-slate-100',
                                  )}
                                >
                                  {project.name}
                                </span>
                                {isCurrent && (
                                  <motion.span
                                    initial={{ scale: 0.7, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                  >
                                    <span className="relative flex h-1 w-1">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                                      <span className="relative inline-flex h-1 w-1 rounded-full bg-green-500" />
                                    </span>
                                    active
                                  </motion.span>
                                )}
                                <BuildModeBadge tags={project.tags} />
                              </div>
                              {/* Line 1 — owner + last-used / created timestamp */}
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-2.5 w-2.5" />
                                  {project.created_by}
                                </span>
                                {formatProjectTimestamp(project, lastUsed) && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatProjectTimestamp(project, lastUsed)}
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                                    isOwner
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                                  )}
                                >
                                  {isOwner ? (
                                    <>
                                      <Crown className="h-2.5 w-2.5" />
                                      owner
                                    </>
                                  ) : (
                                    'contributor'
                                  )}
                                </span>
                              </div>
                              {/* Line 2 — metadata: status, version, deployed, tags */}
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  {project.status}
                                </span>
                                {project.current_version_num != null && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <GitBranch className="h-2.5 w-2.5" />
                                    v{project.current_version_num}
                                  </span>
                                )}
                                {project.deployment_version != null && (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                    <Rocket className="h-2.5 w-2.5" />
                                    deployed v{project.deployment_version}
                                  </span>
                                )}
                                {getDisplayTags(project.tags).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <motion.div
                              animate={{
                                opacity: isSelected ? 1 : 0,
                                x: isSelected ? 0 : -4,
                              }}
                              transition={{ duration: 0.18 }}
                              className="shrink-0"
                            >
                              <PiCheckCircleDuotone
                                className="h-5 w-5 text-blue-600"
                                aria-hidden="true"
                              />
                            </motion.div>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Load more — only when not searching (search is loaded-set only) */}
                {!loading && !projectSearch.trim() && hasMore && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className={cn(
                        'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        'border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60',
                        'dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
                      )}
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        <>Load more projects</>
                      )}
                    </button>
                  </div>
                )}

                {/* Loaded-count line */}
                {!loading && safeProjects.length > 0 && (
                  <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                    {total != null
                      ? `${safeProjects.length} of ${total} project${total === 1 ? '' : 's'}`
                      : `${safeProjects.length} project${safeProjects.length === 1 ? '' : 's'} loaded`}
                  </p>
                )}

                {/* Footer */}
                {safeProjects.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200/60 pt-3 dark:border-slate-700/60"
                  >
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <kbd className="rounded border border-slate-300 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Enter
                      </kbd>
                      <span>or double-click to open</span>
                    </p>
                    <motion.div
                      whileHover={selectedInModal ? { scale: 1.02 } : undefined}
                      whileTap={selectedInModal ? { scale: 0.98 } : undefined}
                    >
                      <Button
                        className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 disabled:shadow-none"
                        onClick={handleSelectProject}
                        disabled={!selectedInModal}
                      >
                        Open project
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </div>
            )}

            {/* ── CREATE NEW tab ────────────────────────────────────── */}
            {modalTab === 'create' && (
              <div className="space-y-4">
                {/* Project Name */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Project name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    size="md"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Customer Analytics Pipeline"
                    className="w-full"
                    disabled={isCreating}
                    autoFocus
                  />
                </motion.div>

                {/* Description */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.04 }}
                >
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Description <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Input
                    type="text"
                    size="md"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Brief summary of what this project models"
                    className="w-full"
                    disabled={isCreating}
                  />
                </motion.div>

                {/* Team Members */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.08 }}
                >
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Users className="h-3.5 w-3.5" />
                    Team members
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>

                  {/* Added members */}
                  {teamMembers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {teamMembers.map((member) => (
                        <div
                          key={member.username}
                          className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs group"
                        >
                          <div
                            className={cn(
                              'h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white',
                              member.role === 'editor'
                                ? 'bg-gradient-to-br from-blue-400 to-indigo-500'
                                : 'bg-gradient-to-br from-slate-400 to-gray-500',
                            )}
                          >
                            {getInitials(member.username)}
                          </div>
                          <span className="font-medium text-slate-700 dark:text-slate-300 max-w-[80px] truncate">
                            {member.username}
                          </span>
                          <button
                            onClick={() =>
                              updateMemberRole(
                                member.username,
                                member.role === 'editor' ? 'viewer' : 'editor',
                              )
                            }
                            className={cn(
                              'px-1 py-0.5 rounded text-[10px] font-medium transition-colors',
                              member.role === 'editor'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                            )}
                            title="Click to toggle role"
                          >
                            {member.role === 'editor' ? (
                              <span className="flex items-center gap-0.5">
                                <Pencil className="h-2 w-2" />E
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <Eye className="h-2 w-2" />V
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => removeTeamMember(member.username)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* User search / picker */}
                  <div className="relative">
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Input
                          ref={memberInputRef}
                          type="text"
                          size="sm"
                          value={memberSearch}
                          onChange={(e) => {
                            setMemberSearch(e.target.value);
                            setShowMemberDropdown(true);
                          }}
                          onFocus={() => setShowMemberDropdown(true)}
                          placeholder="Search users to add..."
                          className="w-full"
                          disabled={isCreating}
                        />
                      </div>
                      {/* Role toggle */}
                      <div className="flex items-center gap-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5">
                        {ROLE_OPTIONS.map((opt) => {
                          const RIcon = opt.icon;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setMemberRole(opt.value)}
                              className={cn(
                                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all',
                                memberRole === opt.value
                                  ? opt.value === 'editor'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-slate-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-slate-600',
                              )}
                            >
                              <RIcon className="h-2.5 w-2.5" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dropdown */}
                    {showMemberDropdown && (
                      <div className="absolute z-50 w-full mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl">
                        {loadingUsers ? (
                          <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading users...
                          </div>
                        ) : filteredUsers.length === 0 ? (
                          <div className="py-3 text-center text-xs text-slate-400">
                            {memberSearch ? 'No matching users' : 'No available users'}
                          </div>
                        ) : (
                          filteredUsers.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => addTeamMember(user.id, user.name)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            >
                              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-slate-400 to-gray-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                {getInitials(user.id)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate block">
                                  {user.id}
                                </span>
                                {user.name && user.name !== user.id && (
                                  <span className="text-[10px] text-slate-400 truncate block">
                                    {user.name}
                                  </span>
                                )}
                              </div>
                              <Plus className="h-3 w-3 text-slate-400" />
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Create Button — gradient with motion hover/tap micro-interaction
                    and an animated state swap between "Create" and "Creating…" */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.12 }}
                  whileHover={
                    !isCreating && newProjectName.trim()
                      ? { scale: 1.01 }
                      : undefined
                  }
                  whileTap={
                    !isCreating && newProjectName.trim()
                      ? { scale: 0.99 }
                      : undefined
                  }
                  className="pt-1"
                >
                  <Button
                    className={cn(
                      'group relative w-full gap-2 overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 transition-shadow',
                      'hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-blue-500/40',
                      'disabled:from-slate-400 disabled:to-slate-500 disabled:shadow-none',
                    )}
                    onClick={handleCreateProject}
                    disabled={isCreating || !newProjectName.trim()}
                  >
                    {/* Subtle shimmer on hover */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <AnimatePresence mode="wait">
                      {isCreating ? (
                        <motion.span
                          key="loading"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="flex items-center gap-2"
                        >
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating…
                        </motion.span>
                      ) : (
                        <motion.span
                          key="idle"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="flex items-center gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          Create project
                          {teamMembers.length > 0 && (
                            <Badge size="sm" className="ml-1 bg-white/25 text-[10px] px-1.5 text-white">
                              +{teamMembers.length}
                            </Badge>
                          )}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                </motion.div>
              </div>
            )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Discard-changes confirmation — inline overlay scoped to the
              popover (not a second page-blocking modal). */}
          {showDiscardConfirm && (
            <div
              role="alertdialog"
              aria-labelledby="discard-changes-title"
              aria-describedby="discard-changes-desc"
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 p-6 backdrop-blur-sm dark:bg-slate-900/95"
            >
              <div className="text-center">
                <h3
                  id="discard-changes-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Discard changes?
                </h3>
                <p
                  id="discard-changes-desc"
                  className="mt-2 text-sm text-slate-600 dark:text-slate-400"
                >
                  Your project name and description will be lost.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDiscardConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" color="danger" onClick={confirmDiscard}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          )}
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
