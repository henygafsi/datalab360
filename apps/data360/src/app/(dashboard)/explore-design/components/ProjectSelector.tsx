'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Badge, Input, Tooltip, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  FolderOpen, Plus, RefreshCw, ChevronDown, Check, X, Loader2,
  FolderPlus, Clock, User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getExploreProjects, createExploreProject, ExploreProject } from '@/app/services/explore-design';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

interface Project {
  project_id: string;
  name: string;
  created_by: string;
  status: string;
  created_at: string | null;
}

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string, projectName: string) => void;
  className?: string;
}

export default function ProjectSelector({
  selectedProjectId,
  onProjectSelect,
  className
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedInModal, setSelectedInModal] = useState<string | null>(null);

  const mountedRef = useRef(true);

  // Watch for SSE cache invalidation events on 'projects' key
  const { wasInvalidated } = useCacheInvalidationWatcher([CACHE_KEYS.PROJECTS]);

  // Fetch explore projects from backend
  const fetchProjects = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await getExploreProjects();
      console.log('[ProjectSelector] Fetched explore projects:', response);

      if (!response.projects || response.projects.length === 0) {
        if (mountedRef.current) setProjects([]);
        return;
      }

      // Map explore projects to internal format
      const mappedProjects: Project[] = response.projects.map((p: ExploreProject) => ({
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

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchProjects();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchProjects]);

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] Projects cache invalidated - refreshing...');
      fetchProjects(true);
    }
  }, [wasInvalidated, loading, fetchProjects]);

  // Handle project creation
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsCreating(true);

    try {
      const response = await createExploreProject(newProjectName.trim());

      toast.success(`Project "${newProjectName}" created successfully!`);

      // Add new project to list and select it
      const newProject: Project = {
        project_id: response.project_id,
        name: newProjectName.trim(),
        created_by: 'You',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      };

      setProjects(prev => [newProject, ...prev]);
      onProjectSelect(response.project_id, newProjectName.trim());
      setNewProjectName('');
      setShowModal(false);
    } catch (error: any) {
      console.error('[ProjectSelector] Error creating project:', error);
      toast.error(`Failed to create project: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle selecting existing project
  const handleSelectProject = () => {
    if (!selectedInModal) {
      toast.error('Please select a project');
      return;
    }
    const project = projects.find(p => p.project_id === selectedInModal);
    if (project) {
      onProjectSelect(project.project_id, project.name);
      setShowModal(false);
      setSelectedInModal(null);
    }
  };

  const selectedProject = projects.find(p => p.project_id === selectedProjectId);

  // Auto-open modal if no project selected and projects are loaded
  useEffect(() => {
    if (!loading && !selectedProjectId && projects.length >= 0) {
      // Show modal automatically when no project is selected
      setShowModal(true);
    }
  }, [loading, selectedProjectId, projects.length]);

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
            !selectedProjectId && 'border-amber-300 bg-amber-50 dark:bg-amber-900/20'
          )}
          onClick={() => setShowModal(true)}
        >
          <FolderOpen className={cn(
            'h-4 w-4 flex-shrink-0',
            selectedProjectId ? 'text-blue-500' : 'text-amber-500'
          )} />
          <span className="flex-1 text-left truncate">
            {loading ? (
              <span className="text-slate-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </span>
            ) : selectedProject ? (
              selectedProject.name
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium">Select Project</span>
            )}
          </span>
          {isRefreshing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>
      </div>

      {/* Project Management Modal - Similar to Mapping Step0 */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          // Only allow closing if a project is selected
          if (selectedProjectId) {
            setShowModal(false);
          } else {
            toast.error('Please select or create a project to continue');
          }
        }}
        customSize="700px"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FolderOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Project Management
                </h2>
                <p className="text-sm text-slate-500">
                  Create a new project or select an existing one to continue
                </p>
              </div>
            </div>
            <Tooltip content="Refresh projects">
              <button
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => fetchProjects(true)}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('h-5 w-5 text-slate-400', isRefreshing && 'animate-spin')} />
              </button>
            </Tooltip>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create New Project Section */}
            <div className="border dark:border-slate-700 rounded-xl p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
              <div className="flex items-center gap-2 mb-4">
                <FolderPlus className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Create New Project
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Project Name *
                  </label>
                  <Input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., Customer Analytics Pipeline"
                    className="w-full"
                    disabled={isCreating}
                  />
                </div>

                <Button
                  className="w-full gap-2"
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
                      <Plus className="h-4 w-4" />
                      Create Project
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Select Existing Project Section */}
            <div className="border dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <FolderOpen className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Select Existing Project
                </h3>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 font-medium">No projects yet</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Create your first project to get started
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-[280px] overflow-auto space-y-2 mb-4">
                    {projects.map((project) => (
                      <button
                        key={project.project_id}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                          'border dark:border-slate-700',
                          selectedInModal === project.project_id
                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        )}
                        onClick={() => setSelectedInModal(project.project_id)}
                      >
                        <div className={cn(
                          'p-2 rounded-lg flex-shrink-0',
                          selectedInModal === project.project_id
                            ? 'bg-blue-100 dark:bg-blue-900/50'
                            : 'bg-slate-100 dark:bg-slate-800'
                        )}>
                          <FolderOpen className={cn(
                            'h-4 w-4',
                            selectedInModal === project.project_id
                              ? 'text-blue-600'
                              : 'text-slate-400'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'font-medium truncate',
                            selectedInModal === project.project_id && 'text-blue-700 dark:text-blue-400'
                          )}>
                            {project.name}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {project.created_by}
                            </span>
                            {project.created_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(project.created_at).toLocaleDateString()}
                              </span>
                            )}
                            {project.status && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded text-xs font-medium',
                                project.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                              )}>
                                {project.status}
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedInModal === project.project_id && (
                          <Check className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleSelectProject}
                    disabled={!selectedInModal}
                  >
                    Continue with Selected Project
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Current selection indicator */}
          {selectedProjectId && (
            <div className="mt-6 pt-4 border-t dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Check className="h-4 w-4 text-green-500" />
                  Currently working on: <span className="font-medium text-slate-900 dark:text-white">{selectedProject?.name}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModal(false)}
                >
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
