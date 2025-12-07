// src/app/services/data-source-connection/connectionServices.ts

import { getSession } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ApiResponse {
    message: string; // Generic message
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

async function getAuthToken(): Promise<string> {
    const session = await getSession();
    if (!session?.user?.access_token) {
        console.error('No access token available in session.');
        throw new Error('Not authenticated');
    }
    return session.user.access_token as string;
}

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
): Promise<ApiResponse> {
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/azure/storage_integration`,
        { integration_name, tenant_id, url }
    );
    const token = await getAuthToken();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to set up Azure Storage Integration');
    }
    const data: any = await response.json();
    return { message: data };
}

export async function setupAzureNotificationIntegration(
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/azure/notification_integration`,
        { integration_name, tenant_id, queue_url }
    );
    const token = await getAuthToken();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to set up Azure Notification Integration');
    }
    const data: any = await response.json();
    return { message: data };
}

export async function setupAzureSnowpipe( // This function is not currently used in the UI flow for notification/stage
    integration_name: string,
    tenant_id: string,
    queue_url: string
): Promise<ApiResponse> {
    const token = await getAuthToken();
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/azure/snowpipe`,
        { integration_name, tenant_id, queue_url }
    );
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to set up Azure Snowpipe');
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
    const token = await getAuthToken();
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/azure/stage`,
        { stage_name, url, integration_name, load_data, auto_update, notification_integration }
    );
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to create Azure Stage');
    }
    const data: any = await response.json();
    return { message: data };
}


// --- AWS Services ---

export async function setupAwsStorageIntegration(
    integration_name: string,
    bucket_name: string,
    aws_role_arn: string,
    external_id: string
): Promise<ApiResponse> {
    const token = await getAuthToken(); // Added token for AWS too
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/aws/storage_integration`,
        { integration_name, bucket_name, aws_role_arn, external_id }
    );
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`, // Add Authorization header
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to set up AWS Storage Integration');
    }
    const data: any = await response.json();
    return { message: data };
}

export async function createAwsStage(
    stage_name: string,
    bucket_name: string,
    integration_name: string,
    load_data: boolean,
    auto_update: boolean
): Promise<ApiResponse> {
    const token = await getAuthToken(); // Added token for AWS too
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/aws/stage`,
        { stage_name, bucket_name, integration_name, load_data, auto_update }
    );
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`, // Add Authorization header
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to create AWS Stage');
    }
    const data: any = await response.json();
    return { message: data };
}

// --- Snowflake Services ---

export async function connectSnowflakeDatalake(
    datalake_username: string,
    datalake_password: string,
    datalake_account: string,
    datalake_role: string
): Promise<ApiResponse> {
    const token = await getAuthToken();
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/snowflake_lake/datalake/connect`,
        { datalake_username, datalake_password, datalake_account, datalake_role }
    );
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to connect to Snowflake Datalake');
    }
    const data: any = await response.json();
    return { message: data };
}

export async function listSnowflakeStages(): Promise<any> {
    const token = await getAuthToken();
    const endpoint = `${API_BASE_URL}/connect/stages`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to list Snowflake stages');
    }
    return await response.json();
}

export async function listSnowflakeStageFiles(stageName: string): Promise<any> {
    const token = await getAuthToken();
    const endpoint = `${API_BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/files`;
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to list stage files');
    }
    return await response.json();
}

// --- Common Integration Details ---
export async function getIntegrationDetails(integration_name: string): Promise<AzureIntegrationDetailsResponse> {
    const token = await getAuthToken();
    const endpoint = buildUrlWithQueryParams(
        `${API_BASE_URL}/connect/integration`,
        { integration_name }
    );
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
    });
    if (!response.ok) {
        const errorData: any = await response.json();
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Failed to get integration details');
    }
    const data = await response.json() as AzureIntegrationDetailsResponse;
    return data;
}