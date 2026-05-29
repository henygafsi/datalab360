/**
 * Data Products Marketplace API client — /data-products/*
 * Handles: data product CRUD, subscriptions.
 */
import apiClient from '@/lib/api-client';

const PREFIX = '/data-products';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataProduct {
  PRODUCT_ID: string;
  NAME: string;
  TABLE_FQN: string;
  OWNER: string;
  DESCRIPTION: string;
  SLA_FRESHNESS_HOURS: number;
  QUALITY_THRESHOLD: number;
  TAGS: string[];
  STATUS: string;
  CONSUMERS: number;
  CREATED_BY: string;
  CREATED_AT: string;
}

export interface CreateDataProductRequest {
  name: string;
  table_fqn: string;
  owner?: string;
  description?: string;
  sla_freshness_hours?: number;
  quality_threshold?: number;
  tags?: string[];
}

export interface DataProductListResponse {
  data: DataProduct[];
  count: number;
  execution_time_ms: number;
}

export interface DataProductDetailResponse {
  data: DataProduct;
  execution_time_ms: number;
}

export interface CreateDataProductResponse {
  product_id: string;
  name: string;
  status: string;
  message: string;
  execution_time_ms: number;
}

export interface SubscribeResponse {
  product_id: string;
  name: string;
  consumers: number;
  subscribed_by: string;
  message: string;
  execution_time_ms: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listDataProducts(): Promise<DataProductListResponse> {
  const { data } = await apiClient.get<DataProductListResponse>(PREFIX);
  return data;
}

export async function getDataProduct(
  productId: string
): Promise<DataProductDetailResponse> {
  const { data } = await apiClient.get<DataProductDetailResponse>(
    `${PREFIX}/${productId}`
  );
  return data;
}

export async function createDataProduct(
  body: CreateDataProductRequest
): Promise<CreateDataProductResponse> {
  const { data } = await apiClient.post<CreateDataProductResponse>(PREFIX, body);
  return data;
}

export async function subscribeToProduct(
  productId: string
): Promise<SubscribeResponse> {
  const { data } = await apiClient.post<SubscribeResponse>(
    `${PREFIX}/${productId}/subscribe`
  );
  return data;
}
