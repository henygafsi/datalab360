/**
 * API functions for Organization Accounts
 * Uses axios-based apiClient for data fetching
 *
 * RECOMMENDED LOADING STRATEGY:
 * 1. getDashboardOverview()  (~1s)  - Instant page render
 * 2. getDashboardUsage()     (~2s)  - Credit/storage totals
 * 3. getDashboardTrends()    (~3s)  - Chart data
 * 4. getAlerts()             (~2s)  - Alert notifications
 */

import apiClient from '@/lib/api-client';
import type {
  // Dashboard
  DashboardOverviewResponse,
  DashboardUsageResponse,
  DashboardTrendsResponse,
  // Accounts
  AccountsListResponse,
  AccountDetailResponse,
  AccountFilters,
  // Credits
  CreditsResponse,
  TopConsumersResponse,
  CreditTrendResponse,
  AccountCreditHistoryResponse,
  // Storage
  StorageResponse,
  StorageTrendResponse,
  DatabaseStorageResponse,
  StageStorageResponse,
  // Warehouses
  WarehousesResponse,
  AccountWarehousesResponse,
  // Logins
  LoginsResponse,
  FailedLoginsResponse,
  AccountLoginHistoryResponse,
  // Queries
  QueriesResponse,
  QueryTrendResponse,
  // Data Transfer
  DataTransferResponse,
  // Balance & Billing
  BalanceResponse,
  ContractResponse,
  RateSheetResponse,
  // Metering
  MeteringResponse,
  MeteringTrendResponse,
  // Health
  HealthScore,
  HealthScoresResponse,
  // Alerts
  AlertsResponse,
  // Compute Services
  ClusteringResponse,
  MaterializedViewResponse,
  PipeResponse,
  SearchOptimizationResponse,
  QueryAccelerationResponse,
  // Replication & Anomalies
  ReplicationResponse,
  AnomalyResponse,
  AnomalyEntry,
  // Reader Accounts & Shares
  ReaderAccountsResponse,
  CreateReaderAccountRequest,
  CreateReaderAccountResponse,
  SharesResponse,
  ShareDetailResponse,
  // New: Account Overview enhanced tabs
  SecurityOverviewResponse,
  GovernanceOverviewResponse,
  DataLoadingOverviewResponse,
  AutomationOverviewResponse,
  PerformanceOverviewResponse,
  CortexCostsResponse,
  PlatformActivityResponse,
  AccountHealthScoreResponse,
  GrantsOverviewResponse,
  ProjectsOverviewResponse,
  GovernanceGrantsOverviewResponse,
  DataOperationsOverviewResponse,
  CommandCenterFilters,
  FilterOptionsResponse,
  // Snowflake Intelligence
  RowTimestampActivationResponse,
  RowTimestampStatusResponse,
  CrossAccountUsageResponse,
  QueryAuditResponse,
  AccessAuditResponse,
  LoginAuditResponse,
  // Org Summary
  OrgSummaryResponse,
  OrgSummaryParams,
} from './types';

const BASE_URL = '/org-accounts';

// =============================================================================
// DASHBOARD - OPTIMIZED ENDPOINTS
// =============================================================================

/**
 * **FAST** (~1s) - Accounts list and overview stats only.
 * Use this for instant page load.
 */
export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  const { data } = await apiClient.get<DashboardOverviewResponse>(`${BASE_URL}/dashboard/overview`);
  return data;
}

/**
 * **FAST** (~2s) - Combined credits and storage totals for dashboard cards.
 */
export async function getDashboardUsage(): Promise<DashboardUsageResponse> {
  const { data } = await apiClient.get<DashboardUsageResponse>(`${BASE_URL}/dashboard/usage`);
  return data;
}

/**
 * Trend data for charts (~3-5s). Load after page renders.
 */
export async function getDashboardTrends(days = 30): Promise<DashboardTrendsResponse> {
  const { data } = await apiClient.get<DashboardTrendsResponse>(`${BASE_URL}/dashboard/trends?days=${days}`);
  return data;
}

/**
 * List all client accounts in the Snowflake organization (optionally filtered).
 *
 * Backend: `GET /org-accounts/accounts` (queries
 * SNOWFLAKE.ORGANIZATION_USAGE.ACCOUNTS). On a NON org-level account the role
 * can't read that view, so the backend returns either an error envelope or an
 * empty `accounts` list — consumers (OrgAccountsTab / SnowflakeAccountsTab)
 * must treat an empty list as "not a Snowflake Organization account" and
 * degrade to an info/empty state rather than surfacing a hard error.
 */
export async function getAccounts(filters?: AccountFilters): Promise<AccountsListResponse> {
  const { data } = await apiClient.get<AccountsListResponse>(`${BASE_URL}/accounts`, {
    params: filters,
    timeout: 60000,
  });
  return data;
}

/**
 * Get detailed info for a specific account.
 */
export async function getAccountDetail(accountName: string): Promise<AccountDetailResponse> {
  const { data } = await apiClient.get<AccountDetailResponse>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}`
  );
  return data;
}

// =============================================================================
// ACCOUNT LIFECYCLE MUTATIONS
// =============================================================================
//
// G8 — orgadmin-only hard destructive endpoint. The backend route is
// `DELETE /org-accounts/accounts/{name}` (Snowflake `DROP ACCOUNT`, irreversible).
// All other lifecycle actions below are currently NOT wired on the backend.
// They are exposed as typed client functions so the UX can probe their
// existence and gracefully degrade to a "Backend Gap" surface when they
// 404 / 405. When the backend lands, no UI changes are needed — the menu
// items will simply stop being disabled.
//

export interface DropAccountResponse {
  success: boolean;
  account_name: string;
  message?: string;
  scheduled_deletion_time?: string | null;
}

/**
 * Hard-destructive drop of a client account.
 *
 * **orgadmin only** — gated server-side. UI must double-gate via the
 * `<ConfirmDestructiveDialog tier="nuclear">` flow (type-to-confirm,
 * mandatory reason, irreversible checkbox, 2s countdown).
 *
 * Snowflake `DROP ACCOUNT` is irreversible after the grace period;
 * the server is expected to enforce the grace window. We pass `reason`
 * to populate the org audit log.
 *
 * The backend requires explicit confirmation: it accepts either
 * `confirm_token == <account name>` or `confirm: true`. Sending `{ reason }`
 * alone returns 400. We send both — `confirm_token` (the canonical contract)
 * plus `confirm: true` as a belt-and-suspenders fallback.
 */
export async function dropAccount(
  accountName: string,
  reason?: string,
): Promise<DropAccountResponse> {
  const { data } = await apiClient.delete<DropAccountResponse>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}`,
    {
      data: {
        confirm_token: accountName,
        confirm: true,
        ...(reason ? { reason } : {}),
      },
    },
  );
  return data;
}

/* ------------------------------------------------------------------ */
/*  Lifecycle actions — Backend Gap (UX target endpoints)              */
/* ------------------------------------------------------------------ */
//
// These functions exist so the lifecycle menu can call them, but
// most resolve to a 404 today. The menu marks the corresponding items
// with a "(beta)" chip + disabled tooltip. The function bodies stay
// here so when the backend ships, only the disabled flag flips.
//

export interface CreateAccountRequest {
  account_name: string;
  cloud: 'AWS' | 'AZURE' | 'GCP';
  region: string;
  edition: 'STANDARD' | 'ENTERPRISE' | 'BUSINESS_CRITICAL';
  admin_name: string;
  admin_email: string;
  admin_username: string;
  admin_password?: string;
  generate_password?: boolean;
  comment?: string;
}

export interface CreateAccountResponse {
  success: boolean;
  account_name: string;
  account_url?: string;
  account_locator?: string;
  message?: string;
}

/** Backend-gap target: `POST /org-accounts/accounts`. */
export async function createAccount(
  payload: CreateAccountRequest,
): Promise<CreateAccountResponse> {
  const { data } = await apiClient.post<CreateAccountResponse>(
    `${BASE_URL}/accounts`,
    payload,
  );
  return data;
}

/** Backend-gap target: `POST /org-accounts/accounts/{name}/suspend`. */
export async function suspendAccount(
  accountName: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}/suspend`,
  );
  return data;
}

/** Backend-gap target: `POST /org-accounts/accounts/{name}/activate`. */
export async function activateAccount(
  accountName: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}/activate`,
  );
  return data;
}

/** Backend-gap target: `POST /org-accounts/accounts/{name}/reset-password`. */
export async function resetAccountPassword(
  accountName: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}/reset-password`,
  );
  return data;
}

/** Backend-gap target: `POST /org-accounts/accounts/{name}/rotate-keys`. */
export async function rotateAccountKeys(
  accountName: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}/rotate-keys`,
  );
  return data;
}

/** Backend-gap target: `PATCH /org-accounts/accounts/{name}/mfa`. */
export async function setAccountMfaEnforcement(
  accountName: string,
  enforce: boolean,
): Promise<{ success: boolean; mfa_enforced: boolean }> {
  const { data } = await apiClient.patch<{ success: boolean; mfa_enforced: boolean }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}/mfa`,
    { enforce },
  );
  return data;
}

/** Backend-gap target: `POST /org-accounts/accounts/{name}/transfer-ownership`. */
export async function transferAccountOwnership(
  accountName: string,
  newOwnerUsername: string,
): Promise<{ success: boolean; message?: string }> {
  const { data } = await apiClient.post<{ success: boolean; message?: string }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}/transfer-ownership`,
    { new_owner: newOwnerUsername },
  );
  return data;
}

/** Backend-gap target: `PATCH /org-accounts/accounts/{name}`. */
export async function updateAccount(
  accountName: string,
  patch: { new_name?: string; comment?: string },
): Promise<{ success: boolean; account_name: string }> {
  const { data } = await apiClient.patch<{ success: boolean; account_name: string }>(
    `${BASE_URL}/accounts/${encodeURIComponent(accountName)}`,
    patch,
  );
  return data;
}

// =============================================================================
// CREDITS
// =============================================================================

/**
 * Credit usage for all accounts with breakdown by service.
 */
export async function getCredits(days = 30): Promise<CreditsResponse> {
  const { data } = await apiClient.get<CreditsResponse>(`${BASE_URL}/credits?days=${days}`);
  return data;
}

/**
 * Top credit consuming accounts.
 */
export async function getTopConsumers(days = 30, limit = 10): Promise<TopConsumersResponse> {
  const { data } = await apiClient.get<TopConsumersResponse>(
    `${BASE_URL}/credits/top?days=${days}&limit=${limit}`
  );
  return data;
}
// =============================================================================
// STORAGE
// =============================================================================

/**
 * Storage usage for all accounts.
 * Uses extended timeout (60s) due to slow Snowflake queries.
 */
export async function getStorage(): Promise<StorageResponse> {
  const { data } = await apiClient.get<StorageResponse>(`${BASE_URL}/organization/storage`, {
    timeout: 60000,
  });
  return data;
}

/**
 * Daily storage trend.
 */
export async function getStorageTrend(days = 30): Promise<StorageTrendResponse> {
  const { data } = await apiClient.get<StorageTrendResponse>(`${BASE_URL}/storage/trend?days=${days}`);
  return data;
}

/**
 * Database-level storage breakdown (yesterday's snapshot).
 */
export async function getStorageDatabases(): Promise<DatabaseStorageResponse> {
  const { data } = await apiClient.get<DatabaseStorageResponse>(`${BASE_URL}/storage/databases`, {
    timeout: 60000,
  });
  return data;
}

/**
 * Stage storage per account (yesterday's snapshot).
 */
export async function getStorageStages(): Promise<StageStorageResponse> {
  const { data } = await apiClient.get<StageStorageResponse>(`${BASE_URL}/storage/stages`, {
    timeout: 60000,
  });
  return data;
}

// =============================================================================
// WAREHOUSES
// =============================================================================

/**
 * Warehouse usage across all accounts.
 * Uses extended timeout (60s) due to slow Snowflake queries.
 */
export async function getWarehouses(days = 30): Promise<WarehousesResponse> {
  const { data } = await apiClient.get<WarehousesResponse>(`${BASE_URL}/warehouses?days=${days}`, {
    timeout: 60000,
  });
  return data;
}

/**
 * Warehouse usage for specific account.
 */
export async function getAccountWarehouses(accountName: string, days = 30): Promise<AccountWarehousesResponse> {
  const { data } = await apiClient.get<AccountWarehousesResponse>(
    `${BASE_URL}/warehouses/${encodeURIComponent(accountName)}?days=${days}`
  );
  return data;
}

// -----------------------------------------------------------------------------
// WAREHOUSE MANAGEMENT MUTATIONS (connected-account scoped)
// -----------------------------------------------------------------------------
//
// These ALTER WAREHOUSE actions run against the CONNECTED account's session
// (the path carries only the warehouse name, not an account). They must only be
// surfaced for warehouses that belong to the connected account — applying them
// from the org-wide usage list could hit a same-named warehouse in the wrong
// account. The Warehouses tab sources these rows from getAccountWarehouses(
// connectedAccount), which returns live SHOW WAREHOUSES state, so every row is
// guaranteed local.

export interface WarehouseMutationResponse {
  success: boolean;
  warehouse?: string;
  size?: string;
  state?: string;
  auto_suspend?: number;
  message?: string;
}

/** POST /org-accounts/warehouses/{wh}/resize — ALTER WAREHOUSE SET WAREHOUSE_SIZE. */
export async function resizeWarehouse(warehouse: string, size: string): Promise<WarehouseMutationResponse> {
  const { data } = await apiClient.post<WarehouseMutationResponse>(
    `${BASE_URL}/warehouses/${encodeURIComponent(warehouse)}/resize`,
    { size },
    { timeout: 60000 }
  );
  return data;
}

/** PATCH /org-accounts/warehouses/{wh}/auto-suspend — set idle auto-suspend seconds. */
export async function setWarehouseAutoSuspend(warehouse: string, seconds: number): Promise<WarehouseMutationResponse> {
  const { data } = await apiClient.patch<WarehouseMutationResponse>(
    `${BASE_URL}/warehouses/${encodeURIComponent(warehouse)}/auto-suspend`,
    { seconds },
    { timeout: 60000 }
  );
  return data;
}

/** POST /org-accounts/warehouses/{wh}/suspend — ALTER WAREHOUSE SUSPEND. */
export async function suspendWarehouse(warehouse: string): Promise<WarehouseMutationResponse> {
  const { data } = await apiClient.post<WarehouseMutationResponse>(
    `${BASE_URL}/warehouses/${encodeURIComponent(warehouse)}/suspend`,
    null,
    { timeout: 60000 }
  );
  return data;
}

// =============================================================================
// LOGINS (Premium Views)
// =============================================================================

/**
 * Login activity summary (requires premium views).
 */
export async function getLogins(days = 30): Promise<LoginsResponse> {
  const { data } = await apiClient.get<LoginsResponse>(`${BASE_URL}/logins?days=${days}`);
  return data;
}

/**
 * Failed login attempts for security monitoring.
 */
export async function getFailedLogins(days = 7): Promise<FailedLoginsResponse> {
  const { data } = await apiClient.get<FailedLoginsResponse>(`${BASE_URL}/logins/failed?days=${days}`);
  return data;
}

/**
 * Login history for specific account.
 */
export async function getAccountLoginHistory(accountName: string, days = 7): Promise<AccountLoginHistoryResponse> {
  const { data } = await apiClient.get<AccountLoginHistoryResponse>(
    `${BASE_URL}/logins/${encodeURIComponent(accountName)}?days=${days}`
  );
  return data;
}

// =============================================================================
// QUERIES (Premium Views)
// =============================================================================

/**
 * Query metrics (requires premium views).
 */
export async function getQueries(days = 7): Promise<QueriesResponse> {
  const { data } = await apiClient.get<QueriesResponse>(`${BASE_URL}/queries?days=${days}`);
  return data;
}

/**
 * Daily query volume trend.
 */
export async function getQueriesTrend(days = 30): Promise<QueryTrendResponse> {
  const { data } = await apiClient.get<QueryTrendResponse>(`${BASE_URL}/queries/trend?days=${days}`);
  return data;
}

// =============================================================================
// DATA TRANSFER
// =============================================================================

/**
 * Data transfer usage (cross-region/cloud).
 * Uses extended timeout (60s) due to slow Snowflake queries.
 */
export async function getDataTransfer(days = 30): Promise<DataTransferResponse> {
  const { data } = await apiClient.get<DataTransferResponse>(`${BASE_URL}/data-transfer?days=${days}`, {
    timeout: 60000,
  });
  return data;
}

// =============================================================================
// BALANCE & BILLING
// =============================================================================

/**
 * Remaining credit balance.
 */
export async function getBalance(): Promise<BalanceResponse> {
  const { data } = await apiClient.get<BalanceResponse>(`${BASE_URL}/organization/remaining-balance`);
  return data;
}

/**
 * Contract items.
 */
export async function getContract(): Promise<ContractResponse> {
  const { data } = await apiClient.get<ContractResponse>(`${BASE_URL}/contract`);
  return data;
}

/**
 * Organization costs by account in currency (requires ORGADMIN).
 * Backend returns flat daily rows; consumer aggregates client-side.
 * Uses extended timeout (60s) — Snowflake USAGE_IN_CURRENCY_DAILY can be slow.
 */
export async function getOrganizationCosts(days = 30): Promise<any> {
  const { data } = await apiClient.get(`${BASE_URL}/organization/costs`, { params: { days }, timeout: 60000 });
  return data;
}

/**
 * Current pricing rates per account.
 */
export async function getRateSheet(): Promise<RateSheetResponse> {
  const { data } = await apiClient.get<RateSheetResponse>(`${BASE_URL}/rate-sheet`);
  return data;
}

// =============================================================================
// ORG SUMMARY
// =============================================================================

/**
 * Org activity rolled up role → module/project → account.
 * Backs the Account-overview "Org Summary" tab. Accepts a rolling window
 * (`days`) OR an explicit `from`/`to` range, plus optional filters
 * (role / module / account / username / project_id). Empty params are
 * stripped so the backend resolves its own defaults.
 *
 * NOTE: this route is NEW; deployments that predate it return 404 — callers
 * must render an honest "not available on this backend yet" state, never fake
 * data. The error is surfaced (not swallowed) so the caller can branch on it.
 */
export async function getOrgSummary(
  params: OrgSummaryParams = {}
): Promise<OrgSummaryResponse> {
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  const { data } = await apiClient.get<OrgSummaryResponse>(
    `${BASE_URL}/org-summary`,
    { params: clean }
  );
  return data;
}

// =============================================================================
// METERING
// =============================================================================

/**
 * Metering by account & service type.
 */
export async function getMetering(days = 30): Promise<MeteringResponse> {
  const { data } = await apiClient.get<MeteringResponse>(`${BASE_URL}/metering?days=${days}`);
  return data;
}

/**
 * Daily metering trend.
 */
export async function getMeteringTrend(days = 30): Promise<MeteringTrendResponse> {
  const { data } = await apiClient.get<MeteringTrendResponse>(`${BASE_URL}/metering/trend?days=${days}`);
  return data;
}

// =============================================================================
// HEALTH & ALERTS
// =============================================================================

/**
 * Health scores for all accounts (slow - makes multiple queries).
 * Uses extended timeout (60s) due to multiple Snowflake queries.
 */
export async function getHealth(): Promise<HealthScoresResponse> {
  const { data } = await apiClient.get<HealthScoresResponse>(`${BASE_URL}/health`, {
    timeout: 60000,
  });
  return data;
}
/**
 * Alerts for high usage, failed logins, inactive accounts.
 */
export async function getAlerts(days = 7): Promise<AlertsResponse> {
  const { data } = await apiClient.get<AlertsResponse>(`${BASE_URL}/alerts?days=${days}`);
  return data;
}

/**
 * Resource monitor configurations and usage.
 * Uses extended timeout (60s) since it queries SHOW RESOURCE MONITORS.
 */
export async function getResourceMonitors(): Promise<{ monitors: any[]; count: number }> {
  const { data } = await apiClient.get<{ monitors: any[]; count: number }>(
    `${BASE_URL}/resource-monitors`, { timeout: 60000 }
  );
  return data;
}

export interface CreateResourceMonitorRequest {
  name: string;
  credit_quota: number;
  frequency: string;
  suspend_at_pct: number;
}

export interface CreateResourceMonitorResponse {
  success: boolean;
  name: string;
  message?: string;
}

/**
 * Create a resource monitor.
 * POST /org-accounts/resource-monitors { name, credit_quota, frequency, suspend_at_pct }.
 *
 * NOTE: there is NO backend DELETE endpoint for resource monitors yet, so the
 * UI exposes create only — no drop control is rendered.
 */
export async function createResourceMonitor(
  request: CreateResourceMonitorRequest,
): Promise<CreateResourceMonitorResponse> {
  const { data } = await apiClient.post<CreateResourceMonitorResponse>(
    `${BASE_URL}/resource-monitors`, request, { timeout: 60000 }
  );
  return data;
}

// =============================================================================
// COMPUTE SERVICES
// =============================================================================

/**
 * Auto-clustering credits per account.
 */
export async function getServicesClustering(days = 30): Promise<ClusteringResponse> {
  const { data } = await apiClient.get<ClusteringResponse>(`${BASE_URL}/services/clustering?days=${days}`);
  return data;
}

/**
 * Materialized view refresh credits per account.
 */
export async function getServicesMaterializedViews(days = 30): Promise<MaterializedViewResponse> {
  const { data } = await apiClient.get<MaterializedViewResponse>(`${BASE_URL}/services/materialized-views?days=${days}`);
  return data;
}

/**
 * Snowpipe usage per account.
 */
export async function getServicesPipes(days = 30): Promise<PipeResponse> {
  const { data } = await apiClient.get<PipeResponse>(`${BASE_URL}/services/pipes?days=${days}`);
  return data;
}

/**
 * Search optimization credits per account.
 */
export async function getServicesSearchOptimization(days = 30): Promise<SearchOptimizationResponse> {
  const { data } = await apiClient.get<SearchOptimizationResponse>(`${BASE_URL}/services/search-optimization?days=${days}`);
  return data;
}

/**
 * Query acceleration credits per account.
 */
export async function getServicesQueryAcceleration(days = 30): Promise<QueryAccelerationResponse> {
  const { data } = await apiClient.get<QueryAccelerationResponse>(`${BASE_URL}/services/query-acceleration?days=${days}`);
  return data;
}

// =============================================================================
// REPLICATION & ANOMALIES
// =============================================================================

/**
 * Replication usage per account.
 */
export async function getReplication(days = 30): Promise<ReplicationResponse> {
  const { data } = await apiClient.get<ReplicationResponse>(`${BASE_URL}/replication?days=${days}`);
  return data;
}

/**
 * Cost anomalies detected.
 */
export async function getAnomalies(days = 30): Promise<AnomalyResponse> {
  const { data } = await apiClient.get<AnomalyResponse>(`${BASE_URL}/anomalies?days=${days}`);
  // Live backend emits {credits, mean_credits, usage_date} while the typed
  // contract says {actual_value, upper_bound, date}. Accept both vocabularies
  // at the service seam.
  const anomalies = (Array.isArray(data?.anomalies) ? data.anomalies : []).map((a) => {
    const raw = a as AnomalyEntry & { credits?: number; mean_credits?: number; usage_date?: string };
    return {
      ...raw,
      date: raw.date ?? raw.usage_date ?? '',
      actual_value: raw.actual_value ?? raw.credits ?? NaN,
      upper_bound: raw.upper_bound ?? raw.mean_credits ?? NaN,
    };
  });
  return { ...data, anomalies };
}

// =============================================================================
// READER ACCOUNTS & SHARES
// =============================================================================

/**
 * List reader accounts for data sharing.
 */
export async function getReaderAccounts(): Promise<ReaderAccountsResponse> {
  const { data } = await apiClient.get<ReaderAccountsResponse>(`${BASE_URL}/reader-accounts`);
  return data;
}

/**
 * Create reader account for data sharing.
 */
export async function createReaderAccount(request: CreateReaderAccountRequest): Promise<CreateReaderAccountResponse> {
  // TODO(henry-P1): method gap — FE sends POST /org-accounts/reader-accounts, backend only has GET
  const { data } = await apiClient.post<CreateReaderAccountResponse>(`${BASE_URL}/reader-accounts`, request);
  return data;
}

/**
 * Drop reader account.
 */
export async function deleteReaderAccount(name: string): Promise<{ success: boolean; message: string }> {
  const { data } = await apiClient.delete<{ success: boolean; message: string }>(
    `${BASE_URL}/reader-accounts/${encodeURIComponent(name)}`
  );
  return data;
}

/**
 * List all data shares.
 */
export async function getShares(): Promise<SharesResponse> {
  const { data } = await apiClient.get<SharesResponse>(`${BASE_URL}/shares`);
  return data;
}

/**
 * Get share details.
 */
export async function getShareDetail(shareName: string): Promise<ShareDetailResponse> {
  const { data } = await apiClient.get<ShareDetailResponse>(
    `${BASE_URL}/shares/${encodeURIComponent(shareName)}`
  );
  return data;
}

// =============================================================================
// ACCOUNT OVERVIEW - ENHANCED TABS
// =============================================================================

export async function getSecurityOverview(days = 30, filters?: Partial<CommandCenterFilters>): Promise<SecurityOverviewResponse> {
  const { data } = await apiClient.get<SecurityOverviewResponse>(
    `${BASE_URL}/security-overview`, { params: { days, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getGovernanceOverview(): Promise<GovernanceOverviewResponse> {
  const { data } = await apiClient.get<GovernanceOverviewResponse>(
    `${BASE_URL}/governance-overview`, { timeout: 60000 }
  );
  return data;
}

export async function getDataLoadingOverview(days = 30): Promise<DataLoadingOverviewResponse> {
  const { data } = await apiClient.get<DataLoadingOverviewResponse>(
    `${BASE_URL}/data-loading-overview`, { params: { days }, timeout: 60000 }
  );
  return data;
}

export async function getAutomationOverview(days = 30): Promise<AutomationOverviewResponse> {
  const { data } = await apiClient.get<AutomationOverviewResponse>(
    `${BASE_URL}/automation-overview`, { params: { days }, timeout: 60000 }
  );
  return data;
}

export async function getPerformanceOverview(days = 7, filters?: Partial<CommandCenterFilters>): Promise<PerformanceOverviewResponse> {
  const { data } = await apiClient.get<PerformanceOverviewResponse>(
    `${BASE_URL}/performance-overview`, { params: { days, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getCortexCosts(days = 30, filters?: Partial<CommandCenterFilters>): Promise<CortexCostsResponse> {
  const { data } = await apiClient.get<CortexCostsResponse>(
    `${BASE_URL}/cortex-costs`, { params: { days, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getPlatformActivity(days = 7): Promise<PlatformActivityResponse> {
  const { data } = await apiClient.get<PlatformActivityResponse>(
    `${BASE_URL}/platform-activity`, { params: { days }, timeout: 60000 }
  );
  return data;
}

export async function getAccountHealthScore(): Promise<AccountHealthScoreResponse> {
  const { data } = await apiClient.get<AccountHealthScoreResponse>(
    `${BASE_URL}/account-health-score`, { timeout: 60000 }
  );
  return data;
}

export async function getGrantsOverview(days = 90): Promise<GrantsOverviewResponse> {
  const { data } = await apiClient.get<GrantsOverviewResponse>(
    `${BASE_URL}/grants-overview`, { params: { days }, timeout: 60000 }
  );
  return data;
}

// =============================================================================
// MERGED / NEW ENDPOINTS (Tab Restructure)
// =============================================================================

export async function getProjectsOverview(
  filters?: Partial<CommandCenterFilters>,
): Promise<ProjectsOverviewResponse> {
  const { data } = await apiClient.get<ProjectsOverviewResponse>(
    `${BASE_URL}/projects-overview`, { params: { days: 180, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getGovernanceGrantsOverview(
  filters?: Partial<CommandCenterFilters>,
): Promise<GovernanceGrantsOverviewResponse> {
  const { data } = await apiClient.get<GovernanceGrantsOverviewResponse>(
    `${BASE_URL}/governance-grants-overview`, { params: { days: 180, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getDataOperationsOverview(
  filters?: Partial<CommandCenterFilters>,
): Promise<DataOperationsOverviewResponse> {
  const { data } = await apiClient.get<DataOperationsOverviewResponse>(
    `${BASE_URL}/data-operations-overview`, { params: { days: 180, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getPlatformActivityFiltered(
  filters?: Partial<CommandCenterFilters>,
): Promise<PlatformActivityResponse> {
  const { data } = await apiClient.get<PlatformActivityResponse>(
    `${BASE_URL}/platform-activity`, { params: { days: 7, ...filters }, timeout: 60000 }
  );
  return data;
}

export async function getFilterOptions(): Promise<FilterOptionsResponse> {
  const { data } = await apiClient.get<FilterOptionsResponse>(
    `${BASE_URL}/filter-options`, { timeout: 30000 }
  );
  return data;
}

// =============================================================================
// SNOWFLAKE INTELLIGENCE — Row Timestamps & Audit
// =============================================================================

export async function activateRowTimestamps(
  database: string,
): Promise<RowTimestampActivationResponse> {
  const { data } = await apiClient.post<RowTimestampActivationResponse>(
    `${BASE_URL}/row-timestamps/activate`, null, { params: { database }, timeout: 60000 }
  );
  return data;
}

export async function getRowTimestampStatus(
  database: string, schema?: string,
): Promise<RowTimestampStatusResponse> {
  const { data } = await apiClient.get<RowTimestampStatusResponse>(
    `${BASE_URL}/row-timestamps/status`, { params: { database, schema }, timeout: 30000 }
  );
  return data;
}

export async function getCrossAccountUsage(
  days: number = 30,
): Promise<CrossAccountUsageResponse> {
  const { data } = await apiClient.get<CrossAccountUsageResponse>(
    `${BASE_URL}/cross-account/usage`, { params: { days }, timeout: 60000 }
  );
  return data;
}

export async function getQueryAuditHistory(
  params?: { days?: number; username?: string; query_type?: string; min_duration_ms?: number; limit?: number },
): Promise<QueryAuditResponse> {
  const { data } = await apiClient.get<QueryAuditResponse>(
    `${BASE_URL}/audit/query-history`, { params: { days: 7, ...params }, timeout: 60000 }
  );
  return data;
}

export async function getAccessAuditHistory(
  params?: { days?: number; username?: string; object_name?: string; limit?: number },
): Promise<AccessAuditResponse> {
  const { data } = await apiClient.get<AccessAuditResponse>(
    `${BASE_URL}/audit/access-history`, { params: { days: 7, ...params }, timeout: 60000 }
  );
  return data;
}

export async function getLoginAuditHistory(
  params?: { days?: number; username?: string; is_success?: string; limit?: number },
): Promise<LoginAuditResponse> {
  const { data } = await apiClient.get<LoginAuditResponse>(
    `${BASE_URL}/audit/login-history`, { params: { days: 7, ...params }, timeout: 60000 }
  );
  return data;
}

// =============================================================================
// CREDITS — FORECAST & WAREHOUSE BREAKDOWN
// =============================================================================

/**
 * Credit usage forecast via linear regression on daily metering history.
 * Returns daily_avg, trend_direction, projected_30d_total, budget_at_risk,
 * history (date/credits array), and forecast (30 projected daily values).
 * Backend param is `days_back`, not `days`.
 */
export async function getCreditForecast(days = 90): Promise<any> {
  const { data } = await apiClient.get(`${BASE_URL}/credit-forecast`, {
    params: { days_back: days },
    timeout: 60000,
  });
  return data;
}

/**
 * Warehouse credit consumption per account from ORGANIZATION_USAGE.
 * Returns warehouses (rows with UPPERCASE Snowflake keys) and total (row count).
 */
export async function getWarehouseCredits(days = 30): Promise<any> {
  const { data } = await apiClient.get(`${BASE_URL}/organization/warehouse-credits`, {
    params: { days },
    timeout: 60000,
  });
  return data;
}

// =============================================================================
// PLATFORM EVENTS, USAGE ANALYTICS, RESOURCE MONITORS
// =============================================================================

/**
 * Platform events audit trail.
 * Returns { events, total, page, page_size, total_pages }.
 * Each event: EVENT_ID, PROJECT_ID, MODULE_NAME, EVENT_TYPE,
 * ENTITY_TYPE, ENTITY_ID, USERNAME, STATUS, DETAILS, CREATED_AT.
 */
export async function getOrgEvents(days = 7): Promise<any> {
  const { data } = await apiClient.get(`${BASE_URL}/events`, { params: { days }, timeout: 60000 });
  return data;
}

/**
 * Usage analytics breakdown.
 * Returns { top_queries_by_credits, top_users_by_credits,
 *           warehouse_utilization, storage_growth_trend, days }.
 */
export async function getUsageAnalytics(days = 30): Promise<any> {
  const { data } = await apiClient.get(`${BASE_URL}/usage-analytics`, { params: { days }, timeout: 60000 });
  return data;
}

// =============================================================================
// CREDIT TREND + PER-ACCOUNT CREDIT/HEALTH HISTORY
// Consumed by credits-tab + the command-center tabs. Wired to routes shipped
// under /org-accounts/{credits/trend,health/{name}}. (getAccounts lives above.)
// =============================================================================

/** GET /org-accounts/credits/trend — daily org credit trend. */
export async function getCreditsTrend(days = 30): Promise<CreditTrendResponse> {
  const { data } = await apiClient.get<CreditTrendResponse>(`${BASE_URL}/credits/trend?days=${days}`);
  return data;
}

/**
 * GET /org-accounts/credits/history/{account_name} — per-account daily credit
 * history. Sourced server-side from ORGANIZATION_USAGE.USAGE_IN_CURRENCY_DAILY
 * filtered to the account; returns the AccountCreditHistoryResponse shape
 * (history is CreditTrendPoint[], one row per day).
 */
export async function getAccountCreditHistory(accountName: string, days = 30): Promise<AccountCreditHistoryResponse> {
  const { data } = await apiClient.get<AccountCreditHistoryResponse>(
    `${BASE_URL}/credits/history/${encodeURIComponent(accountName)}?days=${days}`
  );
  return data;
}

/** GET /org-accounts/health/{account_name} — per-account health detail. */
export async function getAccountHealth(accountName: string): Promise<AccountHealthScoreResponse> {
  const { data } = await apiClient.get<AccountHealthScoreResponse>(`${BASE_URL}/health/${encodeURIComponent(accountName)}`);
  return data;
}

// ---------------------------------------------------------------------------
// Errors deep-dive + COCO narrative (GET /org-accounts/errors-overview[/insight])
// ---------------------------------------------------------------------------

export interface ErrorsOverviewResponse {
  period_days: number;
  scope: 'org' | 'account';
  summary: {
    accounts_with_errors: number;
    total_failed_queries: number;
    distinct_error_codes: number;
    total_failed_logins: number;
  };
  top_errors: Array<{
    error_code: string;
    sample_message: string;
    occurrences: number;
    accounts_affected: number;
    users_affected: number;
    last_seen: string | null;
  }>;
  per_account: Array<{ account_name: string; failed_queries: number; fail_rate_pct: number }>;
  login_failures: Array<{ account_name: string; failed_logins: number; users: number; ips: number }>;
}

export interface ErrorsInsightResponse {
  period_days: number;
  scope: 'org' | 'account';
  /** null when Cortex is unavailable — never a fabricated summary. */
  narrative: string | null;
  model: string;
  basis: Record<string, unknown>;
  degraded_reason: string | null;
}

export async function getErrorsOverview(days = 7): Promise<ErrorsOverviewResponse> {
  const { data } = await apiClient.get<ErrorsOverviewResponse>(
    `${BASE_URL}/errors-overview`, { params: { days }, timeout: 120000 },
  );
  return data;
}

export async function getErrorsInsight(days = 7): Promise<ErrorsInsightResponse> {
  // Cortex inference: allow a generous budget, the endpoint caches for 15 min.
  const { data } = await apiClient.get<ErrorsInsightResponse>(
    `${BASE_URL}/errors-overview/insight`, { params: { days }, timeout: 180000 },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Platform-activity COCO digest (GET /org-accounts/platform-activity/insight)
// ---------------------------------------------------------------------------

/** One EVENT_STORE module rollup inside the digest's auditable basis. */
export interface ActivityInsightModule {
  module: string;
  events: number;
  failed: number;
  users: number;
}

export interface ActivityInsightResponse {
  period_hours: number;
  /** null when Cortex is unavailable — never a fabricated digest. */
  narrative: string | null;
  model: string;
  /** The exact rows COCO read — rendered as evidence next to the narrative. */
  basis: {
    window_hours: number;
    modules: ActivityInsightModule[];
    top_event_types: Array<{ type: string; count: number }>;
    recent_failures: Array<{ type: string; user: string; at: string; detail: string }>;
  };
  degraded_reason: string | null;
  execution_time_ms: number;
}

export async function getPlatformActivityInsight(): Promise<ActivityInsightResponse> {
  // Cortex inference: a cold call can take ~20s; the endpoint caches for 15 min.
  const { data } = await apiClient.get<ActivityInsightResponse>(
    `${BASE_URL}/platform-activity/insight`, { timeout: 180000 },
  );
  return data;
}
