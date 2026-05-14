/**
 * Notifications Service — talks to the /notifications backend module.
 *
 * Backend tables: CP_DATA360.EVENT_STORE.NOTIFICATIONS_RAW + NOTIFICATIONS_USER
 * (see backend/snowflake/notifications_setup.sql).
 *
 * Response shape: backend wraps payloads in ApiResponse({success, data}),
 * so we unwrap with `res.data?.data ?? res.data` exactly like services/chat.
 */
import apiClient from '@/lib/api-client';

export type NotificationKind =
  | 'deploy_success'
  | 'deploy_failure'
  | 'approval_request'
  | 'approval_granted'
  | 'approval_rejected'
  | 'workflow_finished'
  | 'workflow_failed'
  | 'system';

export type UiOrigin =
  | 'explore-design'
  | 'workflow'
  | 'bi'
  | 'dq'
  | 'system';

export interface NotificationItem {
  notification_id: string;
  raw_id: string;
  project_id: string | null;
  kind: NotificationKind | string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  ui_origin?: UiOrigin | string | null;
  link?: string | null;
  actor_username?: string | null;
  created_at: string;
  delivered_at: string;
  read_at?: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  page_size: number;
  total: number;
  unread_count: number;
}

export interface ListParams {
  unread_only?: boolean;
  kind?: NotificationKind;
  project_id?: string;
  page?: number;
  page_size?: number;
}

function unwrap<T>(res: { data: any }): T {
  return (res.data?.data ?? res.data) as T;
}

export async function listNotifications(params: ListParams = {}): Promise<NotificationListResponse> {
  const res = await apiClient.get('/notifications', { params });
  return unwrap<NotificationListResponse>(res);
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get('/notifications/unread-count');
  const data = unwrap<{ unread: number }>(res);
  return data?.unread ?? 0;
}

export async function markRead(notificationId: string): Promise<boolean> {
  const res = await apiClient.patch(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
  );
  const data = unwrap<{ updated: boolean }>(res);
  return Boolean(data?.updated);
}

export async function markAllRead(): Promise<number> {
  const res = await apiClient.post('/notifications/mark-all-read');
  const data = unwrap<{ updated: number }>(res);
  return data?.updated ?? 0;
}

export type Audience =
  | { audience: 'PROJECT_READERS' | 'PROJECT_EDITORS'; project_id: string }
  | { audience: 'ROLE'; audience_role: string }
  | { audience: 'USER_LIST'; audience_users: string[] }
  | { audience: 'EVERYONE' };

export type BroadcastInput = {
  kind: NotificationKind | string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  link?: string;
  ui_origin?: UiOrigin;
} & Audience;

/** Internal-only helper. UI code rarely calls this directly — backend
 *  workers (deploy, workflow) are the typical broadcasters. */
export async function broadcast(input: BroadcastInput): Promise<{ raw_id: string }> {
  const res = await apiClient.post('/notifications/broadcast', input);
  return unwrap<{ raw_id: string }>(res);
}
