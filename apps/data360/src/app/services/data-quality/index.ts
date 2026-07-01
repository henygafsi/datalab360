/**
 * Data Quality DMF-based API Service
 * Runs built-in DMF checks, retrieves results, and suggests DMFs for tables
 *
 * Location: apps/data360/src/app/services/data-quality/index.ts
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

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
 *
 * Backend declares all three fields as FastAPI Query() params (not body).
 * `columns` must be a comma-separated string; the `string[]` in the request
 * type is joined here. Guarded against callers that pass columns as `undefined`
 * (e.g. the api-health test harness which uses `as any`).
 */
export async function runBuiltinDmfCheck(projectId: string, request: RunBuiltinDmfCheckRequest) {
  const columnsCsv = Array.isArray(request.columns) ? request.columns.join(',') : String(request.columns ?? '');
  const { data } = await apiClient.post(API.dataQuality.projectDmfCheck(projectId), null, {
    params: {
      table: request.table,
      columns: columnsCsv,
      dmf_name: request.dmf_name,
    },
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
  const { data } = await apiClient.get(API.dataQuality.projectDmfResults(projectId), {
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
  const { data } = await apiClient.get(API.dataQuality.projectDmfSuggest(projectId), {
    params: queryParams,
  });
  return data;
}

/**
 * Suggest DMFs for a single table WITHOUT a Data Quality project in scope.
 * POST /data-quality/dmf/suggest  (documented in _NEW_CAPABILITIES.md)
 *
 * The project-scoped {@link suggestDmfs} (GET /projects/{id}/dmf-suggest) needs a
 * DQ project; this table-scoped variant lets a power user get AI suggestions for
 * any table they have selected. The backend declares the table via Query()/body;
 * we pass both `table` and `table_name` (plus db/schema) so the call validates
 * regardless of the exact parameter name, and FastAPI ignores the unused one.
 *
 * TODO: lift to api-contracts as API.dataQuality.dmfSuggestPost once the shared
 * contract file is editable (parallel-edit guard this round).
 */
const DQ_DMF_SUGGEST_POST = '/data-quality/dmf/suggest';

export async function suggestDmfsForTable(
  tableFqn: string,
  opts?: { database?: string; schema?: string },
): Promise<DmfSuggestResponse> {
  // QA P1-2: the backend requires `table_name` in the JSON BODY (Pydantic), not
  // as a query param — sending a null body + params 400'd on every click.
  const { data } = await apiClient.post(DQ_DMF_SUGGEST_POST, {
    table_name: tableFqn,
    ...(opts?.database ? { database: opts.database } : {}),
    ...(opts?.schema ? { schema: opts.schema } : {}),
  }, {
    params: {
      table: tableFqn,
      table_name: tableFqn,
      ...(opts?.database ? { database: opts.database } : {}),
      ...(opts?.schema ? { schema: opts.schema } : {}),
    },
  });
  const suggestions = data?.suggestions ?? data?.data?.suggestions ?? data?.data ?? data ?? [];
  return {
    suggestions: Array.isArray(suggestions) ? (suggestions as DmfSuggestion[]) : [],
    table_name: data?.table_name ?? tableFqn,
  };
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
  const { data } = await apiClient.get(API.dataQuality.qualitySummary(), {
    params: { database, days: days || 30 },
  });
  return data?.data || data;
}

export async function getCompletenessMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.completenessMetrics(), {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getUniquenessMetrics(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.uniquenessMetrics(), {
    params: { database },
  });
  return data?.rows || data?.data || data || [];
}

export async function getFreshnessMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.freshnessMetrics(), {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getIngestionMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.ingestionMetrics(), {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getSchemaQuality(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.schemaQuality(), {
    params: { database },
  });
  return data?.data || data || [];
}

export async function getClassificationCoverage(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.classificationCoverage(), {
    params: { database },
  });
  return data?.data || data || [];
}

export async function getCostMetrics(database: string, days?: number): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.costMetrics(), {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export async function getDQSecurityPosture(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.securityPosture(), {
    params: { database },
  });
  return data?.data || data || [];
}

export async function getDmfDashboardResults(database: string): Promise<MetricRow[]> {
  const { data } = await apiClient.get(API.dataQuality.dmfResults(), {
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
  const { data } = await apiClient.get(API.dataQuality.trendAnalysis(), {
    params: { database, days: days || 30 },
  });
  return data?.data || data || [];
}

export interface ThresholdConfig {
  table_name: string;
  metric: string;
  threshold: number;
}

/** Full body accepted by POST /data-quality/dmf/thresholds */
export interface DmfThresholdPayload {
  table_name: string;
  column_name: string;
  metric: string;
  min_value?: number;
  max_value?: number;
  threshold_type: 'absolute' | 'percentage' | 'range';
}

export interface DmfThresholdResponse {
  id?: string | number;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Persist a DMF threshold rule.
 * POST /data-quality/dmf/thresholds
 *
 * Backend ThresholdRequest (dmf_lifecycle_router.py:83-88) requires a SINGLE numeric
 * `threshold` + a pass `operator`; it has no `min_value`/`max_value`/`column_name`/
 * `threshold_type`. The UI still collects min/max for `range`, so we map here:
 *   - max_value present → operator '<=' threshold=max_value  (upper bound)
 *   - else min_value present → operator '>=' threshold=min_value (lower bound)
 *   - non-range types → the single provided value (max preferred, else min)
 * Range is lossy (only one bound can be sent); we send the upper bound when both
 * are present. `column_name` is dropped (backend keys on table_name + metric).
 */
export async function setDmfThreshold(
  payload: DmfThresholdPayload,
): Promise<DmfThresholdResponse> {
  const hasMax = typeof payload.max_value === 'number';
  const hasMin = typeof payload.min_value === 'number';
  const threshold = hasMax ? (payload.max_value as number) : (payload.min_value as number);
  const operator = hasMax ? '<=' : hasMin ? '>=' : '<=';
  const body = {
    table_name: payload.table_name,
    metric: payload.metric,
    threshold,
    operator,
  };
  const { data } = await apiClient.post(API.dataQuality.dmfThresholds(), body);
  return data?.data || data;
}

// =============================================================================
// ACTIONS
// =============================================================================

export interface RunCheckResponse {
  status?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * QualityCheckConfig — mirrors the backend Pydantic model consumed by
 * POST /data-quality/run-check. The `table` field is REQUIRED by the backend;
 * a request without it fails validation (422). The simple `runQualityCheck`
 * helper below intentionally has no usable form (the legacy `{database}` body
 * never satisfied the contract), so callers should use `runQualityCheckOnTable`.
 */
export interface QualityCheckConfig {
  table: string;
  completeness_checks?: string[];
  uniqueness_checks?: string[];
  freshness_config?: { column: string; max_age_hours: number };
  expected_schema?: Record<string, string>;
  custom_rules?: { name: string; sql: string; pass_condition?: string }[];
}

/** A single check result returned inside a run-check response. */
export interface QualityCheckResult {
  check_type: string;
  column?: string;
  status?: string; // PASS | FAIL | ERROR
  completeness_pct?: number;
  duplicates?: number;
  threshold?: number;
  error?: string;
  [key: string]: unknown;
}

export interface QualityCheckRunResult {
  table: string;
  checked_at?: string;
  checks: QualityCheckResult[];
  summary?: {
    total_checks: number;
    passed: number;
    failed: number;
    errors: number;
    overall_status: string;
  };
}

/**
 * Run a configurable quality check against a single table.
 * This is the real, contract-correct entry point for the threshold form:
 * thresholds are enforced server-side per the columns/freshness/custom rules
 * supplied in `config`.
 * POST /data-quality/run-check
 */
export async function runQualityCheckOnTable(config: QualityCheckConfig): Promise<QualityCheckRunResult> {
  const { data } = await apiClient.post(API.dataQuality.runCheck(), config);
  return data?.data || data;
}

/** Column-level profile row returned by the auto-profiler. */
export interface ColumnProfile {
  column?: string;
  data_type?: string;
  null_count?: number;
  distinct_count?: number;
  [key: string]: unknown;
}

/** Response of POST /data-quality/auto-profile. */
export interface AutoProfileResult {
  success?: boolean;
  table: string;
  profiled_at?: string;
  profile?: {
    row_count?: number;
    quality_score?: number;
    columns?: ColumnProfile[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Auto-profile a single table — recompute/refresh its column statistics
 * (row count, per-column null/distinct counts and an aggregate quality score).
 * Thin DQ wrapper over the canonical table profiler.
 * POST /data-quality/auto-profile
 *
 * Backend AutoProfileRequest fields: `database`, `schema` (alias of `schema_name`,
 * accepted via populate_by_name), `table`.
 */
export async function autoProfileTable(
  database: string,
  schema: string,
  table: string,
): Promise<AutoProfileResult> {
  const { data } = await apiClient.post(API.dataQuality.autoProfile(), {
    database,
    schema,
    table,
  });
  return data?.data || data;
}

/**
 * @deprecated The backend /run-check requires a {@link QualityCheckConfig} with a
 * `table` — a bare `{database}` body never validated. Kept only so existing
 * imports don't break; new code must call {@link runQualityCheckOnTable}.
 *
 * FIX DQ-02: body was `{database}` — backend 422s without a `table` key.
 * Now forwards the value as `table` so the backend Pydantic model validates.
 */
export async function runQualityCheck(database: string): Promise<RunCheckResponse> {
  const { data } = await apiClient.post(API.dataQuality.runCheck(), { table: database });
  return data?.data || data;
}

// =============================================================================
// DMF LIFECYCLE — no-code associate / custom-build / schedule
// -----------------------------------------------------------------------------
// These hit the Governance Policies DMF endpoints. The backend declares every
// parameter as a *query* param (FastAPI `Query(...)`), NOT a JSON body — so we
// MUST pass them via axios `params`. (The sibling governance/dmf.ts service
// sends JSON bodies and therefore 422s against this contract; we don't reuse
// it for that reason.) Routes may 404 until the policies router is deployed —
// callers must degrade to an inline error, never fake success.
// =============================================================================

export interface DmfDefinition {
  name: string;
  database_name?: string;
  schema_name?: string;
  created_on?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface DmfReference {
  metric_name?: string;
  METRIC_NAME?: string;
  ref_entity_name?: string;
  ref_column_name?: string;
  argument_signature?: string;
  schedule_status?: string;
  [key: string]: unknown;
}

/** List available DMFs (built-in + custom). GET /gouvernance/policies/dmf/list */
export async function listDmfs(database = 'CP_DATA360', schema = 'GOUVERNANCE'): Promise<DmfDefinition[]> {
  const { data } = await apiClient.get(API.gouvernance.policyDmfList(), { params: { database, schema } });
  return data?.dmfs || data?.data || data || [];
}

/**
 * Create a custom DMF.
 * POST /gouvernance/policies/dmf — query params: name, table_args, expression, ...
 */
export async function createCustomDmf(params: {
  name: string;
  table_args: string;
  expression: string;
  database?: string;
  schema?: string;
  comment?: string;
}): Promise<unknown> {
  const { data } = await apiClient.post(API.gouvernance.policyDmfCreate(), null, {
    params: {
      name: params.name,
      table_args: params.table_args,
      expression: params.expression,
      database: params.database || 'CP_DATA360',
      schema: params.schema || 'GOUVERNANCE',
      ...(params.comment ? { comment: params.comment } : {}),
    },
  });
  return data;
}

/**
 * Associate a DMF with one or more columns of a table.
 * POST /gouvernance/policies/dmf/associate — query params (columns comma-joined).
 */
export async function associateDmf(params: {
  table_fqn: string;
  dmf_name: string;
  columns: string[];
  database?: string;
  schema?: string;
}): Promise<unknown> {
  const { data } = await apiClient.post(API.gouvernance.policyDmfAssociate(), null, {
    params: {
      table_fqn: params.table_fqn,
      dmf_name: params.dmf_name,
      columns: params.columns.join(','),
      database: params.database || 'CP_DATA360',
      schema: params.schema || 'GOUVERNANCE',
    },
  });
  return data;
}

/** Remove a DMF from a table's columns. POST /gouvernance/policies/dmf/disassociate */
export async function disassociateDmf(params: {
  table_fqn: string;
  dmf_name: string;
  columns: string[];
  database?: string;
  schema?: string;
}): Promise<unknown> {
  const { data } = await apiClient.post(API.gouvernance.policyDmfDisassociate(), null, {
    params: {
      table_fqn: params.table_fqn,
      dmf_name: params.dmf_name,
      columns: params.columns.join(','),
      database: params.database || 'CP_DATA360',
      schema: params.schema || 'GOUVERNANCE',
    },
  });
  return data;
}

/**
 * Set the evaluation schedule on a table's DMFs.
 * POST /gouvernance/policies/dmf/schedule — `schedule` is the raw Snowflake
 * clause, e.g. "USING CRON 0 * * * * UTC", "60 MINUTE", or
 * "TRIGGER_ON_CHANGES".
 */
export async function setDmfSchedule(table_fqn: string, schedule: string): Promise<unknown> {
  const { data } = await apiClient.post(API.gouvernance.policyDmfSchedule(), null, {
    params: { table_fqn, schedule },
  });
  return data;
}

/** Get DMF associations for a table. GET /gouvernance/policies/dmf/references */
export async function getDmfReferences(table_name: string): Promise<DmfReference[]> {
  const { data } = await apiClient.get(API.gouvernance.policyDmfReferences(), {
    params: { table_name },
  });
  return data?.references || data?.data || data || [];
}

// -----------------------------------------------------------------------------
// DMF CRUD — Read-detail (describe) + Delete (drop). These complete the DMF
// lifecycle: list(create) → associate/schedule → INSPECT → DROP. The two routes
// below are already exercised by services/governance/dmf.ts against the live
// backend; we re-declare the bare paths here as LOCAL consts so the data-quality
// module owns its own contract surface (parallel-edit guard — api-contracts.ts
// is off-limits this round). Routes may 404 until the policies router is
// deployed — callers must degrade to an inline error, never fake success.
// TODO: lift to api-contracts as API.gouvernance.policyDmfDetails / policyDmfDelete.
// -----------------------------------------------------------------------------
const DQ_DMF_DETAILS = (name: string) => `/gouvernance/policies/dmf/${encodeURIComponent(name)}/details`;
const DQ_DMF_DELETE = (name: string) => `/gouvernance/policies/dmf/${encodeURIComponent(name)}`;

export interface DmfDetails {
  name?: string;
  table_args?: string;
  expression?: string;
  body?: string;
  comment?: string;
  created_on?: string;
  owner?: string;
  database?: string;
  schema?: string;
  [key: string]: unknown;
}

/**
 * Inspect a DMF's definition (table-arg signature + SQL expression + comment).
 * GET /gouvernance/policies/dmf/{name}/details
 *
 * `name` is the BARE metric name; the home db/schema are passed as query params.
 * Custom DMFs default to CP_DATA360.GOUVERNANCE (where the builder creates them).
 */
export async function describeDmf(
  name: string,
  opts?: { database?: string; schema?: string },
): Promise<DmfDetails> {
  const { data } = await apiClient.get(DQ_DMF_DETAILS(name), {
    params: {
      database: opts?.database || 'CP_DATA360',
      schema: opts?.schema || 'GOUVERNANCE',
    },
  });
  return (data?.details || data?.data || data || {}) as DmfDetails;
}

/**
 * Drop a custom DMF definition. DELETE /gouvernance/policies/dmf/{name}
 *
 * The backend errors if the DMF is still associated with any table, so the UI
 * should disassociate first (Manage panel). `name` is the bare metric name.
 */
export async function deleteCustomDmf(
  name: string,
  opts?: { database?: string; schema?: string },
): Promise<unknown> {
  const { data } = await apiClient.delete(DQ_DMF_DELETE(name), {
    params: {
      database: opts?.database || 'CP_DATA360',
      schema: opts?.schema || 'GOUVERNANCE',
    },
  });
  return data;
}

// Local report service removed (reports-local.ts deleted — was unused)
