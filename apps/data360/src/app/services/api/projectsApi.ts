/**
 * Unified Project Management API client — /projects/*
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
  UpdateEventRequest,
  BulkUpdateEventsRequest,
  BulkUpdateEventsResponse,
} from './types';

const PREFIX = '/projects';

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

export async function updateEvent(
  projectId: string,
  eventId: string,
  body: UpdateEventRequest,
) {
  const { data } = await apiClient.patch<{ event_id: string; status: string }>(
    `${PREFIX}/${projectId}/events/${eventId}`,
    body,
  );
  return data;
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

export async function listGlobalEvents(params?: GlobalEventsParams) {
  const { data } = await apiClient.get<EventListResponse>(`${PREFIX}/events/all`, {
    params,
  });
  return data;
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

export async function getUnifiedProjects() {
  const { data } = await apiClient.get<UnifiedProjectsResponse>(`${PREFIX}/unified`);
  return data;
}
