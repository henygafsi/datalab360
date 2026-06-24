'use client';

/**
 * CloneDashboardButton — one "save as / duplicate" control for a whole
 * dashboard. Composes the existing create-dashboard / create-page /
 * create-widget endpoints (via useCloneDashboard) into a single action.
 *
 * Gated by the bi_reporting 'create' action (System 2 Action-RBAC) since a
 * clone POSTs a new dashboard + widgets. Fail-open while the allow-set loads;
 * honest disabled + tooltip on a resolved deny. On success it routes to the
 * fresh copy so the user lands in the editor ready to tweak.
 *
 * Two variants:
 *   - 'icon'   : compact icon button (overlaid on a project list card)
 *   - 'button' : labelled outline button (editor toolbar)
 */
import { useCallback } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useCloneDashboard } from '../hooks/useCloneDashboard';

interface CloneDashboardButtonProps {
  projectId: string;
  projectName: string;
  variant?: 'icon' | 'button';
  className?: string;
  /** Where to go after the clone lands. Defaults to the new dashboard editor. */
  onCloned?: (newProjectId: string) => void;
}

const CREATE_DENIED = 'Requires the "create" permission on Business Reporting.';

export default function CloneDashboardButton({
  projectId,
  projectName,
  variant = 'icon',
  className,
  onCloned,
}: CloneDashboardButtonProps) {
  const { trackFeatureClick } = useTrackEvent();
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const { cloning, cloneDashboard } = useCloneDashboard();

  const handleClone = useCallback(
    async (e: React.MouseEvent) => {
      // The button often lives next to a navigating <Link>; never let the click
      // bubble into a card navigation.
      e.preventDefault();
      e.stopPropagation();
      if (cloning || !canCreate) return;
      const toastId = toast.loading(`Cloning "${projectName}"...`);
      try {
        const res = await cloneDashboard({ projectId, name: projectName });
        trackFeatureClick('bi_dashboard_cloned', {
          source: projectId,
          target: res.projectId,
          widgets: res.widgetsCloned,
        });
        if (res.widgetsFailed > 0) {
          toast.error(
            `Cloned with ${res.widgetsFailed} widget${res.widgetsFailed === 1 ? '' : 's'} skipped — open the copy to review.`,
            { id: toastId },
          );
        } else {
          toast.success(
            `Dashboard cloned${res.widgetsCloned > 0 ? ` (${res.widgetsCloned} widget${res.widgetsCloned === 1 ? '' : 's'})` : ''}.`,
            { id: toastId },
          );
        }
        if (onCloned) onCloned(res.projectId);
        else window.location.href = `/bi-dashboard/${res.projectId}`;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't clone the dashboard.", {
          id: toastId,
        });
      }
    },
    [cloning, canCreate, projectId, projectName, cloneDashboard, onCloned, trackFeatureClick],
  );

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClone}
        disabled={cloning || !canCreate}
        title={!canCreate ? CREATE_DENIED : 'Duplicate this dashboard into an editable copy'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800',
          className,
        )}
      >
        {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
        {cloning ? 'Cloning...' : 'Duplicate'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClone}
      disabled={cloning || !canCreate}
      aria-label={`Duplicate dashboard ${projectName}`}
      title={!canCreate ? CREATE_DENIED : 'Duplicate dashboard'}
      className={cn(
        'rounded-md p-1 text-gray-400 transition-colors hover:bg-cyan-50 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-cyan-900/20',
        className,
      )}
    >
      {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
