'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Badge, Input, Tooltip, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  FolderOpen, Plus, RefreshCw, ChevronDown, Check, X, Loader2,
  FolderPlus, Clock, User, Search, Trash2, LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listProjects } from '@/app/services/api/projectsApi';
import { createDashboard, deleteDashboard } from '@/app/services/api/biDashboardApi';
import type { Project as ApiProject } from '@/app/services/api/types';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
// useSession removed — get username from localStorage token instead
// import { useSession } from 'next-auth/react';
import { getApiErrorMessage } from '@/lib/api-client';

interface DashboardProject {
  project_id: string;
  name: string;
  created_by: string;
  status: string;
  created_at: string | null;
}

interface DashboardSelectorProps {
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string, projectName: string) => void;
  onBrowseSamples?: () => void;
  className?: string;
}

export default function DashboardSelector({
  selectedProjectId,
  onProjectSelect,
  onBrowseSamples,
  className,
}: DashboardSelectorProps) {
  const [showModal, setShowModal] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [defaultDatabase, setDefaultDatabase] = useState('CP_DATA360');
  const [defaultSchema, setDefaultSchema] = useState('RETAIL_DW');
  const [isCreating, setIsCreating] = useState(false);

  // Database/schema options
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // Selection
  const [selectedInModal, setSelectedInModal] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch dashboard projects
  const fetchProjectsFn = useCallback(async (): Promise<DashboardProject[]> => {
    const response = await listProjects({ project_type: 'bi_dashboard', mine_only: false });
    return (response.projects || []).map((p: ApiProject) => ({
      project_id: p.project_id,
      name: p.project_name,
      created_by: p.created_by,
      status: p.status,
      created_at: p.created_at,
    }));
  }, []);

  const { data: projects, loading, isStale, refetch } = useCacheAwareQuery<DashboardProject[]>(
    fetchProjectsFn,
    { cacheKeys: [CACHE_KEYS.PROJECTS, CACHE_KEYS.BI_DASHBOARDS], initialData: [] }
  );

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

  // Fetch databases on modal open
  useEffect(() => {
    if (!showModal || databases.length > 0) return;
    let cancelled = false;
    setLoadingDbs(true);
    getDatabases()
      .then((dbs) => { if (!cancelled) setDatabases(Array.isArray(dbs) ? dbs : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingDbs(false); });
    return () => { cancelled = true; };
  }, [showModal, databases.length]);

  // Fetch schemas when database changes
  useEffect(() => {
    if (!defaultDatabase) { setSchemas([]); setDefaultSchema(''); return; }
    let cancelled = false;
    setLoadingSchemas(true);
    getSchemas(defaultDatabase)
      .then((s) => { if (!cancelled) setSchemas(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSchemas(false); });
    return () => { cancelled = true; };
  }, [defaultDatabase]);

  // Auto-open modal if no project selected
  useEffect(() => {
    if (!loading && !selectedProjectId) setShowModal(true);
  }, [loading, selectedProjectId]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Dashboard name is required'); return; }
    setIsCreating(true);
    try {
      const response = await createDashboard({
        project_name: newName.trim(),
        description: newDescription.trim() || undefined,
        default_database: defaultDatabase || undefined,
        default_schema: defaultSchema || undefined,
      });
      toast.success(`Dashboard "${newName}" created`);
      onProjectSelect(response.project_id, newName.trim());
      refetch();
      resetForm();
      setShowModal(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      await deleteDashboard(projectId);
      refetch();
      if (selectedProjectId === projectId) onProjectSelect('', '');
      if (selectedInModal === projectId) setSelectedInModal(null);
      toast.success('Dashboard deleted');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewDescription('');
    setDefaultDatabase('');
    setDefaultSchema('');
  };

  const handleSelectProject = () => {
    if (!selectedInModal) { toast.error('Please select a dashboard'); return; }
    const project = safeProjects.find((p) => p.project_id === selectedInModal);
    if (project) {
      onProjectSelect(project.project_id, project.name);
      setShowModal(false);
      setSelectedInModal(null);
    }
  };

  const selectedProject = safeProjects.find((p) => p.project_id === selectedProjectId);

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
          <LayoutDashboard
            className={cn(
              'h-4 w-4 flex-shrink-0',
              selectedProjectId ? 'text-blue-500' : 'text-amber-500',
            )}
          />
          <span className="flex-1 text-left truncate">
            {loading ? (
              <span className="text-slate-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading...
              </span>
            ) : selectedProject ? (
              selectedProject.name
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium">Select Dashboard</span>
            )}
          </span>
          {isStale ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>
      </div>

      {/* Dashboard Management Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        customSize="860px"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20">
                <LayoutDashboard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  BI Dashboard
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create a new dashboard or select an existing one
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip content="Refresh">
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => refetch()}
                  disabled={isStale}
                >
                  <RefreshCw className={cn('h-4.5 w-4.5 text-slate-400', isStale && 'animate-spin')} />
                </button>
              </Tooltip>
              <button
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setShowModal(false)}
              >
                <X className="h-4.5 w-4.5 text-slate-400" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Create */}
            <div className="border dark:border-slate-700 rounded-xl p-5 bg-gradient-to-br from-cyan-50/80 to-blue-50/80 dark:from-cyan-900/15 dark:to-blue-900/15">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-cyan-100 dark:bg-cyan-900/40 rounded-lg">
                  <FolderPlus className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Create New Dashboard
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Dashboard Name *
                  </label>
                  <Input
                    type="text"
                    size="sm"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Sales Dashboard"
                    className="w-full"
                    disabled={isCreating}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Description
                  </label>
                  <Input
                    type="text"
                    size="sm"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description (optional)"
                    className="w-full"
                    disabled={isCreating}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Default Database
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm"
                    value={defaultDatabase}
                    onChange={(e) => setDefaultDatabase(e.target.value)}
                    disabled={isCreating || loadingDbs}
                  >
                    <option value="">Select database...</option>
                    {databases.map((db) => (
                      <option key={db} value={db}>{db}</option>
                    ))}
                  </select>
                </div>

                {defaultDatabase && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Default Schema
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm"
                      value={defaultSchema}
                      onChange={(e) => setDefaultSchema(e.target.value)}
                      disabled={isCreating || loadingSchemas}
                    >
                      <option value="">Select schema...</option>
                      {schemas.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                <Button
                  className="w-full gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white shadow-md shadow-cyan-500/20 mt-1"
                  onClick={handleCreate}
                  disabled={isCreating || !newName.trim()}
                >
                  {isCreating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Create Dashboard</>
                  )}
                </Button>
              </div>
            </div>

            {/* Right: Select Existing */}
            <div className="border dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <FolderOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Select Existing
                  </h3>
                </div>
                {safeProjects.length > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">{safeProjects.length} dashboards</span>
                )}
              </div>

              {safeProjects.length > 3 && (
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    size="sm"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search dashboards..."
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
                  <LayoutDashboard className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No dashboards yet</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Create your first dashboard</p>
                </div>
              ) : (
                <>
                  <div className="max-h-[320px] overflow-auto space-y-1.5 mb-3">
                    {filteredProjects.map((project) => {
                      const isSelected = selectedInModal === project.project_id;
                      return (
                        <div
                          key={project.project_id}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg transition-all border dark:border-slate-700',
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-1 ring-blue-400'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent',
                          )}
                        >
                          <button
                            className="flex-1 flex items-center gap-3 text-left"
                            onClick={() => setSelectedInModal(project.project_id)}
                            onDoubleClick={() => {
                              onProjectSelect(project.project_id, project.name);
                              setShowModal(false);
                            }}
                          >
                            <div className={cn(
                              'p-1.5 rounded-lg flex-shrink-0',
                              isSelected ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-800',
                            )}>
                              <LayoutDashboard className={cn('h-4 w-4', isSelected ? 'text-blue-600' : 'text-slate-400')} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-sm font-medium truncate text-slate-700 dark:text-slate-300', isSelected && 'text-blue-700 dark:text-blue-400')}>
                                {project.name}
                              </p>
                              <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1">
                                  <User className="h-2.5 w-2.5" /> {project.created_by}
                                </span>
                                {project.created_at && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" />
                                    {new Date(project.created_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                          </button>
                          <Tooltip content="Delete dashboard">
                            <button
                              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                                  handleDelete(project.project_id);
                                }
                              }}
                              disabled={deletingId === project.project_id}
                            >
                              {deletingId === project.project_id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </Tooltip>
                        </div>
                      );
                    })}
                    {filteredProjects.length === 0 && projectSearch && (
                      <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                        No dashboards match &quot;{projectSearch}&quot;
                      </div>
                    )}
                  </div>

                  <Button className="w-full gap-2" onClick={handleSelectProject} disabled={!selectedInModal}>
                    <Check className="h-4 w-4" /> Open Selected Dashboard
                  </Button>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1.5">
                    Tip: Double-click to open directly
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Browse Samples */}
          {onBrowseSamples && (
            <div className="mt-5 pt-4 border-t dark:border-slate-700">
              <button
                onClick={() => { setShowModal(false); onBrowseSamples(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-sm font-medium"
              >
                <Sparkles className="h-4 w-4" />
                Browse Sample Dashboards
              </button>
            </div>
          )}

          {selectedProjectId && (
            <div className={cn('pt-4 border-t dark:border-slate-700', onBrowseSamples ? 'mt-3' : 'mt-5')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Currently editing:{' '}
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
