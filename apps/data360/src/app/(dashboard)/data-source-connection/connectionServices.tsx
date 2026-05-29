// src/app/services/data-source-connection/connectionServices.ts

import apiClient from '@/lib/api-client';
import { getAuthHeaders } from '@/lib/auth';
import { API_CONTRACTS } from '@/lib/api-contracts';
import { API_CONFIG } from '@/config/database.config';

const API_BASE_URL = API_CONFIG.BASE_URL;

interface ApiResponse {
    message: string;
}

/**
 * Normalize an apiClient (axios) error into the same `Error(message)` contract
 * the raw-fetch helpers used to throw, so callers' `catch (e) { e.message }`
 * keep working unchanged. apiClient already injects auth + X-Account-Name +
 * X-Username and rejects on non-2xx (see lib/api-client.ts).
 */
function toApiError(err: unknown, fallback: string): Error {
    const detail = (err as { response?: { data?: { detail?: unknown; message?: unknown } } })?.response?.data;
    if (detail) {
        if (typeof detail.detail === 'string') return new Error(detail.detail);
        if (typeof detail.message === 'string') return new Error(detail.message);
    }
    if (err instanceof Error && err.message) return new Error(err.message);
    return new Error(fallback);
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
    try {
        const { data } = await apiClient.post<any>('/connect/azure/storage_integration', {
            integration_name,
            tenant_id,
            url,
        });
        return {
            message: data.message ?? 'Azure Storage integration created.',
            requires_consent: data.requires_consent ?? true,
            azure_consent_url: data.azure_consent_url ?? null,
            azure_multi_tenant_app_name: data.azure_multi_tenant_app_name ?? null,
        };
    } catch (err) {
        throw toApiError(err, 'Failed to set up Azure Storage Integration');
    }
}

export async function setupAzureNotificationIntegration(
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    try {
        const { data } = await apiClient.post<any>('/connect/azure/notification_integration', {
            integration_name,
            tenant_id,
            queue_url,
        });
        return { message: data };
    } catch (err) {
        throw toApiError(err, 'Failed to set up Azure Notification Integration');
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
        const { data } = await apiClient.post<any>('/connect/azure/stage', {
            stage_name,
            url,
            integration_name,
            load_data,
            auto_update,
            ...(notification_integration != null && { notification_integration }),
        });
        return { message: data };
    } catch (err) {
        throw toApiError(err, 'Failed to create Azure Stage');
    }
}


// --- AWS Services ---

export async function setupAwsStorageIntegration(
    integration_name: string,
    bucket_name: string,
    aws_role_arn: string,
    external_id: string
): Promise<ApiResponse> {
    try {
        const { data } = await apiClient.post<any>('/connect/aws/storage_integration', {
            integration_name,
            bucket_name,
            aws_role_arn,
            external_id,
        });
        return { message: data };
    } catch (err) {
        throw toApiError(err, 'Failed to set up AWS Storage Integration');
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
        const { data } = await apiClient.post<any>('/connect/aws/stage', {
            stage_name,
            bucket_name,
            integration_name,
            load_data,
            auto_update,
        });
        return { message: data };
    } catch (err) {
        throw toApiError(err, 'Failed to create AWS Stage');
    }
}

// --- Internal stage (raw zone, no Azure/AWS) ---

export async function createInternalStage(stage_name: string): Promise<ApiResponse> {
    const headers = await getAuthHeaders();
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
    try {
        const { data } = await apiClient.post<any>('/connect/snowflake_lake/datalake/connect', {
            datalake_username,
            datalake_password,
            datalake_account,
            datalake_role,
        });
        return { message: data };
    } catch (err) {
        throw toApiError(err, 'Failed to connect to Snowflake Datalake');
    }
}

export async function listSnowflakeStages(): Promise<any> {
    const headers = await getAuthHeaders();
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
    return await response.json();
}

export async function listSnowflakeStageFiles(
    stageName: string,
    opts?: { path?: string; sort?: 'name' | 'size' | 'last_modified' }
): Promise<{ files: any[]; count: number; stage_name: string }> {
    const headers = await getAuthHeaders();
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
    return await response.json();
}

// --- Common Integration Details ---
export async function getIntegrationDetails(integration_name: string): Promise<AzureIntegrationDetailsResponse> {
    const headers = await getAuthHeaders();
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
    const headers = await getAuthHeaders();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/files/${encodeURIComponent(filePath)}/preview?limit=${limit}&offset=${offset}`;
    const response = await fetch(endpoint, { method: 'GET', headers });
    if (!response.ok) {
        const errorData: any = await response.json();
        const errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : errorData.message || 'Failed to preview file';
        throw new Error(errorMessage);
    }
    return await response.json();
}

export async function getStageGrants(stageName: string): Promise<{ stage_name: string; grants: any[]; count: number }> {
    const headers = await getAuthHeaders();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/grants`;
    const response = await fetch(endpoint, { method: 'GET', headers });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(typeof errorData.detail === 'string' ? errorData.detail : 'Failed to load stage grants');
    }
    return await response.json();
}

export async function downloadStageFile(
    stageName: string,
    filePath: string
): Promise<void> {
    const headers = await getAuthHeaders();
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
    const headers = await getAuthHeaders();

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

    return await response.json();
}

export async function deleteStageFile(
    stageName: string,
    filePath: string
): Promise<any> {
    const headers = await getAuthHeaders();
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

    return await response.json();
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
        const { data } = await apiClient.post<{ message: string; tables?: number }>(
            '/connect/postgres/ingest',
            { port: 5432, password: '', ...body }
        );
        return data;
    } catch (err) {
        throw toApiError(err, 'PostgreSQL ingest failed');
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
        const { data } = await apiClient.post<{ message: string }>('/connect/mysql/ingest', {
            port: 3306,
            password: '',
            ...body,
        });
        return data;
    } catch (err) {
        throw toApiError(err, 'MySQL ingest failed');
    }
}

// --- Databricks ---
export async function databricksTest(body: { host: string; http_path: string; access_token: string }): Promise<{ ok: boolean }> {
    try {
        const { data } = await apiClient.post<{ ok: boolean }>('/connect/databricks/test', body);
        return data;
    } catch (err) {
        throw toApiError(err, 'Databricks connection failed');
    }
}

export async function databricksCatalogs(body: { host: string; http_path: string; access_token: string }): Promise<{ catalogs: string[] }> {
    try {
        const { data } = await apiClient.post<{ catalogs: string[] }>('/connect/databricks/catalogs', body);
        return data;
    } catch (err) {
        throw toApiError(err, 'Failed to list catalogs');
    }
}

export async function databricksSchemas(
    body: { host: string; http_path: string; access_token: string },
    catalog: string
): Promise<{ schemas: string[] }> {
    try {
        const { data } = await apiClient.post<{ schemas: string[] }>(
            `/connect/databricks/schemas?catalog=${encodeURIComponent(catalog)}`,
            body
        );
        return data;
    } catch (err) {
        throw toApiError(err, 'Failed to list schemas');
    }
}

export async function databricksTables(
    body: { host: string; http_path: string; access_token: string },
    catalog: string,
    schema_name: string
): Promise<{ tables: string[] }> {
    try {
        const params = new URLSearchParams({ catalog, schema_name });
        const { data } = await apiClient.post<{ tables: string[] }>(
            `/connect/databricks/tables?${params}`,
            body
        );
        return data;
    } catch (err) {
        throw toApiError(err, 'Failed to list tables');
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
        const { data } = await apiClient.post<{ message: string; tables?: { table: string; rows: number }[] }>(
            '/connect/databricks/ingest',
            body
        );
        return data;
    } catch (err) {
        throw toApiError(err, 'Databricks ingest failed');
    }
}

// --- Iceberg ---
export async function icebergTest(body: { uri: string; warehouse?: string; credential?: string }): Promise<{ ok: boolean }> {
    try {
        const { data } = await apiClient.post<{ ok: boolean }>('/connect/iceberg/test', body);
        return data;
    } catch (err) {
        throw toApiError(err, 'Iceberg connection failed');
    }
}

export async function icebergNamespaces(body: { uri: string; warehouse?: string; credential?: string }): Promise<{ namespaces: string[] }> {
    try {
        const { data } = await apiClient.post<{ namespaces: string[] }>('/connect/iceberg/namespaces', body);
        return data;
    } catch (err) {
        throw toApiError(err, 'Failed to list namespaces');
    }
}

export async function icebergTables(
    body: { uri: string; warehouse?: string; credential?: string },
    namespace: string
): Promise<{ tables: string[] }> {
    try {
        const { data } = await apiClient.post<{ tables: string[] }>(
            `/connect/iceberg/tables?namespace=${encodeURIComponent(namespace)}`,
            body
        );
        return data;
    } catch (err) {
        throw toApiError(err, 'Failed to list tables');
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
        const { data } = await apiClient.post<{ message: string; tables?: { table: string; rows: number }[] }>(
            '/connect/iceberg/ingest',
            body
        );
        return data;
    } catch (err) {
        throw toApiError(err, 'Iceberg ingest failed');
    }
}