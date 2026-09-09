/**
 * summary.ts — the per-view KPI roll-ups for the Studio application views
 * (contract summary.v1, served on :8078).
 *
 *   GET /studio/drafts/{id}/summary?views=model,sources,quality,jobs,access
 *
 * Derived from persisted state — never a scan. The cardinal rule the whole
 * platform follows: a score that has NOT been evaluated is `null`, never 0
 * and never 100. The UI renders `null` as "—", and every score carries the
 * `method` by which it was computed so nothing reads as an invented figure.
 */

import apiClient from '@/lib/api-client';

/** A scored metric: value + how it was computed. null = not evaluated. */
export interface ScoredMetric {
  score?: number | null;
  evaluated?: boolean;
  method?: string | null;
  checks?: number | null;
  counts?: Record<string, number> | null;
}

export interface ModelSummary {
  model_coverage_pct?: number | null;
  semantic_readiness_pct?: number | null;
  business_alignment_pct?: number | null;
  join_confidence_pct?: number | null;
  facts?: number | null;
  dimensions?: number | null;
  entities?: number | null;
  relationships?: number | null;
  used_by_reports?: Record<string, { kpis?: string[]; charts?: string[]; reports?: number }> | null;
  last_build?: string | null;
  version?: number | string | null;
  method?: string | null;
}

export interface SourcesSummary {
  connected_systems?: number | null;
  systems?: unknown[];
  functional_domains_detected?: number | null;
  domains?: unknown[];
  rows_scanned?: number | null;
  freshness_avg_days?: number | null;
  source_health_score?: number | null;
  objects?: number | null;
  analysed?: number | null;
  per_object?: Array<{
    ref?: string;
    freshness?: { last_altered?: string; days?: number | null; method?: string };
    domain?: string | null;
    health?: { state?: string; why?: string };
    rows_approx?: number | null;
  }>;
}

export interface QualitySummary {
  dimensions?: Record<string, ScoredMetric>;
  layers?: {
    source?: ScoredMetric;
    ingestion_build?: ScoredMetric;
    target?: ScoredMetric;
  };
  business_impact?: {
    kpis_at_risk?: Array<{ chart_id?: string; title?: string; entity_id?: string }>;
    count?: number | null;
  };
}

export interface JobSummaryRow {
  job_id?: string;
  stage?: 'source_loads' | 'conformed_dims' | 'facts' | 'quality' | 'backfills' | string;
  data_type?: 'transactional' | 'event' | 'dimension' | 'snapshot' | string;
  system_kind?: string | null;
  delivery?: string | null;
  cost?: {
    credits_reconciled?: number | null;
    runs_with_cost?: number | null;
    runs?: number | null;
    note?: string | null;
  };
  last_run?: unknown;
  dlq_open?: number | null;
}

export interface JobsSummary {
  jobs?: JobSummaryRow[];
  by_stage?: Record<string, number>;
  by_data_type?: Record<string, number>;
  credits_reconciled_total?: number | null;
}

export interface AccessPendingApproval {
  kind?: 'activation' | 'access_plan' | 'profiles_plan' | 'assignment' | 'dq_waiver' | string;
  id?: string;
  what?: string;
  since?: string;
  decide?: unknown;
  requires?: string[];
}

export interface AccessSummary {
  people?: number | null;
  app_roles?: number | null;
  governed_datasets?: number | null;
  active_rls?: number | null;
  masked_columns?: number | null;
  encrypted_columns?: number | null;
  pending_approvals?: AccessPendingApproval[];
  pending_count?: number | null;
  risk_level?: 'low' | 'medium' | 'high' | string | null;
  risk_reasons?: string[];
  persisted_risk?: boolean;
}

export interface StudioSummary {
  model?: ModelSummary;
  sources?: SourcesSummary;
  quality?: QualitySummary;
  jobs?: JobsSummary;
  access?: AccessSummary;
  [k: string]: unknown;
}

export type SummaryView = 'model' | 'sources' | 'quality' | 'jobs' | 'access';

export async function getStudioSummary(
  draftId: string,
  views: SummaryView[],
): Promise<StudioSummary> {
  const { data } = await apiClient.get<StudioSummary>(
    `/studio/drafts/${encodeURIComponent(draftId)}/summary`,
    { params: { views: views.join(',') }, timeout: 60_000 },
  );
  return data ?? {};
}
