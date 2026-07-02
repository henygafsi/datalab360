import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

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
 * Sends mapping data for server-side validation.
 *
 * POST /explore-design/guided/test_mapping (BaseMappingRequest — the payload
 * shape above matches its ColumnMapping items exactly).
 */
export async function postMapping(payload: TestMappingPayload): Promise<TestMappingResponse> {
    const { data } = await apiClient.post<TestMappingResponse>(
        API.exploreDesign.guidedTestMapping(),
        payload,
    );
    return data;
}
