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
  share_name?: string;
  consumer_account?: string;
  consumers: number;
  subscribed_by: string;
  already_granted?: boolean;
  message: string;
  execution_time_ms: number;
}

export interface PublishProductResponse {
  product_id: string;
  name: string;
  status: string;
  share_name: string;
  granted_object: string;
  consumer_accounts: string[];
  published_by: string;
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

/**
 * Publish a metadata-only data product as a live Snowflake Secure Data Share.
 *
 * This is the REAL share flow — `POST /data-products/{id}/publish` issues
 * `CREATE SHARE + GRANT … TO SHARE` and sets `SHARE_NAME` on the product. It is
 * NOT the catalog facade publish (`/catalog/products/{id}/publish`). A product
 * MUST be published this way before `subscribeToProduct` can grant access —
 * otherwise the backend 409s with "not published yet".
 *
 * Requires an ACCOUNTADMIN-tier role; non-privileged callers get a 403 which
 * the caller must surface inline (no crash).
 */
export async function publishDataProduct(
  productId: string,
  body?: { accounts?: string[] }
): Promise<PublishProductResponse> {
  const { data } = await apiClient.post<PublishProductResponse>(
    `${PREFIX}/${productId}/publish`,
    body
  );
  return data;
}

/**
 * Subscribe a consumer account to a PUBLISHED data product. Issues a real
 * `ALTER SHARE … ADD ACCOUNTS` grant on the provider account (ACCOUNTADMIN-tier;
 * 403 otherwise). 409 if the product has not been published as a share yet.
 * The consumer account defaults to the caller's account when omitted.
 */
export async function subscribeToProduct(
  productId: string,
  body?: { consumer_account?: string }
): Promise<SubscribeResponse> {
  const { data } = await apiClient.post<SubscribeResponse>(
    `${PREFIX}/${productId}/subscribe`,
    body
  );
  return data;
}
