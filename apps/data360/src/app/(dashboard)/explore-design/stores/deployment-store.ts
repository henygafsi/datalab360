/**
 * Deployment Store for Explore & Design
 * Manages deployment state, pipeline stages, and execution
 */

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import apiClient from '@/lib/api-client';

// Deployment Types
export type DeploymentType = 'immediate' | 'scheduled' | 'conditional' | 'staged';

export type DeploymentStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export type ExecutionLogStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// Interfaces
export interface DeploymentConfig {
  immediate: boolean;
  scheduled_at?: string;
  staged_rollout?: {
    enabled: boolean;
    initial_percentage: number;
    ramp_up_interval_minutes: number;
    final_percentage: number;
  };
  rollback_on_error: boolean;
  notification_channels: string[];
  approvers: string[];
}

export interface ExecutionLog {
  timestamp: string;
  event_id: string;
  status: ExecutionLogStatus;
  duration_ms?: number;
  error?: string;
  sql?: string;
}

export interface DeploymentMetrics {
  total_events: number;
  succeeded: number;
  failed: number;
  skipped: number;
  duration_seconds: number;
}

export interface Deployment {
  deployment_id: string;
  project_id: string;
  version: string;
  type: DeploymentType;
  status: DeploymentStatus;
  config: DeploymentConfig;
  event_ids: string[];
  execution_log: ExecutionLog[];
  metrics?: DeploymentMetrics;
  created_at: string;
  created_by: string;
  approved_at?: string;
  approved_by?: string;
  deployed_at?: string;
  error?: string;
}

export interface ApprovalRequest {
  approval_request_id: string;
  project_id: string;
  deployment_id: string;
  version: string;
  requested_by: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  type: 'deployment' | 'rollback';
  priority: 'low' | 'medium' | 'high' | 'critical';
  changes_summary: {
    total_events: number;
    by_category: Record<string, number>;
    high_risk_changes: number;
    affected_tables: number;
  };
  approvers: Array<{
    user_id: string;
    role: string;
    status: 'pending' | 'approved' | 'rejected';
    approved_at?: string;
    comment?: string;
    required: boolean;
  }>;
  auto_approval_rules?: {
    enabled: boolean;
    conditions: Array<{ type: string; value?: number; met: boolean }>;
  };
  deadline?: string;
  escalation_after_hours?: number;
  comments: Array<{
    user_id: string;
    comment: string;
    created_at: string;
  }>;
}

// Store State
interface DeploymentStoreState {
  deployments: Deployment[];
  currentDeployment: Deployment | null;
  approvalRequests: ApprovalRequest[];
  isLoading: boolean;
  error: string | null;
}

// Generate unique ID
const generateDeploymentId = (): string => {
  return `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Atoms with localStorage persistence
export const deploymentStoreAtom = atomWithStorage<DeploymentStoreState>(
  'explore-design-deployments',
  {
    deployments: [],
    currentDeployment: null,
    approvalRequests: [],
    isLoading: false,
    error: null,
  }
);

// Derived atoms
export const pendingDeploymentsAtom = atom((get) => {
  const store = get(deploymentStoreAtom);
  return store.deployments.filter((d) => d.status === 'pending_review');
});

export const approvedDeploymentsAtom = atom((get) => {
  const store = get(deploymentStoreAtom);
  return store.deployments.filter((d) => d.status === 'approved');
});

export const recentDeploymentsAtom = atom((get) => {
  const store = get(deploymentStoreAtom);
  return store.deployments
    .filter((d) => d.status === 'deployed' || d.status === 'failed')
    .sort((a, b) => new Date(b.deployed_at || b.created_at).getTime() - new Date(a.deployed_at || a.created_at).getTime())
    .slice(0, 10);
});

export const pendingApprovalsAtom = atom((get) => {
  const store = get(deploymentStoreAtom);
  return store.approvalRequests.filter((a) => a.status === 'pending');
});

// Actions
export const createDeploymentAtom = atom(
  null,
  (get, set, params: {
    project_id: string;
    version: string;
    type: DeploymentType;
    event_ids: string[];
    config: Partial<DeploymentConfig>;
    created_by: string;
  }) => {
    const store = get(deploymentStoreAtom);

    const newDeployment: Deployment = {
      deployment_id: generateDeploymentId(),
      project_id: params.project_id,
      version: params.version,
      type: params.type,
      status: 'draft',
      config: {
        immediate: params.type === 'immediate',
        rollback_on_error: true,
        notification_channels: ['email'],
        approvers: [],
        ...params.config,
      },
      event_ids: params.event_ids,
      execution_log: [],
      created_at: new Date().toISOString(),
      created_by: params.created_by,
    };

    set(deploymentStoreAtom, {
      ...store,
      deployments: [...store.deployments, newDeployment],
      currentDeployment: newDeployment,
    });

    return newDeployment.deployment_id;
  }
);

export const submitForReviewAtom = atom(
  null,
  (get, set, params: { deployment_id: string; approvers: string[]; priority: ApprovalRequest['priority']; deadline_hours: number }) => {
    const store = get(deploymentStoreAtom);
    const deployment = store.deployments.find((d) => d.deployment_id === params.deployment_id);

    if (!deployment) return;

    // Create approval request
    const approvalRequest: ApprovalRequest = {
      approval_request_id: `apr_${Date.now()}`,
      project_id: deployment.project_id,
      deployment_id: deployment.deployment_id,
      version: deployment.version,
      requested_by: deployment.created_by,
      requested_at: new Date().toISOString(),
      status: 'pending',
      type: 'deployment',
      priority: params.priority,
      changes_summary: {
        total_events: deployment.event_ids.length,
        by_category: { schema: 0, policy: 0, ingestion: 0 }, // Would be calculated from events
        high_risk_changes: 0,
        affected_tables: 0,
      },
      approvers: params.approvers.map((userId) => ({
        user_id: userId,
        role: 'DATA_MODELER',
        status: 'pending' as const,
        required: true,
      })),
      deadline: new Date(Date.now() + params.deadline_hours * 60 * 60 * 1000).toISOString(),
      escalation_after_hours: 24,
      comments: [],
    };

    // Update deployment status
    const updatedDeployments = store.deployments.map((d) =>
      d.deployment_id === params.deployment_id
        ? { ...d, status: 'pending_review' as const, config: { ...d.config, approvers: params.approvers } }
        : d
    );

    set(deploymentStoreAtom, {
      ...store,
      deployments: updatedDeployments,
      approvalRequests: [...store.approvalRequests, approvalRequest],
    });

    return approvalRequest.approval_request_id;
  }
);

export const approveDeploymentAtom = atom(
  null,
  (get, set, params: { approval_id: string; user_id: string; comment?: string }) => {
    const store = get(deploymentStoreAtom);

    const updatedApprovals = store.approvalRequests.map((a) => {
      if (a.approval_request_id !== params.approval_id) return a;

      const updatedApprovers = a.approvers.map((approver) =>
        approver.user_id === params.user_id
          ? { ...approver, status: 'approved' as const, approved_at: new Date().toISOString(), comment: params.comment }
          : approver
      );

      // Check if all required approvers have approved
      const allRequiredApproved = updatedApprovers.every((ap) => !ap.required || ap.status === 'approved');

      return {
        ...a,
        approvers: updatedApprovers,
        status: allRequiredApproved ? 'approved' as const : a.status,
        comments: params.comment
          ? [...a.comments, { user_id: params.user_id, comment: params.comment, created_at: new Date().toISOString() }]
          : a.comments,
      };
    });

    // Find the approval and update corresponding deployment
    const approval = updatedApprovals.find((a) => a.approval_request_id === params.approval_id);
    const updatedDeployments = store.deployments.map((d) =>
      d.deployment_id === approval?.deployment_id && approval.status === 'approved'
        ? { ...d, status: 'approved' as const, approved_at: new Date().toISOString(), approved_by: params.user_id }
        : d
    );

    set(deploymentStoreAtom, {
      ...store,
      deployments: updatedDeployments,
      approvalRequests: updatedApprovals,
    });
  }
);

export const rejectDeploymentAtom = atom(
  null,
  (get, set, params: { approval_id: string; user_id: string; comment: string }) => {
    const store = get(deploymentStoreAtom);

    const updatedApprovals = store.approvalRequests.map((a) => {
      if (a.approval_request_id !== params.approval_id) return a;

      return {
        ...a,
        status: 'rejected' as const,
        approvers: a.approvers.map((approver) =>
          approver.user_id === params.user_id
            ? { ...approver, status: 'rejected' as const, comment: params.comment }
            : approver
        ),
        comments: [...a.comments, { user_id: params.user_id, comment: params.comment, created_at: new Date().toISOString() }],
      };
    });

    // Find the approval and update corresponding deployment back to draft
    const approval = updatedApprovals.find((a) => a.approval_request_id === params.approval_id);
    const updatedDeployments = store.deployments.map((d) =>
      d.deployment_id === approval?.deployment_id ? { ...d, status: 'draft' as const } : d
    );

    set(deploymentStoreAtom, {
      ...store,
      deployments: updatedDeployments,
      approvalRequests: updatedApprovals,
    });
  }
);

export const executeDeploymentAtom = atom(null, async (get, set, deployment_id: string) => {
  const store = get(deploymentStoreAtom);
  const deployment = store.deployments.find((d) => d.deployment_id === deployment_id);

  if (!deployment) return;

  // Allow execution for approved deployments OR immediate deployments (even if draft)
  if (deployment.status !== 'approved' && !deployment.config.immediate) return;

  // Update status to deploying
  set(deploymentStoreAtom, {
    ...store,
    deployments: store.deployments.map((d) =>
      d.deployment_id === deployment_id ? { ...d, status: 'deploying' as const } : d
    ),
    isLoading: true,
  });

  const executionLog: ExecutionLog[] = [];
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const eventId of deployment.event_ids) {
    const log: ExecutionLog = {
      timestamp: new Date().toISOString(),
      event_id: eventId,
      status: 'running',
    };
    executionLog.push(log);

    try {
      const response = await apiClient.post(
        `/api/v1/explore-design/${deployment.project_id}/deployments/${deployment_id}/execute`
      );
      const result = response.data;
      log.status = result.status === 'completed' ? 'completed' : 'failed';
      log.duration_ms = result.execution_time_ms || 0;
      if (result.status !== 'completed') {
        log.error = result.error || result.detail || 'Deployment execution failed';
        failed++;
      } else {
        succeeded++;
      }
    } catch (err: any) {
      log.status = 'failed';
      log.error = err?.response?.data?.detail || err.message || 'Deployment execution failed';
      log.duration_ms = Date.now() - new Date(log.timestamp).getTime();
      failed++;
    }
  }

  const endTime = Date.now();
  const allSucceeded = failed === 0;

  // Update final status
  const storeAfter = get(deploymentStoreAtom);
  set(deploymentStoreAtom, {
    ...storeAfter,
    deployments: storeAfter.deployments.map((d) =>
      d.deployment_id === deployment_id
        ? {
            ...d,
            status: allSucceeded ? 'deployed' as const : 'failed' as const,
            execution_log: executionLog,
            deployed_at: new Date().toISOString(),
            metrics: {
              total_events: deployment.event_ids.length,
              succeeded,
              failed,
              skipped: 0,
              duration_seconds: Math.round((endTime - startTime) / 1000),
            },
          }
        : d
    ),
    isLoading: false,
  });

  return { succeeded, failed, duration_seconds: Math.round((endTime - startTime) / 1000) };
});

export const rollbackDeploymentAtom = atom(
  null,
  (get, set, params: { deployment_id: string; target_version: string; reason: string }) => {
    const store = get(deploymentStoreAtom);

    set(deploymentStoreAtom, {
      ...store,
      deployments: store.deployments.map((d) =>
        d.deployment_id === params.deployment_id
          ? { ...d, status: 'rolled_back' as const, error: params.reason }
          : d
      ),
    });
  }
);

export const setCurrentDeploymentAtom = atom(null, (get, set, deployment_id: string | null) => {
  const store = get(deploymentStoreAtom);
  const deployment = deployment_id ? store.deployments.find((d) => d.deployment_id === deployment_id) : null;

  set(deploymentStoreAtom, {
    ...store,
    currentDeployment: deployment || null,
  });
});

export const clearDeploymentErrorAtom = atom(null, (get, set) => {
  const store = get(deploymentStoreAtom);
  set(deploymentStoreAtom, {
    ...store,
    error: null,
  });
});

// Custom hook
export function useDeploymentStore() {
  const [store] = useAtom(deploymentStoreAtom);
  const pendingDeployments = useAtomValue(pendingDeploymentsAtom);
  const approvedDeployments = useAtomValue(approvedDeploymentsAtom);
  const recentDeployments = useAtomValue(recentDeploymentsAtom);
  const pendingApprovals = useAtomValue(pendingApprovalsAtom);

  const createDeployment = useSetAtom(createDeploymentAtom);
  const submitForReview = useSetAtom(submitForReviewAtom);
  const approveDeployment = useSetAtom(approveDeploymentAtom);
  const rejectDeployment = useSetAtom(rejectDeploymentAtom);
  const executeDeployment = useSetAtom(executeDeploymentAtom);
  const rollbackDeployment = useSetAtom(rollbackDeploymentAtom);
  const setCurrentDeployment = useSetAtom(setCurrentDeploymentAtom);
  const clearError = useSetAtom(clearDeploymentErrorAtom);

  return {
    deployments: store.deployments,
    currentDeployment: store.currentDeployment,
    approvalRequests: store.approvalRequests,
    pendingDeployments,
    approvedDeployments,
    recentDeployments,
    pendingApprovals,
    isLoading: store.isLoading,
    error: store.error,
    createDeployment,
    submitForReview,
    approveDeployment,
    rejectDeployment,
    executeDeployment,
    rollbackDeployment,
    setCurrentDeployment,
    clearError,
  };
}
