/**
 * Workflow Module API client — /workflow/*
 * Handles: CRUD, steps, action templates, execution, runs, scheduling,
 * versions, and deployments for the CTE Pipeline Engine.
 */
import apiClient from '@/lib/api-client';
import type {
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  Workflow,
  WorkflowStepsResponse,
  AddStepRequest,
  AddStepResponse,
  UpdateStepRequest,
  UpdateStepResponse,
  DeleteStepResponse,
  ReorderStepsRequest,
  ReorderStepsResponse,
  ActionTemplatesResponse,
  CreateActionTemplateRequest,
  CreateActionTemplateResponse,
  ExecuteWorkflowRequest,
  WorkflowExecutionResponse,
  CompileWorkflowResponse,
  ValidateWorkflowResponse,
  WorkflowRunsResponse,
  ListWorkflowRunsParams,
  WorkflowRunSummary,
  CreateWorkflowScheduleRequest,
  WorkflowSchedule,
  WorkflowScheduleListResponse,
  ListScheduledWorkflowsParams,
  RejectWorkflowScheduleRequest,
  WorkflowVersionsResponse,
  ListWorkflowVersionsParams,
  CreateWorkflowDeploymentRequest,
  WorkflowDeployment,
  WorkflowDeploymentListResponse,
  ListWorkflowDeploymentsParams,
  RejectWorkflowDeploymentRequest,
} from './types';

const PREFIX = '/workflow';

// ============================================================================
// Workflow CRUD
// ============================================================================

export async function createWorkflow(body: CreateWorkflowRequest) {
  const { data } = await apiClient.post<CreateWorkflowResponse>(PREFIX, body);
  return data;
}

export async function getWorkflow(workflowId: string) {
  const { data } = await apiClient.get<Workflow>(`${PREFIX}/${workflowId}`);
  return data;
}

// ============================================================================
// Steps Management
// ============================================================================

export async function listSteps(workflowId: string) {
  const { data } = await apiClient.get<WorkflowStepsResponse>(
    `${PREFIX}/${workflowId}/steps`,
  );
  return data;
}

export async function addStep(workflowId: string, body: AddStepRequest) {
  const { data } = await apiClient.post<AddStepResponse>(
    `${PREFIX}/${workflowId}/steps`,
    body,
  );
  return data;
}

export async function updateStep(
  workflowId: string,
  stepId: string,
  body: UpdateStepRequest,
) {
  const { data } = await apiClient.put<UpdateStepResponse>(
    `${PREFIX}/${workflowId}/steps/${stepId}`,
    body,
  );
  return data;
}

export async function deleteStep(workflowId: string, stepId: string) {
  const { data } = await apiClient.delete<DeleteStepResponse>(
    `${PREFIX}/${workflowId}/steps/${stepId}`,
  );
  return data;
}

// ============================================================================
// Action Templates
// ============================================================================

export async function listActionTemplates() {
  const { data } = await apiClient.get<ActionTemplatesResponse>(
    `${PREFIX}/action-templates`,
  );
  return data;
}

// ============================================================================
// Execution
// ============================================================================

export async function executeWorkflow(workflowId: string, body?: ExecuteWorkflowRequest) {
  const { data } = await apiClient.post<WorkflowExecutionResponse>(
    `${PREFIX}/${workflowId}/execute`,
    body,
  );
  return data;
}

export async function compileWorkflow(workflowId: string) {
  // No request body — POST with empty body to avoid FastAPI 422
  const { data } = await apiClient.post<CompileWorkflowResponse>(
    `${PREFIX}/${workflowId}/compile`,
    {},
  );
  return data;
}

export async function validateWorkflow(workflowId: string) {
  // No request body — POST with empty body to avoid FastAPI 422
  const { data } = await apiClient.post<ValidateWorkflowResponse>(
    `${PREFIX}/${workflowId}/validate`,
    {},
  );
  return data;
}

// ============================================================================
// Runs
// ============================================================================

export async function listRuns(workflowId: string, params?: ListWorkflowRunsParams) {
  const { data } = await apiClient.get<WorkflowRunsResponse>(
    `${PREFIX}/${workflowId}/runs`,
    { params },
  );
  return data;
}

export async function getRunSummary(workflowId: string) {
  const { data } = await apiClient.get<WorkflowRunSummary>(
    `${PREFIX}/${workflowId}/runs/summary`,
  );
  return data;
}

export async function analyzeRun(workflowId: string, runId: string) {
  const { data } = await apiClient.post<{ ai_analysis: string }>(
    `${PREFIX}/${workflowId}/runs/${runId}/analyze`,
  );
  return data;
}

// ============================================================================
// Scheduling
// ============================================================================

export async function scheduleWorkflow(
  workflowId: string,
  body: CreateWorkflowScheduleRequest,
) {
  const { data } = await apiClient.post<WorkflowSchedule>(
    `${PREFIX}/${workflowId}/schedule`,
    body,
  );
  return data;
}

export async function suspendTask(workflowId: string) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${workflowId}/schedule/pause`,
  );
  return data;
}

export async function resumeTask(workflowId: string) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${workflowId}/schedule/resume`,
  );
  return data;
}

export async function getWorkflowSchedules(workflowId: string) {
  const { data } = await apiClient.get<WorkflowScheduleListResponse>(
    `${PREFIX}/${workflowId}/schedules`,
  );
  return data;
}

export async function listScheduledWorkflows(params?: ListScheduledWorkflowsParams) {
  const { data } = await apiClient.get<WorkflowScheduleListResponse>(
    `${PREFIX}/schedules`,
    { params },
  );
  return data;
}

// ============================================================================
// Versions
// ============================================================================

export async function listVersions(
  workflowId: string,
  params?: ListWorkflowVersionsParams,
) {
  const { data } = await apiClient.get<WorkflowVersionsResponse>(
    `${PREFIX}/${workflowId}/versions`,
    { params },
  );
  return data;
}

// ============================================================================
// Deployments
// ============================================================================

export async function requestDeployment(
  workflowId: string,
  body: CreateWorkflowDeploymentRequest,
) {
  const { data } = await apiClient.post<WorkflowDeployment>(
    `${PREFIX}/${workflowId}/deployments`,
    body,
  );
  return data;
}

export async function listDeployments(
  workflowId: string,
  params?: ListWorkflowDeploymentsParams,
) {
  const { data } = await apiClient.get<WorkflowDeploymentListResponse>(
    `${PREFIX}/${workflowId}/deployments`,
    { params },
  );
  return data;
}

export async function approveDeployment(workflowId: string, deploymentId: string) {
  const { data } = await apiClient.post<WorkflowDeployment>(
    `${PREFIX}/${workflowId}/deployments/${deploymentId}/approve`,
  );
  return data;
}

export async function rejectDeployment(
  workflowId: string,
  deploymentId: string,
  body?: RejectWorkflowDeploymentRequest,
) {
  const { data } = await apiClient.post<WorkflowDeployment>(
    `${PREFIX}/${workflowId}/deployments/${deploymentId}/reject`,
    body,
  );
  return data;
}

export async function executeDeployment(workflowId: string, deploymentId: string) {
  const { data } = await apiClient.post<WorkflowDeployment>(
    `${PREFIX}/${workflowId}/deployments/${deploymentId}/execute`,
  );
  return data;
}

// ============================================================================
// Snowflake Task Discovery & Import
// ============================================================================

export interface DiscoveredTask {
  name: string;
  database_name: string;
  schema_name: string;
  fqn: string;
  state: string;
  schedule: string;
  warehouse: string;
  definition: string;
  predecessors: string[];
  owner: string;
  created_on: string;
  is_root: boolean;
}

export interface TaskGraph {
  root_task: string;
  task_count: number;
  tasks: DiscoveredTask[];
  state: string;
  schedule: string;
}

export interface DiscoverTasksResponse {
  tasks: DiscoveredTask[];
  graphs: TaskGraph[];
  total: number;
  root_tasks: number;
}

export interface ImportTaskResponse {
  project_id: string;
  project_name: string;
  steps_created: number;
  steps: Array<{
    step_id: string;
    step_name: string;
    step_type: string;
    sql_statement: string;
    depends_on: string[];
    warehouse: string;
    metadata: Record<string, string>;
  }>;
  source_task: string;
}

export interface TaskStatusRun {
  NAME: string;
  STATE: string;
  SCHEDULED_TIME: string;
  COMPLETED_TIME: string;
  DURATION_SECONDS: number;
  ERROR_CODE: string | null;
  ERROR_MESSAGE: string | null;
}

export interface TaskStatusResponse {
  workflow_id: string;
  task_name: string;
  task_info: Record<string, unknown> | null;
  runs: TaskStatusRun[];
  stats: {
    total: number;
    succeeded: number;
    failed: number;
    success_rate: number;
  };
}

export async function discoverTasks(params?: {
  database?: string;
  state?: string;
}) {
  const { data } = await apiClient.get<DiscoverTasksResponse>(
    `${PREFIX}/tasks/discover`,
    { params },
  );
  return data;
}

export async function importTaskGraph(rootTaskFqn: string) {
  const { data } = await apiClient.post<ImportTaskResponse>(
    `${PREFIX}/tasks/import`,
    { root_task_fqn: rootTaskFqn },
  );
  return data;
}

export async function getTaskStatus(
  workflowId: string,
  params?: { days?: number },
) {
  const { data } = await apiClient.get<TaskStatusResponse>(
    `${PREFIX}/${workflowId}/task-status`,
    { params },
  );
  return data;
}
