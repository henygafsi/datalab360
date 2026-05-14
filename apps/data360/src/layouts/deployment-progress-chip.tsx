'use client';

/**
 * DeploymentProgressChip — always-visible header surface for the user's
 * active deployments.
 *
 * Lives in the right side of the top nav. Renders nothing when no
 * deployment is in flight. When one or more are running, shows:
 *   - the freshest deployment as a chip with progress bar + status
 *   - click → returns the user to /explore-design?project_id=…&deployment_id=…
 *   - hover/click for >1 deploy opens a popover listing them all
 *
 * Polling lives in useActiveDeployments() (10s).
 */
import { useState } from 'react';
import Link from 'next/link';
import { Popover } from 'rizzui';
import { PiRocketLaunchDuotone, PiCheckCircleDuotone, PiXCircleDuotone, PiClockCountdownDuotone } from 'react-icons/pi';
import { useActiveDeployments } from '@/hooks/useDeploymentTracking';
import {
  fmtDuration,
  progressPct,
  statusLabel,
  stepLabel,
  type DeploymentRow,
  type DeploymentStatus,
} from '@/app/services/deployment-tracking';
import { cn } from '@/lib/utils';

function deployHref(row: DeploymentRow): string {
  return `/explore-design?project_id=${encodeURIComponent(row.project_id)}&deployment_id=${encodeURIComponent(row.deployment_id)}`;
}

function statusTone(status: DeploymentStatus) {
  switch (status) {
    case 'RUNNING': return { ring: 'ring-blue-400', dot: 'bg-blue-500', bar: 'bg-blue-500' };
    case 'PENDING_APPROVAL': return { ring: 'ring-amber-400', dot: 'bg-amber-500', bar: 'bg-amber-500' };
    case 'FAILED': return { ring: 'ring-rose-400', dot: 'bg-rose-500', bar: 'bg-rose-500' };
    case 'SUCCEEDED': return { ring: 'ring-emerald-400', dot: 'bg-emerald-500', bar: 'bg-emerald-500' };
    default: return { ring: 'ring-slate-300', dot: 'bg-slate-400', bar: 'bg-slate-400' };
  }
}

function StatusIcon({ status, className }: { status: DeploymentStatus; className?: string }) {
  if (status === 'SUCCEEDED') return <PiCheckCircleDuotone className={cn('text-emerald-500', className)} />;
  if (status === 'FAILED' || status === 'CANCELLED') return <PiXCircleDuotone className={cn('text-rose-500', className)} />;
  if (status === 'PENDING_APPROVAL') return <PiClockCountdownDuotone className={cn('text-amber-500', className)} />;
  return <PiRocketLaunchDuotone className={cn('text-blue-500 animate-pulse', className)} />;
}

function DeployRow({ row }: { row: DeploymentRow }) {
  const pct = progressPct(row);
  const tone = statusTone(row.status);
  const failedSteps = Object.entries(row.errors_by_step || {}).filter(([, errs]) => (errs || []).length > 0);
  return (
    <Link
      href={deployHref(row)}
      className="block rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={row.status} className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
              {row.project_name || row.project_id}
            </span>
            <span className="whitespace-nowrap text-[10px] uppercase tracking-wide text-slate-500">
              {statusLabel(row.status)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>Step: <span className="text-slate-700 dark:text-slate-300">{stepLabel(row.current_step)}</span></span>
            <span>·</span>
            <span>{fmtDuration(row.elapsed_ms)}</span>
            {failedSteps.length > 0 && (
              <>
                <span>·</span>
                <span className="text-rose-500">{failedSteps.length} error{failedSteps.length > 1 ? 's' : ''}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
            <div
              className={cn('h-full transition-all', tone.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function DeploymentProgressChip() {
  const { items, refresh } = useActiveDeployments();
  const [open, setOpen] = useState(false);

  // Freshest active deploy = first item (backend ORDER BY started_at DESC).
  const headline = items[0];
  if (!headline) return null;
  const tone = statusTone(headline.status);
  const pct = progressPct(headline);

  const trigger = (
    <button
      type="button"
      className={cn(
        'relative flex items-center gap-2 rounded-xl border bg-white px-2.5 py-1.5 shadow-sm transition-all',
        'hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800',
        'ring-1 ring-inset', tone.ring,
      )}
      onClick={() => {
        // Open inline popover (don't navigate by default — give user the choice).
        setOpen((v) => !v);
        void refresh();
      }}
      aria-label={`Deployment ${statusLabel(headline.status)} for ${headline.project_name || headline.project_id}`}
    >
      <StatusIcon status={headline.status} className="h-4 w-4" />
      <div className="flex flex-col items-start min-w-0 max-w-[180px]">
        <span className="truncate text-xs font-medium text-slate-900 dark:text-white">
          {headline.project_name || headline.project_id}
        </span>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot, headline.status === 'RUNNING' && 'animate-pulse')} />
          <span>{stepLabel(headline.current_step)} · {fmtDuration(headline.elapsed_ms)}</span>
        </div>
      </div>
      {items.length > 1 && (
        <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          +{items.length - 1}
        </span>
      )}
      {/* Progress sliver under the chip */}
      <span
        className={cn('absolute -bottom-px left-2 right-2 h-0.5 rounded-full', tone.bar)}
        style={{ width: `calc(${pct}% - 0.5rem)` }}
      />
    </button>
  );

  return (
    <Popover isOpen={open} setIsOpen={setOpen} placement="bottom-end">
      <Popover.Trigger>{trigger}</Popover.Trigger>
      <Popover.Content className="w-[340px] p-2 shadow-lg z-[9999]">
        <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Active deployments ({items.length})
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {items.map((row) => (
            <DeployRow key={row.deployment_id} row={row} />
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );
}
