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
  // Reader Accounts & Shares
  ReaderAccountsResponse,
  CreateReaderAccountRequest,
  CreateReaderAccountResponse,
  SharesResponse,
  ShareDetailResponse,
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

// =============================================================================
// ACCOUNTS
// =============================================================================

/**
 * List all client accounts with optional filtering.
 */
export async function getAccounts(filters?: AccountFilters): Promise<AccountsListResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.edition) params.append('edition', filters.edition);
  if (filters?.cloud) params.append('cloud', filters.cloud);
  if (filters?.region) params.append('region', filters.region);
  if (filters?.search) params.append('search', filters.search);

  const queryString = params.toString();
  const url = queryString ? `${BASE_URL}/accounts?${queryString}` : `${BASE_URL}/accounts`;
  const { data } = await apiClient.get<AccountsListResponse>(url);
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

/**
 * Daily credit usage trend.
 */
export async function getCreditsTrend(days = 30): Promise<CreditTrendResponse> {
  const { data } = await apiClient.get<CreditTrendResponse>(`${BASE_URL}/credits/trend?days=${days}`);
  return data;
}

/**
 * Credit history for specific account.
 */
export async function getAccountCreditHistory(accountName: string, days = 30): Promise<AccountCreditHistoryResponse> {
  const { data } = await apiClient.get<AccountCreditHistoryResponse>(
    `${BASE_URL}/credits/${encodeURIComponent(accountName)}?days=${days}`
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
  const { data } = await apiClient.get<StorageResponse>(`${BASE_URL}/storage`, {
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
  const { data } = await apiClient.get<BalanceResponse>(`${BASE_URL}/balance`);
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
 * Current pricing rates per account.
 */
export async function getRateSheet(): Promise<RateSheetResponse> {
  const { data } = await apiClient.get<RateSheetResponse>(`${BASE_URL}/rate-sheet`);
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
 * Health score for specific account.
 */
export async function getAccountHealth(accountName: string): Promise<HealthScore> {
  const { data } = await apiClient.get<HealthScore>(
    `${BASE_URL}/health/${encodeURIComponent(accountName)}`
  );
  return data;
}

/**
 * Alerts for high usage, failed logins, inactive accounts.
 */
export async function getAlerts(days = 7): Promise<AlertsResponse> {
  const { data } = await apiClient.get<AlertsResponse>(`${BASE_URL}/alerts?days=${days}`);
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
  return data;
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
