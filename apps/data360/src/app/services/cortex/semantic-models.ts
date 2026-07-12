import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { toServiceError } from '../_errors';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface SemanticModel {
  name: string;
  path: string;
  size: number;
  last_modified: string;
}

export interface SemanticModelContent {
  name: string;
  content: string;
  path: string;
}

export interface CreateSemanticModelRequest {
  name: string;
  database?: string;
  schema?: string;
  stage?: string;
  yaml_content: string;
  description?: string;
}

export interface SemanticModelGenerateRequest {
  database: string;
  schema: string;
  tables?: string[];
  model_name?: string;
  model_description?: string;
  include_views?: boolean;
  sample_values_limit?: number;
}

export interface SemanticModelGenerateResponse {
  model_name: string;
  yaml_content: string;
  tables_count: number;
  database: string;
  schema: string;
  stage_path?: string;
  saved?: boolean;
}

export interface StandardResponse<T = any> {
  status: string;
  message: string;
  data: T;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * List all semantic models from the Snowflake stage
 * @returns Array of semantic model metadata
 */
export async function listSemanticModels(): Promise<SemanticModel[]> {
  try {
    const response = await apiClient.get(API.cortex.semanticModels());

    const responseData = response.data;

    // Handle wrapped response { status, message, data } format
    if (responseData.data !== undefined) {
      if (Array.isArray(responseData.data)) {
        return responseData.data;
      }
      // If data contains nested models/files
      if (responseData.data?.models && Array.isArray(responseData.data.models)) {
        return responseData.data.models;
      }
      if (responseData.data?.files && Array.isArray(responseData.data.files)) {
        return responseData.data.files;
      }
    }

    // If response is direct array
    if (Array.isArray(responseData)) {
      return responseData as SemanticModel[];
    }

    // If data is nested in models/files key at root level
    if (responseData.models && Array.isArray(responseData.models)) {
      return responseData.models;
    }
    if (responseData.files && Array.isArray(responseData.files)) {
      return responseData.files;
    }

    // If response has items key
    if (responseData.items && Array.isArray(responseData.items)) {
      return responseData.items;
    }

    return [];
  } catch (error: any) {
    console.error('Error fetching semantic models:', error);
    throw toServiceError(error, 'Failed to list semantic models');
  }
}

/**
 * Get the content of a specific semantic model
 * @param modelName - Name of the model (without .yaml extension)
 * @returns Model content including YAML definition
 */
export async function getSemanticModelContent(modelName: string): Promise<SemanticModelContent> {
  try {
    const response = await apiClient.get(API.cortex.semanticModel(modelName));

    const responseData = response.data;

    // Handle wrapped response { status, message, data } format
    if (responseData.data !== undefined) {
      if (typeof responseData.data === 'object' && responseData.data !== null) {
        if (responseData.data.content !== undefined || responseData.data.yaml_content !== undefined) {
          return {
            name: responseData.data.name || modelName,
            content: responseData.data.content || responseData.data.yaml_content || '',
            path: responseData.data.path || '',
          };
        }
      }
      // If data is the content string itself
      if (typeof responseData.data === 'string') {
        return {
          name: modelName,
          content: responseData.data,
          path: '',
        };
      }
    }

    // If response has content directly
    if (responseData.content !== undefined) {
      return {
        name: responseData.name || modelName,
        content: responseData.content,
        path: responseData.path || '',
      };
    }

    // If response is in yaml_content format
    if (responseData.yaml_content !== undefined) {
      return {
        name: responseData.name || modelName,
        content: responseData.yaml_content,
        path: responseData.path || '',
      };
    }

    // If response is a plain string (direct YAML content)
    if (typeof responseData === 'string') {
      return {
        name: modelName,
        content: responseData,
        path: '',
      };
    }

    // Fallback
    return {
      name: modelName,
      content: JSON.stringify(responseData, null, 2),
      path: '',
    };
  } catch (error: any) {
    console.error(`Error fetching semantic model ${modelName}:`, error);
    throw toServiceError(error, 'Failed to get semantic model');
  }
}

/**
 * Create/upload a new semantic model to the Snowflake stage
 * @param request - Model creation request with name and YAML content
 * @returns Success response with created model info
 */
export async function createSemanticModel(request: CreateSemanticModelRequest): Promise<any> {
  try {
    // Set defaults if not provided
    const payload = {
      name: request.name,
      database: request.database || 'CP_DATA360',
      schema: request.schema || 'STAGING',
      stage: request.stage || 'SEMANTIC_STAGE',
      yaml_content: request.yaml_content,
      description: request.description || '',
    };

    const response = await apiClient.post<StandardResponse>(
      API.cortex.semanticModelsCreate(),
      payload
    );
    return response.data;
  } catch (error: any) {
    console.error('Error creating semantic model:', error);
    throw toServiceError(error, 'Failed to create semantic model');
  }
}

/**
 * Auto-generate a semantic model YAML from Snowflake DDL introspection
 */
export async function generateSemanticModel(
  request: SemanticModelGenerateRequest
): Promise<SemanticModelGenerateResponse> {
  try {
    const response = await apiClient.post<StandardResponse<SemanticModelGenerateResponse>>(
      API.cortex.semanticModelsGenerate(),
      request
    );
    const data = response.data?.data || response.data;
    return data as SemanticModelGenerateResponse;
  } catch (error: any) {
    throw toServiceError(error, 'Failed to generate semantic model');
  }
}

/**
 * Generate a semantic model and save it directly to SEMANTIC_STAGE
 * One-step: picks schema -> generates YAML -> saves to stage
 */
export async function generateAndSaveSemanticModel(
  request: SemanticModelGenerateRequest
): Promise<SemanticModelGenerateResponse> {
  try {
    const response = await apiClient.post<StandardResponse<SemanticModelGenerateResponse>>(
      API.cortex.semanticModelsGenerateAndSave(),
      request
    );
    const data = response.data?.data || response.data;
    return data as SemanticModelGenerateResponse;
  } catch (error: any) {
    throw toServiceError(error, 'Failed to generate and save semantic model');
  }
}

/**
 * Delete a semantic model from the Snowflake stage
 * @param modelName - Name of the model to delete
 * @returns Success response
 */
export async function deleteSemanticModel(modelName: string): Promise<any> {
  try {
    const response = await apiClient.delete<StandardResponse>(API.cortex.semanticModel(modelName));
    return response.data;
  } catch (error: any) {
    console.error(`Error deleting semantic model ${modelName}:`, error);
    throw toServiceError(error, 'Failed to delete semantic model');
  }
}

/**
 * Update an existing semantic model YAML content
 */
export async function updateSemanticModel(modelName: string, yamlContent: string): Promise<any> {
  try {
    const response = await apiClient.put<StandardResponse>(
      API.cortex.semanticModel(modelName),
      { name: modelName, yaml_content: yamlContent }
    );
    return response.data;
  } catch (error: any) {
    throw toServiceError(error, 'Failed to update semantic model');
  }
}

/**
 * Validate YAML content structure (client-side validation)
 * @param yamlContent - YAML string to validate
 * @returns Validation result
 */
export function validateSemanticModelYaml(yamlContent: string): { valid: boolean; error?: string } {
  if (!yamlContent || yamlContent.trim() === '') {
    return { valid: false, error: 'YAML content cannot be empty' };
  }

  // Check for required fields in semantic model
  const requiredFields = ['name:', 'tables:'];
  for (const field of requiredFields) {
    if (!yamlContent.includes(field)) {
      return { valid: false, error: `Missing required field: ${field.replace(':', '')}` };
    }
  }

  // Basic YAML syntax check (indentation consistency)
  const lines = yamlContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for tabs (YAML prefers spaces)
    if (line.includes('\t')) {
      return { valid: false, error: `Line ${i + 1}: Tabs are not allowed in YAML, use spaces instead` };
    }
  }

  return { valid: true };
}

/**
 * Deep health check for a STORED model — the monitor rule set.
 *
 * Beyond basic yaml validity: Cortex Analyst REJECTS a model whose
 * relationship right-table declares no primary_key ("Table X used in join
 * relationship Y has no primary key") — the exact failure that silently broke
 * the account's largest stored model for weeks (live-caught 2026-07-11).
 * Text-level parse (no yaml lib in the bundle): for every
 * `right_table: <name>`, the `- name: <name>` table block must contain a
 * `primary_key:` before the next table block.
 */
export function checkSemanticModelHealth(yamlContent: string): {
  status: 'ready' | 'broken';
  problems: string[];
} {
  const base = validateSemanticModelYaml(yamlContent);
  if (!base.valid) return { status: 'broken', problems: [base.error ?? 'invalid YAML'] };

  const problems: string[] = [];
  const rightTables = new Set(
    Array.from(yamlContent.matchAll(/right_table:\s*([A-Za-z0-9_]+)/g)).map((m) => m[1]),
  );
  for (const t of rightTables) {
    // The table's block: from its `- name: <t>` line to the next `- name:` at
    // the same list level (or end of file).
    const blockMatch = yamlContent.match(
      new RegExp(`-\\s+name:\\s*${t}\\b([\\s\\S]*?)(?=\\n-\\s+name:|$)`),
    );
    if (!blockMatch) {
      problems.push(`relationship references table '${t}' that has no table block`);
    } else if (!/primary_key:/.test(blockMatch[1])) {
      problems.push(`'${t}' is a relationship right-table with NO primary_key — Analyst will reject this model`);
    }
  }
  return { status: problems.length ? 'broken' : 'ready', problems };
}

/**
 * Generate a sample semantic model YAML template
 * @param tableName - Optional table name to include in template
 * @returns Sample YAML content
 */
export function generateSampleModelYaml(tableName?: string): string {
  const table = tableName || 'YOUR_TABLE_NAME';
  return `name: ${table.toLowerCase()}_semantic_model
description: Semantic model for ${table} analysis

tables:
  - name: ${table}
    description: Main data table for analysis
    base_table:
      database: CP_DATA360
      schema: STAGING
      table: ${table}

    dimensions:
      - name: id
        synonyms:
          - identifier
          - record_id
        description: Unique identifier
        expr: ID
        data_type: NUMBER
        unique: true

      - name: created_date
        synonyms:
          - creation_date
          - date_created
        description: Record creation date
        expr: CREATED_AT
        data_type: DATE

    time_dimensions:
      - name: event_timestamp
        synonyms:
          - timestamp
          - event_time
        description: Event timestamp
        expr: EVENT_TS
        data_type: TIMESTAMP

    measures:
      - name: total_count
        synonyms:
          - count
          - total_records
        description: Total number of records
        expr: COUNT(*)
        data_type: NUMBER
        default_aggregation: sum

    filters:
      - name: recent_records
        synonyms:
          - last_30_days
        description: Filter for records from the last 30 days
        expr: CREATED_AT >= DATEADD(day, -30, CURRENT_DATE())
`;
}

/**
 * Format file size for display
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 KB")
 */
export function formatFileSize(bytes: number | string | null | undefined): string {
  const b = bytes == null || bytes === '' ? NaN : Number(bytes);
  if (!Number.isFinite(b)) return '—';
  if (b === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date for display
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  // The stage listing sometimes puts an md5 hash in last_modified; leaking the
  // raw value rendered "Modified: <hash>" in the UI. Unparseable → honest '—'.
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}
