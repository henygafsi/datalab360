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
