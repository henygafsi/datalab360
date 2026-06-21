/**
 * Workflow API Service
 *
 * ⚠️ Canonical save/run path: `@/app/services/api/workflowApi`.
 * The CRUD / version / run / deployment / contributor functions in THIS file
 * are superseded by `services/api/workflowApi.ts` and are kept only because the
 * out-of-scope admin route-prober (`(dashboard)/admin/api-health/page.tsx`)
 * imports the full export surface here. The workflow builder must NOT call the
 * duplicated functions below — use `workflowApi.*` instead. The unique value of
 * this file is the Developer-Tools surface (Git repos, Compute Pools, Container
 * Services, Notebooks, ad-hoc run-sql / run-python), which has no equivalent in
 * `workflowApi.ts`.
 *
 * Comprehensive workflow management including:
 * - CRUD operations (DEPRECATED — see workflowApi.ts)
 * - Version history with rollback (DEPRECATED — see workflowApi.ts)
 * - Execution history (runs) (DEPRECATED — see workflowApi.ts)
 * - Deployment with approval workflow (DEPRECATED — see workflowApi.ts)
 * - Developer Tools (Git / Notebooks / Compute Pools / Services / run-sql / run-python) — canonical here
 */

import apiClient from '@/lib/api-client';

// ============================================
// TYPES
// ============================================

export type WorkflowStatus = 'draft' | 'pending_approval' | 'approved' | 'deployed' | 'suspended' | 'archived';
export type VersionStatus = 'active' | 'superseded' | 'rolled_back';
export type RunStatus = 'running' | 'completed' | 'failed';
export type TriggerType = 'manual' | 'scheduled';
export type DeploymentStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'SCHEDULED';
export type ContributorRole = 'viewer' | 'editor' | 'admin';

export interface WorkflowStep {
  step_order: number;
  action_type: string;
  payload: Record<string, any>;
}

export interface Workflow {
  workflow_id?: string;
  workflow_name: string;
  steps: WorkflowStep[];
  schedule_interval_str?: string | null;
  status?: WorkflowStatus;
  project_id?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowVersion {
  version_id: string;
  version_number: number;
  version_name: string;
  steps: WorkflowStep[];
  changes_summary: {
    steps_count: number;
    steps_added?: number;
    steps_removed?: number;
    steps_modified?: number;
  };
  status: VersionStatus;
  created_by: string;
  created_at: string;
  description?: string;
  can_rollback: boolean;
}

export interface WorkflowRunErrorLog {
  step_order?: number;
  action_type?: string;
  error_message?: string;
  error_code?: string;
  timestamp?: string;
}

export interface WorkflowRunExecutionDetails {
  steps: Array<{
    step_order: number;
    action_type: string;
    status: 'completed' | 'failed' | 'skipped';
    started_at?: string;
    completed_at?: string;
    output?: Record<string, unknown>;
    error?: string;
  }>;
  environment?: Record<string, string>;
}

export interface WorkflowRun {
  run_id: string;
  version_id: string;
  status: RunStatus;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  triggered_by: string;
  trigger_type: TriggerType;
  steps_executed: number;
  steps_failed: number;
  error_log?: WorkflowRunErrorLog[];
  execution_details?: WorkflowRunExecutionDetails;
}

export interface WorkflowContributor {
  id: string;
  workflow_id: string;
  user_name: string;
  role: ContributorRole;
  added_by: string;
  added_at: string;
}

export interface WorkflowDeployment {
  event_id: string;
  workflow_id: string;
  workflow_name: string;
  module: 'WORKFLOW';
  status: DeploymentStatus;
  scheduled_date?: string;
  steps: WorkflowStep[];
  created_by?: string;
  created_at?: string;
  approved_by?: string;
  approved_at?: string;
  actions: ('approve' | 'reject' | 'activate')[];
}

// ============================================
// BASIC WORKFLOW OPERATIONS
// ============================================

/**
 * Get all workflows for the authenticated user
 */
export async function getWorkflows(): Promise<Workflow[]> {
  const response = await apiClient.get('/workflow');
  return response.data.workflows || [];
}

/**
 * Create a new workflow
 */
export async function createWorkflow(workflow: {
  workflow_name: string;
  steps: WorkflowStep[];
  project_id?: string;
}): Promise<{ message: string; workflow_name: string; workflow_id?: string }> {
  const response = await apiClient.post('/workflow', workflow);
  return response.data;
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(workflow: {
  workflow_name: string;
  steps: WorkflowStep[];
}): Promise<{ message: string; workflow_name: string }> {
  const response = await apiClient.post('/workflow', workflow);
  return response.data;
}

/**
 * Rename a workflow
 */
export async function renameWorkflow(
  oldWorkflowName: string,
  newWorkflowName: string
): Promise<{ message: string }> {
  const response = await apiClient.post(
    '/workflow',
    { old_workflow_name: oldWorkflowName, new_workflow_name: newWorkflowName }
  );
  return response.data;
}

/**
 * Execute a workflow immediately
 */
export async function executeWorkflow(workflowId: string): Promise<{ message: string; task_id?: string }> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/execute`,
    {}
  );
  return response.data;
}

/**
 * Schedule a workflow for recurring execution
 */
export async function scheduleWorkflow(
  workflowId: string,
  cronSchedule: 'hourly' | 'daily' | 'weekly' | 'monthly'
): Promise<{ message: string }> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/schedule`,
    { cron_schedule: cronSchedule }
  );
  return response.data;
}

/**
 * Suspend a scheduled workflow task
 */
export async function suspendTask(workflowId: string): Promise<{ message: string }> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/schedule/pause`,
    {}
  );
  return response.data;
}

/**
 * Resume a suspended workflow task
 */
export async function resumeTask(workflowId: string): Promise<{ message: string }> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/schedule/resume`,
    {}
  );
  return response.data;
}

// ============================================
// VERSION HISTORY
// ============================================

/**
 * Get version history for a workflow
 */
export async function getWorkflowVersions(
  workflowId: string,
  options?: { limit?: number; include_rolled_back?: boolean }
): Promise<{
  workflow_id: string;
  current_version: WorkflowVersion | null;
  versions: WorkflowVersion[];
  total_versions: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.include_rolled_back) params.append('include_rolled_back', 'true');

  const response = await apiClient.get(
    `/workflow/${workflowId}/versions?${params.toString()}`
  );
  return response.data;
}

/**
 * Create a new version snapshot of current workflow steps
 */
export async function createWorkflowVersion(
  workflowId: string,
  options?: { version_name?: string; description?: string }
): Promise<{
  version_id: string;
  version_number: number;
  version_name: string;
  status: VersionStatus;
}> {
  const response = await apiClient.post(
    `/workflow/${workflowId}/versions`,
    options || {}
  );
  return response.data;
}

/**
 * Rollback workflow to a specific version
 */
export async function rollbackWorkflow(
  workflowId: string,
  versionId: string,
  reason?: string
): Promise<{
  status: string;
  rolled_back_to: string;
  target_version_number: number;
  versions_rolled_back: number;
  message: string;
}> {
  const response = await apiClient.post(
    `/projects/${workflowId}/rollback`,
    { target_version_id: versionId, reason }
  );
  return response.data;
}

// ============================================
// EXECUTION HISTORY
// ============================================

/**
 * Get execution history for a workflow
 */
export async function getWorkflowRuns(
  workflowId: string,
  options?: { limit?: number; status?: RunStatus }
): Promise<{
  workflow_id: string;
  runs: WorkflowRun[];
  total_runs: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.status) params.append('status', options.status);

  const response = await apiClient.get(
    `/workflow/${workflowId}/runs?${params.toString()}`
  );
  return response.data;
}

// ============================================
// DEPLOYMENT & APPROVAL
// ============================================

/**
 * Schedule a workflow for deployment with optional approval workflow
 * Uses POST /workflow/{workflow_id}/deployments
 */
export async function scheduleDeployment(options: {
  workflow_id: string;
  workflow_name: string;
  steps: WorkflowStep[];
  scheduled_date?: string;
  requires_approval?: boolean;
  immediate?: boolean;
  created_by?: string;
  description?: string;
}): Promise<{
  event_id: string;
  workflow_id: string;
  workflow_name: string;
  status: DeploymentStatus;
  message: string;
}> {
  const isImmediate = options.immediate === true;
  const deploymentType = isImmediate ? 'immediate' : (options.requires_approval ? 'with_approval' : 'scheduled');

  const deploymentPayload = {
    type: deploymentType,
    scheduled_at: options.scheduled_date || new Date().toISOString(),
    requires_approval: options.requires_approval || false,
    description: options.description || `Workflow deployment: ${options.workflow_name}`,
    created_by: options.created_by || 'system',
  };

  // Step 1: Create the deployment
  const createResponse = await apiClient.post(
    `/workflow/${encodeURIComponent(options.workflow_id)}/deployments`,
    deploymentPayload
  );

  const deploymentId = createResponse.data.deployment_id || createResponse.data.id || createResponse.data.schedule_id;

  // Step 2: For immediate deployments, execute right away
  if (isImmediate && deploymentId) {
    try {
      await apiClient.post(
        `/workflow/${encodeURIComponent(options.workflow_id)}/deployments/${deploymentId}/execute`,
        { rollback_on_error: true }
      );
      return {
        event_id: deploymentId,
        workflow_id: options.workflow_id,
        workflow_name: options.workflow_name,
        status: 'ACTIVE',
        message: 'Workflow deployed and executed successfully',
      };
    } catch (execError: unknown) {
      const errorMessage = execError instanceof Error ? execError.message : String(execError);
      return {
        event_id: deploymentId,
        workflow_id: options.workflow_id,
        workflow_name: options.workflow_name,
        status: 'APPROVED',
        message: `Deployment created but execution failed: ${errorMessage}`,
      };
    }
  }

  return {
    event_id: deploymentId || `workflow_${Date.now()}`,
    workflow_id: options.workflow_id,
    workflow_name: options.workflow_name,
    status: options.requires_approval ? 'PENDING_APPROVAL' : 'SCHEDULED',
    message: createResponse.data.message || 'Deployment scheduled successfully',
  };
}

/**
 * Approve a pending workflow deployment
 * Uses POST /workflow/{workflow_id}/deployments/{deployment_id}/approve
 */
export async function approveDeployment(workflowId: string, eventId: string, comment?: string): Promise<{
  status: string;
  event_id: string;
  workflow_id: string;
  approved_by: string;
}> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/deployments/${encodeURIComponent(eventId)}/approve`,
    { comment: comment || '' }
  );
  return {
    status: 'APPROVED',
    event_id: eventId,
    workflow_id: response.data.workflow_id || workflowId,
    approved_by: response.data.approved_by || '',
  };
}

/**
 * Reject a pending workflow deployment
 * Uses POST /workflow/{workflow_id}/deployments/{deployment_id}/reject
 */
export async function rejectDeployment(
  workflowId: string,
  eventId: string,
  reason?: string
): Promise<{
  status: string;
  event_id: string;
  workflow_id: string;
  rejected_by: string;
  reason?: string;
}> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/deployments/${encodeURIComponent(eventId)}/reject`,
    { reason: reason || '' }
  );
  return {
    status: 'REJECTED',
    event_id: eventId,
    workflow_id: response.data.workflow_id || workflowId,
    rejected_by: response.data.rejected_by || '',
    reason,
  };
}

/**
 * Activate an approved workflow deployment
 * Uses POST /workflow/{workflow_id}/deployments/{deployment_id}/execute
 */
export async function activateDeployment(workflowId: string, eventId: string): Promise<{
  status: string;
  event_id: string;
  workflow_id: string;
  workflow_name: string;
  activated_by: string;
}> {
  const response = await apiClient.post(
    `/workflow/${encodeURIComponent(workflowId)}/deployments/${encodeURIComponent(eventId)}/execute`,
    { rollback_on_error: true }
  );
  return {
    status: 'ACTIVE',
    event_id: eventId,
    workflow_id: response.data.workflow_id || workflowId,
    workflow_name: response.data.workflow_name || '',
    activated_by: response.data.executed_by || '',
  };
}

/**
 * Get all workflow deployments (pending, approved, active)
 * Uses GET /workflow/{workflow_id}/deployments
 */
export async function getWorkflowDeployments(options?: {
  projectId?: string;
  status?: DeploymentStatus;
  limit?: number;
}): Promise<{
  deployments: WorkflowDeployment[];
  total: number;
}> {
  const workflowId = options?.projectId;

  if (!workflowId) {
    return { deployments: [], total: 0 };
  }

  const params = new URLSearchParams();
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', String(options.limit));

  const response = await apiClient.get(
    `/workflow/${encodeURIComponent(workflowId)}/deployments?${params.toString()}`,
    { timeout: 15000 }
  );

  const raw: unknown = response.data?.deployments ?? response.data?.scheduled_deployments ?? [];
  const list = (Array.isArray(raw) ? raw : []) as RawDeploymentRecord[];
  const deployments = list
    .filter((d) => (d.module || d.module_name || '').toString().toUpperCase() === 'WORKFLOW')
    .map((d) => ({
      event_id: d.deployment_id || d.event_id || d.id || d.schedule_id || '',
      workflow_id: d.project_id || d.config?.workflow_id || '',
      workflow_name: d.workflow_name || d.config?.workflow_name || d.version || '',
      module: 'WORKFLOW' as const,
      status: d.status as DeploymentStatus,
      scheduled_date: d.scheduled_date || d.scheduled_at,
      steps: d.steps || d.config?.steps || [],
      created_by: d.created_by || d.config?.created_by,
      created_at: d.created_at,
      approved_by: d.approved_by,
      approved_at: d.approved_at,
      actions: getDeploymentActions(d.status),
    }));

  return {
    deployments,
    total: deployments.length,
  };
}

/** Raw deployment record as returned by the backend before normalization */
interface RawDeploymentRecord {
  deployment_id?: string;
  event_id?: string;
  id?: string;
  schedule_id?: string;
  project_id?: string;
  module?: string;
  module_name?: string;
  version?: string;
  workflow_name?: string;
  status: string;
  scheduled_date?: string;
  scheduled_at?: string;
  steps?: WorkflowStep[];
  created_by?: string;
  created_at?: string;
  approved_by?: string;
  approved_at?: string;
  config?: {
    workflow_id?: string;
    workflow_name?: string;
    steps?: WorkflowStep[];
    created_by?: string;
    [key: string]: unknown;
  };
}

// Helper function to determine available actions based on status
function getDeploymentActions(status: string): ('approve' | 'reject' | 'activate')[] {
  switch (status) {
    case 'PENDING_APPROVAL':
      return ['approve', 'reject'];
    case 'APPROVED':
      return ['activate'];
    default:
      return [];
  }
}

// ============================================
// CONTRIBUTORS
// ============================================

/**
 * Get contributors for a workflow
 */
export async function getWorkflowContributors(workflowId: string): Promise<WorkflowContributor[]> {
  const response = await apiClient.get(
    `/projects/${workflowId}/contributors`
  );
  return response.data.contributors || [];
}

/**
 * Add a contributor to a workflow
 */
export async function addWorkflowContributor(
  workflowId: string,
  userName: string,
  role: ContributorRole
): Promise<{ message: string; contributor_id: string }> {
  const response = await apiClient.post(
    `/projects/${workflowId}/contributors`,
    { user_name: userName, role }
  );
  return response.data;
}

/**
 * Remove a contributor from a workflow
 */
export async function removeWorkflowContributor(
  workflowId: string,
  username: string
): Promise<{ message: string }> {
  const response = await apiClient.delete(
    `/projects/${workflowId}/contributors/${encodeURIComponent(username)}`
  );
  return response.data;
}

// ============================================
// SETUP
// ============================================

/**
 * Initialize workflow tracking tables (run once).
 * Backed by POST /workflow/setup/initialize-tables (deployed — verified in OpenAPI 2026-06-09).
 */
export async function initializeTables(): Promise<{
  status: string;
  message: string;
  tables_created: string[];
}> {
  const response = await apiClient.post(
    '/workflow/setup/initialize-tables',
    {}
  );
  return response.data;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number | string | null | undefined): string {
  const s = seconds == null || seconds === '' ? NaN : Number(seconds);
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Run statuses
    running: 'text-blue-500 bg-blue-50',
    completed: 'text-green-500 bg-green-50',
    failed: 'text-red-500 bg-red-50',
    // Deployment statuses
    PENDING_APPROVAL: 'text-yellow-500 bg-yellow-50',
    APPROVED: 'text-blue-500 bg-blue-50',
    REJECTED: 'text-red-500 bg-red-50',
    ACTIVE: 'text-green-500 bg-green-50',
    SCHEDULED: 'text-purple-500 bg-purple-50',
    // Version statuses
    active: 'text-green-500 bg-green-50',
    superseded: 'text-slate-500 bg-slate-50',
    rolled_back: 'text-orange-500 bg-orange-50',
    // Workflow statuses
    draft: 'text-slate-500 bg-slate-50',
    pending_approval: 'text-yellow-500 bg-yellow-50',
    approved: 'text-blue-500 bg-blue-50',
    deployed: 'text-green-500 bg-green-50',
    suspended: 'text-orange-500 bg-orange-50',
    archived: 'text-slate-400 bg-slate-100',
  };
  return colors[status] || 'text-slate-500 bg-slate-50';
}

/**
 * Get status icon name for UI
 */
export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    running: 'loader-2',
    completed: 'check-circle',
    failed: 'x-circle',
    PENDING_APPROVAL: 'clock',
    APPROVED: 'check',
    REJECTED: 'x',
    ACTIVE: 'play',
    SCHEDULED: 'calendar',
    active: 'check-circle',
    superseded: 'archive',
    rolled_back: 'rotate-ccw',
  };
  return icons[status] || 'circle';
}

// =============================================================================
// Developer Tools — Git Repositories
// =============================================================================

export interface GitRepository {
  name: string;
  origin: string;
  created_on?: string;
}

export interface GitRepositoryDetail extends GitRepository {
  owner?: string;
  default_branch?: string;
  api_integration?: string;
  branches?: string[];
  tags?: string[];
}

export async function listGitRepositories(): Promise<GitRepository[]> {
  const res = await apiClient.get('/workflow/git/repositories');
  return res.data?.data || res.data || [];
}

export async function createGitRepository(params: {
  name: string;
  origin: string;
  api_integration?: string;
  secret?: string;
}): Promise<{ message: string }> {
  const res = await apiClient.post('/workflow/git/repositories', params);
  return res.data;
}

export async function describeGitRepository(name: string): Promise<GitRepositoryDetail> {
  const res = await apiClient.get(`/workflow/git/repositories/${encodeURIComponent(name)}`);
  return res.data?.data || res.data;
}

export async function listGitBranches(repoName: string): Promise<string[]> {
  const res = await apiClient.get(`/workflow/git/repositories/${encodeURIComponent(repoName)}/branches`);
  return res.data?.data || res.data || [];
}

export async function listGitTags(repoName: string): Promise<string[]> {
  const res = await apiClient.get(`/workflow/git/repositories/${encodeURIComponent(repoName)}/tags`);
  return res.data?.data || res.data || [];
}

export async function fetchGitRepository(repoName: string): Promise<{ message: string }> {
  const res = await apiClient.post(`/workflow/git/repositories/${encodeURIComponent(repoName)}/fetch`);
  return res.data;
}

export async function dropGitRepository(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/workflow/git/repositories/${encodeURIComponent(name)}`);
  return res.data;
}

// =============================================================================
// Developer Tools — Compute Pools
// =============================================================================

export interface ComputePool {
  name: string;
  state?: string;
  min_nodes?: number;
  max_nodes?: number;
  instance_family?: string;
  created_on?: string;
}

export async function listComputePools(): Promise<ComputePool[]> {
  const res = await apiClient.get('/cortex/snowpark/compute-pools');
  return res.data?.data || res.data || [];
}

export async function createComputePool(params: {
  name: string;
  min_nodes: number;
  max_nodes: number;
  instance_family: string;
  auto_resume?: boolean;
  auto_suspend_secs?: number;
}): Promise<{ message: string }> {
  const res = await apiClient.post('/cortex/snowpark/compute-pools', params);
  return res.data;
}

// FE sends PATCH /workflow/compute-pools/{name}; backend route added 2026-06-21
// (api_workflow_alter_compute_pool → snowpark alter_compute_pool). Method gap closed.
export async function alterComputePool(name: string, params: {
  min_nodes?: number;
  max_nodes?: number;
  auto_suspend_secs?: number;
}): Promise<{ message: string }> {
  const res = await apiClient.patch(`/workflow/compute-pools/${encodeURIComponent(name)}`, params);
  return res.data;
}

export async function dropComputePool(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/cortex/snowpark/compute-pools/${encodeURIComponent(name)}`);
  return res.data;
}

// =============================================================================
// Developer Tools — Container Services
// =============================================================================

export interface ContainerService {
  name: string;
  status?: string;
  compute_pool?: string;
  created_on?: string;
}

export interface ContainerServiceDetail extends ContainerService {
  spec?: string;
  min_instances?: number;
  max_instances?: number;
  owner?: string;
  dns_name?: string;
  endpoints?: Record<string, string>;
}

export interface ContainerServiceStatus {
  name: string;
  status: string;
  message?: string;
  instances?: Array<{
    instance_id: string;
    status: string;
    started_at?: string;
  }>;
}

export async function listContainerServices(): Promise<ContainerService[]> {
  const res = await apiClient.get('/cortex/snowpark/services');
  return res.data?.data || res.data || [];
}

export async function createContainerService(params: {
  name: string;
  compute_pool: string;
  spec: string;
  min_instances?: number;
  max_instances?: number;
}): Promise<{ message: string }> {
  const res = await apiClient.post('/cortex/snowpark/services', params);
  return res.data;
}

// TODO: no exact backend route for GET /cortex/snowpark/services/{name} exists yet
export async function describeContainerService(name: string): Promise<ContainerServiceDetail> {
  const res = await apiClient.get(`/cortex/snowpark/services/${encodeURIComponent(name)}`);
  return res.data?.data || res.data;
}

export async function getContainerServiceStatus(name: string): Promise<ContainerServiceStatus> {
  const res = await apiClient.get(`/cortex/snowpark/services/${encodeURIComponent(name)}/status`);
  return res.data?.data || res.data;
}

export async function getContainerServiceLogs(name: string, instanceId?: string): Promise<string[]> {
  const params = instanceId ? { instance_id: instanceId } : {};
  const res = await apiClient.get(`/cortex/snowpark/services/${encodeURIComponent(name)}/logs`, { params });
  return res.data?.data || res.data || [];
}

export async function dropContainerService(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/cortex/snowpark/services/${encodeURIComponent(name)}`);
  return res.data;
}

// =============================================================================
// Developer Tools — Notebooks
// =============================================================================

export interface Notebook {
  name: string;
  database?: string;
  schema?: string;
  created_on?: string;
}

export interface NotebookExecutionResult {
  rows_affected?: number;
  output?: string;
  cells_executed?: number;
  errors?: string[];
}

export async function listNotebooks(): Promise<Notebook[]> {
  const res = await apiClient.get('/workflow/notebooks');
  return res.data?.data || res.data || [];
}

export async function createNotebook(params: {
  name: string;
  database: string;
  schema: string;
  warehouse?: string;
}): Promise<{ message: string }> {
  const res = await apiClient.post('/workflow/notebooks', params);
  return res.data;
}

export async function executeNotebook(name: string): Promise<{ message: string; result?: NotebookExecutionResult }> {
  const res = await apiClient.post(`/workflow/notebooks/${encodeURIComponent(name)}/execute`);
  return res.data;
}

export async function alterNotebook(name: string, params: {
  warehouse?: string;
  comment?: string;
}): Promise<{ message: string }> {
  const res = await apiClient.patch(`/workflow/notebooks/${encodeURIComponent(name)}`, params);
  return res.data;
}

export async function dropNotebook(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/workflow/notebooks/${encodeURIComponent(name)}`);
  return res.data;
}

// =============================================================================
// Developer Tools — Ad-hoc Execution
// =============================================================================

export interface SqlQueryResultRow {
  [column: string]: string | number | boolean | null;
}

export interface SqlQueryResult {
  data: SqlQueryResultRow[];
  columns: string[];
}

export interface PythonExecutionResult {
  output: string;
  result?: Record<string, unknown>;
  error?: string;
}

export async function runAdHocSQL(params: {
  sql: string;
  warehouse?: string;
  database?: string;
  schema?: string;
}): Promise<SqlQueryResult> {
  const res = await apiClient.post('/workflow/run-sql', params);
  return res.data?.data || res.data;
}

export async function runAdHocPython(params: {
  code: string;
  warehouse?: string;
  packages?: string[];
}): Promise<PythonExecutionResult> {
  const res = await apiClient.post('/workflow/run-python', params);
  return res.data?.data || res.data;
}

export interface WorkflowCapabilities {
  module: 'workflow';
  ux_mode: 'low_code';
  builder: {
    supports_drag_drop: boolean;
    supports_action_templates: boolean;
    supports_compile: boolean;
    supports_validate: boolean;
    supports_clone_data_tests: boolean;
  };
  endpoints: Record<string, string>;
  recommended_flow: string[];
}

export interface ActionTemplate {
  [key: string]: any;
}

export async function getWorkflowCapabilities(): Promise<WorkflowCapabilities> {
  const res = await apiClient.get('/workflow/capabilities');
  return res.data;
}

export async function getWorkflowActionTemplates(): Promise<{ data: ActionTemplate[]; count: number }> {
  const res = await apiClient.get('/workflow/action-templates');
  return res.data;
}

export async function createWorkflowActionTemplate(payload: {
  action_type: string;
  query_template: string;
  action_name?: string;
  description?: string;
  parameters?: Record<string, any>;
}): Promise<Record<string, any>> {
  const res = await apiClient.post('/workflow/action-templates', payload);
  return res.data;
}

export interface WorkflowCloneDataTestsResult {
  workflow_id: string;
  connector_count: number;
  connectors_passed: number;
  connectors_failed: number;
  ok: boolean;
  reports: Array<{
    connector_id: string;
    connector_type?: string;
    target_schema: string;
    tables_tested: number;
    tables_passed: number;
    pass_rate: number;
    ok: boolean;
  }>;
}

export async function runWorkflowCloneDataTests(
  workflowId: string,
  connectorIds: string[],
  maxTables = 20,
): Promise<WorkflowCloneDataTestsResult> {
  const params = new URLSearchParams();
  connectorIds.forEach((id) => params.append('connector_ids', id));
  params.append('max_tables', String(maxTables));
  const res = await apiClient.get(`/workflow/${workflowId}/clone-data-tests?${params.toString()}`);
  return res.data;
}

// Export all as default object for convenience
export default {
  // Basic operations
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  renameWorkflow,
  executeWorkflow,
  scheduleWorkflow,
  suspendTask,
  resumeTask,
  // Version history
  getWorkflowVersions,
  createWorkflowVersion,
  rollbackWorkflow,
  // Execution history
  getWorkflowRuns,
  // Deployment
  scheduleDeployment,
  approveDeployment,
  rejectDeployment,
  activateDeployment,
  getWorkflowDeployments,
  // Contributors
  getWorkflowContributors,
  addWorkflowContributor,
  removeWorkflowContributor,
  // Setup
  initializeTables,
  // Developer Tools — Git
  listGitRepositories,
  createGitRepository,
  describeGitRepository,
  listGitBranches,
  listGitTags,
  fetchGitRepository,
  dropGitRepository,
  // Developer Tools — Compute Pools
  listComputePools,
  createComputePool,
  alterComputePool,
  dropComputePool,
  // Developer Tools — Container Services
  listContainerServices,
  createContainerService,
  describeContainerService,
  getContainerServiceStatus,
  getContainerServiceLogs,
  dropContainerService,
  // Developer Tools — Notebooks
  listNotebooks,
  createNotebook,
  executeNotebook,
  alterNotebook,
  dropNotebook,
  // Developer Tools — Ad-hoc Execution
  runAdHocSQL,
  runAdHocPython,
  getWorkflowCapabilities,
  getWorkflowActionTemplates,
  createWorkflowActionTemplate,
  runWorkflowCloneDataTests,
  // Utilities
  formatDuration,
  getStatusColor,
  getStatusIcon,
};
