/**
 * Data Quality DMF-based API Service
 * Runs built-in DMF checks, retrieves results, and suggests DMFs for tables
 *
 * Location: apps/data360/src/app/services/data-quality/index.ts
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/data-quality';

// =============================================================================
// TYPES
// =============================================================================

export interface RunBuiltinDmfCheckRequest {
  table: string;
  columns: string[];
  dmf_name: string;
}

export interface DmfCheckResult {
  table: string;
  dmf_name: string;
  column?: string;
  value?: number | string;
  status?: string;
  measured_at?: string;
}

export interface DmfResultsResponse {
  results: DmfCheckResult[];
  count: number;
}

export interface DmfSuggestion {
  dmf_name: string;
  description?: string;
  applicable_columns?: string[];
  reason?: string;
}

export interface DmfSuggestResponse {
  suggestions: DmfSuggestion[];
  table_name?: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Run a built-in DMF check against a table's columns
 * POST /data-quality/projects/{project_id}/dmf-check
 */
export async function runBuiltinDmfCheck(projectId: string, request: RunBuiltinDmfCheckRequest) {
  const { data } = await apiClient.post(`${PREFIX}/projects/${encodeURIComponent(projectId)}/dmf-check`, {
    table: request.table,
    columns: request.columns,
    dmf_name: request.dmf_name,
  });
  return data;
}

/**
 * Get DMF evaluation results for a project
 * GET /data-quality/projects/{project_id}/dmf-results
 */
export async function getDmfResults(
  projectId: string,
  params?: { table_name?: string; database?: string; schema?: string }
): Promise<DmfResultsResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.table_name) queryParams.table_name = params.table_name;
  if (params?.database) queryParams.database = params.database;
  if (params?.schema) queryParams.schema = params.schema;
  const { data } = await apiClient.get(`${PREFIX}/projects/${encodeURIComponent(projectId)}/dmf-results`, {
    params: queryParams,
  });
  return data;
}

/**
 * Get DMF suggestions for a table based on its schema and data profile
 * GET /data-quality/projects/{project_id}/dmf-suggest
 */
export async function suggestDmfs(
  projectId: string,
  params?: { table_name?: string; database?: string; schema?: string }
): Promise<DmfSuggestResponse> {
  const queryParams: Record<string, string> = {};
  if (params?.table_name) queryParams.table_name = params.table_name;
  if (params?.database) queryParams.database = params.database;
  if (params?.schema) queryParams.schema = params.schema;
  const { data } = await apiClient.get(`${PREFIX}/projects/${encodeURIComponent(projectId)}/dmf-suggest`, {
    params: queryParams,
  });
  return data;
}

// =============================================================================
// DASHBOARD METRICS — Match backend /data-quality/* endpoints
// =============================================================================

export interface QualitySummary {
  total_tables: number;
  tables_with_issues: number;
  overall_score: number;
  dimensions: Record<string, number>;
}

export interface MetricRow {
  [key: string]: string | number | null;
}

export async function getQualitySummary(database: string, days?: number): Promise<QualitySummary> {
  const { data } = await apiClient.get(`${PREFIX}/quality-summary`, {
    params: { database, days: days || 30 },
  });
  return data?.data || data;
}

export async function getCompletenessMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/completeness-metrics`, {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getUniquenessMetrics(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/uniqueness-metrics`, {
    params: { database },
  });
  return data?.rows || data?.data || data || [];
}

export async function getFreshnessMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/freshness-metrics`, {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getIngestionMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/ingestion-metrics`, {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getSchemaQuality(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/schema-quality`, {
    params: { database },
  });
  return data?.data || data || [];
}

export async function getClassificationCoverage(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/classification-coverage`, {
    params: { database },
  });
  return data?.data || data || [];
}

export async function getCostMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/cost-metrics`, {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getSecurityPosture(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/security-posture`, {
    params: { database },
  });
  return data?.data || data || [];
}

export async function getDmfDashboardResults(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(`${PREFIX}/dmf-results-dashboard`, {
    params: { database },
  });
  return data?.data || data || [];
}

// =============================================================================
// TREND & THRESHOLD — New features
// =============================================================================

export interface TrendDataPoint {
  day: string;
  metric_name: string;
  avg_value: number;
}

export async function getTrendAnalysis(database: string, days?: number): Promise<TrendDataPoint[]> {
  const { data } = await apiClient.get(`${PREFIX}/trend-analysis`, {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export interface ThresholdConfig {
  table_name: string;
  metric: string;
  threshold: number;
}

export async function setQualityThresholds(config: ThresholdConfig): Promise<{ status: string }> {
  const { data } = await apiClient.post(`${PREFIX}/thresholds`, config);
  return data?.data || data;
}

// Re-export local report service for backward compatibility
export {
  createQualityReport,
  getQualityReports,
  getQualityReport,
  updateQualityReport,
  deleteQualityReport,
  duplicateQualityReport,
  exportQualityReport,
  importQualityReport,
  clearAllQualityReports,
  getStorageInfo,
  setCurrentUser,
  runQualityChecks,
} from './reports-local';
export type {
  QualityMetric,
  DataSource,
  QualityReportItem,
  QualityReport,
  CreateQualityReportInput,
  RunQualityChecksOptions,
} from './reports-local';
