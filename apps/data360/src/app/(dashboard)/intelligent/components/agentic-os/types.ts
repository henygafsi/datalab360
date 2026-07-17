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
  /** Starter prompts — a successful first run per step (onboarding-by-agent). */
  starters: string[];
}

export const STAGE_META: Record<LifecycleStage, StageMetaEntry> = {
  sources: {
    label: 'Sources',
    hint: 'Pick the data objects that ground the agent',
    starters: [
      'Profile the selected tables: row counts, freshness and quality signals',
      'Which of my sources are stale or unmonitored?',
      'Suggest the best tables for a customer-360 view',
    ],
  },
  models: {
    label: 'Models',
    hint: 'Semantic & data models over the selection',
    starters: [
      'Propose a star schema over the selected tables',
      'Which tables are missing a primary key or relationships?',
      'Draft a semantic model for the selection',
    ],
  },
  ingestion: {
    label: 'Ingestion',
    hint: 'Load, sync and watermark the sources',
    starters: [
      'What is the load status and freshness of my selection?',
      'Recommend an ingestion mode (full, incremental, CDC) for these tables',
      'Show recent ingestion failures and how to fix them',
    ],
  },
  workflow: {
    label: 'Workflow',
    hint: 'Draft and govern ETL pipelines',
    starters: [
      'Draft a pipeline that cleans and merges the selected tables',
      'Aggregate the selection into a daily summary table',
      'Add a quality gate before publishing the output',
    ],
  },
  dashboards: {
    label: 'Dashboards',
    hint: 'Charts and boards, tested on real data',
    starters: [
      'Chart the trend over time for the selected data',
      'Build a top-10 breakdown chart from the selection',
      'Compare this month vs last month on the key metric',
    ],
  },
  questions: {
    label: 'Questions',
    hint: 'Ask anything — SQL drafted and verified',
    starters: [
      'What are the 10 most important facts in the selected tables?',
      'Find anomalies or outliers in the selection',
      'Summarize what this data is about',
    ],
  },
  dependencies: {
    label: 'Dependencies',
    hint: 'Lineage and impact of the selection',
    starters: [
      'What feeds the selected tables, and what breaks if they change?',
      'Who uses these objects the most?',
      'Show the downstream impact of dropping a column here',
    ],
  },
};
