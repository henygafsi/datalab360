/**
 * Workflow API Service
 *
 * Comprehensive workflow management including:
 * - CRUD operations
 * - Version history with rollback
 * - Execution history (runs)
 * - Deployment with approval workflow
 * - Event logging (aligned with explore_design pattern)
 */

import axios from 'axios';
import { getAuthHeaders } from '@/lib/auth';
import { API_CONTRACTS } from '@/lib/api-contracts';
import { API_CONFIG } from '@/config/database.config';

const API_BASE_URL = API_CONFIG.BASE_URL;

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
  error_log?: any;
  execution_details?: any;
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
// AUTH HELPER
// ============================================

async function getWorkflowAuthHeaders(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders();
  return headers as unknown as Record<string, string>;
}

// ============================================
// BASIC WORKFLOW OPERATIONS
// ============================================

/**
 * Get all workflows for the authenticated user
 */
export async function getWorkflows(): Promise<Workflow[]> {
  const headers = await getWorkflowAuthHeaders();
  const url = API_CONTRACTS.workflow.getWorkflows.getUrl();
  const response = await axios.get(url, { headers });
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
  const headers = await getWorkflowAuthHeaders();
  const url = API_CONTRACTS.workflow.createWorkflow.getUrl();
  const response = await axios.post(url, workflow, { headers });
  return response.data;
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(workflow: {
  workflow_name: string;
  steps: WorkflowStep[];
}): Promise<{ message: string; workflow_name: string }> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/workflow/update_workflow/`, workflow, { headers });
  return response.data;
}

/**
 * Rename a workflow
 */
export async function renameWorkflow(
  oldWorkflowName: string,
  newWorkflowName: string
): Promise<{ message: string }> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/rename_workflow/`,
    { old_workflow_name: oldWorkflowName, new_workflow_name: newWorkflowName },
    { headers }
  );
  return response.data;
}

/**
 * Execute a workflow immediately
 */
export async function executeWorkflow(workflowName: string): Promise<{ message: string; task_id?: string }> {
  const headers = await getWorkflowAuthHeaders();
  const url = API_CONTRACTS.workflow.executeWorkflow.getUrl(workflowName);
  const response = await axios.post(url, {}, { headers });
  return response.data;
}

/**
 * Schedule a workflow for recurring execution
 */
export async function scheduleWorkflow(
  workflowName: string,
  cronSchedule: 'hourly' | 'daily' | 'weekly' | 'monthly'
): Promise<{ message: string }> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/schedule_workflow/`,
    { workflow_name: workflowName, cron_schedule: cronSchedule },
    { headers }
  );
  return response.data;
}

/**
 * Suspend a scheduled workflow task
 */
export async function suspendTask(taskName: string): Promise<{ message: string }> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/suspend_task/?task_name=${encodeURIComponent(taskName)}`,
    {},
    { headers }
  );
  return response.data;
}

/**
 * Resume a suspended workflow task
 */
export async function resumeTask(taskName: string): Promise<{ message: string }> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/resume_task/?task_name=${encodeURIComponent(taskName)}`,
    {},
    { headers }
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
  const headers = await getWorkflowAuthHeaders();
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.include_rolled_back) params.append('include_rolled_back', 'true');

  const response = await axios.get(
    `${API_BASE_URL}/workflow/${workflowId}/versions?${params.toString()}`,
    { headers }
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
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/${workflowId}/versions`,
    options || {},
    { headers }
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
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/${workflowId}/rollback/${versionId}`,
    { reason },
    { headers }
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
  const headers = await getWorkflowAuthHeaders();
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.status) params.append('status', options.status);

  const response = await axios.get(
    `${API_BASE_URL}/workflow/${workflowId}/runs?${params.toString()}`,
    { headers }
  );
  return response.data;
}

// ============================================
// DEPLOYMENT & APPROVAL
// ============================================

/**
 * Schedule a workflow for deployment with optional approval workflow
 * Uses the unified /explore-design/deployments endpoint with module_type='workflow'
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
  const headers = await getWorkflowAuthHeaders();

  // Determine deployment type
  const isImmediate = options.immediate === true;
  const deploymentType = isImmediate ? 'immediate' : (options.requires_approval ? 'with_approval' : 'scheduled');

  // Build deployment payload aligned with explore-design pattern
  const deploymentPayload = {
    project_id: options.workflow_id, // Use workflow_id as project identifier
    version: options.workflow_name,
    type: deploymentType,
    event_ids: [], // No events for workflow - steps are inline
    scheduled_at: options.scheduled_date || new Date().toISOString(),
    sql_queries: [], // Workflows don't use SQL queries
    config: {
      immediate: isImmediate,
      scheduled_at: options.scheduled_date || new Date().toISOString(),
      rollback_on_error: true,
      notification_channels: ['email'],
      approvers: options.requires_approval ? ['DATA_MODELER', 'DATA_ADMIN'] : [],
      requires_approval: options.requires_approval || false,
      deployment_method: 'REPLACE_EXISTING',
      created_by: options.created_by || 'system',
      description: options.description || `Workflow deployment: ${options.workflow_name}`,
      module_type: 'workflow',
      workflow_id: options.workflow_id,
      workflow_name: options.workflow_name,
      steps: options.steps,
    },
  };

  console.log('[scheduleDeployment] Creating workflow deployment:', JSON.stringify(deploymentPayload, null, 2));

  // Step 1: Create the deployment
  const createResponse = await axios.post(
    `${API_BASE_URL}/explore-design/deployments`,
    deploymentPayload,
    { headers }
  );

  const deploymentId = createResponse.data.deployment_id || createResponse.data.id || createResponse.data.schedule_id;

  // Step 2: For immediate deployments, execute right away
  if (isImmediate && deploymentId) {
    try {
      console.log('[scheduleDeployment] Executing immediate deployment:', deploymentId);
      await axios.post(
        `${API_BASE_URL}/explore-design/deployments/${deploymentId}/execute`,
        { rollback_on_error: true },
        { headers }
      );
      return {
        event_id: deploymentId,
        workflow_id: options.workflow_id,
        workflow_name: options.workflow_name,
        status: 'ACTIVE',
        message: 'Workflow deployed and executed successfully',
      };
    } catch (execError: any) {
      console.error('[scheduleDeployment] Immediate execution failed:', execError);
      // Return the deployment ID even if execution failed
      return {
        event_id: deploymentId,
        workflow_id: options.workflow_id,
        workflow_name: options.workflow_name,
        status: 'APPROVED', // Created but execution failed
        message: `Deployment created but execution failed: ${execError.message}`,
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
 * Uses /explore-design/deployments/{id}/approve endpoint
 */
export async function approveDeployment(eventId: string, comment?: string): Promise<{
  status: string;
  event_id: string;
  workflow_id: string;
  approved_by: string;
}> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/explore-design/deployments/${eventId}/approve`,
    { comment: comment || '' },
    { headers }
  );
  return {
    status: 'APPROVED',
    event_id: eventId,
    workflow_id: response.data.workflow_id || response.data.project_id || '',
    approved_by: response.data.approved_by || '',
  };
}

/**
 * Reject a pending workflow deployment
 * Uses /explore-design/deployments/{id}/reject endpoint
 */
export async function rejectDeployment(
  eventId: string,
  reason?: string
): Promise<{
  status: string;
  event_id: string;
  workflow_id: string;
  rejected_by: string;
  reason?: string;
}> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/explore-design/deployments/${eventId}/reject`,
    { reason: reason || '' },
    { headers }
  );
  return {
    status: 'REJECTED',
    event_id: eventId,
    workflow_id: response.data.workflow_id || response.data.project_id || '',
    rejected_by: response.data.rejected_by || '',
    reason,
  };
}

/**
 * Activate an approved workflow deployment
 * Uses /explore-design/deployments/{id}/execute endpoint
 */
export async function activateDeployment(eventId: string): Promise<{
  status: string;
  event_id: string;
  workflow_id: string;
  workflow_name: string;
  activated_by: string;
}> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/explore-design/deployments/${eventId}/execute`,
    { rollback_on_error: true },
    { headers }
  );
  return {
    status: 'ACTIVE',
    event_id: eventId,
    workflow_id: response.data.workflow_id || response.data.project_id || '',
    workflow_name: response.data.workflow_name || '',
    activated_by: response.data.executed_by || '',
  };
}

/**
 * Get all workflow deployments (pending, approved, active)
 * Uses GET /explore-design/scheduled-deployments with module_type=workflow and optional project_id (workflow_id)
 */
export async function getWorkflowDeployments(options?: {
  projectId?: string;
  status?: DeploymentStatus;
  limit?: number;
}): Promise<{
  deployments: WorkflowDeployment[];
  total: number;
}> {
  const headers = await getWorkflowAuthHeaders();
  const params = new URLSearchParams();
  params.append('module_type', 'workflow');
  if (options?.projectId) params.append('project_id', options.projectId);
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', String(options.limit));

  const response = await axios.get(
    `${API_BASE_URL}/explore-design/scheduled-deployments?${params.toString()}`,
    { headers, timeout: 15000 }
  );

  const raw = response.data?.deployments ?? response.data?.scheduled_deployments ?? [];
  const list = Array.isArray(raw) ? raw : [];
  const deployments = list
    .filter((d: any) => (d.module || d.module_name || '').toString().toUpperCase() === 'WORKFLOW')
    .map((d: any) => ({
      event_id: d.deployment_id || d.event_id || d.id || d.schedule_id,
      workflow_id: d.project_id || d.config?.workflow_id,
      workflow_name: d.workflow_name || d.config?.workflow_name || d.version || '',
      module: 'WORKFLOW' as const,
      status: d.status,
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
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.get(
    `${API_BASE_URL}/workflow/${workflowId}/contributors`,
    { headers }
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
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/${workflowId}/contributors`,
    { user_name: userName, role },
    { headers }
  );
  return response.data;
}

/**
 * Remove a contributor from a workflow
 */
export async function removeWorkflowContributor(
  workflowId: string,
  contributorId: string
): Promise<{ message: string }> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.delete(
    `${API_BASE_URL}/workflow/${workflowId}/contributors/${contributorId}`,
    { headers }
  );
  return response.data;
}

// ============================================
// SETUP
// ============================================

/**
 * Initialize workflow tracking tables (run once)
 */
export async function initializeTables(): Promise<{
  status: string;
  message: string;
  tables_created: string[];
}> {
  const headers = await getWorkflowAuthHeaders();
  const response = await axios.post(
    `${API_BASE_URL}/workflow/setup/initialize-tables`,
    {},
    { headers }
  );
  return response.data;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
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

export async function listGitRepositories(): Promise<GitRepository[]> {
  const res = await apiClient.get('/workflow/git/repos');
  return res.data?.data || res.data || [];
}

export async function createGitRepository(params: {
  name: string;
  origin: string;
  api_integration?: string;
  secret?: string;
}): Promise<{ message: string }> {
  const res = await apiClient.post('/workflow/git/repos', params);
  return res.data;
}

export async function describeGitRepository(name: string): Promise<any> {
  const res = await apiClient.get(`/workflow/git/repos/${encodeURIComponent(name)}`);
  return res.data?.data || res.data;
}

export async function listGitBranches(repoName: string): Promise<string[]> {
  const res = await apiClient.get(`/workflow/git/repos/${encodeURIComponent(repoName)}/branches`);
  return res.data?.data || res.data || [];
}

export async function listGitTags(repoName: string): Promise<string[]> {
  const res = await apiClient.get(`/workflow/git/repos/${encodeURIComponent(repoName)}/tags`);
  return res.data?.data || res.data || [];
}

export async function fetchGitRepository(repoName: string): Promise<{ message: string }> {
  const res = await apiClient.post(`/workflow/git/repos/${encodeURIComponent(repoName)}/fetch`);
  return res.data;
}

export async function dropGitRepository(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/workflow/git/repos/${encodeURIComponent(name)}`);
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
  const res = await apiClient.get('/workflow/compute-pools');
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
  const res = await apiClient.post('/workflow/compute-pools', params);
  return res.data;
}

export async function alterComputePool(name: string, params: {
  min_nodes?: number;
  max_nodes?: number;
  auto_suspend_secs?: number;
}): Promise<{ message: string }> {
  const res = await apiClient.patch(`/workflow/compute-pools/${encodeURIComponent(name)}`, params);
  return res.data;
}

export async function dropComputePool(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/workflow/compute-pools/${encodeURIComponent(name)}`);
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

export async function listContainerServices(): Promise<ContainerService[]> {
  const res = await apiClient.get('/workflow/services');
  return res.data?.data || res.data || [];
}

export async function createContainerService(params: {
  name: string;
  compute_pool: string;
  spec: string;
  min_instances?: number;
  max_instances?: number;
}): Promise<{ message: string }> {
  const res = await apiClient.post('/workflow/services', params);
  return res.data;
}

export async function describeContainerService(name: string): Promise<any> {
  const res = await apiClient.get(`/workflow/services/${encodeURIComponent(name)}`);
  return res.data?.data || res.data;
}

export async function getContainerServiceStatus(name: string): Promise<any> {
  const res = await apiClient.get(`/workflow/services/${encodeURIComponent(name)}/status`);
  return res.data?.data || res.data;
}

export async function getContainerServiceLogs(name: string, instanceId?: string): Promise<string[]> {
  const params = instanceId ? { instance_id: instanceId } : {};
  const res = await apiClient.get(`/workflow/services/${encodeURIComponent(name)}/logs`, { params });
  return res.data?.data || res.data || [];
}

export async function dropContainerService(name: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/workflow/services/${encodeURIComponent(name)}`);
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

export async function executeNotebook(name: string): Promise<{ message: string; result?: any }> {
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

export async function runAdHocSQL(params: {
  sql: string;
  warehouse?: string;
  database?: string;
  schema?: string;
}): Promise<{ data: any[]; columns: string[] }> {
  const res = await apiClient.post('/workflow/execute/sql', params);
  return res.data?.data || res.data;
}

export async function runAdHocPython(params: {
  code: string;
  warehouse?: string;
  packages?: string[];
}): Promise<{ output: string; result?: any }> {
  const res = await apiClient.post('/workflow/execute/python', params);
  return res.data?.data || res.data;
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
  // Utilities
  formatDuration,
  getStatusColor,
  getStatusIcon,
};
