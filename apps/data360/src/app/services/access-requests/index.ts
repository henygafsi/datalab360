/**
 * Access Requests service — thin wrapper over the /access-requests/* backend routes.
 *
 * Every call goes through `apiClient` (auth headers injected automatically).
 * Endpoint paths come exclusively from `API.accessRequests.*` — no hardcoded strings.
 * Errors are normalized via `toServiceError` so the caller gets a real message
 * (not "[object Object]") and the HTTP status is preserved.
 *
 * Response shape note:
 *  - GET endpoints (/mine, /inbox, /all) return UPPERCASE field names
 *    (Snowflake conventions: REQUEST_ID, REQUESTER, ASSET_FQN, …).
 *  - POST endpoints return lowercase (status, asset_fqn, owner, …).
 * These are typed separately; consumers must not conflate them.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { toServiceError } from '@/app/services/_errors';

// ── Shared response types ────────────────────────────────────────────────────

/** A single access request row returned by the GET list endpoints (UPPERCASE keys). */
export interface AccessRequest {
  REQUEST_ID: string;
  REQUESTER: string;
  REQUESTER_ROLE: string;
  ASSET_FQN: string;
  ASSET_TYPE: string;
  PRIVILEGE: string;
  OWNER: string;
  STATUS: string;
  REASON: string | null;
  DECISION_NOTE: string | null;
  GRANTED_TO_ROLE: string | null;
  DECIDED_BY: string | null;
  DECIDED_AT: string | null;
  CREATED_AT: string;
}

export interface AccessRequestsListResponse {
  requests: AccessRequest[];
  count: number;
}

// ── POST /access-requests ────────────────────────────────────────────────────

export interface CreateAccessRequestBody {
  asset_fqn: string;
  /** Asset type label. */
  asset_type?: 'TABLE' | 'VIEW' | 'DATA_PRODUCT';
  privilege: 'SELECT' | 'REFERENCES';
  reason?: string;
}

export interface CreateAccessRequestResponse {
  status: 'pending';
  asset_fqn: string;
  asset_type: string;
  privilege: string;
  owner: string;
}

/**
 * Submit a new access request for a data asset.
 * Any authenticated user may call this (no permission gate required).
 */
export async function createAccessRequest(
  body: CreateAccessRequestBody,
): Promise<CreateAccessRequestResponse> {
  try {
    const res = await apiClient.post<CreateAccessRequestResponse>(
      API.accessRequests.create(),
      body,
    );
    return res.data;
  } catch (err) {
    throw toServiceError(err, 'Failed to submit access request');
  }
}

// ── GET /access-requests/mine ────────────────────────────────────────────────

/** Fetch access requests submitted by the caller. */
export async function getMyRequests(): Promise<AccessRequestsListResponse> {
  try {
    const res = await apiClient.get<AccessRequestsListResponse>(
      API.accessRequests.mine(),
    );
    return res.data;
  } catch (err) {
    throw toServiceError(err, 'Failed to fetch your access requests');
  }
}

// ── GET /access-requests/inbox ───────────────────────────────────────────────

/**
 * Fetch access requests awaiting the caller's approval.
 * For admin roles this returns the full pending queue.
 */
export async function getInbox(): Promise<AccessRequestsListResponse> {
  try {
    const res = await apiClient.get<AccessRequestsListResponse>(
      API.accessRequests.inbox(),
    );
    return res.data;
  } catch (err) {
    throw toServiceError(err, 'Failed to fetch access request inbox');
  }
}

// ── GET /access-requests/all ─────────────────────────────────────────────────

/** Fetch the full account-level access request audit log (account-admin only). */
export async function getAllRequests(): Promise<AccessRequestsListResponse> {
  try {
    const res = await apiClient.get<AccessRequestsListResponse>(
      API.accessRequests.all(),
    );
    return res.data;
  } catch (err) {
    throw toServiceError(err, 'Failed to fetch all access requests');
  }
}

// ── POST /access-requests/{id}/approve ──────────────────────────────────────

export interface ApproveResponse {
  status: 'approved';
  request_id: string;
  granted: boolean;
  asset_fqn: string;
  to_role: string;
}

/** Approve a pending access request. An optional `note` is stored with the decision. */
export async function approveRequest(
  id: string,
  note?: string,
): Promise<ApproveResponse> {
  try {
    const res = await apiClient.post<ApproveResponse>(
      API.accessRequests.approve(id),
      { note: note ?? null },
    );
    return res.data;
  } catch (err) {
    throw toServiceError(err, 'Failed to approve access request');
  }
}

// ── POST /access-requests/{id}/deny ─────────────────────────────────────────

export interface DenyResponse {
  status: 'denied';
  request_id: string;
}

/** Deny a pending access request. An optional `note` is stored with the decision. */
export async function denyRequest(
  id: string,
  note?: string,
): Promise<DenyResponse> {
  try {
    const res = await apiClient.post<DenyResponse>(
      API.accessRequests.deny(id),
      { note: note ?? null },
    );
    return res.data;
  } catch (err) {
    throw toServiceError(err, 'Failed to deny access request');
  }
}
