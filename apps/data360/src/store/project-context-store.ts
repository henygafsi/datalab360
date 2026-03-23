/**
 * Project Context Store — jotai atoms for unified project tracking.
 *
 * Re-exports the atoms from useProjectContext for components
 * that need to read project state outside of the hook (e.g., layout headers).
 *
 * Usage:
 *   import { lastProjectsAtom } from '@/store/project-context-store';
 *   const [lastProjects] = useAtom(lastProjectsAtom);
 */

export {
  lastProjectsAtom,
  lastProjectNamesAtom,
  activeProjectAtom,
  type ActiveProject,
} from '@/hooks/useProjectContext';
