/**
 * Unified deployment types for Workflow and Explore Design.
 * Backend: USER_ACTIVITY with EVENT_TYPE=SCHEDULE_DEPLOYMENT, MODULE_NAME in (WORKFLOW, MAPPING).
 */

export type DeploymentStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'SCHEDULED';

export type DeploymentModule = 'WORKFLOW' | 'MAPPING';

export type DeploymentAction = 'approve' | 'reject' | 'activate' | 'rollback' | 'deactivate' | 'view_logs';

/** One step in a deployment (backend can return mapping step or workflow step shape) */
export interface UnifiedDeploymentStep {
  step_index: number;
  /** Mapping: source/target; Workflow: task_name, task_type, schedule, config */
  source?: { database?: string; schema?: string; table?: string; columns?: string[] };
  target?: { database?: string; schema?: string; table?: string; columns?: string[] };
  pk_source?: string[];
  pk_target?: string[];
  task_name?: string;
  task_type?: string;
  schedule?: string;
  config?: Record<string, unknown>;
}

/** Deployment item as returned by GET /explore-design/deployments or /scheduled-deployments */
export interface UnifiedDeployment {
  event_id: string;
  deployment_id: string;
  workflow_name: string;
  project_id: string;
  status: DeploymentStatus;
  scheduled_date?: string;
  deployment_method?: string;
  created_by?: string;
  created_at?: string;
  approved_by?: string;
  approved_at?: string;
  steps: UnifiedDeploymentStep[];
  total_steps: number;
  total_mappings?: number;
  module: DeploymentModule;
  actions: DeploymentAction[];
}

export interface ListDeploymentsFilters {
  project_id?: string;
  status?: DeploymentStatus;
  module?: DeploymentModule;
}

export interface ListDeploymentsResult {
  deployments: UnifiedDeployment[];
  total: number;
}
