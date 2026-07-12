/**
 * COCO Drafts — chat helper returning JSON proposal drafts TESTED on real data.
 * Backend: POST /cortex/coco/draft.
 * The LLM drafts a module artifact (sql / chart / etl) grounded in real table
 * schemas, then the backend executes/validates it against live data before
 * returning. Latency 5-30s (LLM + real test execution). NO auto-create —
 * validation happens in the target module.
 */
import apiClient from '@/lib/api-client';
import { toServiceError } from '../_errors';

export type DraftModule = 'sql' | 'chart' | 'etl';

export interface DraftTestStep {
  step: number;
  action_type: string;
  status: string; // 'rendered' | 'failed'
  error?: string;
  missing?: string[];
}

export interface DraftTested {
  status: 'passed' | 'failed' | 'rejected';
  /** sql/chart: columns returned by the real test execution. */
  columns?: string[];
  /** sql/chart: number of sample rows returned. */
  sample_rows?: number;
  /** sql/chart: the actual sample rows from the live test run. */
  sample?: Record<string, unknown>[];
  /** etl: per-step render/validation results. */
  steps?: DraftTestStep[];
  error?: string;
}

export interface CocoDraftResult {
  module: DraftModule;
  intent: string;
  /** The proposed JSON draft — null when the LLM could not produce one. */
  draft: Record<string, unknown> | null;
  tested: DraftTested;
  ready_to_validate: boolean;
  /** FQN → ["COL:TYPE", ...] the draft was grounded on. */
  grounding: Record<string, string[]>;
  model: string;
}

export interface CocoDraftRequest {
  module: DraftModule;
  intent: string;
  /** Table FQNs (DB.SCHEMA.TABLE), max 5. */
  tables?: string[];
  /** Row cap for the real-data test execution (<= 5000). */
  test_limit?: number;
}

/** Generate a draft proposal and test it on real data (5-30s). */
export async function cocoDraft(req: CocoDraftRequest): Promise<CocoDraftResult> {
  try {
    const res = await apiClient.post('/cortex/coco/draft', req, { timeout: 120_000 });
    return (res.data?.data ?? res.data) as CocoDraftResult;
  } catch (err) {
    throw toServiceError(err, 'cocoDraft');
  }
}
