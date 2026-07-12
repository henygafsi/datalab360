'use client';

/**
 * ProjectGatePanel — the single, shared INLINE project picker shown by both
 * the Workflow (`ETLPipelineBuilder`) and Explore & Design (`explore-design`)
 * modules when no project is selected yet.
 *
 * This is deliberately NOT a modal: no portal, no `fixed inset-0` overlay. It
 * renders a centred card in normal document flow so the page never shows a
 * floating pop-up the user must dismiss. It replaces both the workflow's
 * hardcoded inline pre-state and explore-design's "Pick existing project"
 * modal hand-off, so the two modules behave identically.
 *
 * States handled honestly: loading (skeleton rows), empty (create CTA),
 * error (message + retry), and ready (searchable, keyboard-navigable list).
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FolderOpen, ChevronRight, Plus, AlertTriangle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  sortByLastUsedThenCreated,
  formatProjectTimestamp,
  getBuildModeChip,
  recordProjectUsed,
  getLastUsedMap,
} from './project-listing-utils';

/** A project row as the gate panel needs it — module-agnostic. */
export interface ProjectGateItem {
  id: string;
  name: string;
  created_by?: string;
  created_at?: string;
  tags?: string[] | null;
}

export interface ProjectGatePanelProps {
  /** Which module is rendering the gate — drives the heading + CTA wording. */
  module: 'workflow' | 'explore-design';
  /** Projects available to pick. */
  projects: ProjectGateItem[];
  /** True while the project list is still loading. */
  loading?: boolean;
  /** Non-null when the project list failed to load. */
  error?: string | null;
  /** Called when the user picks a project. */
  onSelect: (projectId: string, projectName: string) => void;
  /** Called when the user wants to create a new project. */
  onCreateNew: () => void;
  /** Called when the user retries after an error. */
  onRetry?: () => void;
  /**
   * Max-width utility of the centred card (default `max-w-2xl`). Wide-canvas
   * hosts (the workflow builder) pass a larger cap so the gate doesn't leave
   * dead flanks at 1440/1920.
   */
  widthClass?: string;
}

/** Per-module wording — only the noun + accent differ between the two gates. */
const MODULE_COPY: Record<
  ProjectGatePanelProps['module'],
  { noun: string; heading: string; subtitle: string }
> = {
  workflow: {
    noun: 'workflow',
    heading: 'Choose a workflow project',
    subtitle: 'Pick an existing workflow to continue, or create a new one.',
  },
  'explore-design': {
    noun: 'project',
    heading: 'Choose an explore & design project',
    subtitle: 'Pick an existing project to keep modelling, or create a new one.',
  },
};

/** Build-mode chip colour by kind. */
const CHIP_CLASS: Record<string, string> = {
  ai: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  manual: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  template: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function ProjectGatePanel({
  module,
  projects,
  loading = false,
  error = null,
  onSelect,
  onCreateNew,
  onRetry,
  widthClass = 'max-w-2xl',
}: ProjectGatePanelProps) {
  const copy = MODULE_COPY[module];
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Last-used map — read once per mount (sync localStorage), reused by both
  // the sorter and the per-row "used 2h ago" timestamp label. The gate is
  // short-lived (it unmounts the moment a project is picked), so a single
  // read is fine.
  const lastUsed = useMemo(() => getLastUsedMap(), []);

  // Sort by last-used (most-recent first) then created_at desc. The sorter
  // works on `{ project_id, created_at }` — adapt the gate's row shape.
  const sorted = useMemo(() => {
    const sortable = projects.map((p) => ({
      ...p,
      project_id: p.id,
      created_at: p.created_at ?? null,
    }));
    return sortByLastUsedThenCreated(sortable, lastUsed);
  }, [projects, lastUsed]);

  // Client-side name filter.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(q));
  }, [sorted, query]);

  const handleSelect = useCallback(
    (id: string, name: string) => {
      recordProjectUsed(id);
      onSelect(id, name);
    },
    [onSelect],
  );

  // Arrow-key navigation over the listbox. Works regardless of whether the
  // search box or the list has focus — command-palette behaviour.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[Math.min(activeIndex, filtered.length - 1)];
        if (target) handleSelect(target.id, target.name);
      }
    },
    [filtered, activeIndex, handleSelect],
  );

  // Keep the active row scrolled into view.
  const setActiveRow = useCallback((idx: number) => {
    setActiveIndex(idx);
    const el = listRef.current?.querySelectorAll('[role="option"]')[idx] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div className="flex-1 overflow-auto flex items-start justify-center p-6">
      <div className={`w-full ${widthClass} mt-8`}>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
              <FolderOpen className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {copy.heading}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {copy.subtitle}
              </p>
            </div>
          </div>

          {/* Count + New CTA */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loading
                ? 'Loading…'
                : error
                  ? 'Could not load projects'
                  : `${projects.length} ${copy.noun}${projects.length === 1 ? '' : 's'} available`}
            </p>
            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New {copy.noun}
            </button>
          </div>

          {/* Search box — hidden while loading / on error / when empty. */}
          {!loading && !error && projects.length > 0 && (
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={`Search ${copy.noun}s…`}
                aria-label={`Search ${copy.noun}s`}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              />
            </div>
          )}

          {/* Body */}
          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg max-h-[420px] overflow-y-auto">
            {/* Loading — skeleton rows */}
            {loading && (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-1/2 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                      <div className="h-2.5 w-1/3 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Error — honest message + retry */}
            {!loading && error && (
              <div className="px-4 py-12 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {error}
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Empty — no projects at all */}
            {!loading && !error && projects.length === 0 && (
              <div className="px-4 py-12 text-center">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No {copy.noun}s yet
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Create your first {copy.noun} to get started.
                </p>
                <button
                  type="button"
                  onClick={onCreateNew}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create {copy.noun}
                </button>
              </div>
            )}

            {/* No search matches */}
            {!loading && !error && projects.length > 0 && filtered.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Search className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No {copy.noun}s match &ldquo;{query}&rdquo;
                </p>
              </div>
            )}

            {/* Ready — the project list */}
            {!loading && !error && filtered.length > 0 && (
              <ul
                ref={listRef}
                role="listbox"
                aria-label={`${copy.noun} list`}
                className="divide-y divide-slate-100 dark:divide-slate-700"
              >
                {filtered.map((p, idx) => {
                  const chip = getBuildModeChip(p.tags);
                  const timestamp = formatProjectTimestamp(
                    { project_id: p.id, created_at: p.created_at ?? null },
                    lastUsed,
                  );
                  const isActive = idx === activeIndex;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => handleSelect(p.id, p.name)}
                        onMouseEnter={() => setActiveRow(idx)}
                        onKeyDown={handleKeyDown}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors focus:outline-none',
                          isActive
                            ? 'bg-indigo-50 dark:bg-indigo-900/20'
                            : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
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
                            {chip && (
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                                  CHIP_CLASS[chip.kind],
                                )}
                              >
                                {chip.label}
                              </span>
                            )}
                          </div>
                          {timestamp && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                              {timestamp}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
