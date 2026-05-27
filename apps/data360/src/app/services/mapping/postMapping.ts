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
 * Sends mapping data to a FastAPI endpoint.
 *
 * NOTE: /explore-design/guided/test_mapping/ DOES NOT EXIST on the current
 * backend router (the /explore-design router has no /guided sub-prefix).
 * Wrapped in try-catch with safe, non-throwing fallback so callers can
 * detect "not implemented" via response.message.
 */
export async function postMapping(payload: TestMappingPayload): Promise<TestMappingResponse> {
    try {
        const response = await apiClient.post<TestMappingResponse>(
            '/explore-design/guided/test_mapping/',
            payload
        );
        return response.data;
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.warn(
                '[postMapping] /explore-design/guided/test_mapping/ not implemented on backend.',
                error
            );
        }
        return {
            message: 'Mapping validation endpoint not implemented on backend.',
            project_id: payload.project_id,
            validation_results: payload.mappings.map((m) => ({
                source_table: `${m.source_database}.${m.source_schema}.${m.source_table}`,
                target_table: `${m.target_database}.${m.target_schema}.${m.target_table}`,
                status: 'warning' as const,
                warnings: ['Backend test_mapping endpoint not available; skipped server-side validation.'],
            })),
        };
    }
}
