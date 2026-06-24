import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

/**
 * Chat Service — CRUD for conversations, messages, participants, attachments.
 * Uses the /chat backend endpoints (CHAT_CONVERSATIONS + CHAT_MESSAGES tables).
 *
 * Backend routes covered:
 *   GET    /chat/conversations
 *   GET    /chat/conversations/{id}
 *   GET    /chat/conversations/{id}/messages
 *   GET    /chat/conversations/{id}/participants
 *   GET    /chat/online-users
 *   PATCH  /chat/conversations/{id}
 *   POST   /chat/conversations/dm
 *   POST   /chat/conversations/group
 *   POST   /chat/conversations/{id}/attachments
 *   POST   /chat/conversations/{id}/messages
 *   POST   /chat/conversations/{id}/read
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ChatConversation {
  CONVERSATION_ID: string;
  TITLE: string;
  TYPE: string;
  CREATED_AT: string;
  UPDATED_AT: string;
  LAST_MESSAGE?: string;
  UNREAD_COUNT?: number;
}

export interface ChatMessageRecord {
  MESSAGE_ID: string;
  CONVERSATION_ID: string;
  SENDER_USERNAME: string;
  CONTENT: string;
  MESSAGE_TYPE: string;
  CREATED_AT: string;
  IS_EDITED?: boolean;
}

export interface ChatParticipant {
  username: string;
  role: 'ADMIN' | 'MEMBER';
  joined_at?: string;
  is_online?: boolean;
}

export interface ConversationListResponse {
  items: ChatConversation[];
  total: number;
  page: number;
  page_size: number;
}

export interface MessageListResponse {
  items: ChatMessageRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface AttachmentResponse {
  attachment_id: string;
  file_name: string;
  file_size?: number;
  mime_type?: string;
  uploaded_at?: string;
}

export interface OnlineUsersResponse {
  online_users: string[];
  count: number;
}

// ── Key normalizer ─────────────────────────────────────────────────────
// Backend returns lowercase keys on create, uppercase from Snowflake SELECTs.

function normalizeConversation(raw: any): ChatConversation {
  return {
    CONVERSATION_ID: raw.CONVERSATION_ID || raw.conversation_id || '',
    TITLE: raw.TITLE || raw.title || '',
    TYPE: raw.TYPE || raw.conversation_type || raw.type || 'GROUP',
    CREATED_AT: raw.CREATED_AT || raw.created_at || new Date().toISOString(),
    UPDATED_AT: raw.UPDATED_AT || raw.updated_at || raw.CREATED_AT || raw.created_at || new Date().toISOString(),
    LAST_MESSAGE: raw.LAST_MESSAGE || raw.last_message,
    UNREAD_COUNT: raw.UNREAD_COUNT ?? raw.unread_count ?? 0,
  };
}

function normalizeMessage(raw: any): ChatMessageRecord {
  return {
    MESSAGE_ID: raw.MESSAGE_ID || raw.message_id || '',
    CONVERSATION_ID: raw.CONVERSATION_ID || raw.conversation_id || '',
    SENDER_USERNAME: raw.SENDER_USERNAME || raw.sender_username || raw.username || '',
    CONTENT: raw.CONTENT || raw.content || '',
    MESSAGE_TYPE: raw.MESSAGE_TYPE || raw.message_type || 'TEXT',
    CREATED_AT: raw.CREATED_AT || raw.created_at || new Date().toISOString(),
    IS_EDITED: raw.IS_EDITED ?? raw.is_edited ?? false,
  };
}

// ── API calls ──────────────────────────────────────────────────────────

/** List all conversations for the current user */
export async function listConversations(page = 1, pageSize = 50): Promise<ConversationListResponse> {
  const res = await apiClient.get(API.chat.conversations(), { params: { page, page_size: pageSize } });
  const data = res.data?.data ?? res.data;
  return {
    ...data,
    items: (data.items || []).map(normalizeConversation),
  };
}

/** Get a single conversation by ID */
export async function getConversation(conversationId: string): Promise<ChatConversation> {
  const res = await apiClient.get(API.chat.conversation(conversationId));
  return normalizeConversation(res.data?.data ?? res.data);
}

/** Create a DM conversation (used for AI chat — DM with self or bot user) */
export async function createDMConversation(targetUsername: string): Promise<ChatConversation> {
  const res = await apiClient.post(API.chat.conversationsDm(), { target_username: targetUsername });
  return normalizeConversation(res.data?.data ?? res.data);
}

/** Create a group conversation */
export async function createGroupConversation(title: string, participants: string[] = []): Promise<ChatConversation> {
  const res = await apiClient.post(API.chat.conversationsGroup(), {
    title,
    participant_usernames: participants,
  });
  return normalizeConversation(res.data?.data ?? res.data);
}

/** Get messages for a conversation */
export async function getMessages(
  conversationId: string,
  page = 1,
  pageSize = 100,
  beforeMessageId?: string,
): Promise<MessageListResponse> {
  const params: Record<string, any> = { page, page_size: pageSize };
  if (beforeMessageId) params.before_message_id = beforeMessageId;
  const res = await apiClient.get(API.chat.conversationMessages(conversationId), { params });
  const data = res.data?.data ?? res.data;
  return {
    ...data,
    items: (data.items || []).map(normalizeMessage),
  };
}

/** Send a message to a conversation */
export async function sendMessage(
  conversationId: string,
  content: string,
  messageType: 'TEXT' | 'SYSTEM' | 'FILE' | 'IMAGE' = 'TEXT',
  replyToMessageId?: string,
  attachmentIds?: string[],
): Promise<ChatMessageRecord> {
  const body: Record<string, any> = { content, message_type: messageType };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  if (attachmentIds?.length) body.attachment_ids = attachmentIds;
  const res = await apiClient.post(API.chat.conversationMessages(conversationId), body);
  return normalizeMessage(res.data?.data ?? res.data);
}

/** Update conversation title */
export async function updateConversation(conversationId: string, title: string): Promise<ChatConversation> {
  const res = await apiClient.patch(API.chat.conversation(conversationId), { title });
  return normalizeConversation(res.data?.data ?? res.data);
}

/** Get participants in a conversation */
export async function getParticipants(conversationId: string): Promise<ChatParticipant[]> {
  const res = await apiClient.get(API.chat.conversationParticipants(conversationId));
  const data = res.data?.data ?? res.data;
  return data?.participants ?? [];
}

/** Mark messages as read up to a specific message */
export async function markAsRead(
  conversationId: string,
  lastReadMessageId: string,
): Promise<Record<string, any>> {
  const res = await apiClient.post(API.chat.conversationRead(conversationId), {
    last_read_message_id: lastReadMessageId,
  });
  return res.data?.data ?? res.data;
}

/** Upload a file attachment to a conversation. Returns attachment metadata. */
export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<AttachmentResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post(
    API.chat.conversationAttachments(conversationId),
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data?.data ?? res.data;
}

/** Get list of currently online users (active WebSocket connections) */
export async function getOnlineUsers(): Promise<OnlineUsersResponse> {
  try {
    const res = await apiClient.get(API.chat.onlineUsers());
    return res.data?.data ?? res.data ?? { online_users: [], count: 0 };
  } catch {
    // Graceful fallback — presence is non-critical
    return { online_users: [], count: 0 };
  }
}
