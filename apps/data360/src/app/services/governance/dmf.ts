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
 */
export async function createDMF(request: CreateDMFRequest) {
  const { data } = await apiClient.post(`${PREFIX}/dmf`, {
    name: request.name,
    table_args: request.table_args,
    expression: request.expression,
    database: request.database,
    schema: request.schema,
    comment: request.comment,
  });
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
 */
export async function associateDMF(request: AssociateDMFRequest) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/associate`, {
    table_fqn: request.table_fqn,
    dmf_name: request.dmf_name,
    columns: request.columns,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

/**
 * Disassociate a DMF from table columns
 * POST /gouvernance/policies/dmf/disassociate
 */
export async function disassociateDMF(request: DisassociateDMFRequest) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/disassociate`, {
    table_fqn: request.table_fqn,
    dmf_name: request.dmf_name,
    columns: request.columns,
  });
  return data;
}

/**
 * Set a DMF evaluation schedule for a table
 * POST /gouvernance/policies/dmf/schedule
 */
export async function setDMFSchedule(request: SetDMFScheduleRequest) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/schedule`, {
    table_fqn: request.table_fqn,
    schedule: request.schedule,
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
 */
export async function classifyTable(request: ClassifyTableRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classify`, {
    table_name: request.table_name,
    config: request.config,
  });
  return data;
}

/**
 * Extract semantic categories from a table
 * POST /gouvernance/policies/classification/extract-categories
 */
export async function extractSemanticCategories(request: ExtractCategoriesRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/extract-categories`, {
    table_name: request.table_name,
  });
  return data;
}

/**
 * Apply semantic tags to a table based on classification results
 * POST /gouvernance/policies/classification/apply-tags
 */
export async function applySemanticTags(request: ApplySemanticTagsRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/apply-tags`, {
    table_name: request.table_name,
  });
  return data;
}

/**
 * Create a custom classifier
 * POST /gouvernance/policies/classification/classifiers
 */
export async function createCustomClassifier(request: CreateCustomClassifierRequest) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classifiers`, {
    name: request.name,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

/**
 * Add a regex rule to a custom classifier
 * POST /gouvernance/policies/classification/classifiers/{name}/regex
 */
export async function addClassifierRegex(name: string, request: AddClassifierRegexRequest) {
  const { data } = await apiClient.post(
    `${PREFIX}/classification/classifiers/${encodeURIComponent(name)}/regex`,
    {
      classifier_name: request.classifier_name,
      semantic_category: request.semantic_category,
      privacy_category: request.privacy_category,
      regex: request.regex,
      col_regex: request.col_regex,
      threshold: request.threshold,
    }
  );
  return data;
}
