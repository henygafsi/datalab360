'use client';

/**
 * Status hero shown above the right-panel tab content.
 *
 * Surfaces the 3 axes the user cares about at a glance:
 *   1. Last run        — status pill + rows + duration + timestamp
 *   2. Approval        — none / pending / approved / rejected, with name+ts
 *   3. Deployment      — current active deployment id, if any
 *
 * Read-only. All actions live in the page header (Save/Validate/Run/Approve)
 * and inside each tab. This component's job is purely to make the state
 * legible so the user doesn't have to dig through tabs to know "is my draft
 * approved?" or "did the last run succeed?".
 */
import {
  CheckCircle, AlertCircle, Loader2, ShieldCheck, ShieldAlert, Hourglass,
  Rocket, Clock, GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type RunStatus = 'success' | 'failed' | 'running' | 'partial' | 'never';
type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface Props {
  // Run
  runStatus: RunStatus;
  rowsAffected?: number | null;
  durationMs?: number | null;
  ranAt?: string | Date | null;
  // Approval
  approvalStatus: ApprovalStatus;
  approver?: string | null;
  approvedAt?: string | Date | null;
  // Deployment
  activeDeploymentId?: string | null;
  // Version
  versionCount?: number;
}

const RUN_TINT: Record<RunStatus, { bg: string; text: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle,
    label: 'Last run succeeded',
  },
  failed: {
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40',
    text: 'text-red-700 dark:text-red-300',
    icon: AlertCircle,
    label: 'Last run failed',
  },
  partial: {
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40',
    text: 'text-amber-700 dark:text-amber-300',
    icon: AlertCircle,
    label: 'Partial failure',
  },
  running: {
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/40',
    text: 'text-blue-700 dark:text-blue-300',
    icon: Loader2,
    label: 'Running…',
  },
  never: {
    bg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    icon: Clock,
    label: 'Never run',
  },
};

const APPROVAL_TINT: Record<ApprovalStatus, { bg: string; text: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  none: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    icon: ShieldCheck,
    label: 'Not requested',
  },
  pending: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-200',
    icon: Hourglass,
    label: 'Pending approval',
  },
  approved: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-800 dark:text-emerald-200',
    icon: ShieldCheck,
    label: 'Approved',
  },
  rejected: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-200',
    icon: ShieldAlert,
    label: 'Rejected',
  },
};

function fmtTimestamp(t: string | Date | null | undefined): string {
  if (!t) return '';
  try {
    return formatDistanceToNow(new Date(t), { addSuffix: true });
  } catch {
    return '';
  }
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m${r > 0 ? ` ${r}s` : ''}`;
}

export default function RunApprovalStatusHero({
  runStatus,
  rowsAffected,
  durationMs,
  ranAt,
  approvalStatus,
  approver,
  approvedAt,
  activeDeploymentId,
  versionCount,
}: Props) {
  const run = RUN_TINT[runStatus];
  const approval = APPROVAL_TINT[approvalStatus];
  const RunIcon = run.icon;
  const ApprovalIcon = approval.icon;

  return (
    <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-3 py-2.5 dark:border-slate-700 dark:from-slate-900/60 dark:to-slate-800">
      {/* Run row */}
      <div className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5', run.bg)}>
        <RunIcon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            run.text,
            runStatus === 'running' && 'animate-spin',
          )}
        />
        <span className={cn('text-[11px] font-semibold', run.text)}>{run.label}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {rowsAffected != null && (
            <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
              {rowsAffected.toLocaleString()} rows
            </span>
          )}
          {durationMs != null && (
            <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
              {fmtDuration(durationMs)}
            </span>
          )}
          {ranAt && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {fmtTimestamp(ranAt)}
            </span>
          )}
        </div>
      </div>

      {/* Approval + deployment + version chips */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            approval.bg,
            approval.text,
          )}
        >
          <ApprovalIcon className="h-3 w-3" />
          {approval.label}
          {approvalStatus === 'approved' && approver && (
            <span className="font-normal opacity-80">· {approver}</span>
          )}
          {approvalStatus !== 'none' && approvedAt && (
            <span className="font-normal opacity-70">· {fmtTimestamp(approvedAt)}</span>
          )}
        </span>

        {activeDeploymentId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
            <Rocket className="h-3 w-3" />
            Deployment{' '}
            <span className="font-mono opacity-80">
              {activeDeploymentId.slice(0, 8)}
            </span>
          </span>
        )}

        {versionCount != null && versionCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <GitBranch className="h-3 w-3" />
            v{versionCount}
          </span>
        )}
      </div>
    </div>
  );
}
