/**
 * Chat Service — CRUD for AI chat conversations persisted in Snowflake.
 * Uses the /chat backend endpoints (CHAT_CONVERSATIONS + CHAT_MESSAGES tables).
 */
import apiClient from '@/lib/api-client';

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
  const res = await apiClient.get('/chat/conversations', { params: { page, page_size: pageSize } });
  const data = res.data?.data ?? res.data;
  return {
    ...data,
    items: (data.items || []).map(normalizeConversation),
  };
}

/** Create a DM conversation (used for AI chat — DM with self or bot user) */
export async function createDMConversation(targetUsername: string): Promise<ChatConversation> {
  const res = await apiClient.post('/chat/conversations/dm', { target_username: targetUsername });
  return normalizeConversation(res.data?.data ?? res.data);
}

/** Create a group conversation */
export async function createGroupConversation(title: string, participants: string[] = []): Promise<ChatConversation> {
  const res = await apiClient.post('/chat/conversations/group', {
    title,
    participant_usernames: participants,
  });
  return normalizeConversation(res.data?.data ?? res.data);
}

/** Get messages for a conversation */
export async function getMessages(conversationId: string, page = 1, pageSize = 100): Promise<MessageListResponse> {
  const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`, {
    params: { page, page_size: pageSize },
  });
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
  messageType: 'TEXT' | 'SYSTEM' = 'TEXT',
): Promise<ChatMessageRecord> {
  const res = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
    content,
    message_type: messageType,
  });
  return normalizeMessage(res.data?.data ?? res.data);
}

/** Update conversation title */
export async function updateConversation(conversationId: string, title: string): Promise<ChatConversation> {
  const res = await apiClient.patch(`/chat/conversations/${conversationId}`, { title });
  return normalizeConversation(res.data?.data ?? res.data);
}
