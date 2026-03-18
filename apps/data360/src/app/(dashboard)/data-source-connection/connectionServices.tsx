// src/app/services/data-source-connection/connectionServices.ts

import { getAuthHeaders } from '@/lib/auth';
import { API_CONTRACTS } from '@/lib/api-contracts';
import { API_CONFIG } from '@/config/database.config';
import apiClient from '@/lib/api-client';

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
    return response.json() as any;
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
    return response.json() as Promise<{ files: any[]; count: number; stage_name: string }>;
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
    return response.json() as Promise<StageFilePreviewResponse>;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
}

// --- Connection Test Results ---
export interface TestConnectionResult {
    ok: boolean;
    latency_ms: number;
    version?: string;
    database?: string;
    schema?: string;
    table_count?: number;
    tables?: string[];
    message?: string;
}

// --- PostgreSQL Test ---
export async function postgresTest(body: {
    host: string;
    port?: number;
    database: string;
    user: string;
    password?: string;
}): Promise<TestConnectionResult> {
    const response = await apiClient.post('/connect/postgres/test', {
        port: 5432, password: '', ...body,
    });
    return response.data;
}

// --- MySQL Test ---
export async function mysqlTest(body: {
    host: string;
    port?: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean;
}): Promise<TestConnectionResult> {
    const response = await apiClient.post('/connect/mysql/test', {
        port: 3306, password: '', ssl: false, ...body,
    });
    return response.data;
}

// --- Oracle Test ---
export async function oracleTest(body: {
    host: string;
    port?: number;
    service_name: string;
    username: string;
    password?: string;
}): Promise<TestConnectionResult> {
    const response = await apiClient.post('/connect/oracle/test', {
        port: 1521, password: '', ...body,
    });
    return response.data;
}

// --- Re-ingest from saved connector ---
export async function ingestFromConnector(
    connectorId: string
): Promise<{ connector_id: string; connector_type: string; tables_count?: number; rows_total?: number }> {
    const response = await apiClient.post(`/connect/connectors/${connectorId}/ingest`);
    return response.data;
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
    return response.json() as any;
}

// --- MySQL ---
export async function mysqlIngest(body: {
    host: string;
    port?: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean;
    tables?: string[];
}): Promise<{ message: string }> {
    const headers = await fetchHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/mysql/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 3306, password: '', ssl: false, ...body }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'MySQL ingest failed');
    }
    return await response.json() as any;
    return response.json() as any;
}

// --- Salesforce ---
export async function salesforceIngest(body: {
    instance_url: string;
    client_id: string;
    client_secret: string;
    username: string;
    security_token?: string;
    objects?: string[];
}): Promise<{ message: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/salesforce/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Salesforce ingest failed');
    }
    return response.json() as any;
}

// --- SAP ---
export async function sapIngest(body: {
    host: string;
    system_id: string;
    client: string;
    username: string;
    password: string;
    tables?: string[];
}): Promise<{ message: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/sap/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'SAP ingest failed');
    }
    return response.json() as any;
}

// --- Oracle ---
export async function oracleIngest(body: {
    host: string;
    port?: number;
    service_name: string;
    username: string;
    password?: string;
    tables?: string[];
}): Promise<{ message: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/oracle/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 1521, password: '', ...body }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Oracle ingest failed');
    }
    return response.json() as any;
}

// --- HubSpot ---
export async function hubspotIngest(body: {
    api_key: string;
    objects?: string[];
}): Promise<{ message: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/hubspot/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'HubSpot ingest failed');
    }
    return response.json() as any;
}

// --- ServiceNow ---
export async function servicenowIngest(body: {
    instance_url: string;
    username: string;
    password: string;
    tables?: string[];
}): Promise<{ message: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/servicenow/ingest`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'ServiceNow ingest failed');
    }
    return response.json() as any;
}

// --- Custom REST API ---
export async function customApiIngest(body: {
    base_url: string;
    auth_type?: string;
    auth_config?: Record<string, string>;
    headers?: Record<string, string>;
    endpoints: { path: string; method?: string; params?: Record<string, string>; target_table: string }[];
    pagination_type?: string;
}): Promise<{ message: string }> {
    const headers_auth = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/api/ingest`, {
        method: 'POST',
        headers: { ...headers_auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_type: 'bearer', ...body }),
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'API ingest failed');
    }
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return response.json() as any;
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
    return await response.json();
    return response.json() as any;
}

// --- Pipes ---

export interface PipeInfo {
    name: string;
    target_table: string;
    source_stage: string;
    status: string;
    pending_files: number;
}

export async function listPipes(database?: string, schema?: string): Promise<{ pipes: PipeInfo[] }> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (database) params.append('database', database);
    if (schema) params.append('schema', schema);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/connect/pipes${qs}`, { headers });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list pipes');
    }
    return response.json() as any;
}

export async function refreshPipe(name: string): Promise<ApiResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/pipes/${encodeURIComponent(name)}/refresh`, {
        method: 'POST',
        headers,
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to refresh pipe');
    }
    return response.json() as any;
}

export async function pausePipe(name: string): Promise<ApiResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/pipes/${encodeURIComponent(name)}/pause`, {
        method: 'POST',
        headers,
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to pause pipe');
    }
    return response.json() as any;
}

export async function resumePipe(name: string): Promise<ApiResponse> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/connect/pipes/${encodeURIComponent(name)}/resume`, {
        method: 'POST',
        headers,
    });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to resume pipe');
    }
    return response.json() as any;
}

// --- Streams ---

export interface StreamInfo {
    name: string;
    source_object: string;
    type: string;
    has_data: boolean;
    mode: string;
    created: string;
}

export async function listStreams(database?: string, schema?: string): Promise<{ streams: StreamInfo[] }> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (database) params.append('database', database);
    if (schema) params.append('schema', schema);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/connect/streams${qs}`, { headers });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list streams');
    }
    return response.json() as any;
}

// --- Dynamic Tables ---

export interface DynamicTableInfo {
    name: string;
    target_lag: string;
    warehouse: string;
    rows: number;
    last_refresh: string;
    status: string;
}

export async function listDynamicTables(database?: string, schema?: string): Promise<{ dynamic_tables: DynamicTableInfo[] }> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (database) params.append('database', database);
    if (schema) params.append('schema', schema);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/connect/dynamic-tables${qs}`, { headers });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list dynamic tables');
    }
    return response.json() as any;
}

// --- External Tables ---

export interface ExternalTableInfo {
    name: string;
    location: string;
    file_format: string;
    auto_refresh: boolean;
    rows: number;
}

export async function listExternalTables(database?: string, schema?: string): Promise<{ external_tables: ExternalTableInfo[] }> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (database) params.append('database', database);
    if (schema) params.append('schema', schema);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/connect/external-tables${qs}`, { headers });
    if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to list external tables');
    }
    return response.json() as any;
}

// ============================================================================
// Connector Registry (metadata-backed persistence)
// ============================================================================

export interface RegisteredConnector {
  CONNECTOR_ID: string;
  CONNECTOR_TYPE: string;
  CONNECTOR_NAME: string;
  STATUS: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'EXPIRED';
  CONFIG: Record<string, unknown>;
  TARGET_SCHEMA: string;
  LAST_SYNC_AT: string | null;
  LAST_SYNC_STATUS: string | null;
  LAST_SYNC_DETAILS: Record<string, unknown> | null;
  TABLES_SYNCED: number;
  ROWS_SYNCED: number;
  CREATED_BY: string;
  CREATED_AT: string;
  UPDATED_AT: string;
}

export interface ExpiringCredential {
  CONNECTOR_ID: string;
  CONNECTOR_NAME: string;
  CONNECTOR_TYPE: string;
  CREDENTIAL_KEY: string;
  EXPIRES_AT: string;
  DAYS_UNTIL_EXPIRY: number;
}

export interface AuditEntry {
  AUDIT_ID: string;
  CONNECTOR_ID: string | null;
  CONNECTOR_NAME: string | null;
  CONNECTOR_TYPE: string | null;
  ACTION: string;
  USERNAME: string;
  STATUS: string;
  DETAILS: Record<string, unknown> | null;
  CREATED_AT: string;
}

export async function listRegisteredConnectors(
  type?: string,
  status?: string
): Promise<RegisteredConnector[]> {
  const params: Record<string, string> = {};
  if (type) params.connector_type = type;
  if (status) params.status = status;
  const response = await apiClient.get('/connect/connectors/registered', { params });
  return response.data?.connectors || response.data || [];
}

export async function getRegisteredConnector(
  id: string
): Promise<RegisteredConnector> {
  const response = await apiClient.get(`/connect/connectors/registered/${id}`);
  return response.data;
}

export async function deleteRegisteredConnector(
  id: string
): Promise<{ message: string }> {
  const response = await apiClient.delete(`/connect/connectors/registered/${id}`);
  return response.data;
}

export async function testConnector(
  id: string
): Promise<{ ok: boolean; message: string; latency_ms?: number }> {
  const response = await apiClient.post(`/connect/connectors/${id}/test`);
  return response.data;
}

export async function getExpiringCredentials(
  days: number = 7
): Promise<ExpiringCredential[]> {
  const response = await apiClient.get('/connect/connectors/credentials/expiring', {
    params: { days },
  });
  return response.data?.expiring || response.data || [];
}

export async function rotateCredential(body: {
  connector_id: string;
  credential_key: string;
  new_value: string;
  expires_at?: string;
}): Promise<{ message: string; credential_id: string }> {
  const response = await apiClient.post('/connect/connectors/credentials/rotate', body);
  return response.data;
}

export async function getConnectorAudit(
  connectorId?: string,
  limit: number = 100
): Promise<AuditEntry[]> {
  const params: Record<string, string | number> = { limit };
  if (connectorId) params.connector_id = connectorId;
  const response = await apiClient.get('/connect/connectors/audit', { params });
  return response.data?.audit || response.data || [];
}

// ─── Snowflake Shares ───────────────────────────────────────────────
export async function createShare(shareName: string, datalakeUsername: string): Promise<{ message: string }> {
  const response = await apiClient.post('/connect/snowflake_lake/share/create', {
    share_name: shareName,
    datalake_username: datalakeUsername,
  });
  return response.data;
}

export async function grantSchemasToShare(
  shareName: string,
  database: string,
  schemas: string[],
  datalakeUsername: string
): Promise<{ message: string }> {
  const response = await apiClient.post('/connect/snowflake_lake/share/grant-schemas', {
    share_name: shareName,
    database,
    schemas,
    datalake_username: datalakeUsername,
  });
  return response.data;
}

export async function affectShareToAccount(
  shareName: string,
  targetAccount: string,
  datalakeUsername: string
): Promise<{ message: string }> {
  const response = await apiClient.post('/connect/snowflake_lake/share/affect', {
    share_name: shareName,
    target_account: targetAccount,
    datalake_username: datalakeUsername,
  });
  return response.data;
}

export async function createDbFromShare(
  dbName: string,
  providerAccount: string,
  shareName: string
): Promise<{ message: string }> {
  const response = await apiClient.post('/connect/snowflake_lake/share/create-db', {
    db_name: dbName,
    provider_account: providerAccount,
    share_name: shareName,
  });
  return response.data;
}

export async function cloneDbFromShare(
  dbName: string,
  providerAccount: string,
  shareName: string,
  targetDb?: string
): Promise<{ message: string }> {
  const response = await apiClient.post('/connect/snowflake_lake/share/clone-db', {
    db_name: dbName,
    provider_account: providerAccount,
    share_name: shareName,
    target_db: targetDb,
  });
  return response.data;
}

// ─── Org Accounts — Shares & Reader Accounts ────────────────────────
export async function listOrgShares(): Promise<{ shares: any[]; count: number }> {
  const response = await apiClient.get('/org-accounts/shares');
  return response.data;
}

export async function listReaderAccounts(): Promise<{ reader_accounts: any[]; count: number }> {
  const response = await apiClient.get('/org-accounts/reader-accounts');
  return response.data;
}

// ─── Snowflake Databases/Schemas (for share UI) ─────────────────────
export async function listDatabases(): Promise<string[]> {
  const response = await apiClient.get('/connect/snowflake_lake/databases');
  return response.data?.databases || response.data || [];
}

export async function listSchemas(database: string): Promise<string[]> {
  const response = await apiClient.get(`/connect/snowflake_lake/schemas/${database}`);
  return response.data?.schemas || response.data || [];
}

// ─── GCS (Google Cloud Storage) ──────────────────────────────────────
export async function setupGcsStorageIntegration(body: {
  integration_name: string;
  bucket_name: string;
}): Promise<{ message: string; integration_name: string; STORAGE_GCS_SERVICE_ACCOUNT: string; instructions: string }> {
  const response = await apiClient.post('/connect/gcs/storage_integration', body);
  return response.data;
}

export async function createGcsStage(body: {
  stage_name: string;
  bucket_name: string;
  integration_name: string;
  prefix?: string;
  load_data?: boolean;
  auto_update?: boolean;
}): Promise<ApiResponse> {
  const response = await apiClient.post('/connect/gcs/stage', body);
  return response.data;
}

// ─── File Format ─────────────────────────────────────────────────────
export async function createFileFormat(body: {
  format_name: string;
  format_type: 'CSV' | 'JSON' | 'AVRO' | 'ORC' | 'PARQUET' | 'XML';
  field_delimiter?: string;
  record_delimiter?: string;
  skip_header?: number;
  field_optionally_enclosed_by?: string;
  strip_outer_array?: boolean;
  compression?: string;
  null_if?: string[];
  comment?: string;
}): Promise<{ message: string; fqn: string }> {
  const response = await apiClient.post('/connect/file-formats', body);
  return response.data;
}

export async function listFileFormats(): Promise<{ file_formats: any[] }> {
  const response = await apiClient.get('/connect/file-formats');
  return response.data;
}

// ─── External Table ──────────────────────────────────────────────────
export async function createExternalTable(body: {
  table_name: string;
  stage_name: string;
  file_format_name?: string;
  file_format_type?: string;
  location?: string;
  pattern?: string;
  auto_refresh?: boolean;
  partition_by?: string[];
  columns?: { name: string; type: string; as_expression?: string }[];
}): Promise<{ message: string; fqn: string }> {
  const response = await apiClient.post('/connect/external-tables', body);
  return response.data;
}

// ─── Stream (CDC) ────────────────────────────────────────────────────
export async function createStream(body: {
  stream_name: string;
  source_object: string;
  append_only?: boolean;
  show_initial_rows?: boolean;
  comment?: string;
}): Promise<{ message: string; fqn: string }> {
  const response = await apiClient.post('/connect/streams', body);
  return response.data;
}

// ─── Dynamic Table ───────────────────────────────────────────────────
export async function createDynamicTable(body: {
  table_name: string;
  target_lag: string;
  warehouse: string;
  query: string;
  comment?: string;
}): Promise<{ message: string; fqn: string }> {
  const response = await apiClient.post('/connect/dynamic-tables', body);
  return response.data;
}

// ─── Task (Scheduled SQL) ────────────────────────────────────────────
export async function createTask(body: {
  task_name: string;
  warehouse: string;
  schedule?: string;
  sql_statement: string;
  after?: string;
  when_condition?: string;
  comment?: string;
}): Promise<{ message: string; fqn: string; note: string }> {
  const response = await apiClient.post('/connect/tasks', body);
  return response.data;
}

export async function resumeTask(taskName: string): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/tasks/${taskName}/resume`);
  return response.data;
}

export async function suspendTask(taskName: string): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/tasks/${taskName}/suspend`);
  return response.data;
}

// ─── Provisioning: Database / Schema / Warehouse ─────────────────────

// Databases
export async function listProvisionedDatabases(): Promise<{ databases: any[]; count: number }> {
  const response = await apiClient.get('/connect/provisioning/databases');
  return response.data;
}

export async function createDatabase(body: {
  database_name: string;
  comment?: string;
  data_retention_time_in_days?: number;
  transient?: boolean;
}): Promise<{ message: string; database: string }> {
  const response = await apiClient.post('/connect/provisioning/databases', body);
  return response.data;
}

export async function alterDatabase(databaseName: string, body: {
  comment?: string;
  data_retention_time_in_days?: number;
}): Promise<ApiResponse> {
  const response = await apiClient.patch(`/connect/provisioning/databases/${databaseName}`, body);
  return response.data;
}

export async function dropDatabase(databaseName: string, cascade: boolean = false): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/provisioning/databases/${databaseName}`, { params: { cascade } });
  return response.data;
}

// Schemas
export async function listSchemasInDb(databaseName: string): Promise<{ schemas: any[]; count: number }> {
  const response = await apiClient.get(`/connect/provisioning/databases/${databaseName}/schemas`);
  return response.data;
}

export async function createSchema(body: {
  database_name: string;
  schema_name: string;
  comment?: string;
  transient?: boolean;
  data_retention_time_in_days?: number;
}): Promise<{ message: string; fqn: string }> {
  const response = await apiClient.post('/connect/provisioning/schemas', body);
  return response.data;
}

export async function alterSchema(databaseName: string, schemaName: string, body: {
  comment?: string;
  data_retention_time_in_days?: number;
}): Promise<ApiResponse> {
  const response = await apiClient.patch(`/connect/provisioning/databases/${databaseName}/schemas/${schemaName}`, body);
  return response.data;
}

export async function dropSchema(databaseName: string, schemaName: string, cascade: boolean = false): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/provisioning/databases/${databaseName}/schemas/${schemaName}`, { params: { cascade } });
  return response.data;
}

export async function cloneSchema(body: {
  source_database: string;
  source_schema: string;
  target_database: string;
  target_schema: string;
}): Promise<{ message: string; source: string; target: string }> {
  const response = await apiClient.post('/connect/provisioning/schemas/clone', body);
  return response.data;
}

// Warehouses
export async function listWarehouses(): Promise<{ warehouses: any[]; count: number }> {
  const response = await apiClient.get('/connect/provisioning/warehouses');
  return response.data;
}

export async function createWarehouse(body: {
  warehouse_name: string;
  warehouse_size?: string;
  auto_suspend?: number;
  auto_resume?: boolean;
  min_cluster_count?: number;
  max_cluster_count?: number;
  scaling_policy?: string;
  comment?: string;
}): Promise<{ message: string; warehouse: string; size: string }> {
  const response = await apiClient.post('/connect/provisioning/warehouses', body);
  return response.data;
}

export async function alterWarehouse(warehouseName: string, body: {
  warehouse_size?: string;
  auto_suspend?: number;
  auto_resume?: boolean;
  min_cluster_count?: number;
  max_cluster_count?: number;
  scaling_policy?: string;
  comment?: string;
}): Promise<ApiResponse> {
  const response = await apiClient.patch(`/connect/provisioning/warehouses/${warehouseName}`, body);
  return response.data;
}

export async function resumeWarehouse(warehouseName: string): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/provisioning/warehouses/${warehouseName}/resume`);
  return response.data;
}

export async function suspendWarehouse(warehouseName: string): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/provisioning/warehouses/${warehouseName}/suspend`);
  return response.data;
}

export async function dropWarehouse(warehouseName: string): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/provisioning/warehouses/${warehouseName}`);
  return response.data;
}

// Storage Integrations
export async function listStorageIntegrations(): Promise<{ integrations: any[]; count: number }> {
  const response = await apiClient.get('/connect/provisioning/storage-integrations');
  return response.data;
}

export async function dropStorageIntegration(integrationName: string): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/provisioning/storage-integrations/${integrationName}`);
  return response.data;
}

// Stage drop
export async function dropStage(stageName: string): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/provisioning/stages/${stageName}`);
  return response.data;
}

// Snowflake-Managed Postgres Instances
export async function listPostgresInstances(): Promise<{ instances: any[]; count: number }> {
  const response = await apiClient.get('/connect/provisioning/postgres-instances');
  return response.data;
}

export async function createPostgresInstance(body: {
  instance_name: string;
  compute_family?: string;
  storage_size_gb?: number;
  postgres_version?: number;
  high_availability?: boolean;
}): Promise<ApiResponse> {
  const response = await apiClient.post('/connect/provisioning/postgres-instances', body);
  return response.data;
}

export async function describePostgresInstance(instanceName: string): Promise<any> {
  const response = await apiClient.get(`/connect/provisioning/postgres-instances/${instanceName}`);
  return response.data;
}

export async function dropPostgresInstance(instanceName: string): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/provisioning/postgres-instances/${instanceName}`);
  return response.data;
}

// ─── Databricks Provisioning ─────────────────────────────────────────

export interface DbxCreds { host: string; token: string; }

export async function dbxCheckStatus(creds: DbxCreds): Promise<{ ok: boolean; user: string; workspace_host: string }> {
  const response = await apiClient.post('/connect/databricks/provision/status', creds);
  return response.data;
}

// SQL Warehouses
export async function dbxListSqlWarehouses(creds: DbxCreds): Promise<{ warehouses: any[]; count: number }> {
  const response = await apiClient.post('/connect/databricks/provision/sql-warehouses/list', creds);
  return response.data;
}

export async function dbxCreateSqlWarehouse(body: DbxCreds & {
  name: string; cluster_size?: string; min_num_clusters?: number; max_num_clusters?: number;
  auto_stop_mins?: number; warehouse_type?: string; enable_serverless?: boolean;
}): Promise<any> {
  const response = await apiClient.post('/connect/databricks/provision/sql-warehouses', body);
  return response.data;
}

export async function dbxStartSqlWarehouse(warehouseId: string, creds: DbxCreds): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/databricks/provision/sql-warehouses/${warehouseId}/start`, creds);
  return response.data;
}

export async function dbxStopSqlWarehouse(warehouseId: string, creds: DbxCreds): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/databricks/provision/sql-warehouses/${warehouseId}/stop`, creds);
  return response.data;
}

export async function dbxDeleteSqlWarehouse(warehouseId: string, host: string, token: string): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/databricks/provision/sql-warehouses/${warehouseId}`, { params: { host, token } });
  return response.data;
}

// Unity Catalog
export async function dbxListCatalogs(creds: DbxCreds): Promise<{ catalogs: any[]; count: number }> {
  const response = await apiClient.post('/connect/databricks/provision/catalogs/list', creds);
  return response.data;
}

export async function dbxCreateCatalog(body: DbxCreds & { name: string; comment?: string }): Promise<any> {
  const response = await apiClient.post('/connect/databricks/provision/catalogs', body);
  return response.data;
}

export async function dbxDeleteCatalog(catalogName: string, host: string, token: string, force: boolean = false): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/databricks/provision/catalogs/${catalogName}`, { params: { host, token, force } });
  return response.data;
}

// Schemas
export async function dbxListSchemas(creds: DbxCreds, catalogName: string): Promise<{ schemas: any[]; count: number }> {
  const response = await apiClient.post('/connect/databricks/provision/schemas/list', creds, { params: { catalog_name: catalogName } });
  return response.data;
}

export async function dbxCreateSchema(body: DbxCreds & { catalog_name: string; name: string; comment?: string }): Promise<any> {
  const response = await apiClient.post('/connect/databricks/provision/schemas', body);
  return response.data;
}

export async function dbxDeleteSchema(fullName: string, host: string, token: string): Promise<ApiResponse> {
  const response = await apiClient.delete(`/connect/databricks/provision/schemas/${fullName}`, { params: { host, token } });
  return response.data;
}

// Clusters
export async function dbxListClusters(creds: DbxCreds): Promise<{ clusters: any[]; count: number }> {
  const response = await apiClient.post('/connect/databricks/provision/clusters/list', creds);
  return response.data;
}

export async function dbxCreateCluster(body: DbxCreds & {
  cluster_name: string; spark_version?: string; node_type_id?: string;
  num_workers?: number; autotermination_minutes?: number; autoscale_min?: number; autoscale_max?: number;
}): Promise<any> {
  const response = await apiClient.post('/connect/databricks/provision/clusters', body);
  return response.data;
}

export async function dbxStartCluster(clusterId: string, creds: DbxCreds): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/databricks/provision/clusters/${clusterId}/start`, creds);
  return response.data;
}

export async function dbxTerminateCluster(clusterId: string, creds: DbxCreds): Promise<ApiResponse> {
  const response = await apiClient.post(`/connect/databricks/provision/clusters/${clusterId}/terminate`, creds);
  return response.data;
}