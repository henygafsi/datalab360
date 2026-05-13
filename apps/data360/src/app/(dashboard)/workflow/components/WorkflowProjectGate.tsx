'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Button, Input, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import { FolderOpen, Plus, Search, Loader2, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listProjects } from '@/app/services/api/projectsApi';
import * as workflowApi from '@/app/services/api/workflowApi';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { getApiErrorMessage } from '@/lib/api-client';
import type { Project as ApiProject } from '@/app/services/api/types';

interface WorkflowProjectGateProps {
  /** When true, the modal is rendered and blocks the canvas. */
  isOpen: boolean;
  /** Called when the user selects an existing workflow or creates a new one. */
  onSelect: (workflowId: string, workflowName: string) => void;
  /** Optional className for the modal wrapper. */
  className?: string;
}

interface ProjectRow {
  project_id: string;
  name: string;
  created_by: string;
  status: string;
  created_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Project gate for the Workflow module.
 *
 * A workflow IS a project (project_type='workflow'), so this modal blocks the
 * canvas until the user either selects an existing workflow or creates a new one.
 * Mirrors the UX of Explore & Design's ProjectSelector without lifting the
 * full ProjectSelector component (it's tied to explore_design endpoints).
 */
export default function WorkflowProjectGate({
  isOpen,
  onSelect,
  className,
}: WorkflowProjectGateProps) {
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Fetch workflow projects (same endpoint the page already uses)
  const fetchFn = useMemo(
    () => async (): Promise<ProjectRow[]> => {
      const res = await listProjects({ project_type: 'workflow', mine_only: false });
      const items = Array.isArray(res?.projects) ? res.projects : [];
      return items.map((p: ApiProject) => ({
        project_id: p.project_id,
        name: p.project_name,
        created_by: p.created_by,
        status: p.status,
        created_at: p.created_at,
      }));
    },
    [],
  );

  const { data: projects, loading, refetch } = useCacheAwareQuery<ProjectRow[]>(
    fetchFn,
    { cacheKeys: [CACHE_KEYS.WORKFLOWS], initialData: [] },
  );

  const safeProjects = projects ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return safeProjects;
    return safeProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.created_by.toLowerCase().includes(q),
    );
  }, [safeProjects, search]);

  // Reset form when modal becomes visible again
  useEffect(() => {
    if (isOpen) {
      setMode('select');
      setSearch('');
      setNewName('');
      setNewDescription('');
    }
  }, [isOpen]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Workflow name is required');
      return;
    }
    setIsCreating(true);
    try {
      const response = await workflowApi.createWorkflow({
        project_name: name,
        description: newDescription.trim() || undefined,
        steps: [],
      });
      toast.success(`Workflow "${name}" created`);
      onSelect(response.project_id, response.project_name);
      refetch();
    } catch (error: any) {
      console.error('[WorkflowProjectGate] Failed to create workflow:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to create workflow');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { /* gate is mandatory — closing without selection is not allowed */ }}
      size="lg"
      containerClassName={className}
    >
      <div className="p-5">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-indigo-500" />
            Choose a workflow project
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Workflows are stored as projects. Pick one to continue, or create a new one.
          </p>
        </div>

        {/* Mode tabs */}
        <div
          role="tablist"
          aria-label="Workflow project mode"
          className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4"
        >
          <button
            role="tab"
            aria-selected={mode === 'select'}
            type="button"
            onClick={() => setMode('select')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              mode === 'select'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
          >
            Select existing
          </button>
          <button
            role="tab"
            aria-selected={mode === 'create'}
            type="button"
            onClick={() => setMode('create')}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5',
              mode === 'create'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Create new
          </button>
        </div>

        {mode === 'select' ? (
          <div>
            {/* Search */}
            <div className="relative mb-3">
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
                    {safeProjects.length === 0 ? 'No workflows yet' : 'No workflows match your search'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {safeProjects.length === 0
                      ? 'Create your first workflow to get started.'
                      : 'Try a different search term.'}
                  </p>
                  {safeProjects.length === 0 && (
                    <Button
                      size="sm"
                      variant="solid"
                      className="mt-3"
                      onClick={() => setMode('create')}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Create workflow
                    </Button>
                  )}
                </div>
              ) : (
                <ul role="listbox" aria-label="Available workflows" className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filtered.map((p) => (
                    <li key={p.project_id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onClick={() => onSelect(p.project_id, p.name)}
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
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {p.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {p.created_by}
                            </span>
                            {p.created_at && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(p.created_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex justify-between items-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {filtered.length} workflow{filtered.length === 1 ? '' : 's'} available
              </p>
              <Button size="sm" variant="outline" onClick={() => setMode('create')}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                New workflow
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="wf-gate-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Workflow name<span className="text-red-500 ml-0.5">*</span>
              </label>
              <Input
                id="wf-gate-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Daily sales rollup"
                disabled={isCreating}
                autoFocus
              />
            </div>
            <div>
              <label
                htmlFor="wf-gate-desc"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id="wf-gate-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this workflow do?"
                disabled={isCreating}
                rows={3}
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-lg',
                  'border border-slate-200 dark:border-slate-700',
                  'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100',
                  'placeholder:text-slate-400',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400',
                  'disabled:opacity-50',
                )}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMode('select')}
                disabled={isCreating}
              >
                Back
              </Button>
              <Button
                size="sm"
                variant="solid"
                onClick={handleCreate}
                disabled={isCreating || !newName.trim()}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create &amp; open
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
