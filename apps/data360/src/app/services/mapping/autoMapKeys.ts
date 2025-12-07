import { API_BASE_URL } from '@/config/constants';
import { getSession } from 'next-auth/react';
import axios from 'axios';

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
    const session = await getSession();
    if (!session?.user?.access_token) {
      throw new Error('No access token available');
    }
    const token = session.user.access_token;

    // Use the proxied endpoint instead of direct backend URL
    const response = await axios.post(
      '/api/mapping/auto_map_keys/',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
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
    data.suggested_mappings = data.suggested_mappings.map((mapping: any) => ({
      ...mapping,
      is_primary_key: data.primary_keys?.source.includes(mapping.source_column) ||
                     data.primary_keys?.target.includes(mapping.target_column),
      is_foreign_key: data.foreign_keys?.source.some((fk: any) => fk.column === mapping.source_column) ||
                     data.foreign_keys?.target.some((fk: any) => fk.column === mapping.target_column),
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