'use client';

/**
 * DeployStateButton — the header primary action for Explore & Design whose LABEL
 * and VARIANT morph by the project's lifecycle state (redesign spec §3 / mockup
 * `13-deploy-states.png`). One button, nine faces:
 *
 *   No changes        → "Deploy"              (disabled, muted)
 *   Draft changes     → "Prepare Release"     (primary)
 *   Checks not run     → "Run Validation"      (neutral/outline)
 *   Blocking issues   → "Fix Blockers"        (red)
 *   Ready not approved → "Submit for Approval" (primary)
 *   Waiting approval   → "Awaiting Approval"    (disabled, muted)
 *   Approved           → "Deploy"              (primary)
 *   Deployed           → "Verify"              (neutral/outline)
 *   Failed             → "Open Recovery"        (red)
 *
 * Pure + props-driven: takes a `state` + `onClick`. The state-machine's own
 * disabled states (no-changes, awaiting-approval) are ADDITIVE on top of the
 * caller's `disabled` (read-only / no-project) — the caller keeps its own guards
 * in `onClick`.
 *
 * Tailwind purge note: variants use LITERAL class strings (no interpolation).
 */

import React from 'react';
import {
  Rocket, PackageCheck, CheckCircle2, AlertTriangle, Send,
  Hourglass, Search, LifeBuoy, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Public types ─────────────────────────────────────────────────────────────

export type DeployState =
  | 'no-changes'
  | 'draft'
  | 'checks-not-run'
  | 'blocked'
  | 'ready-not-approved'
  | 'awaiting-approval'
  | 'approved'
  | 'deployed'
  | 'failed';

/**
 * Flexible input for `deriveDeployState`. Every field is optional so callers can
 * pass only what they can honestly source; the mapping degrades to the earliest
 * lifecycle state it can prove.
 */
export interface DeployStateInput {
  /** Number of pending/unshipped changes (e.g. pending events). */
  pendingChanges?: number | null;
  /** Number of blocking issues (breaking changes / hard readiness failures). */
  blockers?: number | null;
  /** Whether validation/checks have been run against the current changes. */
  validationRun?: boolean | null;
  /** Approval workflow state, if tracked. */
  approvalStatus?: 'none' | 'submitted' | 'approved' | 'rejected' | null;
  /** Deploy execution state, if tracked. */
  deployStatus?: 'idle' | 'deploying' | 'deployed' | 'verified' | 'failed' | null;
}

export interface DeployStateButtonProps {
  state: DeployState;
  onClick: () => void;
  /** Extra caller guard (read-only / no project). ANDed with state disabled. */
  disabled?: boolean;
  /** Optional pending-change count badge (mirrors the legacy button). */
  changeCount?: number;
  className?: string;
  size?: 'sm' | 'md';
}

// ── State → presentation map ─────────────────────────────────────────────────

type Variant = 'primary' | 'red' | 'neutral' | 'muted';

interface StateSpec {
  label: string;
  icon: LucideIcon;
  variant: Variant;
  /** State-intrinsic disable (no-changes / awaiting-approval). */
  stateDisabled?: boolean;
}

const STATE_SPEC: Record<DeployState, StateSpec> = {
  'no-changes':        { label: 'Deploy',              icon: Rocket,       variant: 'muted',   stateDisabled: true },
  'draft':             { label: 'Prepare Release',     icon: PackageCheck, variant: 'primary' },
  'checks-not-run':    { label: 'Run Validation',      icon: CheckCircle2, variant: 'neutral' },
  'blocked':           { label: 'Fix Blockers',        icon: AlertTriangle, variant: 'red' },
  'ready-not-approved': { label: 'Submit for Approval', icon: Send,         variant: 'primary' },
  'awaiting-approval': { label: 'Awaiting Approval',   icon: Hourglass,    variant: 'muted',   stateDisabled: true },
  'approved':          { label: 'Deploy',              icon: Rocket,       variant: 'primary' },
  'deployed':          { label: 'Verify',              icon: Search,       variant: 'neutral' },
  'failed':            { label: 'Open Recovery',       icon: LifeBuoy,     variant: 'red' },
};

// Literal class strings per variant (purge-safe).
const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700',
  red: 'bg-red-600 text-white hover:bg-red-700',
  neutral: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  muted: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

// ── deriveDeployState — map readiness/blockers data to a lifecycle state ──────

/**
 * Terminal states win first (failed → deployed → approved → awaiting → blocked),
 * so a "blocked but also has pending changes" project reads "Fix Blockers", not
 * "Prepare Release". Falls back to the earliest provable state.
 */
export function deriveDeployState(input?: DeployStateInput | null): DeployState {
  const i = input ?? {};
  const pending = i.pendingChanges ?? 0;
  const blockers = i.blockers ?? 0;

  if (i.deployStatus === 'failed') return 'failed';
  if (i.deployStatus === 'deployed' || i.deployStatus === 'verified') return 'deployed';
  if (i.approvalStatus === 'approved') return 'approved';
  if (i.approvalStatus === 'submitted') return 'awaiting-approval';
  if (blockers > 0) return 'blocked';

  // No changes to ship → disabled Deploy.
  if (pending <= 0) return 'no-changes';

  // There are changes. If we can prove checks haven't run, ask for validation;
  // if checks are green (validationRun === true) and no blockers, it's ready for
  // approval; otherwise it's a plain draft.
  if (i.validationRun === false) return 'checks-not-run';
  if (i.validationRun === true) return 'ready-not-approved';
  return 'draft';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeployStateButton({
  state, onClick, disabled, changeCount, className, size = 'sm',
}: DeployStateButtonProps) {
  const spec = STATE_SPEC[state];
  const Icon = spec.icon;
  const isDisabled = !!disabled || !!spec.stateDisabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={spec.label}
      aria-label={spec.label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        VARIANT_CLASS[spec.variant],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {spec.label}
      {changeCount != null && changeCount > 0 && (
        <span
          className={cn(
            'ml-0.5 rounded px-1 py-0 text-[10px]',
            spec.variant === 'primary' || spec.variant === 'red'
              ? 'bg-white/20 text-white'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
          )}
        >
          {changeCount}
        </span>
      )}
    </button>
  );
}
