'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button, Badge, Input, Tooltip, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  FolderOpen, Plus, RefreshCw, ChevronDown, Check, X, Loader2,
  FolderPlus, Clock, User, Search, Users, Crown, Pencil, Eye, Trash2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listProjects, addContributor } from '@/app/services/api/projectsApi';
import { createExploreProject } from '@/app/services/api/exploreDesignApi';
import type { Project as ApiProject } from '@/app/services/api/types';
import { getUsers } from '@/app/services/gouvernance/fetch_users';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useSession } from 'next-auth/react';

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
}: ProjectSelectorProps) {
  const { data: session } = useSession();
  const currentUsername = (session?.user as any)?.username || '';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedInModal, setSelectedInModal] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');

  // Team members for new project
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRole, setMemberRole] = useState<'editor' | 'viewer'>('viewer');
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const mountedRef = useRef(true);
  const memberInputRef = useRef<HTMLInputElement>(null);

  const { wasInvalidated } = useCacheInvalidationWatcher([CACHE_KEYS.PROJECTS]);

  // Filtered projects for search
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.created_by.toLowerCase().includes(q),
    );
  }, [projects, projectSearch]);

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

  // Fetch explore projects
  const fetchProjects = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await listProjects({ project_type: 'explore_design', mine_only: true });

      if (!response.projects || response.projects.length === 0) {
        if (mountedRef.current) setProjects([]);
        return;
      }

      const mappedProjects: Project[] = response.projects.map((p: ApiProject) => ({
        project_id: p.project_id,
        name: p.project_name,
        created_by: p.created_by,
        status: p.status,
        created_at: p.created_at,
      }));

      if (mountedRef.current) {
        setProjects(mappedProjects);
      }
    } catch (error: any) {
      console.error('[ProjectSelector] Error fetching projects:', error);
      if (mountedRef.current) {
        toast.error('Failed to fetch projects');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchProjects();
    return () => { mountedRef.current = false; };
  }, [fetchProjects]);

  useEffect(() => {
    if (wasInvalidated && !loading) {
      fetchProjects(true);
    }
  }, [wasInvalidated, loading, fetchProjects]);

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

      const newProject: Project = {
        project_id: response.project_id,
        name: newProjectName.trim(),
        created_by: 'You',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      };

      setProjects((prev) => [newProject, ...prev]);
      onProjectSelect(response.project_id, newProjectName.trim());
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

  const handleSelectProject = () => {
    if (!selectedInModal) {
      toast.error('Please select a project');
      return;
    }
    const project = projects.find((p) => p.project_id === selectedInModal);
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

  const selectedProject = projects.find((p) => p.project_id === selectedProjectId);
  const autoSelectedRef = useRef(false);

  // Auto-select project from URL query param (e.g., ?project_id=xxx)
  useEffect(() => {
    if (autoSelectedRef.current || loading || !autoSelectProjectId) return;
    const match = projects.find((p) => p.project_id === autoSelectProjectId);
    if (match) {
      autoSelectedRef.current = true;
      onProjectSelect(match.project_id, match.name);
    }
  }, [loading, projects, autoSelectProjectId, onProjectSelect]);

  useEffect(() => {
    if (!loading && !selectedProjectId && !autoSelectProjectId && projects.length >= 0) {
      setShowModal(true);
    }
  }, [loading, selectedProjectId, autoSelectProjectId, projects.length]);

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
          {isRefreshing ? (
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
          if (selectedProjectId) {
            setShowModal(false);
          } else {
            toast.error('Please select or create a project to continue');
          }
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
                  onClick={() => fetchProjects(true)}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={cn('h-4.5 w-4.5 text-slate-400', isRefreshing && 'animate-spin')}
                  />
                </button>
              </Tooltip>
              {selectedProjectId && (
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => setShowModal(false)}
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
                {projects.length > 0 && (
                  <span className="text-xs text-slate-400">{projects.length} projects</span>
                )}
              </div>

              {/* Search */}
              {projects.length > 3 && (
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
              ) : projects.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-slate-500 font-medium text-sm">No projects yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Create your first project to get started
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-[320px] overflow-auto space-y-1.5 mb-3">
                    {filteredProjects.map((project) => {
                      const isSelected = selectedInModal === project.project_id;
                      return (
                        <button
                          key={project.project_id}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all',
                            'border dark:border-slate-700',
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-1 ring-blue-400'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent',
                          )}
                          onClick={() => setSelectedInModal(project.project_id)}
                          onDoubleClick={() => {
                            setSelectedInModal(project.project_id);
                            onProjectSelect(project.project_id, project.name);
                            setShowModal(false);
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
                            <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
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
                <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
