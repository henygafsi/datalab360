/**
 * Unified Project Management API client — /projects/*
 * Handles: CRUD, versions, deployments, runs, contributors, events.
 *
 * NOTE: Some functions call routes that do not exist on the unified /projects/
 * router (e.g. versions are per-module, not per-project; state lives under
 * /explore-design). These are wrapped in try-catch so they degrade gracefully
 * (empty response, no error pop-up) when the backend returns 404.
 */
import apiClient from '@/lib/api-client';
import type {
  Project,
  ProjectType,
  ProjectListResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
  DeleteProjectResponse,
  ListProjectsParams,
  ProjectVersion,
  CreateVersionRequest,
  CreateVersionResponse,
  VersionListResponse,
  ListVersionsParams,
  RollbackRequest,
  RollbackResponse,
  ProjectDeployment,
  CreateDeploymentRequest,
  ListDeploymentsParams,
  RejectDeploymentRequest,
  ExecuteDeploymentRequest,
  ProjectRun,
  StartRunRequest,
  CompleteRunRequest,
  ListRunsParams,
  Contributor,
  AddContributorRequest,
  WizardState,
  SaveStateRequest,
  SaveStateResponse,
  EventListResponse,
  ListEventsParams,
  GlobalEventsParams,
  CreateEventRequest,
  CreateEventResponse,
  UpdateEventRequest,
  BulkUpdateEventsRequest,
  BulkUpdateEventsResponse,
} from './types';

const PREFIX = '/projects';

// ============================================================================
// Project CRUD
// ============================================================================

// In-flight dedup: explore-design's page + ProjectSelector each call listProjects
// on open, firing 3-4 identical /projects requests (~524ms each) concurrently.
// Share one in-flight promise per params signature so the burst collapses to a
// single request. Cleared on settle, so later refetches still hit the network.
const _listProjectsInFlight = new Map<string, Promise<ProjectListResponse>>();
export async function listProjects(params?: ListProjectsParams) {
  const key = JSON.stringify(params ?? {});
  const inFlight = _listProjectsInFlight.get(key);
  if (inFlight) return inFlight;
  const p = apiClient
    .get<ProjectListResponse>(PREFIX, { params })
    .then(({ data }) => data)
    .finally(() => _listProjectsInFlight.delete(key));
  _listProjectsInFlight.set(key, p);
  return p;
}

export async function getProject(projectId: string) {
  const { data } = await apiClient.get<Project>(`${PREFIX}/${projectId}`);
  return data;
}

export async function createProject(body: CreateProjectRequest) {
  // POST /projects (unified-CRUD create) added on the backend 2026-06-21 — method gap closed.
  // Idempotent server-side (same project_name+project_type+owner returns the existing project).
  const { data } = await apiClient.post<CreateProjectResponse>(PREFIX, body);
  return data;
}

export async function updateProject(projectId: string, body: UpdateProjectRequest) {
  const { data } = await apiClient.put<Project>(`${PREFIX}/${projectId}`, body);
  return data;
}

export async function deleteProject(projectId: string) {
  const { data } = await apiClient.delete<DeleteProjectResponse>(`${PREFIX}/${projectId}`);
  return data;
}

// ============================================================================
// Lock / Unlock — NOT wired on the unified /projects/ router.
// Calls are kept for forward-compat but return null on 404.
// ============================================================================

export async function lockProject(projectId: string): Promise<Project | null> {
  try {
    const { data } = await apiClient.post<Project>(`${PREFIX}/${projectId}/lock`);
    return data;
  } catch {
    return null;
  }
}

export async function unlockProject(projectId: string): Promise<Project | null> {
  try {
    const { data } = await apiClient.post<Project>(`${PREFIX}/${projectId}/unlock`);
    return data;
  } catch {
    return null;
  }
}

// ============================================================================
// Version Management — /projects/{id}/versions does NOT exist on the unified
// router. Versions live per-module (/workflow/{id}/versions, etc.).
// These stubs keep callers working; they degrade gracefully on 404.
// ============================================================================

export async function createVersion(
  projectId: string,
  body: CreateVersionRequest,
): Promise<CreateVersionResponse | null> {
  try {
    const { data } = await apiClient.post<CreateVersionResponse>(
      `${PREFIX}/${projectId}/versions`,
      body,
    );
    return data;
  } catch {
    return null;
  }
}

export async function listVersions(
  projectId: string,
  params?: ListVersionsParams,
): Promise<VersionListResponse> {
  try {
    const { data } = await apiClient.get<VersionListResponse>(
      `${PREFIX}/${projectId}/versions`,
      { params },
    );
    return data;
  } catch {
    return { project_id: projectId, versions: [], total: 0, current_version: null };
  }
}

export async function getVersion(
  projectId: string,
  versionId: string,
): Promise<ProjectVersion | null> {
  try {
    const { data } = await apiClient.get<ProjectVersion>(
      `${PREFIX}/${projectId}/versions/${versionId}`,
    );
    return data;
  } catch {
    return null;
  }
}

export async function rollbackVersion(projectId: string, body: RollbackRequest) {
  const { data } = await apiClient.post<RollbackResponse>(
    `${PREFIX}/${projectId}/rollback`,
    body,
  );
  return data;
}

// ============================================================================
// Deployments (Unified)
// ============================================================================

export async function requestDeployment(projectId: string, body: CreateDeploymentRequest) {
  const { data } = await apiClient.post<ProjectDeployment>(
    `${PREFIX}/${projectId}/deployments`,
    body,
  );
  return data;
}

export async function listDeployments(projectId: string, params?: ListDeploymentsParams) {
  const { data } = await apiClient.get<{ deployments: ProjectDeployment[] }>(
    `${PREFIX}/${projectId}/deployments`,
    { params },
  );
  return data;
}

export async function approveDeployment(projectId: string, deploymentId: string) {
  const { data } = await apiClient.post<ProjectDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/approve`,
  );
  return data;
}

export async function rejectDeployment(
  projectId: string,
  deploymentId: string,
  body?: RejectDeploymentRequest,
) {
  const { data } = await apiClient.post<ProjectDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/reject`,
    body,
  );
  return data;
}

export async function executeDeployment(
  projectId: string,
  deploymentId: string,
  body?: ExecuteDeploymentRequest,
) {
  const { data } = await apiClient.post<ProjectDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/execute`,
    body,
  );
  return data;
}

// ── BE-1 / BE-3 — single-deployment detail + per-step persistence ──
// The 8 wizard steps. The frontend's internal token for step 2 is 'config';
// the backend's WIZARD_STEPS uses 'configure' — callers must map at this
// boundary (see DeploymentContext.toTrackedStep for the existing pattern).
export type WizardStepKey =
  | 'review' | 'configure' | 'pre_checks' | 'dry_run'
  | 'sql_diff' | 'impact' | 'deploy' | 'verify';

export interface DeploymentStepEntry {
  step: WizardStepKey;
  order: number;
  result: Record<string, unknown> | null;
  has_result: boolean;
  status: 'pending' | 'completed' | 'failed';
}

/** Full detail returned by GET /projects/{id}/deployments/{deployment_id} (BE-1). */
export interface DeploymentDetail extends ProjectDeployment {
  version: Record<string, unknown> | null;
  approvals: unknown | null;
  runs: ProjectRun[];
  run_count: number;
  steps: DeploymentStepEntry[];
  step_results: Record<
    string,
    { step: string; status: string; result: Record<string, unknown>; saved_by: string; saved_at: string }
  >;
  completed_steps: string[];
}

/** BE-1 — full detail of one deployment; rehydrates the deploy view on reload. */
export async function getDeployment(projectId: string, deploymentId: string) {
  const { data } = await apiClient.get<DeploymentDetail>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}`,
  );
  return data;
}

/** BE-3 — persist one wizard step's result onto the deployment record. */
export async function saveDeploymentStep(
  projectId: string,
  deploymentId: string,
  step: WizardStepKey,
  result: Record<string, unknown>,
  status: 'completed' | 'failed' = 'completed',
) {
  const { data } = await apiClient.put<{
    deployment_id: string;
    step: string;
    status: string;
    saved: boolean;
  }>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/steps/${step}`,
    { result, status },
  );
  return data;
}

// ============================================================================
// Execution Runs
// ============================================================================

export async function listRuns(projectId: string, params?: ListRunsParams) {
  const { data } = await apiClient.get<{ runs: ProjectRun[] }>(
    `${PREFIX}/${projectId}/runs`,
    { params },
  );
  return data;
}

/** /projects/{id}/runs/summary does NOT exist. Degrades to empty object. */
export async function getRunSummary(
  projectId: string,
): Promise<Record<string, unknown>> {
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      `${PREFIX}/${projectId}/runs/summary`,
    );
    return data;
  } catch {
    return {};
  }
}

// ============================================================================
// Contributors
// ============================================================================

export async function listContributors(projectId: string) {
  const { data } = await apiClient.get<Contributor[]>(
    `${PREFIX}/${projectId}/contributors`,
  );
  return data;
}

export async function addContributor(projectId: string, body: AddContributorRequest) {
  const { data } = await apiClient.post<Contributor>(
    `${PREFIX}/${projectId}/contributors`,
    body,
  );
  return data;
}

/** DELETE /projects/{id}/contributors/{username} is NOT wired in the router
 *  (service function exists but no route). Returns a structured result so the
 *  caller can distinguish success from a missing route vs a hard error. */
export async function removeContributor(
  projectId: string,
  username: string,
): Promise<{ status: string; username: string; reason?: string }> {
  try {
    const { data } = await apiClient.delete<{ status: string; username: string }>(
      `${PREFIX}/${projectId}/contributors/${username}`,
    );
    return data;
  } catch (err: unknown) {
    const httpStatus = (err as { response?: { status?: number } })?.response?.status;
    if (httpStatus === 404) {
      return { status: 'unavailable', reason: 'route not deployed', username };
    }
    return { status: 'error', username };
  }
}

// ============================================================================
// Project State (Wizard) — /projects/{id}/state does NOT exist under the
// unified router; wizard state lives under /explore-design/{id}/state.
// Degrades gracefully on 404.
// ============================================================================

export async function getState(projectId: string): Promise<WizardState> {
  try {
    const { data } = await apiClient.get<WizardState>(`${PREFIX}/${projectId}/state`);
    return data;
  } catch {
    return { project_id: projectId, step: 0, state: {} };
  }
}

// ============================================================================
// Events (Activity Log)
// ============================================================================

export async function listEvents(projectId: string, params?: ListEventsParams) {
  const { data } = await apiClient.get<EventListResponse>(
    `${PREFIX}/${projectId}/events`,
    { params },
  );
  return data;
}

export async function addEvent(projectId: string, body: CreateEventRequest) {
  const { data } = await apiClient.post<CreateEventResponse>(
    `${PREFIX}/${projectId}/events`,
    body,
  );
  return data;
}

/** PATCH /projects/{id}/events/{eventId} does NOT exist — only bulk-update
 *  is available. Degrades gracefully; callers should prefer bulkUpdateEvents. */
export async function updateEvent(
  projectId: string,
  eventId: string,
  body: UpdateEventRequest,
): Promise<{ event_id: string; status: string }> {
  try {
    const { data } = await apiClient.patch<{ event_id: string; status: string }>(
      `${PREFIX}/${projectId}/events/${eventId}`,
      body,
    );
    return data;
  } catch {
    return { event_id: eventId, status: 'noop' };
  }
}

export async function bulkUpdateEvents(
  projectId: string,
  body: BulkUpdateEventsRequest,
) {
  const { data } = await apiClient.patch<BulkUpdateEventsResponse>(
    `${PREFIX}/${projectId}/events/bulk-update`,
    body,
  );
  return data;
}

/** GET /projects/events/all does NOT exist. Degrades to empty list. */
export async function listGlobalEvents(
  params?: GlobalEventsParams,
): Promise<EventListResponse> {
  try {
    const { data } = await apiClient.get<EventListResponse>(`${PREFIX}/events/all`, {
      params,
    });
    return data;
  } catch {
    return { project_id: '', events: [], count: 0 };
  }
}

// ============================================================================
// Unified Project Context — last-used tracking & cross-module list
// ============================================================================

export interface LastUsedProject {
  module: string;
  project_id: string | null;
  project_name?: string;
  project_type?: string;
}

export interface LastUsedRecent {
  module: string;
  project_id: string;
  project_name: string;
  project_type: string;
  last_used: string | null;
}

export interface UnifiedProject {
  project_id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string | null;
  updated_at: string | null;
  current_version_num: number | null;
  deployment_version: number | null;
  contributors_count: number;
  icon: string;
  page_url: string;
  tags: string[];
}

export interface UnifiedProjectsResponse {
  projects: UnifiedProject[];
  by_type: Record<string, number>;
  last_used: Record<string, string>;
  total: number;
}

export async function getLastUsedProjects(module?: string) {
  const params = module ? { module } : undefined;
  const { data } = await apiClient.get<LastUsedProject | { recent: LastUsedRecent[] }>(
    `${PREFIX}/last-used`,
    { params },
  );
  return data;
}

export async function setLastUsedProject(module: string, projectId: string) {
  const { data } = await apiClient.post<{ status: string; event_id: string }>(
    `${PREFIX}/last-used`,
    { module, project_id: projectId },
  );
  return data;
}

/**
 * Query params for the unified project list.
 *
 * `mine_only` defaults to `true` on the backend (caller's own / contributed
 * projects only). Pass `mine_only: false` to list ALL account projects —
 * including seeded samples (SEED_DASH_* / SEED_WF_*) owned by other identities.
 * All fields are optional so existing no-arg callers keep the backend default.
 */
export interface UnifiedProjectsParams {
  mine_only?: boolean;
  project_type?: ProjectType;
  limit?: number;
  offset?: number;
}

export async function getUnifiedProjects(params?: UnifiedProjectsParams) {
  // axios preserves a literal `false` in the query string (it only drops
  // `undefined`), so `{ mine_only: false }` correctly serialises to
  // `?mine_only=false` and unlocks account-wide listing.
  const { data } = await apiClient.get<UnifiedProjectsResponse>(`${PREFIX}/unified`, {
    params,
  });
  return data;
}
