/**
 * Agentic OS — shared types.
 *
 * The OS is a 3-pane shell over the EXISTING governed capability space:
 * each lifecycle stage maps to one module action-catalog (registry-in-tables,
 * GET /<module>/actions) so the agent always knows, per step, what CAN be done
 * (read-only → runs inline), what needs HUMAN VALIDATION (mutating → right
 * rail), and what is NOT verified — never hidden, always labeled honestly.
 */

export type LifecycleStage =
  | 'sources'
  | 'models'
  | 'ingestion'
  | 'workflow'
  | 'dashboards'
  | 'questions'
  | 'dependencies';

export const STAGE_ORDER: LifecycleStage[] = [
  'sources',
  'models',
  'ingestion',
  'workflow',
  'dashboards',
  'questions',
  'dependencies',
];

/** One row of any module action-catalog (all 12 share this shape). */
export interface CatalogRow {
  action_id: string;
  area: string;
  label: string;
  why: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  rbac: string;
  probe: 'get' | 'none';
  verified_at?: string | null;
  verified_status?: string | null;
}

/**
 * Honest per-action verdict at the current step:
 * - ready      → read-only, contract verified: the agent may run it inline
 * - gated      → mutating: possible, but only through human validation (right rail)
 * - unverified → probeable but contract not (yet) verified: shown, not runnable
 */
export type CapabilityVerdict = 'ready' | 'gated' | 'unverified';

export interface StageCapability extends CatalogRow {
  verdict: CapabilityVerdict;
}

/** A mutating proposal parked in the right rail until a human decides. */
export interface PendingApproval {
  id: string;
  stage: LifecycleStage;
  label: string;
  rationale?: string;
  risk?: 'low' | 'medium' | 'high';
  /** Where the human completes it (existing workbench tab id). */
  handOffTab: string;
  /** Prompt/payload carried to the workbench. */
  prompt: string;
  status: 'pending' | 'sent' | 'dismissed';
}

/** Conversation entries rendered in the center canvas. */
export type AgentCardKind = 'text' | 'proposals' | 'draft' | 'rows' | 'error';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  stage: LifecycleStage;
  kind: AgentCardKind;
  text?: string;
  /** kind='proposals' — governed next actions from /cortex/agent/propose. */
  proposals?: import('@/app/services/cortex/agent').ProposedAction[];
  contextSummary?: string;
  /** kind='draft' — a coco draft tested on real data. */
  draft?: import('@/app/services/cortex/draft').CocoDraftResult;
  /** kind='rows' — inline read-only run result. */
  rows?: Record<string, unknown>[];
  rowColumns?: string[];
  at: number;
}

export interface StageMetaEntry {
  label: string;
  hint: string;
}

export const STAGE_META: Record<LifecycleStage, StageMetaEntry> = {
  sources: { label: 'Sources', hint: 'Pick the data objects that ground the agent' },
  models: { label: 'Models', hint: 'Semantic & data models over the selection' },
  ingestion: { label: 'Ingestion', hint: 'Load, sync and watermark the sources' },
  workflow: { label: 'Workflow', hint: 'Draft and govern ETL pipelines' },
  dashboards: { label: 'Dashboards', hint: 'Charts and boards, tested on real data' },
  questions: { label: 'Questions', hint: 'Ask anything — SQL drafted and verified' },
  dependencies: { label: 'Dependencies', hint: 'Lineage and impact of the selection' },
};
