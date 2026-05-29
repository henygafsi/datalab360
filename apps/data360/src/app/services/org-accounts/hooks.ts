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
  DashboardCreditsResponse,
  DashboardStorageResponse,
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
  // Balance
  BalanceResponse,
  // Health
  HealthScore,
  HealthScoresResponse,
  // Alerts
  AlertsResponse,
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
// HEALTH & ALERTS
// =============================================================================

/**
 * Health scores for all accounts (slow - makes multiple queries).
 * Uses extended timeout (60s) due to multiple Snowflake queries.
 */
export async function getHealth(): Promise<HealthScoresResponse> {
  const { data } = await apiClient.get<HealthScoresResponse>(`${BASE_URL}/health`, {
    timeout: 60000, // 60 seconds for this slow endpoint
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