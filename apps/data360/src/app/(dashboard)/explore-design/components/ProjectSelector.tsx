'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button, Badge, Input, Tooltip, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  FolderOpen, Plus, RefreshCw, ChevronDown, Check, X, Loader2,
  FolderPlus, Clock, User, Search, Users, Crown, Pencil, Eye, Trash2,
  Sparkles,
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

interface Project {
  project_id: string;
  name: string;
  created_by: string;
  status: string;
  created_at: string | null;
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

  // Fetch explore projects (declared early so safeProjects below can reference it)
  const fetchProjectsFn = useCallback(async (): Promise<Project[]> => {
    // mine_only=false: account admins should see all explore-design projects, not
    // just ones they personally created. Backend's "mine" predicate is contributor-
    // based and returns 0 for accountadmins on projects they made.
    const response = await listProjects({ project_type: 'explore_design', mine_only: false });
    if (!response.projects || response.projects.length === 0) return [];
    return response.projects.map((p: ApiProject) => ({
      project_id: p.project_id,
      name: p.project_name,
      created_by: p.created_by,
      status: p.status,
      created_at: p.created_at,
    }));
  }, []);

  const { data: projects, loading, isStale, refetch } = useCacheAwareQuery<Project[]>(
    fetchProjectsFn,
    { cacheKeys: [CACHE_KEYS.PROJECTS], initialData: [] }
  );

  // Filtered projects for search
  const safeProjects = projects ?? [];
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return safeProjects;
    const q = projectSearch.toLowerCase();
    return safeProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.created_by.toLowerCase().includes(q),
    );
  }, [safeProjects, projectSearch]);

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

  const handleSelectProject = () => {
    if (!selectedInModal) {
      toast.error('Please select a project');
      return;
    }
    const project = safeProjects.find((p) => p.project_id === selectedInModal);
    if (project) {
      onProjectSelect(project.project_id, project.name);
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

  // Auto-open project management when no project is selected so the user
  // always has a visible way to switch / create / list projects. The modal
  // already exposes a "Create New Project" panel; the inline wizard
  // (`onCreateRequested`) remains reachable from inside the modal.
  useEffect(() => {
    if (!loading && !selectedProjectId) {
      setShowModal(true);
    }
  }, [loading, selectedProjectId]);

  return (
    <>
      {/* Compact Selector Button */}
      <div className={cn('relative', className)}>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg',
            'bg-white dark:bg-slate-800 dark:border-slate-700',
            'hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',
            'min-w-[180px] max-w-[280px]',
            !selectedProjectId && 'border-amber-300 bg-amber-50 dark:bg-amber-900/20',
          )}
          onClick={() => setShowModal(true)}
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
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>
      </div>

      {/* Project Management Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          if (!selectedProjectId) {
            if (isDirty) {
              setShowDiscardConfirm(true);
            } else {
              toast.error('Please select or create a project to continue');
            }
            return;
          }
          attemptCloseModal();
        }}
        customSize="860px"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
                <FolderOpen className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Project Management
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create a new project or select an existing one to continue
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip content="Refresh projects">
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => refetch()}
                  disabled={isStale}
                >
                  <RefreshCw
                    className={cn('h-4.5 w-4.5 text-slate-400', isStale && 'animate-spin')}
                  />
                </button>
              </Tooltip>
              {(selectedProjectId || isDirty) && (
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={attemptCloseModal}
                  aria-label="Close project management"
                >
                  <X className="h-4.5 w-4.5 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Left: Create New Project ── */}
            <div className="border dark:border-slate-700 rounded-xl p-5 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/15 dark:to-indigo-900/15">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                  <FolderPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Create New Project
                </h3>
              </div>

              <div className="space-y-3">
                {/* Project Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Project Name *
                  </label>
                  <Input
                    type="text"
                    size="sm"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., Customer Analytics Pipeline"
                    className="w-full"
                    disabled={isCreating}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Description
                  </label>
                  <Input
                    type="text"
                    size="sm"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Brief description (optional)"
                    className="w-full"
                    disabled={isCreating}
                  />
                </div>

                {/* Team Members */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    <Users className="h-3 w-3" />
                    Team Members
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
                </div>

                {/* Create Button */}
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 mt-1"
                  onClick={handleCreateProject}
                  disabled={isCreating || !newProjectName.trim()}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Create Project
                      {teamMembers.length > 0 && (
                        <Badge size="sm" className="ml-1 bg-white/20 text-white text-[10px] px-1.5">
                          +{teamMembers.length}
                        </Badge>
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* ── Right: Select Existing Project ── */}
            <div className="border dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <FolderOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Select Existing Project
                  </h3>
                </div>
                {safeProjects.length > 0 && (
                  <span className="text-xs text-slate-400">{safeProjects.length} projects</span>
                )}
              </div>

              {/* Search */}
              {safeProjects.length > 3 && (
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    size="sm"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="pl-8"
                  />
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : safeProjects.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-slate-500 font-medium text-sm">No projects yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Create your first project to get started
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="max-h-[320px] overflow-auto space-y-1.5 mb-3"
                    role="listbox"
                    aria-label="Existing projects"
                  >
                    {filteredProjects.map((project, idx) => {
                      const isSelected = selectedInModal === project.project_id;
                      return (
                        <button
                          key={project.project_id}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={0}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all select-none',
                            'border dark:border-slate-700',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500 ring-offset-2'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent',
                          )}
                          onClick={() => setSelectedInModal(project.project_id)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            setSelectedInModal(project.project_id);
                            onProjectSelect(project.project_id, project.name);
                            setShowModal(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              setSelectedInModal(project.project_id);
                              onProjectSelect(project.project_id, project.name);
                              setShowModal(false);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next = filteredProjects[idx + 1];
                              if (next) {
                                setSelectedInModal(next.project_id);
                                const el = e.currentTarget.parentElement?.children[idx + 1] as HTMLElement | undefined;
                                el?.focus();
                              }
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              const prev = filteredProjects[idx - 1];
                              if (prev) {
                                setSelectedInModal(prev.project_id);
                                const el = e.currentTarget.parentElement?.children[idx - 1] as HTMLElement | undefined;
                                el?.focus();
                              }
                            }
                          }}
                        >
                          <div
                            className={cn(
                              'p-1.5 rounded-lg flex-shrink-0',
                              isSelected
                                ? 'bg-blue-100 dark:bg-blue-900/50'
                                : 'bg-slate-100 dark:bg-slate-800',
                            )}
                          >
                            <FolderOpen
                              className={cn(
                                'h-4 w-4',
                                isSelected ? 'text-blue-600' : 'text-slate-400',
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                'text-sm font-medium truncate',
                                isSelected && 'text-blue-700 dark:text-blue-400',
                              )}
                            >
                              {project.name}
                            </p>
                            <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <User className="h-2.5 w-2.5" />
                                {project.created_by}
                              </span>
                              {project.created_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {new Date(project.created_at).toLocaleDateString()}
                                </span>
                              )}
                              {project.status && (
                                <span
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                    project.status === 'ACTIVE'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-slate-100 text-slate-600',
                                  )}
                                >
                                  {project.status.toLowerCase()}
                                </span>
                              )}
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                  project.created_by.toLowerCase() === currentUsername.toLowerCase()
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                )}
                              >
                                {project.created_by.toLowerCase() === currentUsername.toLowerCase() ? 'owner' : 'contributor'}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <PiCheckCircleDuotone
                              className="h-5 w-5 text-blue-600 flex-shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                    {filteredProjects.length === 0 && projectSearch && (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No projects match "{projectSearch}"
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={handleSelectProject}
                    disabled={!selectedInModal}
                  >
                    <Check className="h-4 w-4" />
                    Continue with Selected Project
                  </Button>
                  <p className="text-[10px] text-slate-400 text-center mt-1.5">
                    Tip: Double-click a project to open it directly
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Current selection indicator */}
          {selectedProjectId && (
            <div className="mt-5 pt-4 border-t dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Currently working on:{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {selectedProject?.name}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={attemptCloseModal}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Discard-changes confirmation */}
      <Modal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        size="sm"
      >
        <div
          role="alertdialog"
          aria-labelledby="discard-changes-title"
          aria-describedby="discard-changes-desc"
          className="p-6"
        >
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
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDiscardConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              color="danger"
              onClick={confirmDiscard}
            >
              Discard
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
