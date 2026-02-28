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

/**
 * The shape of the test mapping payload
 * Expected by the backend test_mapping endpoint
 */
export interface TestMappingPayload {
    project_id: string;
    mappings: Array<{
        source_database: string;
        source_schema: string;
        source_table: string;
        source_columns: string[];
        pk_source: string[];
        target_database: string;
        target_schema: string;
        target_table: string;
        target_columns: string[];
        pk_target: string[];
    }>;
}

export interface TestMappingResponse {
  message: string;
  project_id: string;
  validation_results?: Array<{
    source_table: string;
    target_table: string;
    status: 'valid' | 'invalid' | 'warning';
    errors?: string[];
    warnings?: string[];
  }>;
}

/**
 * Sends mapping data to your FastAPI endpoint: POST /mapping/test_mapping
 * The endpoint expects a TestMappingPayload with project_id and mappings array.
 */
export async function postMapping(payload: TestMappingPayload): Promise<TestMappingResponse> {
    const headers = await getAuthHeaders();
    const url = `${process.env.NEXT_PUBLIC_API_URL}/explore-design/guided/test_mapping/`;
    try {
        const response = await axios.post<TestMappingResponse>(url, payload, { headers });
        return response.data;
    } catch (error) {
        console.error('Error saving mapping:', error);
        throw error;
    }
}
