'use client';

/**
 * Unified Project Context Hook
 *
 * Eliminates popup project selectors by:
 * 1. Persisting last-used project per module in localStorage (survives refresh)
 * 2. Auto-restoring the last project on page load (no popup needed)
 * 3. Syncing with backend for cross-device continuity
 * 4. Providing a shared atom so all components see the same active project
 *
 * Usage:
 *   const { activeProject, lastProjectId, selectProject, hasProject } = useProjectContext('explore_design');
 */

import { useCallback, useEffect, useRef } from 'react';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  setLastUsedProject as apiSetLastUsed,
  getLastUsedProjects as apiGetLastUsed,
} from '@/app/services/api/projectsApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveProject {
  id: string;
  name: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Atoms — shared across all components using this hook
// ---------------------------------------------------------------------------

/** Persists in localStorage — survives page refresh and browser restart */
const lastProjectsAtom = atomWithStorage<Record<string, string>>(
  'd360_last_projects',
  {},
);

/** Persists project names so we can display them without re-fetching */
const lastProjectNamesAtom = atomWithStorage<Record<string, string>>(
  'd360_last_project_names',
  {},
);

/**
 * Current active project keyed by module — in-memory only (set on mount or
 * user selection). Keying by module prevents last-write-wins clobber when two
 * modules (e.g. explore_design + workflow) are mounted simultaneously.
 */
const activeProjectAtom = atom<Record<string, ActiveProject | null>>({});

/** Track whether backend sync has been attempted this session */
const backendSyncedAtom = atom<boolean>(false);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProjectContext(module: string) {
  const [lastProjects, setLastProjects] = useAtom(lastProjectsAtom);
  const [lastNames, setLastNames] = useAtom(lastProjectNamesAtom);
  const [activeProjectMap, setActiveProjectMap] = useAtom(activeProjectAtom);
  const [backendSynced, setBackendSynced] = useAtom(backendSyncedAtom);
  const syncAttempted = useRef(false);

  /** Active project for THIS module only — other modules' selections are unaffected. */
  const activeProject: ActiveProject | null = activeProjectMap[module] ?? null;

  const lastProjectId = lastProjects[module] || null;
  const lastProjectName = lastNames[module] || null;

  // -----------------------------------------------------------------------
  // Select a project — updates local state + notifies backend
  // -----------------------------------------------------------------------
  const selectProject = useCallback(
    (projectId: string, projectName: string, projectType?: string) => {
      const pType = projectType || module;
      setActiveProjectMap((prev) => ({ ...prev, [module]: { id: projectId, name: projectName, type: pType } }));
      setLastProjects((prev) => ({ ...prev, [module]: projectId }));
      setLastNames((prev) => ({ ...prev, [module]: projectName }));
      // Fire-and-forget backend notification
      apiSetLastUsed(module, projectId).catch(() => {});
    },
    [module, setActiveProjectMap, setLastProjects, setLastNames],
  );

  // -----------------------------------------------------------------------
  // Clear active project (e.g. when navigating away)
  // -----------------------------------------------------------------------
  const clearProject = useCallback(() => {
    setActiveProjectMap((prev) => ({ ...prev, [module]: null }));
  }, [module, setActiveProjectMap]);

  // -----------------------------------------------------------------------
  // On first mount: try to restore from localStorage, fallback to backend
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    // If we already have a localStorage value, use it (no popup needed)
    if (lastProjectId) return;

    // Otherwise, check backend for last-used project in this module
    if (!backendSynced) {
      apiGetLastUsed(module)
        .then((res) => {
          setBackendSynced(true);
          if ('project_id' in res && res.project_id) {
            setLastProjects((prev) => ({ ...prev, [module]: res.project_id as string }));
            if ('project_name' in res && res.project_name) {
              setLastNames((prev) => ({ ...prev, [module]: res.project_name as string }));
            }
          }
        })
        .catch(() => {
          setBackendSynced(true);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  return {
    /** Currently active project (set by selectProject or auto-restore) */
    activeProject,
    /** Last-used project ID for this module (from localStorage) */
    lastProjectId,
    /** Last-used project name for this module (from localStorage) */
    lastProjectName,
    /** Select a project — stores locally + syncs to backend */
    selectProject,
    /** Clear the active project */
    clearProject,
    /** Whether a project is available (active or last-used) */
    hasProject: !!(activeProject?.id || lastProjectId),
  };
}

// ---------------------------------------------------------------------------
// Exported atoms for advanced usage (e.g. reading from non-hook contexts)
// ---------------------------------------------------------------------------
export { lastProjectsAtom, activeProjectAtom, lastProjectNamesAtom };
