'use client';

/**
 * Release spine — thin apiClient wrappers for the NEW backend contract
 * (release-state, named approvers, AI change-analyst history).
 *
 * All paths come from `API.exploreDesign.*` (src/lib/api-contracts.ts) — no
 * hardcoded endpoint strings. These endpoints are being added by a parallel
 * backend workstream: callers must treat 404/501 (`isUnavailable`) as an
 * honest "not available yet" state, never as an error to retry or fake.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import type {
  AddApproverBody,
  AiHistoryEvent,
  AiHistoryResponse,
  ApproverDecisionBody,
  ApproversResponse,
  DeploymentApprover,
  ReleaseState,
} from './types';

/** GET /explore-design/{project_id}/release-state */
export async function getReleaseState(projectId: string): Promise<ReleaseState> {
  const { data } = await apiClient.get<ReleaseState>(
    API.exploreDesign.releaseState(projectId),
  );
  return data;
}

/** GET /explore-design/{project_id}/deployments/{deployment_id}/approvers */
export async function getDeploymentApprovers(
  projectId: string,
  deploymentId: string,
): Promise<ApproversResponse> {
  const { data } = await apiClient.get<ApproversResponse>(
    API.exploreDesign.deploymentApprovers(projectId, deploymentId),
  );
  return data;
}

/** POST …/approvers — add a named reviewer to a deployment. */
export async function addDeploymentApprover(
  projectId: string,
  deploymentId: string,
  body: AddApproverBody,
): Promise<DeploymentApprover> {
  // Live backend contract (release_router.ApproverAdd) names the fields
  // approver_username / approver_role_label — map from our FE shape so the
  // POST doesn't 400 with VALIDATION_ERROR.
  const { data } = await apiClient.post<DeploymentApprover>(
    API.exploreDesign.deploymentApprovers(projectId, deploymentId),
    {
      approver_username: body.username,
      ...(body.role_label ? { approver_role_label: body.role_label } : {}),
      ...(body.required != null ? { required: body.required } : {}),
    },
  );
  return data;
}

/** POST …/approvers/{username}/decision — approve | reject | request-changes. */
export async function postApproverDecision(
  projectId: string,
  deploymentId: string,
  username: string,
  body: ApproverDecisionBody,
): Promise<DeploymentApprover> {
  const { data } = await apiClient.post<DeploymentApprover>(
    API.exploreDesign.approverDecision(projectId, deploymentId, username),
    body,
  );
  return data;
}

/** GET /explore-design/{project_id}/ai/history?limit= */
export async function getAiHistory(
  projectId: string,
  limit = 50,
): Promise<AiHistoryResponse> {
  const { data } = await apiClient.get<AiHistoryResponse>(
    API.exploreDesign.aiHistory(projectId, limit),
  );
  return data;
}

/** POST /explore-design/{project_id}/ai/history — append an analyst event. */
export async function appendAiHistory(
  projectId: string,
  event: Partial<AiHistoryEvent> & { kind: string; message: string },
): Promise<AiHistoryEvent> {
  const { data } = await apiClient.post<AiHistoryEvent>(
    API.exploreDesign.aiHistory(projectId),
    event,
  );
  return data;
}
