/**
 * Data Products Marketplace API client — /data-products/*
 * Handles: data product CRUD, subscriptions.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

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
  /**
   * Raw lifecycle status as emitted by the backend (e.g. `DRAFT` / `PUBLISHED`,
   * uppercase). Do NOT compare this directly in the UI — backend casing and
   * vocabulary differ from the front's `draft` / `active` / `certified` model.
   * Use `normalizeProductStatus()` (page-level helper) at every consumption site.
   */
  STATUS: string;
  /**
   * Optional backend-provided normalized status (`draft` / `active` / `certified`).
   * When present it is authoritative and used as-is by `normalizeProductStatus()`.
   */
  STATUS_NORMALIZED?: string;
  /**
   * Backend-derived publish flag — `true` once the product backs a live Secure
   * Data Share (has a `SHARE_NAME`) or its status is `PUBLISHED`. Subscribing
   * requires a published product (the backend 409s otherwise), so the card gates
   * the Subscribe affordance on this. Optional: falls back to a `STATUS` check
   * when an older backend doesn't supply it.
   */
  is_published?: boolean;
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
  /**
   * Authoritative post-subscribe consumer count (the product's `CONSUMERS`
   * column, the same field the list endpoint returns). The backend reads it
   * back after an idempotent grant, so it can be `null` when the row read
   * returns nothing — callers must guard before using it (e.g. `.toLocaleString()`).
   */
  consumers: number | null;
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

/**
 * The backend may emit `TAGS` as a JSON-encoded string (e.g. `'["a","b"]'`)
 * or a comma-separated string rather than a real array — the `DataProduct.TAGS:
 * string[]` contract. Left raw, `product.TAGS.length` is truthy for a string but
 * `product.TAGS.map(...)` throws (`map is not a function`), crashing the
 * ProductCard render into the page error boundary. Normalize to a real array at
 * the service boundary so every consumer is safe and the contract holds.
 */
function normalizeTags(t: unknown): string[] {
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  if (typeof t === 'string' && t.trim()) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      /* not JSON — fall back to comma-separated */
    }
    return t.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export async function listDataProducts(): Promise<DataProductListResponse> {
  const { data } = await apiClient.get<DataProductListResponse>(API.dataProducts.list());
  return {
    ...data,
    data: (data?.data ?? []).map((p) => ({ ...p, TAGS: normalizeTags(p.TAGS) })),
  };
}

export async function getDataProduct(
  productId: string
): Promise<DataProductDetailResponse> {
  const { data } = await apiClient.get<DataProductDetailResponse>(
    API.dataProducts.get(productId)
  );
  return data?.data
    ? { ...data, data: { ...data.data, TAGS: normalizeTags(data.data.TAGS) } }
    : data;
}

export async function createDataProduct(
  body: CreateDataProductRequest
): Promise<CreateDataProductResponse> {
  const { data } = await apiClient.post<CreateDataProductResponse>(API.dataProducts.create(), body);
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
    API.dataProducts.publish(productId),
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
    API.dataProducts.subscribe(productId),
    body
  );
  return data;
}

export interface RefreshProductResponse {
  product_id: string;
  /** Whether the backing object actually had a manual-refresh verb run against it. */
  refreshed: boolean;
  /** Honest reason when `refreshed` is false (e.g. plain table / view — nothing to refresh). */
  reason?: string;
  object_kind?: string;
  last_refreshed_at?: string | null;
  message: string;
  execution_time_ms: number;
  [key: string]: unknown;
}

/**
 * Refresh the materialization behind a data product.
 * POST /data-products/{id}/refresh (data_products.py:790, verified vs backend).
 *
 * A data product is metadata over an existing TABLE_FQN. Only a dynamic table has
 * a manual refresh verb (ALTER DYNAMIC TABLE … REFRESH); for a plain table / view /
 * materialized view the backend returns an honest `refreshed: false` with a reason
 * rather than a fake success. Requires the `data_products:edit` action (403 otherwise).
 */
export async function refreshDataProduct(
  productId: string,
  body?: Record<string, unknown>
): Promise<RefreshProductResponse> {
  const { data } = await apiClient.post<RefreshProductResponse>(
    API.dataProducts.refresh(productId),
    body ?? {}
  );
  return data;
}

export interface DataProductLineageResponse {
  product_id: string;
  objects: string[];
  upstream: Array<Record<string, unknown>>;
  downstream: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * One-level lineage around the product's underlying object.
 * GET /data-products/{id}/lineage (data_products.py:1021, verified vs backend).
 */
export async function getDataProductLineage(
  productId: string
): Promise<DataProductLineageResponse> {
  const { data } = await apiClient.get<DataProductLineageResponse>(
    API.dataProducts.lineage(productId)
  );
  return data;
}

export interface DataProductConsumersResponse {
  product_id: string;
  subscribers: Array<Record<string, unknown>>;
  recent_readers: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Subscriber accounts + recent readers for a published product.
 * GET /data-products/{id}/consumers (data_products.py:1087, verified vs backend).
 */
export async function getDataProductConsumers(
  productId: string
): Promise<DataProductConsumersResponse> {
  const { data } = await apiClient.get<DataProductConsumersResponse>(
    API.dataProducts.consumers(productId)
  );
  return data;
}
