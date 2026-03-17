// src/app/services/data-source-connection/connectionServices.ts

import { getAuthHeaders } from '@/lib/auth';
import { API_CONTRACTS } from '@/lib/api-contracts';
import { API_CONFIG } from '@/config/database.config';

const API_BASE_URL = API_CONFIG.BASE_URL;

/** Convert AuthHeaders (which lacks an index signature) to a plain Record for fetch() */
async function fetchHeaders(): Promise<Record<string, string>> {
    const h = await getAuthHeaders();
    return { ...h } as Record<string, string>;
}

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

// Auth helpers removed - using centralized getAuthHeaders from @/lib/auth

function buildUrlWithQueryParams(baseUrl: string, params: Record<string, string | boolean | null | undefined>): string {
    const url = new URL(baseUrl);
    for (const key in params) {
        const value = params[key];
        if (value !== null && value !== undefined) {
            url.searchParams.append(key, String(value));
        }
    }
    return url.toString();
}

// --- Azure Services ---

export async function setupAzureStorageIntegration(
    integration_name: string,
    tenant_id: string,
    url: string
): Promise<AzureStorageIntegrationResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/azure/storage_integration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_name, tenant_id, url }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to set up Azure Storage Integration';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return {
        message: data.message ?? 'Azure Storage integration created.',
        requires_consent: data.requires_consent ?? true,
        azure_consent_url: data.azure_consent_url ?? null,
        azure_multi_tenant_app_name: data.azure_multi_tenant_app_name ?? null,
    };
}

export async function setupAzureNotificationIntegration(
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/azure/notification_integration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_name, tenant_id, queue_url }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to set up Azure Notification Integration';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data };
}

export async function setupAzureSnowpipe(
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/azure/snowpipe`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_name, tenant_id, queue_url }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to set up Azure Snowpipe';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data };
}

export async function createAzureStage(
    stage_name: string,
    url: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean,
    notification_integration?: string | null
): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/azure/stage`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stage_name,
            url,
            integration_name,
            load_data,
            auto_update,
            ...(notification_integration != null && { notification_integration }),
        }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to create Azure Stage';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data };
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/aws/storage_integration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_name, bucket_name, aws_role_arn }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to set up AWS Storage Integration';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return {
        message: data.message || 'AWS Storage integration created.',
        STORAGE_AWS_IAM_USER_ARN: data.STORAGE_AWS_IAM_USER_ARN || '',
        STORAGE_AWS_EXTERNAL_ID: data.STORAGE_AWS_EXTERNAL_ID || '',
    };
}

export async function createAwsStage(
    stage_name: string,
    bucket_name: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean
): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/aws/stage`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name, bucket_name, integration_name, load_data, auto_update }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to create AWS Stage';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data };
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/integration/${encodeURIComponent(integration_name)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to update storage integration';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data.message || 'Storage integration updated.' };
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/gcs/storage_integration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_name, bucket_name }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to set up GCS Storage Integration';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return {
        message: data.message ?? 'GCS Storage integration created.',
        integration_name: data.integration_name ?? integration_name,
        STORAGE_GCP_SERVICE_ACCOUNT: data.STORAGE_GCP_SERVICE_ACCOUNT ?? '',
        instructions: data.instructions ?? '',
    };
}

export async function createGcsStage(
    stage_name: string,
    bucket_name: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean,
    prefix?: string | null
): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/gcs/stage`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stage_name,
            bucket_name,
            integration_name,
            load_data,
            auto_update,
            ...(prefix != null && prefix !== '' && { prefix }),
        }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to create GCS Stage';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data.message ?? `GCS stage '${stage_name}' created successfully.` };
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/gcs/notification_integration`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_name, gcp_pubsub_subscription_name }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to create GCS Notification Integration';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return {
        message: data.message ?? 'GCS notification integration created.',
        integration_name: data.integration_name ?? integration_name,
        GCP_PUBSUB_SERVICE_ACCOUNT: data.GCP_PUBSUB_SERVICE_ACCOUNT ?? '',
        instructions: data.instructions ?? '',
    };
}

// --- Internal stage (raw zone, no Azure/AWS) ---

export async function createInternalStage(stage_name: string): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const url = API_CONTRACTS.dataSource.createInternalStage.getUrl();
    const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_name }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to create internal stage';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data.message ?? `Internal stage '${stage_name}' created. You can upload files to it.` };
}

// --- Snowflake Services ---

export async function connectSnowflakeDatalake(
    datalake_username: string,
    datalake_password: string,
    datalake_account: string,
    datalake_role: string
): Promise<ApiResponse> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/snowflake_lake/datalake/connect`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            datalake_username,
            datalake_password,
            datalake_account,
            datalake_role,
        }),
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to connect to Snowflake Datalake';
        throw new Error(errorMessage);
    }
    const data: any = await response.json();
    return { message: data };
}

export async function listSnowflakeStages(): Promise<any> {
    const headers = await fetchHeaders();
    const endpoint = API_CONTRACTS.dataSource.listStages.getUrl();
    const response = await fetch(endpoint, {
        method: 'GET',
        headers,
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to list Snowflake stages';
        throw new Error(errorMessage);
    }
    return await response.json() as any;
}

export async function listSnowflakeStageFiles(
    stageName: string,
    opts?: { path?: string; sort?: 'name' | 'size' | 'last_modified' }
): Promise<{ files: any[]; count: number; stage_name: string }> {
    const headers = await fetchHeaders();
    const params = new URLSearchParams();
    if (opts?.path) params.set('path', opts.path);
    if (opts?.sort) params.set('sort', opts.sort);
    const qs = params.toString();
    const endpoint = `${API_CONTRACTS.dataSource.listStageFiles.getUrl(stageName)}${qs ? `?${qs}` : ''}`;
    const response = await fetch(endpoint, { method: 'GET', headers });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to list stage files';
        throw new Error(errorMessage);
    }
    return await response.json() as any;
}

// --- Common Integration Details ---
export async function getIntegrationDetails(integration_name: string): Promise<AzureIntegrationDetailsResponse> {
    const headers = await fetchHeaders();
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/integration`,
        { integration_name }
    );
    const response = await fetch(endpoint, {
        method: 'GET',
        headers,
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to get integration details';
        throw new Error(errorMessage);
    }
    const data = await response.json() as AzureIntegrationDetailsResponse;
    return data;
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
    const headers = await fetchHeaders();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/files/${encodeURIComponent(filePath)}/preview?limit=${limit}&offset=${offset}`;
    const response = await fetch(endpoint, { method: 'GET', headers });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to preview file';
        throw new Error(errorMessage);
    }
    return await response.json() as any;
}

export async function getStageGrants(stageName: string): Promise<{ stage_name: string; grants: any[]; count: number }> {
    const headers = await fetchHeaders();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/grants`;
    const response = await fetch(endpoint, { method: 'GET', headers });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to load stage grants');
    }
    return await response.json() as any;
}

export async function downloadStageFile(
    stageName: string,
    filePath: string
): Promise<void> {
    const headers = await fetchHeaders();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/files/${encodeURIComponent(filePath)}/download`;

    const response = await fetch(endpoint, {
        method: 'GET',
        headers,
    });

    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to download file';
        throw new Error(errorMessage);
    }

    // Create blob and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

export async function uploadStageFile(
    stageName: string,
    files: FileList,
    overwrite: boolean = false,
    path?: string
): Promise<any> {
    const headers = await fetchHeaders();

    const endpoint = API_CONTRACTS.dataSource.uploadToStage.getUrl(stageName, overwrite);
    const url = new URL(endpoint);
    if (path) {
        url.searchParams.set('path', path);
    }

    const formData = new FormData();
    Array.from(files).forEach(file => {
        formData.append('files', file);
    });

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': headers.Authorization,
            'X-Account-Name': headers['X-Account-Name'],
            'X-Username': headers['X-Username'],
            // Do NOT set Content-Type for multipart/form-data - browser handles it
        },
        body: formData,
    });

    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to upload file';
        throw new Error(errorMessage);
    }

    return await response.json() as any;
}

export async function deleteStageFile(
    stageName: string,
    filePath: string
): Promise<any> {
    const headers = await fetchHeaders();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/files/${encodeURIComponent(filePath)}`;

    const response = await fetch(endpoint, {
        method: 'DELETE',
        headers,
    });

    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to delete file';
        throw new Error(errorMessage);
    }

    return await response.json() as any;
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/connectors`, { method: 'GET', headers });
    if (!response.ok) throw new Error('Failed to list connectors');
    return await response.json() as any;
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/postgres/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 5432, password: '', ...body }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'PostgreSQL ingest failed');
    }
    return await response.json() as any;
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
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/mysql/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 3306, password: '', ...body }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'MySQL ingest failed');
    }
    return await response.json() as any;
}

// --- Databricks ---
export async function databricksTest(body: { host: string; http_path: string; access_token: string }): Promise<{ ok: boolean }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/databricks/test`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Databricks connection failed');
    }
    return await response.json() as any;
}

export async function databricksCatalogs(body: { host: string; http_path: string; access_token: string }): Promise<{ catalogs: string[] }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/databricks/catalogs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list catalogs');
    }
    return await response.json() as any;
}

export async function databricksSchemas(
    body: { host: string; http_path: string; access_token: string },
    catalog: string
): Promise<{ schemas: string[] }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/databricks/schemas?catalog=${encodeURIComponent(catalog)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list schemas');
    }
    return await response.json() as any;
}

export async function databricksTables(
    body: { host: string; http_path: string; access_token: string },
    catalog: string,
    schema_name: string
): Promise<{ tables: string[] }> {
    const headers = await fetchHeaders();
    const params = new URLSearchParams({ catalog, schema_name });
    const response = await fetch(`${API_BASE_URL}/connect/databricks/tables?${params}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list tables');
    }
    return await response.json() as any;
}

export async function databricksIngest(body: {
    host: string;
    http_path: string;
    access_token: string;
    catalog: string;
    schema_name: string;
    tables?: string[];
}): Promise<{ message: string; tables?: { table: string; rows: number }[] }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/databricks/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Databricks ingest failed');
    }
    return await response.json() as any;
}

// --- Iceberg ---
export async function icebergTest(body: { uri: string; warehouse?: string; credential?: string }): Promise<{ ok: boolean }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/iceberg/test`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Iceberg connection failed');
    }
    return await response.json() as any;
}

export async function icebergNamespaces(body: { uri: string; warehouse?: string; credential?: string }): Promise<{ namespaces: string[] }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/iceberg/namespaces`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list namespaces');
    }
    return await response.json() as any;
}

export async function icebergTables(
    body: { uri: string; warehouse?: string; credential?: string },
    namespace: string
): Promise<{ tables: string[] }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/iceberg/tables?namespace=${encodeURIComponent(namespace)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list tables');
    }
    return await response.json() as any;
}

export async function icebergIngest(body: {
    uri: string;
    warehouse?: string;
    credential?: string;
    namespace: string;
    tables?: string[];
}): Promise<{ message: string; tables?: { table: string; rows: number }[] }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/iceberg/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Iceberg ingest failed');
    }
    return await response.json() as any;
}