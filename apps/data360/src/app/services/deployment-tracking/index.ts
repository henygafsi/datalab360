/**
 * Deployment tracking service — talks to the /deployments/track backend
 * module. Each user action in the deploy popup hits one of these.
 *
 * Backend table → CP_DATA360.EVENT_STORE.DEPLOYMENT_PROGRESS.
 * Notifications fan out automatically via EMIT_DEPLOYMENT_NOTIFICATION
 * and land in the same inbox the header bell reads.
 */
import apiClient from '@/lib/api-client';

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

export async function startDeployment(input: StartInput): Promise<DeploymentRow> {
  const res = await apiClient.post('/deployments/track', input);
  return unwrap<DeploymentRow>(res);
}

export async function advanceStep(
  deploymentId: string,
  input: AdvanceStepInput,
): Promise<DeploymentRow> {
  const res = await apiClient.patch(
    `/deployments/track/${encodeURIComponent(deploymentId)}/step`,
    input,
  );
  return unwrap<DeploymentRow>(res);
}

export async function completeDeployment(
  deploymentId: string,
  input: CompleteInput,
): Promise<DeploymentRow> {
  const res = await apiClient.post(
    `/deployments/track/${encodeURIComponent(deploymentId)}/complete`,
    input,
  );
  return unwrap<DeploymentRow>(res);
}

export async function getDeployment(deploymentId: string): Promise<DeploymentRow> {
  const res = await apiClient.get(`/deployments/track/${encodeURIComponent(deploymentId)}`);
  return unwrap<DeploymentRow>(res);
}

export async function listActiveDeployments(
  opts: { include_approvals_for_me?: boolean } = {},
): Promise<DeploymentRow[]> {
  const res = await apiClient.get('/deployments/track', { params: opts });
  const data = unwrap<{ items: DeploymentRow[] }>(res);
  return data?.items ?? [];
}

// ---------------------------------------------------------------------------
// Display helpers — keep status / step / duration logic in one place so the
// chip, the row, and the popup speak the same language.
// ---------------------------------------------------------------------------
export function isTerminal(status: DeploymentStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED';
}

export function statusLabel(status: DeploymentStatus): string {
  switch (status) {
    case 'PENDING': return 'Queued';
    case 'RUNNING': return 'Running';
    case 'PENDING_APPROVAL': return 'Pending approval';
    case 'SUCCEEDED': return 'Succeeded';
    case 'FAILED': return 'Failed';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

export function stepLabel(step: DeploymentStep): string {
  return ({
    review: 'Review',
    configure: 'Configure',
    dry_run: 'Dry-run',
    deploy: 'Deploy',
    verify: 'Verify',
  } as const)[step];
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
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}
