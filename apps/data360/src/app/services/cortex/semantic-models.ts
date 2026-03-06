import { getAuthSession } from '@/lib/auth';
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
}

export interface StandardResponse<T = any> {
  status: string;
  message: string;
  data: T;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getAuthSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
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
    const headers = await getAuthHeaders();
    const response = await axios.get(
      `${API_BASE_URL}/cortex/semantic-models/list`,
      { headers }
    );
    console.log('🔍 Semantic models list raw response:', JSON.stringify(response.data, null, 2));
    console.log('🔍 Response type:', typeof response.data);

    const responseData = response.data;

    // Handle wrapped response { status, message, data } format
    if (responseData.data !== undefined) {
      console.log('🔍 Found data field:', responseData.data);
      if (Array.isArray(responseData.data)) {
        console.log('✅ Returning responseData.data (array)');
        return responseData.data;
      }
      // If data contains nested models/files
      if (responseData.data?.models && Array.isArray(responseData.data.models)) {
        console.log('✅ Returning responseData.data.models');
        return responseData.data.models;
      }
      if (responseData.data?.files && Array.isArray(responseData.data.files)) {
        console.log('✅ Returning responseData.data.files');
        return responseData.data.files;
      }
    }

    // If response is direct array
    if (Array.isArray(responseData)) {
      console.log('✅ Response is direct array');
      return responseData as SemanticModel[];
    }

    // If data is nested in models/files key at root level
    if (responseData.models && Array.isArray(responseData.models)) {
      console.log('✅ Returning responseData.models');
      return responseData.models;
    }
    if (responseData.files && Array.isArray(responseData.files)) {
      console.log('✅ Returning responseData.files');
      return responseData.files;
    }

    // If response has items key
    if (responseData.items && Array.isArray(responseData.items)) {
      console.log('✅ Returning responseData.items');
      return responseData.items;
    }

    console.log('⚠️ Semantic models - unexpected format, returning empty array');
    console.log('⚠️ Available keys:', Object.keys(responseData));
    return [];
  } catch (error: any) {
    console.error('❌ Error fetching semantic models:', error);
    console.error('❌ Error response:', error.response?.data);
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.response?.data?.message || error.message;
      throw new Error(`Failed to list semantic models: ${message}`);
    }
    throw error;
  }
}

/**
 * Get the content of a specific semantic model
 * @param modelName - Name of the model (without .yaml extension)
 * @returns Model content including YAML definition
 */
export async function getSemanticModelContent(modelName: string): Promise<SemanticModelContent> {
  try {
    const headers = await getAuthHeaders();
    console.log('🔍 Fetching semantic model:', modelName);

    const response = await axios.get(
      `${API_BASE_URL}/cortex/semantic-models/${encodeURIComponent(modelName)}`,
      { headers }
    );
    console.log('🔍 Semantic model content raw response:', JSON.stringify(response.data, null, 2));
    console.log('🔍 Response type:', typeof response.data);

    const responseData = response.data;

    // Handle wrapped response { status, message, data } format
    if (responseData.data !== undefined) {
      console.log('🔍 Found data field:', responseData.data);
      if (typeof responseData.data === 'object' && responseData.data !== null) {
        if (responseData.data.content !== undefined || responseData.data.yaml_content !== undefined) {
          console.log('✅ Returning responseData.data');
          return {
            name: responseData.data.name || modelName,
            content: responseData.data.content || responseData.data.yaml_content || '',
            path: responseData.data.path || '',
          };
        }
      }
      // If data is the content string itself
      if (typeof responseData.data === 'string') {
        console.log('✅ Data is string content');
        return {
          name: modelName,
          content: responseData.data,
          path: '',
        };
      }
    }

    // If response has content directly
    if (responseData.content !== undefined) {
      console.log('✅ Found content field');
      return {
        name: responseData.name || modelName,
        content: responseData.content,
        path: responseData.path || '',
      };
    }

    // If response is in yaml_content format
    if (responseData.yaml_content !== undefined) {
      console.log('✅ Found yaml_content field');
      return {
        name: responseData.name || modelName,
        content: responseData.yaml_content,
        path: responseData.path || '',
      };
    }

    // If response is a plain string (direct YAML content)
    if (typeof responseData === 'string') {
      console.log('✅ Response is direct string content');
      return {
        name: modelName,
        content: responseData,
        path: '',
      };
    }

    // Fallback
    console.log('⚠️ Unexpected format, available keys:', Object.keys(responseData));
    return {
      name: modelName,
      content: JSON.stringify(responseData, null, 2),
      path: '',
    };
  } catch (error: any) {
    console.error(`❌ Error fetching semantic model ${modelName}:`, error);
    console.error('❌ Error response:', error.response?.data);
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.response?.data?.message || error.message;
      throw new Error(`Failed to get semantic model: ${message}`);
    }
    throw error;
  }
}

/**
 * Create/upload a new semantic model to the Snowflake stage
 * @param request - Model creation request with name and YAML content
 * @returns Success response with created model info
 */
export async function createSemanticModel(request: CreateSemanticModelRequest): Promise<any> {
  try {
    const headers = await getAuthHeaders();

    // Set defaults if not provided
    const payload = {
      name: request.name,
      database: request.database || 'CP_DATA360',
      schema: request.schema || 'STAGING',
      stage: request.stage || 'SEMANTIC_STAGE',
      yaml_content: request.yaml_content,
      description: request.description || '',
    };

    const response = await axios.post<StandardResponse>(
      `${API_BASE_URL}/cortex/semantic-models`,
      payload,
      { headers }
    );
    console.log('Create semantic model response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error creating semantic model:', error);
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.response?.data?.message || error.message;
      throw new Error(`Failed to create semantic model: ${message}`);
    }
    throw error;
  }
}

/**
 * Auto-generate a semantic model YAML from Snowflake DDL introspection
 */
export async function generateSemanticModel(
  request: SemanticModelGenerateRequest
): Promise<SemanticModelGenerateResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post<StandardResponse<SemanticModelGenerateResponse>>(
      `${API_BASE_URL}/cortex/semantic-models/generate`,
      request,
      { headers }
    );
    const data = response.data?.data || response.data;
    return data as SemanticModelGenerateResponse;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.response?.data?.message || error.message;
      throw new Error(`Failed to generate semantic model: ${message}`);
    }
    throw error;
  }
}

/**
 * Delete a semantic model from the Snowflake stage
 * @param modelName - Name of the model to delete
 * @returns Success response
 */
export async function deleteSemanticModel(modelName: string): Promise<any> {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.delete<StandardResponse>(
      `${API_BASE_URL}/cortex/semantic-models/${encodeURIComponent(modelName)}`,
      { headers }
    );
    console.log('Delete semantic model response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error(`Error deleting semantic model ${modelName}:`, error);
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.response?.data?.message || error.message;
      throw new Error(`Failed to delete semantic model: ${message}`);
    }
    throw error;
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
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date for display
 * @param dateString - ISO date string
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}
