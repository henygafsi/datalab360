'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Badge, Button, Input, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  FolderOpen, Users, Crown, Pencil, Eye, Trash2,
  ChevronDown, ChevronRight, Loader2, RefreshCw,
  UserPlus, Check, X, Search, Rocket, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import {
  listProjects,
  listContributors,
  addContributor,
  removeContributor,
  approveDeployment,
  rejectDeployment,
} from '@/app/services/api/projectsApi';
import { getProjectsOverview } from '@/app/services/org-accounts/hooks';
import type { Project, Contributor, ContributorRole } from '@/app/services/api/types';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  getProjectRollup,
  ScoreCardsUnavailableError,
  type ProjectRollup,
  type ScoreCard,
} from '@/app/services/command-center/score-cards';
import ProjectCollaborationPanel from './ProjectCollaborationPanel';

// ---------------------------------------------------------------------------
// Role Config
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<ContributorRole, { icon: React.ElementType; label: string; cls: string }> = {
  owner: { icon: Crown, label: 'Owner', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  editor: { icon: Pencil, label: 'Editor', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  viewer: { icon: Eye, label: 'Viewer', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

function getInitials(username: string): string {
  return username.split(/[._\-@]/).filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Per-project KPI strip (G7 rollup) — DQ% · PERF fail% · cost · N recos, from
// the single cheap getProjectRollup call. Null → "—" (never a fake 0); a 404
// (route not provisioned) hides the strip quietly.
// ---------------------------------------------------------------------------

function fmtMetric(card: ScoreCard | null): string {
  if (!card || card.value == null) return '—';
  const v = typeof card.value === 'number' ? card.value.toLocaleString() : String(card.value);
  return card.unit ? `${v}${card.unit === '%' ? '%' : ` ${card.unit}`}` : v;
}

function StripPill({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/50 text-[10px] font-medium">
      <span className="text-slate-400 dark:text-slate-500">{label}</span>
      <span className={cn('text-slate-600 dark:text-slate-300', tone)}>{value}</span>
    </span>
  );
}

function ProjectScoreStrip({ projectId }: { projectId: string }) {
  const [rollup, setRollup] = useState<ProjectRollup | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let ignore = false;
    getProjectRollup(projectId)
      .then((r) => { if (!ignore) setRollup(r); })
      .catch((err) => {
        // Route not provisioned (404/501) → hide the strip quietly. Other errors
        // just leave it absent (no noisy banner in a list row).
        if (!ignore && err instanceof ScoreCardsUnavailableError) setHidden(true);
      });
    return () => { ignore = true; };
  }, [projectId]);

  if (hidden || !rollup) return null;

  const card = (d: string) => rollup.cards.find((c) => c.dimension === d) ?? null;
  const dq = card('dq');
  const perf = card('perf');
  const cost = card('cost');
  const totalRecos = rollup.recos.open + rollup.recos.critical;
  const recoTone =
    rollup.recos.critical > 0
      ? 'text-red-600 dark:text-red-400'
      : rollup.recos.open > 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <StripPill label="DQ" value={fmtMetric(dq)} />
      <StripPill label="Fail" value={fmtMetric(perf)} />
      <StripPill label="Cost" value={fmtMetric(cost)} />
      <StripPill label="Recos" value={`${totalRecos}`} tone={recoTone} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'explore_design' | 'workflow';

interface ProjectWithMembers extends Project {
  contributors: Contributor[];
  loadingMembers: boolean;
}

// ---------------------------------------------------------------------------
// Project Row
// ---------------------------------------------------------------------------

function ProjectRow({
  project,
  expanded,
  onToggle,
  onRefreshMembers,
  onAddMember,
  onRemoveMember,
  currentUsername,
}: {
  project: ProjectWithMembers;
  expanded: boolean;
  onToggle: () => void;
  onRefreshMembers: () => void;
  onAddMember: (username: string, role: 'editor' | 'viewer') => void;
  onRemoveMember: (username: string) => void;
  currentUsername: string;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('viewer');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const owner = project.contributors.find((c) => c.role === 'owner');
  const memberCount = project.contributors.length;
  const isTypeExplore = project.project_type === 'explore_design';

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}

        {/* Project info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
              {project.project_name}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                isTypeExplore
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              )}
            >
              {isTypeExplore ? 'Explore & Design' : 'Workflow'}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium',
                project.status === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
              )}
            >
              {project.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {owner && <span>Owner: {owner.username}</span>}
            <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
            {project.created_at && (
              <span>Created {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}</span>
            )}
          </div>
          {/* G7 per-project KPI strip (DQ% · PERF fail% · cost · N recos) from the rollup */}
          <ProjectScoreStrip projectId={project.project_id} />
        </div>

        {/* Member avatars */}
        <div className="flex -space-x-2">
          {project.contributors.slice(0, 4).map((c) => {
            const cfg = ROLE_CONFIG[c.role];
            return (
              <div
                key={c.contributor_id}
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white dark:border-slate-800',
                  c.role === 'owner'
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                    : c.role === 'editor'
                    ? 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white'
                    : 'bg-gradient-to-br from-slate-400 to-gray-500 text-white',
                )}
                title={`${c.username} (${cfg.label})`}
              >
                {getInitials(c.username)}
              </div>
            );
          })}
          {memberCount > 4 && (
            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
              +{memberCount - 4}
            </div>
          )}
        </div>
      </button>

      {/* Expanded members */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          {/* Unified collaborative view: lock · runs-health · deploy state ·
              activity feed · G6 score cards · comments placeholder */}
          <ProjectCollaborationPanel projectId={project.project_id} />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <Tooltip content="Add member">
                <Button
                  size="sm"
                  variant={showAddForm ? 'solid' : 'outline'}
                  className={cn('h-6 w-6 p-0', showAddForm && 'bg-blue-600 text-white hover:bg-blue-700')}
                  onClick={() => { setShowAddForm(!showAddForm); setNewUsername(''); }}
                >
                  {showAddForm ? <X className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                </Button>
              </Tooltip>
              <Tooltip content="Refresh">
                <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={onRefreshMembers}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-2">
                <Input
                  size="sm"
                  placeholder="Enter username..."
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUsername.trim()) {
                      onAddMember(newUsername.trim(), newRole);
                      setNewUsername('');
                    }
                  }}
                />
                <div className="flex items-center gap-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5">
                  <button
                    onClick={() => setNewRole('viewer')}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-all',
                      newRole === 'viewer' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    Viewer
                  </button>
                  <button
                    onClick={() => setNewRole('editor')}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-all',
                      newRole === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    Editor
                  </button>
                </div>
                <Button
                  size="sm"
                  className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  disabled={!newUsername.trim()}
                  onClick={() => {
                    onAddMember(newUsername.trim(), newRole);
                    setNewUsername('');
                  }}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Loading */}
          {project.loadingMembers ? (
            <div className="flex items-center justify-center py-4 gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading members...
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {project.contributors.map((c) => {
                const cfg = ROLE_CONFIG[c.role];
                const RoleIcon = cfg.icon;
                const isOwner = c.role === 'owner';
                const isMe = c.username.toLowerCase() === currentUsername.toLowerCase();

                if (confirmRemove === c.username) {
                  return (
                    <div key={c.contributor_id} className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/10">
                      <Trash2 className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="text-xs text-red-700 dark:text-red-300 flex-1">
                        Remove <strong>{c.username}</strong>?
                      </span>
                      <Button
                        size="sm"
                        className="h-5 px-1.5 text-[10px] bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => { onRemoveMember(c.username); setConfirmRemove(null); }}
                      >
                        Yes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={() => setConfirmRemove(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  );
                }

                return (
                  <div key={c.contributor_id} className="group flex items-center gap-2.5 px-4 py-2 hover:bg-white dark:hover:bg-slate-700/30 transition-colors">
                    <div
                      className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        c.role === 'owner'
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                          : c.role === 'editor'
                          ? 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white'
                          : 'bg-gradient-to-br from-slate-400 to-gray-500 text-white',
                      )}
                    >
                      {getInitials(c.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                          {c.username}
                        </span>
                        {isMe && (
                          <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                            you
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full', cfg.cls)}>
                          <RoleIcon className="h-2.5 w-2.5" />
                          {cfg.label}
                        </span>
                        {c.added_at && !isNaN(new Date(c.added_at).getTime()) && (
                          <span className="text-[10px] text-slate-400">
                            {formatDistanceToNow(new Date(c.added_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isOwner && !isMe && (
                      <button
                        onClick={() => setConfirmRemove(c.username)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

// FilterTab values that are valid `?tab=` query values ('all' is the default,
// represented as the absence of the param).
function parseTab(raw: string | null): FilterTab {
  return raw === 'explore_design' || raw === 'workflow' ? raw : 'all';
}

function ProjectsGovernancePageInner() {
  const { username: currentUsername } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<ProjectWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  // G8: project + filter selection is restorable from the URL so a shared link
  // reopens the same project panel. Lazy-init from `?project` / `?tab` so the
  // first paint already reflects the deep-link (localStorage stays the default
  // elsewhere — the URL is purely additive/shareable here).
  const [expandedId, setExpandedId] = useState<string | null>(() => searchParams.get('project'));
  const [activeTab, setActiveTab] = useState<FilterTab>(() => parseTab(searchParams.get('tab')));
  const [search, setSearch] = useState('');

  // Merge a single query param into the current URL via a shallow replace
  // (preserves sibling params; no scroll jump; null clears the param).
  const setUrlParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // URL → state sync (covers browser back/forward). Read-only: state only changes
  // when it differs from the URL, so the writes above never loop back here.
  useEffect(() => {
    const p = searchParams.get('project');
    setExpandedId((prev) => (prev === p ? prev : p));
    const t = parseTab(searchParams.get('tab'));
    setActiveTab((prev) => (prev === t ? prev : t));
  }, [searchParams]);

  const handleToggle = useCallback(
    (projectId: string) => {
      const next = expandedId === projectId ? null : projectId;
      setExpandedId(next);
      setUrlParam('project', next);
    },
    [expandedId, setUrlParam],
  );

  const handleTabChange = useCallback(
    (tab: FilterTab) => {
      setActiveTab(tab);
      setUrlParam('tab', tab === 'all' ? null : tab);
    },
    [setUrlParam],
  );

  // Fetch all projects + their contributors
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProjects();
      const projectList: ProjectWithMembers[] = (res.projects || []).map((p) => ({
        ...p,
        contributors: [],
        loadingMembers: true,
      }));
      setProjects(projectList);

      // Fetch contributors for each project in parallel
      const updated = await Promise.all(
        projectList.map(async (p) => {
          try {
            const contribs = await listContributors(p.project_id);
            return { ...p, contributors: contribs, loadingMembers: false };
          } catch {
            return { ...p, contributors: [], loadingMembers: false };
          }
        }),
      );
      setProjects(updated);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Refresh a single project's members
  const refreshMembers = useCallback(async (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.project_id === projectId ? { ...p, loadingMembers: true } : p)),
    );
    try {
      const contribs = await listContributors(projectId);
      setProjects((prev) =>
        prev.map((p) => (p.project_id === projectId ? { ...p, contributors: contribs, loadingMembers: false } : p)),
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      setProjects((prev) =>
        prev.map((p) => (p.project_id === projectId ? { ...p, loadingMembers: false } : p)),
      );
    }
  }, []);

  // Add member
  const handleAddMember = useCallback(
    async (projectId: string, username: string, role: 'editor' | 'viewer') => {
      try {
        const added = await addContributor(projectId, { username, role });
        setProjects((prev) =>
          prev.map((p) =>
            p.project_id === projectId
              ? { ...p, contributors: [...p.contributors, added] }
              : p,
          ),
        );
        toast.success(`Added ${added.username} as ${added.role}`);
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [],
  );

  // Remove member
  const handleRemoveMember = useCallback(
    async (projectId: string, username: string) => {
      try {
        await removeContributor(projectId, username);
        setProjects((prev) =>
          prev.map((p) =>
            p.project_id === projectId
              ? { ...p, contributors: p.contributors.filter((c) => c.username !== username) }
              : p,
          ),
        );
        toast.success(`Removed ${username}`);
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [],
  );

  // Filtered + searched projects
  const filtered = useMemo(() => {
    let list = projects;
    if (activeTab !== 'all') {
      list = list.filter((p) => p.project_type === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.project_name.toLowerCase().includes(q) ||
          p.created_by.toLowerCase().includes(q) ||
          p.contributors.some((c) => c.username.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [projects, activeTab, search]);

  // Stats
  const stats = useMemo(() => {
    const total = projects.length;
    const explore = projects.filter((p) => p.project_type === 'explore_design').length;
    const workflow = projects.filter((p) => p.project_type === 'workflow').length;
    const totalMembers = new Set(projects.flatMap((p) => p.contributors.map((c) => c.username))).size;
    return { total, explore, workflow, totalMembers };
  }, [projects]);

  // Pending deployments
  const [pendingDeploys, setPendingDeploys] = useState<any[]>([]);
  const [deployActionLoading, setDeployActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ projectId: string; deploymentId: string; projectName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchPendingDeploys = useCallback(async () => {
    try {
      const overview = await getProjectsOverview({ days: 90 });
      setPendingDeploys(Array.isArray(overview?.pending_approvals) ? overview.pending_approvals : []);
    } catch {
      // Silently fail — non-critical
    }
  }, []);

  useEffect(() => {
    fetchPendingDeploys();
  }, [fetchPendingDeploys]);

  const handleApproveDeploy = useCallback(async (projectId: string, deploymentId: string, projectName: string) => {
    if (deployActionLoading) return;
    setDeployActionLoading(deploymentId);
    try {
      await approveDeployment(projectId, deploymentId);
      toast.success(`Deployment approved for ${projectName} — deploying now...`);
      await Promise.all([fetchPendingDeploys(), fetchAll()]);
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      // If already processed (404), just refresh the list silently
      if (err?.response?.status === 404) {
        toast.success(`Deployment already processed for ${projectName}`);
        await Promise.all([fetchPendingDeploys(), fetchAll()]);
      } else {
        toast.error(typeof msg === 'string' ? msg : 'Deployment action failed');
      }
    } finally {
      setDeployActionLoading(null);
    }
  }, [deployActionLoading, fetchPendingDeploys, fetchAll]);

  const handleRejectDeploy = useCallback(async () => {
    if (!rejectModal || deployActionLoading) return;
    setDeployActionLoading(rejectModal.deploymentId);
    try {
      await rejectDeployment(rejectModal.projectId, rejectModal.deploymentId, { reason: rejectReason || undefined });
      toast.success(`Deployment rejected for ${rejectModal.projectName}`);
      setRejectModal(null);
      setRejectReason('');
      // Refresh BOTH pending list AND project list
      await Promise.all([fetchPendingDeploys(), fetchAll()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setDeployActionLoading(null);
    }
  }, [rejectModal, deployActionLoading, rejectReason, fetchPendingDeploys, fetchAll]);

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'explore_design', label: 'Explore & Design', count: stats.explore },
    { id: 'workflow', label: 'Workflow', count: stats.workflow },
  ];

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      <PageHeader
        icon={<FolderOpen className="h-6 w-6" />}
        title="Projects"
        subtitle="Manage project members and access across Explore & Design and Workflow modules"
        color="violet"
        badges={
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400 px-3 py-1 text-sm font-medium">
              {stats.total} Projects
            </Badge>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">
              {stats.totalMembers} Members
            </Badge>
          </div>
        }
        actions={
          <Button
            variant="outline"
            className="gap-2"
            onClick={fetchAll}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      {/* Pending Deployments */}
      {pendingDeploys.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Rocket className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Pending Deployment Approvals
            </h3>
            <Badge className="bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
              {pendingDeploys.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {pendingDeploys.map((d: any, i: number) => (
              <div key={d.deployment_id || i} className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{d.project_name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                      {d.project_type?.replace(/_/g, ' ')}
                    </span>
                    <Badge size="sm" variant="flat" color="warning">{d.environment}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="h-3 w-3" />
                    Requested by {d.requested_by}
                    {d.requested_at && ` — ${formatDistanceToNow(new Date(d.requested_at), { addSuffix: true })}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleApproveDeploy(d.project_id, d.deployment_id, d.project_name)}
                    disabled={deployActionLoading === d.deployment_id}
                    className="rounded-lg bg-green-100 dark:bg-green-900/30 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {deployActionLoading === d.deployment_id ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setRejectModal({ projectId: d.project_id, deploymentId: d.deployment_id, projectName: d.project_name })}
                    disabled={deployActionLoading === d.deployment_id}
                    className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject Deployment Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="button" tabIndex={0} aria-label="Close modal" onClick={() => setRejectModal(null)} onKeyDown={(e) => e.key === 'Escape' && setRejectModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Reject Deployment</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Reject deployment for <span className="font-medium text-gray-900 dark:text-white">{rejectModal.projectName}</span>
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none"
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectDeploy}
                disabled={deployActionLoading === rejectModal.deploymentId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deployActionLoading === rejectModal.deploymentId ? 'Rejecting...' : 'Reject Deployment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6 space-y-4">
        {/* Tabs + Search */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'text-violet-600 border-violet-600'
                    : 'text-slate-500 border-transparent hover:text-slate-700',
                )}
              >
                {tab.label}
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[11px] font-medium">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              size="sm"
              placeholder="Search projects or members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading projects...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {search ? 'No projects match your search' : 'No projects found'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((project) => (
              <ProjectRow
                key={project.project_id}
                project={project}
                expanded={expandedId === project.project_id}
                onToggle={() => handleToggle(project.project_id)}
                onRefreshMembers={() => refreshMembers(project.project_id)}
                onAddMember={(username, role) => handleAddMember(project.project_id, username, role)}
                onRemoveMember={(username) => handleRemoveMember(project.project_id, username)}
                currentUsername={currentUsername}
              />
            ))}
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}

// useSearchParams() requires a Suspense boundary in the App Router (otherwise
// `next build` throws / the whole page de-opts to client rendering).
export default function ProjectsGovernancePage() {
  return (
    <Suspense fallback={null}>
      <ProjectsGovernancePageInner />
    </Suspense>
  );
}
