import apiClient from '@/lib/api-client';

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
    try {
        const response = await apiClient.post<TestMappingResponse>(
            '/explore-design/guided/test_mapping/',
            payload
        );
        return response.data;
    } catch (error) {
        console.error('Error saving mapping:', error);
        throw error;
    }
}
