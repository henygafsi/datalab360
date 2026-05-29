import apiClient from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnalyticsResult {
  ANALYSIS_ID: string;
  ANALYSIS_TIMESTAMP: string;
  ANALYSIS_TYPE: string;
  QUERY_ID: string;
  USERNAME: string;
  WAREHOUSE_NAME: string;
  DATABASE_NAME: string;
  SCHEMA_NAME: string;
  QUERY_TYPE: string;
  EXECUTION_STATUS: string;
  EXECUTION_TIME_MS: number;
  ROWS_PRODUCED: number;
  ERROR_MESSAGE: string | null;
  CORTEX_ANALYSIS: string;
  RECOMMENDATION: string;
  SEVERITY: string;
  MODULE: string | null;
  IS_REDUNDANT: boolean;
  REDUNDANT_GROUP_ID: string | null;
  QUERY_HASH: string;
}

export interface AnalyticsSummary {
  TOTAL_ANALYZED: number;
  REDUNDANT_COUNT: number;
  ERROR_COUNT: number;
  OPTIMIZATION_COUNT: number;
  SLOW_QUERY_COUNT: number;
  CRITICAL_COUNT: number;
  WARNING_COUNT: number;
  AVG_EXECUTION_TIME_MS: number;
  LAST_ANALYSIS_AT: string | null;
  top_error_patterns: Array<{ error: string; count: number }>;
  most_redundant_queries: Array<{
    QUERY_HASH: string;
    QUERY_TYPE: string;
    execution_count: number;
    avg_time_ms: number;
    recommendation: string;
  }>;
}

export interface RedundantGroup {
  REDUNDANT_GROUP_ID: string;
  QUERY_TYPE: string;
  SAMPLE_USER: string;
  WAREHOUSE: string;
  DATABASE_NAME: string;
  EXECUTION_COUNT: number;
  AVG_TIME_MS: number;
  TOTAL_TIME_MS: number;
  RECOMMENDATION: string;
  LAST_SEEN: string;
}

export interface RunAnalysisResponse {
  analyzed: number;
  inserted: number;
  cortex_issues: number;
  redundant_groups: number;
  hours: number;
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function runQueryAnalysis(hours: number = 5): Promise<RunAnalysisResponse> {
  const response = await apiClient.post('/cortex/query-analytics/analyze', null, {
    params: { hours },
    timeout: 120000,
  });
  return response.data;
}

export async function getQueryAnalyticsResults(params?: {
  analysis_type?: string;
  severity?: string;
  limit?: number;
}): Promise<{ results: AnalyticsResult[]; count: number }> {
  const response = await apiClient.get('/cortex/query-analytics/results', { params });
  return response.data;
}

export async function getQueryAnalyticsSummary(): Promise<AnalyticsSummary> {
  const response = await apiClient.get('/cortex/query-analytics/summary');
  return response.data;
}

export async function getRedundantGroups(limit: number = 20): Promise<{ groups: RedundantGroup[]; count: number }> {
  const response = await apiClient.get('/cortex/query-analytics/redundant-groups', {
    params: { limit },
  });
  return response.data;
}
