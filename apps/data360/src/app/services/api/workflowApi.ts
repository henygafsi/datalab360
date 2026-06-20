/**
 * Workflow Module API client — /workflow/*
 * Handles: CRUD, steps, action templates, execution, runs, scheduling,
 * versions, and deployments for the CTE Pipeline Engine.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import type {
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  UpdateWorkflowRequest,
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
  WorkflowCostSummary,
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
  FromGraphRequest,
  FromGraphResponse,
  WorkflowCapabilities,
  CloneDataTestsResult,
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

/**
 * Update workflow metadata (tags / name / description) — PATCH /workflow/{id}.
 * A workflow is a project row, so this persists to the shared project TAGS
 * column with server-side cache invalidation. Returns the updated Workflow.
 */
export async function updateWorkflow(
  workflowId: string,
  body: UpdateWorkflowRequest,
) {
  const { data } = await apiClient.patch<Workflow>(
    API.workflow.update(workflowId),
    body,
  );
  return data;
}

/**
 * One-shot canvas save: creates a workflow + all steps from the ReactFlow
 * node/edge graph in a single round-trip. This is the bulk replacement for
 * the purged per-step `/steps` CRUD — the builder's Save button wires here.
 * Partial-failure tolerant: per-node/edge problems come back in `errors[]`.
 */
export async function saveWorkflowFromGraph(body: FromGraphRequest) {
  const { data } = await apiClient.post<FromGraphResponse>(
    `${PREFIX}/from-graph`,
    body,
  );
  return data;
}

/**
 * Advisory capabilities hint — which lifecycle routes the backend exposes.
 * Treated as a HINT only by the builder (it can advertise purged routes), so
 * each lifecycle button ALSO self-disables when its route 404s at runtime.
 */
export async function getWorkflowCapabilities() {
  const { data } = await apiClient.get<WorkflowCapabilities>(
    `${PREFIX}/capabilities`,
  );
  return data;
}

/**
 * "Test on cloned data" — runs the pipeline against a CLONED copy of the real
 * source/business data (no write to production). The standard test step that
 * sits between dry-run (compile) and deploy.
 */
export async function runCloneDataTests(
  workflowId: string,
  connectorIds: string[],
  maxTables = 20,
) {
  const params = new URLSearchParams();
  connectorIds.forEach((id) => params.append('connector_ids', id));
  params.append('max_tables', String(maxTables));
  const { data } = await apiClient.get<CloneDataTestsResult>(
    `${PREFIX}/${workflowId}/clone-data-tests?${params.toString()}`,
  );
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

export async function dryRunSavedWorkflow(
  workflowId: string,
  // Backend dry-run contract is {mode: 'clone' | 'temp_tables'} (see STATUS-done-todo);
  // not to be confused with the panel's ValidateStrategy enum (production_clone/pipeline_temp_tables).
  mode?: 'clone' | 'temp_tables',
) {
  // POST /workflow/{id}/dry-run — compile + validate a saved workflow without executing.
  // `mode` selects the validation strategy when the backend honours it; omitted → default.
  const { data } = await apiClient.post(`${PREFIX}/${workflowId}/dry-run`, mode ? { mode } : {});
  return data;
}

// ============================================================================
// Runs
// ============================================================================

export async function listRuns(workflowId: string, params?: ListWorkflowRunsParams) {
  // The backend run-history route paginates on `page_size` (not `limit`); send the
  // requested limit under the param name the route reads, otherwise it silently
  // falls back to the default page size of 20 no matter what the UI asked for.
  const { limit, ...rest } = params ?? {};
  const query = { ...rest, ...(limit != null ? { page_size: limit } : {}) };
  const { data } = await apiClient.get<WorkflowRunsResponse>(
    `${PREFIX}/${workflowId}/runs`,
    { params: query },
  );
  return data;
}

/**
 * Run summary for a workflow. `GET /workflow/{id}/runs/summary` does NOT exist
 * on the backend (404) — the real source is the `metrics` block returned by
 * `GET /workflow/{id}/runs`, so we derive the same summary shape from it
 * (page_size=1: we only need the aggregate metrics, not the run rows).
 */
export async function getRunSummary(workflowId: string): Promise<WorkflowRunSummary> {
  const { data } = await apiClient.get<WorkflowRunsResponse>(
    API.workflow.runs(workflowId),
    { params: { page_size: 1 } },
  );
  const m = data?.metrics;
  return {
    total_runs: m?.total_runs ?? data?.total ?? 0,
    completed: m?.succeeded ?? 0,
    failed: m?.failed ?? 0,
    avg_duration_seconds: m?.avg_duration_seconds ?? null,
    last_run_at: m?.last_run_at ?? null,
  };
}

/**
 * Credit/cost breakdown for one workflow — GET /workflow/{id}/cost-summary
 * (cached ~30 min server-side). Separates attributed vs total credits so the
 * UI can be transparent about what is truly per-workflow.
 */
export async function getWorkflowCostSummary(workflowId: string) {
  const { data } = await apiClient.get<WorkflowCostSummary>(
    API.workflow.costSummary(workflowId),
  );
  return data;
}

/**
 * Cancel a running workflow — POST /workflow/{id}/cancel.
 * Workflow-LEVEL (not per-run): the backend suspends the scheduled task, marks
 * any running runs as cancelled, and best-effort aborts the current session's
 * in-flight query. Returns `{ cancelled_runs, ... }`. There is no per-run-id
 * cancel route, so callers should phrase copy as "cancel running runs".
 */
export async function cancelWorkflowRun(workflowId: string) {
  const { data } = await apiClient.post<{
    cancelled_runs?: number;
    [k: string]: unknown;
  }>(API.workflow.cancelRun(workflowId));
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

/**
 * Delete (drop) the scheduled Snowflake TASK for this workflow —
 * DELETE /workflow/{id}/schedule (DROP TASK IF EXISTS). This is a real
 * teardown, distinct from suspend (pause), which only halts the task.
 */
export async function deleteSchedule(workflowId: string) {
  const { data } = await apiClient.delete<{ state?: string; [k: string]: unknown }>(
    API.workflow.scheduleDelete(workflowId),
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

/**
 * Rollback a workflow to a previous version.
 * Backed by POST /projects/{project_id}/rollback (workflow_id === project_id
 * in the unified projects model).
 */
export async function rollbackVersion(
  workflowId: string,
  body: { target_version_id: string; reason?: string },
) {
  const { data } = await apiClient.post<Record<string, unknown>>(
    `/projects/${workflowId}/rollback`,
    body,
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
