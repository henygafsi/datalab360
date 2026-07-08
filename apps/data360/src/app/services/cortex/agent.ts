/**
 * Cortex Agent — agentic proposals + governed coco execution.
 * Backend: POST /cortex/agent/propose, POST /cortex/coco/run-sql.
 * The AI Intelligence surface uses these to PROPOSE governed actions grounded
 * in a project's 360 context, then execute read-only coco SQL.
 */
import apiClient from '@/lib/api-client';
import { toServiceError } from '../_errors';

export type ProposedActionKind = 'endpoint' | 'coco_sql';

export interface ProposedAction {
  kind: ProposedActionKind;
  label: string;
  rationale?: string;
  risk?: 'low' | 'medium' | 'high';
  endpoint?: { method: 'GET' | 'POST'; path: string; body?: Record<string, unknown> };
  sql?: string | null;
  requires?: { module: string; action: string };
  /** Set server-side when a coco_sql proposal contained a write statement. */
  _rejected?: string;
}

export interface AgentProposeResult {
  project_id: string;
  goal: string;
  context_summary: string;
  actions: ProposedAction[];
  model: string;
  error?: string;
}

/** Ask the agent to propose governed next actions for a project + goal. */
export async function proposeAgentActions(
  projectId: string,
  goal: string,
  model?: string,
): Promise<AgentProposeResult> {
  try {
    const res = await apiClient.post('/cortex/agent/propose', {
      project_id: projectId,
      goal,
      ...(model ? { model } : {}),
    });
    return (res.data?.data ?? res.data) as AgentProposeResult;
  } catch (err) {
    throw toServiceError(err, 'proposeAgentActions');
  }
}

export interface CocoRunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
}

/** Execute a READ-ONLY SQL snippet via the governed coco path (write → 422). */
export async function cocoRunSql(sql: string, limit = 200): Promise<CocoRunResult> {
  try {
    const res = await apiClient.post('/cortex/coco/run-sql', { sql, limit });
    return (res.data?.data ?? res.data) as CocoRunResult;
  } catch (err) {
    throw toServiceError(err, 'cocoRunSql');
  }
}
