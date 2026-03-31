// src/app/services/data-source-connection/connectionServices.ts

import apiClient from '@/lib/api-client';
import { AxiosError } from 'axios';

interface ApiResponse {
    message: string;
}

/** Response from Azure storage integration creation: may include consent URL for wait flow */
export interface AzureStorageIntegrationResponse extends ApiResponse {
    requires_consent?: boolean;
    azure_consent_url?: string | null;
    azure_multi_tenant_app_name?: string | null;
}

// New interface for the expected structured response from getIntegrationDetails
interface AzureIntegrationDetailsResponse {
    message: string;
    azure_consent_url?: string; // Optional, as it might not always be there
    azure_multi_tenant_app_name?: string; // Optional
    details: {
        integration_name: string;
        tenant_id?: string; // Add if returned
        type: string; // e.g., "AZURE_NOTIFICATION"

        // ... other relevant details you might expect ...
    };
}

/** Extract error message from an Axios error response */
function extractErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as any;
        if (typeof errorData.detail === 'string') return errorData.detail;
        if (errorData.message) return errorData.message;
    }
    if (error instanceof Error) return error.message;
    return fallback;
}

// --- Azure Services ---

export async function setupAzureStorageIntegration(
    integration_name: string,
    tenant_id: string,
    url: string
): Promise<AzureStorageIntegrationResponse> {
    try {
        const response = await apiClient.post('/connect/azure/storage_integration', {
            integration_name, tenant_id, url,
        });
        const data = response.data;
        return {
            message: data.message ?? 'Azure Storage integration created.',
            requires_consent: data.requires_consent ?? true,
            azure_consent_url: data.azure_consent_url ?? null,
            azure_multi_tenant_app_name: data.azure_multi_tenant_app_name ?? null,
        };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to set up Azure Storage Integration'));
    }
}

export async function setupAzureNotificationIntegration(
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/azure/notification_integration', {
            integration_name, tenant_id, queue_url,
        });
        return { message: response.data };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to set up Azure Notification Integration'));
    }
}

export async function setupAzureSnowpipe(
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/azure/snowpipe', {
            integration_name, tenant_id, queue_url,
        });
        return { message: response.data };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to set up Azure Snowpipe'));
    }
}

export async function createAzureStage(
    stage_name: string,
    url: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean,
    notification_integration?: string | null
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/azure/stage', {
            stage_name,
            url,
            integration_name,
            load_data,
            auto_update,
            ...(notification_integration != null && { notification_integration }),
        });
        return { message: response.data };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to create Azure Stage'));
    }
}


// --- AWS Services ---

export interface AwsStorageIntegrationResponse extends ApiResponse {
    STORAGE_AWS_IAM_USER_ARN: string;
    STORAGE_AWS_EXTERNAL_ID: string;
}

export async function setupAwsStorageIntegration(
    integration_name: string,
    bucket_name: string,
    aws_role_arn: string,
): Promise<AwsStorageIntegrationResponse> {
    try {
        const response = await apiClient.post('/connect/aws/storage_integration', {
            integration_name, bucket_name, aws_role_arn,
        });
        const data = response.data;
        return {
            message: data.message || 'AWS Storage integration created.',
            STORAGE_AWS_IAM_USER_ARN: data.STORAGE_AWS_IAM_USER_ARN || '',
            STORAGE_AWS_EXTERNAL_ID: data.STORAGE_AWS_EXTERNAL_ID || '',
        };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to set up AWS Storage Integration'));
    }
}

export async function createAwsStage(
    stage_name: string,
    bucket_name: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/aws/stage', {
            stage_name, bucket_name, integration_name, load_data, auto_update,
        });
        return { message: response.data };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to create AWS Stage'));
    }
}

// --- Patch Storage Integration (ALTER) ---

export async function patchStorageIntegration(
    integration_name: string,
    updates: {
        enabled?: boolean;
        storage_allowed_locations?: string[];
        storage_blocked_locations?: string[];
        comment?: string;
        storage_aws_role_arn?: string;
        storage_aws_external_id?: string;
    }
): Promise<ApiResponse> {
    try {
        const response = await apiClient.patch(
            `/connect/integration/${encodeURIComponent(integration_name)}`,
            updates,
        );
        return { message: response.data.message || 'Storage integration updated.' };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to update storage integration'));
    }
}

// --- GCS (Google Cloud Storage) Services ---

export interface GcsStorageIntegrationResponse extends ApiResponse {
    integration_name: string;
    STORAGE_GCP_SERVICE_ACCOUNT: string;
    instructions: string;
}

export async function setupGcsStorageIntegration(
    integration_name: string,
    bucket_name: string
): Promise<GcsStorageIntegrationResponse> {
    try {
        const response = await apiClient.post('/connect/gcs/storage_integration', {
            integration_name, bucket_name,
        });
        const data = response.data;
        return {
            message: data.message ?? 'GCS Storage integration created.',
            integration_name: data.integration_name ?? integration_name,
            STORAGE_GCP_SERVICE_ACCOUNT: data.STORAGE_GCP_SERVICE_ACCOUNT ?? '',
            instructions: data.instructions ?? '',
        };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to set up GCS Storage Integration'));
    }
}

export async function createGcsStage(
    stage_name: string,
    bucket_name: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean,
    prefix?: string | null
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/gcs/stage', {
            stage_name,
            bucket_name,
            integration_name,
            load_data,
            auto_update,
            ...(prefix != null && prefix !== '' && { prefix }),
        });
        return { message: response.data.message ?? `GCS stage '${stage_name}' created successfully.` };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to create GCS Stage'));
    }
}

export interface GcsNotificationIntegrationResponse extends ApiResponse {
    integration_name: string;
    GCP_PUBSUB_SERVICE_ACCOUNT: string;
    instructions: string;
}

export async function setupGcsNotificationIntegration(
    integration_name: string,
    gcp_pubsub_subscription_name: string
): Promise<GcsNotificationIntegrationResponse> {
    try {
        const response = await apiClient.post('/connect/gcs/notification_integration', {
            integration_name, gcp_pubsub_subscription_name,
        });
        const data = response.data;
        return {
            message: data.message ?? 'GCS notification integration created.',
            integration_name: data.integration_name ?? integration_name,
            GCP_PUBSUB_SERVICE_ACCOUNT: data.GCP_PUBSUB_SERVICE_ACCOUNT ?? '',
            instructions: data.instructions ?? '',
        };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to create GCS Notification Integration'));
    }
}

// --- Internal stage (raw zone, no Azure/AWS) ---

export async function createInternalStage(stage_name: string): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/stages/internal', { stage_name });
        return { message: response.data.message ?? `Internal stage '${stage_name}' created. You can upload files to it.` };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to create internal stage'));
    }
}

// --- Snowflake Services ---

export async function connectSnowflakeDatalake(
    datalake_username: string,
    datalake_password: string,
    datalake_account: string,
    datalake_role: string
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/connect/snowflake_lake/datalake/connect', {
            datalake_username,
            datalake_password,
            datalake_account,
            datalake_role,
        });
        return { message: response.data };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to connect to Snowflake Datalake'));
    }
}

export async function listSnowflakeStages(): Promise<any> {
    try {
        const response = await apiClient.get('/connect/stages');
        const raw = response.data;
        // Normalize: always return { stages: [...] } for backward compat
        // Backend may return { data: [...], pagination: {...} } (paginated) or { stages: [...] }
        if (raw?.stages) return raw;
        if (Array.isArray(raw?.data)) return { stages: raw.data, pagination: raw.pagination, total: raw.total };
        if (Array.isArray(raw)) return { stages: raw };
        return { stages: [] };
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list Snowflake stages'));
    }
}

export async function listSnowflakeStageFiles(
    stageName: string,
    opts?: { path?: string; sort?: 'name' | 'size' | 'last_modified' }
): Promise<{ files: any[]; count: number; stage_name: string }> {
    try {
        const params: Record<string, string> = {};
        if (opts?.path) params.path = opts.path;
        if (opts?.sort) params.sort = opts.sort;
        const response = await apiClient.get(`/connect/stages/${stageName}/files`, { params });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list stage files'));
    }
}

// --- Common Integration Details ---
export async function getIntegrationDetails(integration_name: string): Promise<AzureIntegrationDetailsResponse> {
    try {
        const response = await apiClient.get('/connect/integration', {
            params: { integration_name },
        });
        return response.data as AzureIntegrationDetailsResponse;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to get integration details'));
    }
}

// --- File Operations ---

export interface StageFilePreviewResponse {
    file_name: string;
    file_type: string;
    file_size: number;
    stage_name: string;
    total_rows: number;
    preview_limit: number;
    offset: number;
    columns: string[];
    rows: Record<string, unknown>[];
}

export async function previewStageFile(
    stageName: string,
    filePath: string,
    limit: number = 100,
    offset: number = 0
): Promise<StageFilePreviewResponse> {
    try {
        const response = await apiClient.get(
            `/connect/stages/${stageName}/files/${encodeURIComponent(filePath)}/preview`,
            { params: { limit, offset } },
        );
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to preview file'));
    }
}

export async function getStageGrants(stageName: string): Promise<{ stage_name: string; grants: any[]; count: number }> {
    try {
        const response = await apiClient.get(`/connect/stages/${stageName}/grants`);
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to load stage grants'));
    }
}

export async function downloadStageFile(
    stageName: string,
    filePath: string
): Promise<void> {
    try {
        const response = await apiClient.get(
            `/connect/stages/${stageName}/files/${encodeURIComponent(filePath)}/download`,
            { responseType: 'blob' },
        );

        // Create blob and trigger download
        const blob = new Blob([response.data]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filePath.split('/').pop() || 'download';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to download file'));
    }
}

export async function uploadStageFile(
    stageName: string,
    files: FileList,
    overwrite: boolean = false,
    path?: string
): Promise<any> {
    try {
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        const params: Record<string, string> = {};
        if (overwrite) params.overwrite = String(overwrite);
        if (path) params.path = path;

        const response = await apiClient.post(
            `/connect/stages/${stageName}/upload`,
            formData,
            {
                params,
                headers: { 'Content-Type': 'multipart/form-data' },
            },
        );
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to upload file'));
    }
}

export async function deleteStageFile(
    stageName: string,
    filePath: string
): Promise<any> {
    try {
        const response = await apiClient.delete(
            `/connect/stages/${stageName}/files/${encodeURIComponent(filePath)}`,
        );
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to delete file'));
    }
}

// ============================================================================
// Standardized connectors API
// ============================================================================

export interface ConnectorInfo {
    id: string;
    name: string;
    capabilities: string[];
    has_stages?: boolean;
}

export async function listConnectors(): Promise<{ connectors: ConnectorInfo[] }> {
    try {
        const response = await apiClient.get('/connect/connectors');
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list connectors'));
    }
}

// --- PostgreSQL ---
export async function postgresIngest(body: {
    host: string;
    port?: number;
    database: string;
    user: string;
    password?: string;
    tables?: string[];
}): Promise<{ message: string; tables?: number }> {
    try {
        const response = await apiClient.post('/connect/postgres/ingest', {
            port: 5432, password: '', ...body,
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'PostgreSQL ingest failed'));
    }
}

// --- MySQL ---
export async function mysqlIngest(body: {
    host: string;
    port?: number;
    database: string;
    user: string;
    password?: string;
    tables?: string[];
}): Promise<{ message: string }> {
    try {
        const response = await apiClient.post('/connect/mysql/ingest', {
            port: 3306, password: '', ...body,
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'MySQL ingest failed'));
    }
}

// --- Databricks ---
export async function databricksTest(body: { host: string; http_path: string; access_token: string }): Promise<{ ok: boolean }> {
    try {
        const response = await apiClient.post('/connect/databricks/test', body);
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Databricks connection failed'));
    }
}

export async function databricksCatalogs(body: { host: string; http_path: string; access_token: string }): Promise<{ catalogs: string[] }> {
    try {
        const response = await apiClient.post('/connect/databricks/catalogs', body);
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list catalogs'));
    }
}

export async function databricksSchemas(
    body: { host: string; http_path: string; access_token: string },
    catalog: string
): Promise<{ schemas: string[] }> {
    try {
        const response = await apiClient.post('/connect/databricks/schemas', body, {
            params: { catalog },
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list schemas'));
    }
}

export async function databricksTables(
    body: { host: string; http_path: string; access_token: string },
    catalog: string,
    schema_name: string
): Promise<{ tables: string[] }> {
    try {
        const response = await apiClient.post('/connect/databricks/tables', body, {
            params: { catalog, schema_name },
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list tables'));
    }
}

export async function databricksIngest(body: {
    host: string;
    http_path: string;
    access_token: string;
    catalog: string;
    schema_name: string;
    tables?: string[];
}): Promise<{ message: string; tables?: { table: string; rows: number }[] }> {
    try {
        const response = await apiClient.post('/connect/databricks/ingest', body, { timeout: 600000 });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Databricks ingest failed'));
    }
}

// --- Oracle ---
export async function oracleTest(body: {
    host: string;
    port?: number;
    service_name: string;
    username: string;
    password?: string;
    connection_mode?: string;
    wallet_path?: string;
    wallet_password?: string;
    connect_string?: string;
}): Promise<{ ok: boolean; version?: string; table_count?: number; tables?: string[]; connection_mode?: string; latency_ms?: number }> {
    try {
        const response = await apiClient.post('/connect/oracle/test', {
            port: 1522, password: '', connection_mode: 'tls', ...body,
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Oracle connection failed'));
    }
}

export async function oracleIngest(body: {
    host: string;
    port?: number;
    service_name: string;
    username: string;
    password?: string;
    connection_mode?: string;
    wallet_path?: string;
    wallet_password?: string;
    connect_string?: string;
    tables?: string[];
}): Promise<{ message: string; tables_count?: number; rows_total?: number; connector_id?: string; tables?: { name: string; rows: number }[] }> {
    try {
        const response = await apiClient.post('/connect/oracle/ingest', {
            port: 1522, password: '', connection_mode: 'tls', ...body,
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Oracle ingest failed'));
    }
}

export async function oracleSampleStage(): Promise<{ message: string; stage?: string; target_schema?: string; tables?: { name: string; rows: number; file: string }[]; total_rows?: number }> {
    try {
        const response = await apiClient.post('/connect/oracle/sample-stage');
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Sample stage load failed'));
    }
}

// --- Iceberg ---
export async function icebergTest(body: { uri: string; warehouse?: string; credential?: string }): Promise<{ ok: boolean }> {
    try {
        const response = await apiClient.post('/connect/iceberg/test', body);
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Iceberg connection failed'));
    }
}

export async function icebergNamespaces(body: { uri: string; warehouse?: string; credential?: string }): Promise<{ namespaces: string[] }> {
    try {
        const response = await apiClient.post('/connect/iceberg/namespaces', body);
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list namespaces'));
    }
}

export async function icebergTables(
    body: { uri: string; warehouse?: string; credential?: string },
    namespace: string
): Promise<{ tables: string[] }> {
    try {
        const response = await apiClient.post('/connect/iceberg/tables', body, {
            params: { namespace },
        });
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Failed to list tables'));
    }
}

export async function icebergIngest(body: {
    uri: string;
    warehouse?: string;
    credential?: string;
    namespace: string;
    tables?: string[];
}): Promise<{ message: string; tables?: { table: string; rows: number }[] }> {
    try {
        const response = await apiClient.post('/connect/iceberg/ingest', body);
        return response.data;
    } catch (error) {
        throw new Error(extractErrorMessage(error, 'Iceberg ingest failed'));
    }
}
