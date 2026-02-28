import axios from 'axios';
import { getAuthSession } from '@/lib/auth';

/**
 * Helper to get authentication headers with Snowflake account context
 */
async function getAuthHeaders() {
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

export interface AutoMapRequestPayload {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
}

export interface SuggestedMapping {
  source_column: string;
  target_column: string;
  data_type: string;
  type: string;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
  referenced_table?: string;
  referenced_column?: string;
}

export interface ForeignKey {
  column: string;
  referenced_table: string;
  referenced_column: string;
}

export interface AutoMapResponse {
  suggested_mappings: SuggestedMapping[];
  suggested_constraints_ddl: string[];
  primary_keys?: {
    source: string[];
    target: string[];
  };
  foreign_keys?: {
    source: ForeignKey[];
    target: ForeignKey[];
  };
}

export async function autoMapKeys(payload: AutoMapRequestPayload): Promise<AutoMapResponse> {
  try {
    const headers = await getAuthHeaders();

    // Use the proxied endpoint instead of direct backend URL
    const response = await axios.post(
      '/api/mapping/auto_map_keys/',
      payload,
      { headers }
    );

    const data = response.data;
    
    // Validate response format
    if (!data.suggested_mappings || !Array.isArray(data.suggested_mappings)) {
      throw new Error('Invalid response format: missing suggested_mappings array');
    }

    // Ensure we have the PK/FK information
    if (!data.primary_keys) {
      data.primary_keys = { source: [], target: [] };
    }
    if (!data.foreign_keys) {
      data.foreign_keys = { source: [], target: [] };
    }

    // Update the suggested mappings with PK/FK information
    data.suggested_mappings = data.suggested_mappings.map((mapping: SuggestedMapping) => ({
      ...mapping,
      is_primary_key: data.primary_keys?.source.includes(mapping.source_column) ||
                     data.primary_keys?.target.includes(mapping.target_column),
      is_foreign_key: data.foreign_keys?.source.some((fk: ForeignKey) => fk.column === mapping.source_column) ||
                     data.foreign_keys?.target.some((fk: ForeignKey) => fk.column === mapping.target_column),
    }));

    return data;
  } catch (error) {
    console.error('Error in autoMapKeys:', error);
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.message;
      throw new Error(`Auto-mapping failed: ${message}`);
    }
    throw error;
  }
} 