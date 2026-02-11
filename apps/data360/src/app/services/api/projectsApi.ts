/**
 * Unified Project Management API client — /api/v1/projects/*
 * Handles: CRUD, lock/unlock, versions, deployments, runs, contributors, state, events.
 */
import apiClient from '@/lib/api-client';
import type {
  Project,
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
} from './types';

const PREFIX = '/api/v1/projects';

// ============================================================================
// Project CRUD
// ============================================================================

export async function listProjects(params?: ListProjectsParams) {
  const { data } = await apiClient.get<ProjectListResponse>(PREFIX, { params });
  return data;
}

export async function getProject(projectId: string) {
  const { data } = await apiClient.get<Project>(`${PREFIX}/${projectId}`);
  return data;
}

export async function createProject(body: CreateProjectRequest) {
  const { data } = await apiClient.post<CreateProjectResponse>(PREFIX, body);
  return data;
}

export async function updateProject(projectId: string, body: UpdateProjectRequest) {
  const { data } = await apiClient.patch<Project>(`${PREFIX}/${projectId}`, body);
  return data;
}

export async function deleteProject(projectId: string) {
  const { data } = await apiClient.delete<DeleteProjectResponse>(`${PREFIX}/${projectId}`);
  return data;
}

// ============================================================================
// Lock / Unlock
// ============================================================================

export async function lockProject(projectId: string) {
  const { data } = await apiClient.post<Project>(`${PREFIX}/${projectId}/lock`);
  return data;
}

export async function unlockProject(projectId: string) {
  const { data } = await apiClient.post<Project>(`${PREFIX}/${projectId}/unlock`);
  return data;
}

// ============================================================================
// Version Management
// ============================================================================

export async function createVersion(projectId: string, body: CreateVersionRequest) {
  const { data } = await apiClient.post<CreateVersionResponse>(
    `${PREFIX}/${projectId}/versions`,
    body,
  );
  return data;
}

export async function listVersions(projectId: string, params?: ListVersionsParams) {
  const { data } = await apiClient.get<VersionListResponse>(
    `${PREFIX}/${projectId}/versions`,
    { params },
  );
  return data;
}

export async function getVersion(projectId: string, versionId: string) {
  const { data } = await apiClient.get<ProjectVersion>(
    `${PREFIX}/${projectId}/versions/${versionId}`,
  );
  return data;
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

// ============================================================================
// Execution Runs
// ============================================================================

export async function startRun(projectId: string, body: StartRunRequest) {
  const { data } = await apiClient.post<ProjectRun>(`${PREFIX}/${projectId}/runs`, body);
  return data;
}

export async function listRuns(projectId: string, params?: ListRunsParams) {
  const { data } = await apiClient.get<{ runs: ProjectRun[] }>(
    `${PREFIX}/${projectId}/runs`,
    { params },
  );
  return data;
}

export async function getRunSummary(projectId: string) {
  const { data } = await apiClient.get<Record<string, unknown>>(
    `${PREFIX}/${projectId}/runs/summary`,
  );
  return data;
}

export async function completeRun(
  projectId: string,
  runId: string,
  body: CompleteRunRequest,
) {
  const { data } = await apiClient.patch<ProjectRun>(
    `${PREFIX}/${projectId}/runs/${runId}/complete`,
    body,
  );
  return data;
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

export async function removeContributor(projectId: string, username: string) {
  const { data } = await apiClient.delete<{ status: string; username: string }>(
    `${PREFIX}/${projectId}/contributors/${username}`,
  );
  return data;
}

// ============================================================================
// Project State (Wizard)
// ============================================================================

export async function getState(projectId: string) {
  const { data } = await apiClient.get<WizardState>(`${PREFIX}/${projectId}/state`);
  return data;
}

export async function saveState(projectId: string, body: SaveStateRequest) {
  const { data } = await apiClient.put<SaveStateResponse>(
    `${PREFIX}/${projectId}/state`,
    body,
  );
  return data;
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

export async function listGlobalEvents(params?: GlobalEventsParams) {
  const { data } = await apiClient.get<EventListResponse>(`${PREFIX}/events/all`, {
    params,
  });
  return data;
}
