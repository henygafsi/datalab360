/**
 * Deployments — canonical deployment service layer.
 *
 * This is the single source of truth for the deployment lifecycle the frontend
 * drives against the backend `/deployments/track` module. It supersedes the old
 * `services/deployment-tracking` surface (which now re-exports from here for
 * backwards compatibility with existing importers).
 *
 * Two concerns live here:
 *  1. Tracking — start / advance-step / complete / get / list. Each maps to a
 *     `/deployments/track` route and persists to
 *     CP_DATA360.EVENT_STORE.DEPLOYMENT_PROGRESS. Notifications fan out
 *     automatically via EMIT_DEPLOYMENT_NOTIFICATION into the header bell inbox.
 *  2. Approval lifecycle — approve / reject / execute / rollback. These are the
 *     privileged (`approver`-role) gates on a deployment. Non-approvers receive
 *     a 403, which callers MUST surface inline (disabled action + reason), never
 *     crash.
 */
import apiClient from '@/lib/api-client';

const TRACK = '/deployments/track';

export type DeploymentStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PENDING_APPROVAL'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export type DeploymentStep =
  | 'review'
  | 'configure'
  | 'dry_run'
  | 'deploy'
  | 'verify';

export const DEPLOYMENT_STEPS: DeploymentStep[] = [
  'review',
  'configure',
  'dry_run',
  'deploy',
  'verify',
];

export interface StepError {
  code?: string;
  message: string;
  ts?: string;
  /** Optional extra context per error (line number, table name, etc.) */
  detail?: Record<string, unknown>;
}

export interface DeploymentRow {
  deployment_id: string;
  project_id: string;
  project_name: string | null;
  version_id: string | null;
  owner_username: string;
  approver_username: string | null;
  status: DeploymentStatus;
  current_step: DeploymentStep;
  steps_completed: DeploymentStep[];
  errors_by_step: Record<DeploymentStep, StepError[]>;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number;
  payload?: Record<string, unknown> | null;
  ui_origin?: string | null;
}

export interface StartInput {
  project_id: string;
  project_name?: string;
  version_id?: string;
  approver_username?: string;
  requires_approval?: boolean;
  payload?: Record<string, unknown>;
  ui_origin?: string;
}

export interface AdvanceStepInput {
  step: DeploymentStep;
  completed?: boolean;
  errors?: StepError[];
}

export interface CompleteInput {
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  error?: string;
}

function unwrap<T>(res: { data: any }): T {
  return (res.data?.data ?? res.data) as T;
}

// ---------------------------------------------------------------------------
// Tracking lifecycle
// ---------------------------------------------------------------------------

export async function startDeployment(
  input: StartInput
): Promise<DeploymentRow> {
  const res = await apiClient.post(TRACK, input);
  return unwrap<DeploymentRow>(res);
}

export async function advanceStep(
  deploymentId: string,
  input: AdvanceStepInput
): Promise<DeploymentRow> {
  const res = await apiClient.patch(
    `${TRACK}/${encodeURIComponent(deploymentId)}/step`,
    input
  );
  return unwrap<DeploymentRow>(res);
}

export async function completeDeployment(
  deploymentId: string,
  input: CompleteInput
): Promise<DeploymentRow> {
  const res = await apiClient.post(
    `${TRACK}/${encodeURIComponent(deploymentId)}/complete`,
    input
  );
  return unwrap<DeploymentRow>(res);
}

export async function getDeployment(
  deploymentId: string
): Promise<DeploymentRow> {
  const res = await apiClient.get(
    `${TRACK}/${encodeURIComponent(deploymentId)}`
  );
  return unwrap<DeploymentRow>(res);
}

export async function listActiveDeployments(
  opts: { include_approvals_for_me?: boolean } = {}
): Promise<DeploymentRow[]> {
  const res = await apiClient.get(TRACK, { params: opts });
  const data = unwrap<{ items: DeploymentRow[] }>(res);
  return data?.items ?? [];
}

// ---------------------------------------------------------------------------
// Approval lifecycle — privileged (approver-role) gates.
// All four 403 for non-approvers; surface inline, never crash.
// ---------------------------------------------------------------------------

export interface ApproveInput {
  comment?: string;
}

export interface RejectInput {
  reason?: string;
}

export interface ExecuteInput {
  execution_log?: Record<string, unknown>;
  error?: string;
  finalize_only?: boolean;
}

export interface RollbackInput {
  project_id?: string;
  target_version_id?: string;
  reason?: string;
}

export async function approveDeployment(
  deploymentId: string,
  input: ApproveInput = {}
): Promise<any> {
  const res = await apiClient.post(
    `${TRACK}/${encodeURIComponent(deploymentId)}/approve`,
    input
  );
  return unwrap<any>(res);
}

export async function rejectDeployment(
  deploymentId: string,
  input: RejectInput = {}
): Promise<any> {
  const res = await apiClient.post(
    `${TRACK}/${encodeURIComponent(deploymentId)}/reject`,
    input
  );
  return unwrap<any>(res);
}

export async function executeDeployment(
  deploymentId: string,
  input: ExecuteInput = {}
): Promise<any> {
  const res = await apiClient.post(
    `${TRACK}/${encodeURIComponent(deploymentId)}/execute`,
    input
  );
  return unwrap<any>(res);
}

export async function rollbackDeployment(
  deploymentId: string,
  input: RollbackInput = {}
): Promise<any> {
  const res = await apiClient.post(
    `${TRACK}/${encodeURIComponent(deploymentId)}/rollback`,
    input
  );
  return unwrap<any>(res);
}

// ---------------------------------------------------------------------------
// Display helpers — keep status / step / duration logic in one place so the
// chip, the row, and the popup speak the same language.
// ---------------------------------------------------------------------------
export function isTerminal(status: DeploymentStatus): boolean {
  return (
    status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED'
  );
}

export function statusLabel(status: DeploymentStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Queued';
    case 'RUNNING':
      return 'Running';
    case 'PENDING_APPROVAL':
      return 'Pending approval';
    case 'SUCCEEDED':
      return 'Succeeded';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export function stepLabel(step: DeploymentStep): string {
  return (
    {
      review: 'Review',
      configure: 'Configure',
      dry_run: 'Dry-run',
      deploy: 'Deploy',
      verify: 'Verify',
    } as const
  )[step];
}

export function progressPct(row: DeploymentRow): number {
  const idx = DEPLOYMENT_STEPS.indexOf(row.current_step);
  if (idx < 0) return 0;
  if (row.status === 'SUCCEEDED') return 100;
  // Step index out of 5 → 20 / 40 / 60 / 80 / 95 (cap at 95 until SUCCEEDED).
  const pct = ((idx + 1) / DEPLOYMENT_STEPS.length) * 100;
  return Math.min(95, Math.round(pct));
}

export function fmtDuration(ms: number): string {
  if (!ms || ms < 0) return '0s';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s - m * 60)}s`;
  // Roll long waits up — the header chip once showed a review pending for
  // 3.5 days as a ticking "5044m 2s". Above an hour, seconds are noise.
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m - h * 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h - d * 24}h`;
}
