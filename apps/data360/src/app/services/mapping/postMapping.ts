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
 * The historical /explore-design/guided/test_mapping/ route DOES NOT EXIST on the
 * current backend (the /explore-design router has no /guided sub-prefix) and there
 * is no canonical server-side mapping-validation endpoint. Rather than fabricating
 * validation results that would read as a passing test, this surfaces an honest
 * error which the caller already handles (toast + alert).
 */
export async function postMapping(_payload: TestMappingPayload): Promise<TestMappingResponse> {
    throw new Error(
        'Server-side mapping validation is not available: the backend does not expose a test-mapping endpoint.'
    );
}
