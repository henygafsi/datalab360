/**
 * Governance DMF (Data Metric Functions) & Classification Service
 * Manages DMF lifecycle, associations, schedules, and semantic classification
 *
 * Location: apps/data360/src/app/services/governance/dmf.ts
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/gouvernance/policies';

// =============================================================================
// TYPES
// =============================================================================

export interface DMFListItem {
  name: string;
  database_name?: string;
  schema_name?: string;
  created_on?: string;
  comment?: string;
}

export interface DMFDetails {
  name: string;
  table_args: string;
  expression: string;
  database?: string;
  schema?: string;
  comment?: string;
  created_on?: string;
  owner?: string;
}

export interface DMFReference {
  metric_name: string;
  ref_entity_name: string;
  ref_entity_domain: string;
  ref_column_name?: string;
  ref_entity_database?: string;
  ref_entity_schema?: string;
}

export interface CreateDMFRequest {
  name: string;
  table_args: string;
  expression: string;
  database?: string;
  schema?: string;
  comment?: string;
}

export interface AssociateDMFRequest {
  table_fqn: string;
  dmf_name: string;
  columns: string[];
  database?: string;
  schema?: string;
}

export interface DisassociateDMFRequest {
  table_fqn: string;
  dmf_name: string;
  columns: string[];
}

export interface SetDMFScheduleRequest {
  table_fqn: string;
  schedule: string;
}

export interface ClassifyTableRequest {
  table_name: string;
  config?: Record<string, unknown>;
}

export interface ExtractCategoriesRequest {
  table_name: string;
}

export interface ApplySemanticTagsRequest {
  table_name: string;
}

export interface CreateCustomClassifierRequest {
  name: string;
  database?: string;
  schema?: string;
}

export interface AddClassifierRegexRequest {
  classifier_name: string;
  semantic_category: string;
  privacy_category: string;
  regex: string;
  col_regex?: string;
  threshold?: number;
}

// =============================================================================
// DMF FUNCTIONS
// =============================================================================

/**
 * List all Data Metric Functions
 * GET /gouvernance/policies/dmf/list
 */
export async function listDMFs(database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.get(`${PREFIX}/dmf/list`, { params });
  return data;
}

/**
 * Create a new Data Metric Function
 * POST /gouvernance/policies/dmf
 * Backend uses Query(...) params — null body required.
 */
export async function createDMF(request: CreateDMFRequest) {
  const params: Record<string, string> = {
    name: request.name,
    table_args: request.table_args,
    expression: request.expression,
  };
  if (request.database) params.database = request.database;
  if (request.schema) params.schema = request.schema;
  if (request.comment) params.comment = request.comment;
  const { data } = await apiClient.post(`${PREFIX}/dmf`, null, { params });
  return data;
}

/**
 * Get detailed information about a specific DMF
 * GET /gouvernance/policies/dmf/{name}/details
 */
export async function describeDMF(name: string, database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.get(`${PREFIX}/dmf/${encodeURIComponent(name)}/details`, { params });
  return data;
}

/**
 * Delete a Data Metric Function
 * DELETE /gouvernance/policies/dmf/{name}
 */
export async function deleteDMF(name: string, database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.delete(`${PREFIX}/dmf/${encodeURIComponent(name)}`, { params });
  return data;
}

/**
 * Associate a DMF with table columns
 * POST /gouvernance/policies/dmf/associate
 * Backend uses Query(...) params — null body; columns must be comma-joined string.
 */
export async function associateDMF(request: AssociateDMFRequest) {
  const cols = Array.isArray(request.columns) ? request.columns : [];
  if (!request.table_fqn || !request.dmf_name || cols.length === 0) {
    throw new Error('associateDMF requires table_fqn, dmf_name and at least one column');
  }
  const params: Record<string, string> = {
    table_fqn: request.table_fqn,
    dmf_name: request.dmf_name,
    columns: cols.join(','),
  };
  if (request.database) params.database = request.database;
  if (request.schema) params.schema = request.schema;
  const { data } = await apiClient.post(`${PREFIX}/dmf/associate`, null, { params });
  return data;
}

/**
 * Disassociate a DMF from table columns
 * POST /gouvernance/policies/dmf/disassociate
 * Backend uses Query(...) params — null body; columns must be comma-joined string.
 */
export async function disassociateDMF(request: DisassociateDMFRequest) {
  const cols = Array.isArray(request.columns) ? request.columns : [];
  if (!request.table_fqn || !request.dmf_name || cols.length === 0) {
    throw new Error('disassociateDMF requires table_fqn, dmf_name and at least one column');
  }
  const params: Record<string, string> = {
    table_fqn: request.table_fqn,
    dmf_name: request.dmf_name,
    columns: cols.join(','),
  };
  const { data } = await apiClient.post(`${PREFIX}/dmf/disassociate`, null, { params });
  return data;
}

/**
 * Set a DMF evaluation schedule for a table
 * POST /gouvernance/policies/dmf/schedule
 * Backend uses Query(...) params — null body.
 */
export async function setDMFSchedule(request: SetDMFScheduleRequest) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/schedule`, null, {
    params: {
      table_fqn: request.table_fqn,
      schedule: request.schedule,
    },
  });
  return data;
}

/**
 * Get DMF references (associations) for a table
 * GET /gouvernance/policies/dmf/references
 */
export async function getDMFReferences(tableName: string) {
  const { data } = await apiClient.get(`${PREFIX}/dmf/references`, {
    params: { table_name: tableName },
  });
  return data;
}

// =============================================================================
// CLASSIFICATION FUNCTIONS
// =============================================================================

/**
 * Classify a table using Snowflake's built-in classification
 * POST /gouvernance/policies/classification/classify
 * Backend uses Query(...) params — null body. `config` is not supported by the backend.
 */
export async function classifyTable(request: ClassifyTableRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classify`, null, {
    params: { table_name: request.table_name },
  });
  return data;
}

/**
 * Extract semantic categories from a table
 * POST /gouvernance/policies/classification/extract-categories
 * Backend uses Query(...) `table_name` — null body.
 */
export async function extractSemanticCategories(request: ExtractCategoriesRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/extract-categories`, null, {
    params: { table_name: request.table_name },
  });
  return data;
}

/**
 * Apply semantic tags to a table based on classification results
 * POST /gouvernance/policies/classification/apply-tags
 * Backend uses Query(...) `table_name` — null body.
 */
export async function applySemanticTags(request: ApplySemanticTagsRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/apply-tags`, null, {
    params: { table_name: request.table_name },
  });
  return data;
}

/**
 * Create a custom classifier
 * POST /gouvernance/policies/classification/classifiers
 * Backend uses Query(...) params — null body.
 */
export async function createCustomClassifier(request: CreateCustomClassifierRequest) {
  const params: Record<string, string> = { name: request.name };
  if (request.database) params.database = request.database;
  if (request.schema) params.schema = request.schema;
  const { data } = await apiClient.post(`${PREFIX}/classification/classifiers`, null, { params });
  return data;
}

/**
 * Add a regex rule to a custom classifier
 * POST /gouvernance/policies/classification/classifiers/{name}/regex
 * Backend uses Query(...) params — null body.
 * Backend param names: value_regex (not regex), col_name_regex (not col_regex).
 * classifier_name is the path param `name`, not a query param.
 */
export async function addClassifierRegex(name: string, request: AddClassifierRegexRequest) {
  const params: Record<string, any> = {
    semantic_category: request.semantic_category,
    privacy_category: request.privacy_category,
    value_regex: request.regex,
  };
  if (request.col_regex) params.col_name_regex = request.col_regex;
  if (request.threshold !== undefined) params.threshold = request.threshold;
  const { data } = await apiClient.post(
    `${PREFIX}/classification/classifiers/${encodeURIComponent(name)}/regex`,
    null,
    { params },
  );
  return data;
}
