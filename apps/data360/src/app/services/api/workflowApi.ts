/**
 * Workflow Module API client — /api/v1/workflows/*
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
  WorkflowRollbackParams,
  CreateWorkflowDeploymentRequest,
  WorkflowDeployment,
  WorkflowDeploymentListResponse,
  ListWorkflowDeploymentsParams,
  RejectWorkflowDeploymentRequest,
} from './types';

const PREFIX = '/api/v1/workflows';

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

export async function reorderSteps(workflowId: string, body: ReorderStepsRequest) {
  const { data } = await apiClient.post<ReorderStepsResponse>(
    `${PREFIX}/${workflowId}/steps/reorder`,
    body,
  );
  return data;
}

// ============================================================================
// Action Templates
// ============================================================================

export async function listActionTemplates() {
  const { data } = await apiClient.get<ActionTemplatesResponse>(
    `${PREFIX}/actions/templates`,
  );
  return data;
}

export async function createActionTemplate(body: CreateActionTemplateRequest) {
  const { data } = await apiClient.post<CreateActionTemplateResponse>(
    `${PREFIX}/actions/templates`,
    body,
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
  const { data } = await apiClient.post<CompileWorkflowResponse>(
    `${PREFIX}/${workflowId}/compile`,
  );
  return data;
}

export async function validateWorkflow(workflowId: string) {
  const { data } = await apiClient.post<ValidateWorkflowResponse>(
    `${PREFIX}/${workflowId}/validate`,
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

export async function approveSchedule(workflowId: string, scheduleId: string) {
  const { data } = await apiClient.post<WorkflowSchedule>(
    `${PREFIX}/${workflowId}/schedule/${scheduleId}/approve`,
  );
  return data;
}

export async function rejectSchedule(
  workflowId: string,
  scheduleId: string,
  body?: RejectWorkflowScheduleRequest,
) {
  const { data } = await apiClient.post<WorkflowSchedule>(
    `${PREFIX}/${workflowId}/schedule/${scheduleId}/reject`,
    body,
  );
  return data;
}

export async function activateSchedule(workflowId: string, scheduleId: string) {
  const { data } = await apiClient.post<WorkflowSchedule>(
    `${PREFIX}/${workflowId}/schedule/${scheduleId}/activate`,
  );
  return data;
}

export async function suspendTask(workflowId: string) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${workflowId}/task/suspend`,
  );
  return data;
}

export async function resumeTask(workflowId: string) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${workflowId}/task/resume`,
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

export async function rollbackVersion(workflowId: string, params: WorkflowRollbackParams) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${workflowId}/rollback`,
    null,
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

export async function cancelDeployment(workflowId: string, deploymentId: string) {
  const { data } = await apiClient.post<WorkflowDeployment>(
    `${PREFIX}/${workflowId}/deployments/${deploymentId}/cancel`,
  );
  return data;
}
