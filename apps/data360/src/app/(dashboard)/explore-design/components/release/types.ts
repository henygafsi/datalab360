/**
 * Release spine — shared types for the Explore & Design redesign (spec §3/§4).
 *
 * The project release lifecycle (12 statuses), the per-axis color signal used
 * by the right-bar mini-rail, and the 7 internal Release-tab step ids.
 * Wire shapes mirror the backend contract for:
 *   GET  /explore-design/{project_id}/release-state
 *   GET|POST …/deployments/{deployment_id}/approvers (+ /{username}/decision)
 *   GET|POST /explore-design/{project_id}/ai/history
 */

// ── Lifecycle ────────────────────────────────────────────────────────────────

/** Project release lifecycle (spec §3). Order matters for the stepper. */
export type ReleaseStatus =
  | 'no_changes'
  | 'draft_changes'
  | 'checks_not_run'
  | 'blocked'
  | 'ready_for_approval'
  | 'awaiting_approval'
  | 'approved'
  | 'deploying'
  | 'deployed'
  | 'verified'
  | 'failed'
  | 'rolled_back';

/** Right-bar axis color indicator: OK / warning / blocker / changes-pending / not run. */
export type AxisSignal = 'green' | 'orange' | 'red' | 'blue' | 'grey';

/** The 7 right-bar axes (spec §2). */
export type AxisId =
  | 'overview'
  | 'ingestion'
  | 'data_quality'
  | 'governance'
  | 'impact_cost'
  | 'release'
  | 'history';

/** The 7 internal steps of the Release tab (spec §4). */
export type ReleaseStepId =
  | 'changes'
  | 'readiness'
  | 'impact'
  | 'approval'
  | 'deploy'
  | 'verify'
  | 'recovery';

export interface ReleaseStepDef {
  id: ReleaseStepId;
  label: string;
}

/** Ordered step registry for the Release mini-stepper. */
export const RELEASE_STEPS: readonly ReleaseStepDef[] = [
  { id: 'changes', label: 'Changes' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'impact', label: 'Impact' },
  { id: 'approval', label: 'Approval' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'verify', label: 'Verify' },
  { id: 'recovery', label: 'Recovery' },
] as const;

// ── GET /release-state wire shape ────────────────────────────────────────────

export interface ReleaseStateCounts {
  changes?: number | null;
  blockers?: number | null;
  warnings?: number | null;
  pending_approvals?: number | null;
}

export interface ReleaseState {
  status: ReleaseStatus;
  /** Human label the backend wants shown (optional; FE has its own fallback). */
  label?: string | null;
  /** Backend-suggested next action (advisory copy). */
  next_action?: string | null;
  counts?: ReleaseStateCounts | null;
  axis_signals?: Partial<Record<AxisId, AxisSignal>> | null;
}

// ── Named approvers wire shapes ──────────────────────────────────────────────

export type ApproverStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export interface DeploymentApprover {
  approver_username: string;
  approver_role_label?: string | null;
  required?: boolean;
  status?: ApproverStatus | string | null;
  comment?: string | null;
  decided_at?: string | null;
}

export interface ApproverPolicy {
  required_count?: number | null;
  mandatory_roles?: string[] | null;
}

export interface ApproversResponse {
  approvers: DeploymentApprover[];
  policy?: ApproverPolicy | null;
}

export interface AddApproverBody {
  username: string;
  role_label?: string;
  required?: boolean;
}

export type ApproverDecision = 'approve' | 'reject' | 'request-changes';

export interface ApproverDecisionBody {
  decision: ApproverDecision;
  comment?: string;
}

// ── AI change-analyst history wire shapes ────────────────────────────────────

export interface AiHistoryEvent {
  ts: string;
  /** e.g. 'observation' | 'interview' | 'outcome' | 'signal_change' | 'checkpoint' */
  kind: string;
  axis?: AxisId | string | null;
  severity?: 'info' | 'warning' | 'critical' | string | null;
  message: string;
  payload?: Record<string, unknown> | null;
}

export interface AiHistoryResponse {
  events: AiHistoryEvent[];
}

// ── UI helpers shared by the release surfaces ────────────────────────────────

/** Tailwind chip classes per axis signal (literal strings — purge-safe). */
export const AXIS_SIGNAL_CLASS: Record<AxisSignal, string> = {
  green:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  orange:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  grey: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

/** Display labels for the 7 axes (right-bar rail / analyst chips). */
export const AXIS_LABEL: Record<AxisId, string> = {
  overview: 'Overview',
  ingestion: 'Ingestion',
  data_quality: 'Data Quality',
  governance: 'Governance',
  impact_cost: 'Impact & Cost',
  release: 'Release',
  history: 'History',
};

/** Human-readable status labels (FE fallback when the backend sends none). */
export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = {
  no_changes: 'No changes',
  draft_changes: 'Draft changes',
  checks_not_run: 'Validation required',
  blocked: 'Blocked',
  ready_for_approval: 'Ready for approval',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  deploying: 'Deploying',
  deployed: 'Deployed',
  verified: 'Verified',
  failed: 'Failed',
  rolled_back: 'Rolled back',
};
