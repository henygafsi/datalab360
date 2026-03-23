'use client';

/**
 * InlineProjectSelector — replaces popup/modal project selectors.
 *
 * Renders an inline dropdown in the page header that:
 * - Shows current project name (or "Select Project" placeholder)
 * - Opens a dropdown (NOT a modal) with recent projects at the top
 * - Marks the last-used project with a "Last Used" badge
 * - Includes a search input for filtering
 * - Offers a "Create New" button at bottom
 * - Auto-selects the last-used project on mount (zero popups)
 *
 * Dark mode compliant. Uses jotai atomWithStorage for persistence.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FolderOpen,
  ChevronDown,
  Search,
  Plus,
  Clock,
  Compass,
  GitBranch,
  BarChart2,
  Check,
} from 'lucide-react';
import { Badge } from 'rizzui';
import { cn } from '@/lib/utils';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  getUnifiedProjects,
  type UnifiedProject,
} from '@/app/services/api/projectsApi';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineProjectSelectorProps {
  /** Module name: explore_design, workflow, bi_dashboard */
  module: string;
  /** Called when user selects a project */
  onSelect: (projectId: string, projectName: string) => void;
  /** Called when user clicks "Create New" */
  onCreate?: () => void;
  /** Filter projects to this type only (defaults to module name) */
  projectType?: string;
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Compact mode — smaller button, no icon */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ElementType> = {
  explore_design: Compass,
  workflow: GitBranch,
  bi_dashboard: BarChart2,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InlineProjectSelector({
  module,
  onSelect,
  onCreate,
  projectType,
  className,
  compact = false,
}: InlineProjectSelectorProps) {
  const {
    activeProject,
    lastProjectId,
    lastProjectName,
    selectProject,
  } = useProjectContext(module);

  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<UnifiedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hasFetched = useRef(false);

  // Determine effective project type filter
  const effectiveType = projectType || module;

  // -----------------------------------------------------------------------
  // Fetch projects once (on first open, or on mount for auto-restore)
  // -----------------------------------------------------------------------
  const fetchProjects = useCallback(async () => {
    if (hasFetched.current || loading) return;
    setLoading(true);
    try {
      const res = await getUnifiedProjects();
      const filtered = (res?.projects ?? []).filter(
        (p) => p.type === effectiveType && p.status !== 'deleted',
      );
      setProjects(filtered);
      hasFetched.current = true;
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveType, loading]);

  // -----------------------------------------------------------------------
  // Auto-select last-used project on mount (NO POPUP)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!lastProjectId || activeProject?.id === lastProjectId) return;

    // If we already have projects loaded, find the name
    if (projects.length > 0) {
      const found = projects.find((p) => p.project_id === lastProjectId);
      if (found) {
        onSelect(found.project_id, found.name);
        selectProject(found.project_id, found.name, found.type);
        return;
      }
    }

    // If we have a cached name, use it immediately
    if (lastProjectName) {
      onSelect(lastProjectId, lastProjectName);
      selectProject(lastProjectId, lastProjectName, effectiveType);
      return;
    }

    // Otherwise fetch projects to get the name
    if (!hasFetched.current) {
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastProjectId, projects.length]);

  // -----------------------------------------------------------------------
  // Close dropdown on outside click
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, fetchProjects]);

  // -----------------------------------------------------------------------
  // Filter & sort projects
  // -----------------------------------------------------------------------
  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query),
        )
      : projects;

    // Sort: last-used first, then by updated_at desc
    return [...filtered].sort((a, b) => {
      if (a.project_id === lastProjectId) return -1;
      if (b.project_id === lastProjectId) return 1;
      const aDate = a.updated_at || a.created_at || '';
      const bDate = b.updated_at || b.created_at || '';
      return bDate.localeCompare(aDate);
    });
  }, [projects, searchQuery, lastProjectId]);

  // -----------------------------------------------------------------------
  // Handle selection
  // -----------------------------------------------------------------------
  const handleSelect = useCallback(
    (project: UnifiedProject) => {
      selectProject(project.project_id, project.name, project.type);
      onSelect(project.project_id, project.name);
      setIsOpen(false);
      setSearchQuery('');
    },
    [selectProject, onSelect],
  );

  // -----------------------------------------------------------------------
  // Display name
  // -----------------------------------------------------------------------
  const displayName =
    activeProject?.name || lastProjectName || 'Select Project';
  const isSelected = !!(activeProject?.id || lastProjectId);
  const TypeIcon = TYPE_ICONS[effectiveType] || FolderOpen;

  return (
    <div
      ref={dropdownRef}
      className={cn('relative inline-block', className)}
      data-testid="inline-project-selector"
    >
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-2 rounded-lg border transition-colors',
          'border-gray-200 dark:border-gray-700',
          'bg-white dark:bg-gray-800',
          'hover:bg-gray-50 dark:hover:bg-gray-700',
          'text-gray-900 dark:text-white',
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
          isOpen && 'ring-2 ring-blue-500 dark:ring-blue-400',
        )}
      >
        {!compact && <TypeIcon className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />}
        <span className={cn('truncate', compact ? 'max-w-[140px]' : 'max-w-[200px]')}>
          {displayName}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-gray-400 transition-transform flex-shrink-0',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 z-50 mt-1',
            'w-80 max-h-[400px] overflow-hidden',
            'rounded-lg border shadow-lg',
            'border-gray-200 dark:border-gray-700',
            'bg-white dark:bg-gray-800',
            'flex flex-col',
          )}
        >
          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className={cn(
                  'w-full pl-8 pr-3 py-1.5 text-sm rounded-md',
                  'border border-gray-200 dark:border-gray-600',
                  'bg-gray-50 dark:bg-gray-900',
                  'text-gray-900 dark:text-white',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'focus:outline-none focus:ring-1 focus:ring-blue-500',
                )}
              />
            </div>
          </div>

          {/* Project list */}
          <div className="overflow-y-auto flex-1 max-h-[300px]">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && filteredProjects.length === 0 && (
              <div className="px-3 py-6 text-center">
                <FolderOpen className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No projects match your search' : 'No projects found'}
                </p>
              </div>
            )}

            {!loading && filteredProjects.length > 0 && (
              <>
                {/* Recent label */}
                {lastProjectId && !searchQuery && (
                  <div className="px-3 py-1.5 flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Recent
                    </span>
                  </div>
                )}

                {filteredProjects.map((project) => {
                  const isLastUsed = project.project_id === lastProjectId;
                  const isActive =
                    activeProject?.id === project.project_id;
                  const PIcon = TYPE_ICONS[project.type] || FolderOpen;

                  return (
                    <button
                      key={project.project_id}
                      type="button"
                      onClick={() => handleSelect(project)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left',
                        'transition-colors',
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                      )}
                    >
                      <PIcon
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-400 dark:text-gray-500',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-sm font-medium truncate',
                              isActive
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-gray-900 dark:text-white',
                            )}
                          >
                            {project.name}
                          </span>
                          {isLastUsed && (
                            <Badge
                              size="sm"
                              variant="flat"
                              color="success"
                              className="flex-shrink-0 text-[10px]"
                            >
                              Last Used
                            </Badge>
                          )}
                        </div>
                        {project.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Create new */}
          {onCreate && (
            <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery('');
                  onCreate();
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
                  'text-blue-600 dark:text-blue-400',
                  'hover:bg-blue-50 dark:hover:bg-blue-900/30',
                  'transition-colors',
                )}
              >
                <Plus className="h-4 w-4" />
                Create New Project
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
