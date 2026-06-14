/**
 * Projects — Collaboration service (Data360 goal G11).
 *
 * A thin composition layer for the ONE unified collaborative project view. It
 * reuses the already-wired unified `/projects/*` endpoints (see
 * services/api/projectsApi.ts — importing is allowed, editing it is not) and
 * adds only:
 *   - accurately-typed wrappers where services/api/types.ts is stale
 *     (PROJECT_RUNS returns `started_at` / `duration_seconds`, not `created_at`,
 *      and the deployment list carries the full approval envelope);
 *   - a per-project `loadProjectCollaboration` aggregator that fetches the lock
 *     state, contributors, recent activity, runs + a derived runs-health
 *     summary, and the latest/pending deployment in parallel for one project.
 *
 * No new backend routes are invented. Lock state comes from GET /projects/{id}
 * (the list response omits LOCKED_BY/LOCKED_AT); runs-health is derived
 * client-side because /projects/{id}/runs/summary returns 404.
 *
 * Backend contract wired (all under prefix `/projects`):
 *   GET  /projects/{id}                         → lock state (locked_by/locked_at)
 *   GET  /projects/{id}/contributors            → Contributor[]
 *   GET  /projects/{id}/events?limit=           → PROJECT_EVENTS activity feed
 *   GET  /projects/{id}/runs?page_size=         → PROJECT_RUNS (run health)
 *   GET  /projects/{id}/deployments?limit=      → deploy / approval state
 */
// ////dependency//// services.projects → services.api.projectsApi → lib.api-client
import apiClient from '@/lib/api-client';
import {
  getProject,
  listContributors,
  listEvents,
} from '@/app/services/api/projectsApi';
import type { Contributor, ProjectEvent } from '@/app/services/api/types';

const PREFIX = '/projects';

// ── Accurately-typed run row (matches services.list_runs output) ─────────────

export type RunStatus = 'running' | 'completed' | 'failed' | string;

export interface CollabRun {
  run_id: string;
  version_id: string | null;
  deployment_id: string | null;
  status: RunStatus;
  trigger_type: string | null;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  steps_total: number | null;
  steps_executed: number | null;
  steps_failed: number | null;
  error_log: Record<string, unknown> | null;
}

interface RunsResponse {
  project_id: string;
  runs: CollabRun[];
  total: number;
}

/** Derived health digest for the runs section (no /runs/summary route exists). */
export interface RunsHealth {
  total: number;
  completed: number;
  failed: number;
  running: number;
  success_rate: number | null; // 0–100, null when no terminal runs
  last_run_at: string | null;
  last_status: RunStatus | null;
}

// ── Accurately-typed deployment row (matches services.list_deployments) ──────

export type DeploymentStatus =
  | 'pending'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'deployed'
  | 'failed'
  | 'cancelled'
  | string;

export interface CollabDeployment {
  deployment_id: string;
  version_id: string | null;
  deployment_type: string | null;
  environment: string | null;
  status: DeploymentStatus;
  deployment_method: string | null;
  scheduled_at: string | null;
  deployed_at: string | null;
  deployed_by: string | null;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  error: string | null;
}

interface DeploymentsResponse {
  project_id: string;
  deployments: CollabDeployment[];
  total: number;
}

// ── Per-project lock state (from GET /projects/{id}) ─────────────────────────

export interface LockState {
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
}

// ── Aggregate handed to the collaborative panel ──────────────────────────────

export interface ProjectCollaboration {
  lock: LockState;
  contributors: Contributor[];
  events: ProjectEvent[];
  runs: CollabRun[];
  runsHealth: RunsHealth;
  deployments: CollabDeployment[];
  /** First deployment awaiting an approval decision, if any. */
  pendingDeployment: CollabDeployment | null;
  /** Most recent deployment overall (for the deploy badge). */
  latestDeployment: CollabDeployment | null;
}

// ── Typed fetchers ───────────────────────────────────────────────────────────

export async function listProjectRuns(
  projectId: string,
  pageSize = 20,
): Promise<CollabRun[]> {
  try {
    const { data } = await apiClient.get<RunsResponse>(`${PREFIX}/${projectId}/runs`, {
      params: { page_size: pageSize },
    });
    return Array.isArray(data?.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

export async function listProjectDeployments(
  projectId: string,
  limit = 20,
): Promise<CollabDeployment[]> {
  try {
    const { data } = await apiClient.get<DeploymentsResponse>(
      `${PREFIX}/${projectId}/deployments`,
      { params: { limit } },
    );
    return Array.isArray(data?.deployments) ? data.deployments : [];
  } catch {
    return [];
  }
}

export async function getLockState(projectId: string): Promise<LockState> {
  try {
    const project = await getProject(projectId);
    const lockedBy = (project as { locked_by?: string | null })?.locked_by ?? null;
    const lockedAt = (project as { locked_at?: string | null })?.locked_at ?? null;
    return { locked: Boolean(lockedBy), locked_by: lockedBy, locked_at: lockedAt };
  } catch {
    return { locked: false, locked_by: null, locked_at: null };
  }
}

// ── Derivations ──────────────────────────────────────────────────────────────

export function deriveRunsHealth(runs: CollabRun[]): RunsHealth {
  const total = runs.length;
  let completed = 0;
  let failed = 0;
  let running = 0;
  for (const r of runs) {
    if (r.status === 'completed') completed += 1;
    else if (r.status === 'failed') failed += 1;
    else if (r.status === 'running') running += 1;
  }
  const terminal = completed + failed;
  const success_rate = terminal > 0 ? Math.round((completed / terminal) * 100) : null;
  // runs are returned ordered by STARTED_AT DESC — first row is most recent.
  const last = runs[0] ?? null;
  return {
    total,
    completed,
    failed,
    running,
    success_rate,
    last_run_at: last?.started_at ?? null,
    last_status: last?.status ?? null,
  };
}

const PENDING_DEPLOY_STATES = new Set(['pending', 'pending_approval', 'requested']);

export function pickPendingDeployment(
  deployments: CollabDeployment[],
): CollabDeployment | null {
  return (
    deployments.find((d) => PENDING_DEPLOY_STATES.has(String(d.status).toLowerCase())) ??
    null
  );
}

// ── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Load everything the collaborative panel needs for ONE project, in parallel.
 * Every leg degrades to an empty value on failure so a single 403/404 never
 * blanks the whole panel.
 */
export async function loadProjectCollaboration(
  projectId: string,
): Promise<ProjectCollaboration> {
  const [lock, contributors, eventsRes, runs, deployments] = await Promise.all([
    getLockState(projectId),
    listContributors(projectId).catch(() => [] as Contributor[]),
    listEvents(projectId, { limit: 25 }).catch(() => ({
      project_id: projectId,
      events: [] as ProjectEvent[],
      count: 0,
    })),
    listProjectRuns(projectId, 20),
    listProjectDeployments(projectId, 20),
  ]);

  const events = Array.isArray(eventsRes?.events) ? eventsRes.events : [];
  return {
    lock,
    contributors,
    events,
    runs,
    runsHealth: deriveRunsHealth(runs),
    deployments,
    pendingDeployment: pickPendingDeployment(deployments),
    latestDeployment: deployments[0] ?? null,
  };
}
