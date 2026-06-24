/**
 * Cortex Service - AI conversation history
 *
 * Wires the documented (but previously un-consumed) Cortex chat-history hooks:
 *   GET /cortex/conversations            -> list the caller's AI exchanges (newest first)
 *   GET /cortex/conversations/{id}       -> read one exchange (prompt + response)
 *
 * These paths are not yet in api-contracts.ts.
 * TODO: lift '/cortex/conversations' into API.cortex in src/lib/api-contracts.ts.
 */
import apiClient from '@/lib/api-client';
import { toServiceError } from '../_errors';

// TODO: lift to api-contracts (API.cortex.conversations / conversation)
const CONVERSATIONS_PATH = '/cortex/conversations';

export interface CortexConversation {
  id: string;
  prompt: string;
  /** Trimmed/preview text shown in the list. */
  preview?: string;
  semantic_model?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface CortexConversationDetail extends CortexConversation {
  response?: string | null;
  sql?: string | null;
}

/** Coerce an arbitrary backend record into a CortexConversation. */
function toConversation(raw: Record<string, unknown>): CortexConversation {
  const id =
    (raw.id ?? raw.conversation_id ?? raw.CONVERSATION_ID ?? raw.ID ?? '') as string;
  const prompt =
    (raw.prompt ?? raw.PROMPT ?? raw.question ?? raw.QUESTION ?? '') as string;
  return {
    id: String(id),
    prompt: String(prompt ?? ''),
    preview: (raw.preview ?? raw.PREVIEW) as string | undefined,
    semantic_model: (raw.semantic_model ?? raw.SEMANTIC_MODEL ?? null) as string | null,
    created_at: (raw.created_at ?? raw.CREATED_AT ?? raw.timestamp ?? null) as string | null,
    ...raw,
  };
}

/**
 * List the caller's recent AI chat exchanges (newest first).
 * Tolerant of {data:[...]}, {conversations:[...]}, or a bare array.
 */
export async function listCortexConversations(limit = 25): Promise<CortexConversation[]> {
  try {
    const { data } = await apiClient.get(CONVERSATIONS_PATH, { params: { limit } });
    const payload = data?.data ?? data;
    const arr: unknown[] = Array.isArray(payload)
      ? payload
      : payload?.conversations ?? payload?.items ?? payload?.results ?? [];
    return arr.map((r) => toConversation((r ?? {}) as Record<string, unknown>));
  } catch (error: any) {
    throw toServiceError(error, 'Failed to load conversation history');
  }
}

/** Read one AI exchange (prompt + response) by id. */
export async function getCortexConversation(id: string): Promise<CortexConversationDetail> {
  try {
    const { data } = await apiClient.get(`${CONVERSATIONS_PATH}/${encodeURIComponent(id)}`);
    const payload = (data?.data ?? data ?? {}) as Record<string, unknown>;
    const base = toConversation(payload);
    return {
      ...base,
      response: (payload.response ?? payload.RESPONSE ?? payload.answer ?? null) as string | null,
      sql: (payload.sql ?? payload.SQL ?? payload.query ?? null) as string | null,
    };
  } catch (error: any) {
    throw toServiceError(error, 'Failed to load conversation');
  }
}
