/**
 * Types for Organization Accounts API
 * Client account monitoring dashboard for Snowflake organizations
 */

// =============================================================================
// CLIENT ACCOUNTS
// =============================================================================

export interface ClientAccount {
  account_name: string;
  account_locator: string;
  organization_name: string;
  region: string;
  region_group: string;
  cloud: 'AWS' | 'AZURE' | 'GCP';
  edition: 'STANDARD' | 'ENTERPRISE' | 'BUSINESS_CRITICAL';
  account_url: string;
  created_on: string;
  comment: string | null;
  dropped_on: string | null;
  scheduled_deletion_time: string | null;
  is_org_admin: boolean;
  is_events_account: boolean;
  is_active: boolean;
}

// =============================================================================
// DASHBOARD OVERVIEW (Step 1 - Fast ~1s)
// =============================================================================

export interface DashboardOverviewResponse {
  overview: {
    organization_name: string;
    total_client_accounts: number;
    active_accounts: number;
    inactive_accounts: number;
    suspended_accounts: number;
    accounts_by_region: Record<string, number>;
    accounts_by_edition: Record<string, number>;
    accounts_by_cloud: Record<string, number>;
  };
  accounts: ClientAccount[];
  generated_at: string;
  execution_time_ms: number;
}

// =============================================================================
// DASHBOARD USAGE (Credits + Storage combined)
// =============================================================================

export interface DashboardUsageResponse {
  total_credits_30d: number;
  credit_account_count: number;
  total_storage_bytes: number;
  total_storage_tb: number;
  storage_account_count: number;
  generated_at: string;
  credits_error: string | null;
  storage_error: string | null;
}

// Legacy separate types (deprecated - use DashboardUsageResponse)
export interface DashboardCreditsResponse {
  period_days: number;
  total_credits: number;
  account_count: number;
  generated_at: string;
  execution_time_ms: number;
}

export interface DashboardStorageResponse {
  total_bytes: number;
  total_tb: number;
  account_count: number;
  generated_at: string;
  execution_time_ms: number;
}

// =============================================================================
// DASHBOARD TRENDS (Step 2b - ~3-5s)
// =============================================================================

export interface CreditTrendPoint {
  usage_date: string;
  total_credits: number;
  active_accounts: number;
}

export interface StorageTrendPoint {
  usage_date: string;
  total_bytes: number;
  total_tb: number;
  total_credits: number;
  account_count: number;
}

export interface QueryTrendPoint {
  query_date: string;
  query_count: number;
  active_accounts: number;
  active_users: number;
  avg_execution_time: number;
}

export interface DashboardTrendsResponse {
  credits: CreditTrendPoint[];
  storage: StorageTrendPoint[];
  queries: QueryTrendPoint[];
  period_days: number;
  generated_at: string;
  execution_time_ms: number;
}

// =============================================================================
// CREDITS
// =============================================================================

export interface AccountCredit {
  account_name: string;
  account_locator: string;
  region: string;
  total_credits: number;
  compute_credits: number;
  cloud_services_credits: number;
  by_service: Record<string, number>;
}

export interface CreditsResponse {
  period_days: number;
  total_credits: number;
  accounts: AccountCredit[];
  account_count: number;
  execution_time_ms: number;
}

// =============================================================================
// STORAGE
// =============================================================================

export interface AccountStorage {
  account_name: string;
  account_locator: string;
  region: string;
  total_bytes: number;
  storage_credits: number;
  by_type: Record<string, number>;
  total_tb: number;
}

export interface StorageResponse {
  total_storage_bytes: number;
  total_storage_tb: number;
  accounts: AccountStorage[];
  account_count: number;
  execution_time_ms: number;
}

// =============================================================================
// ALERTS
// =============================================================================

export type AlertType = 'warning' | 'critical' | 'info' | 'security';

export interface Alert {
  account_name: string;
  alert_type: AlertType;
  title: string;
  message: string;
  metric_value: number;
  threshold: number;
  timestamp: string;
}

export interface AlertsResponse {
  period_days: number;
  alerts: Alert[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// HEALTH
// =============================================================================

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface HealthScore {
  account_name: string;
  overall_score: number;
  status: HealthStatus;
  cost_score: number;
  activity_score: number;
  security_score: number;
  issues: string[];
  recommendations: string[];
  last_assessed: string;
}

export interface HealthResponse {
  accounts: HealthScore[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// LOGINS
// =============================================================================

export interface AccountLogins {
  account_name: string;
  unique_users: number;
  total_logins: number;
  successful_logins: number;
  failed_logins: number;
  first_login: string;
  last_login: string;
}

export interface LoginsResponse {
  period_days: number;
  accounts: AccountLogins[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// QUERIES
// =============================================================================

export interface AccountQueries {
  account_name: string;
  query_count: number;
  unique_users: number;
  avg_execution_time_ms: number;
  max_execution_time_ms: number;
  total_bytes_scanned: number;
  total_rows_produced: number;
}

export interface QueriesResponse {
  period_days: number;
  total_queries: number;
  accounts: AccountQueries[];
  account_count: number;
  execution_time_ms: number;
}

// =============================================================================
// WAREHOUSES
// =============================================================================

export interface Warehouse {
  account_name?: string; // Optional - not present in aggregated endpoint
  warehouse_name: string;
  total_credits: number;
  compute_credits: number;
  cloud_credits: number;
  metering_hours: number;
}

export interface WarehousesResponse {
  period_days: number;
  warehouses: Warehouse[];
  execution_time_ms: number;
}

// =============================================================================
// BALANCE
// =============================================================================

export interface BalanceResponse {
  organization_name: string;
  contract_number: string;
  date: string;
  currency: string;
  free_credits_remaining: number;
  capacity_balance: number;
  on_demand_consumption: number;
  rollover_balance: number;
  execution_time_ms: number;
}

// =============================================================================
// ACCOUNT DETAIL
// =============================================================================

export interface AccountDetailResponse {
  account: ClientAccount;
  credits: AccountCredit | null;
  storage: AccountStorage | null;
  logins: AccountLogins | null;
  queries: AccountQueries | null;
  warehouses: Warehouse[];
  health: HealthScore | null;
  alerts: Alert[];
  execution_time_ms: number;
}

// =============================================================================
// FILTER PARAMS
// =============================================================================

export interface AccountFilters {
  status?: 'active' | 'inactive' | 'suspended';
  edition?: 'STANDARD' | 'ENTERPRISE' | 'BUSINESS_CRITICAL';
  cloud?: 'AWS' | 'AZURE' | 'GCP';
  region?: string;
  search?: string;
}

export type DateRange = '7d' | '30d' | '90d';

// Type aliases for backwards compatibility with chart components
export type CreditTrend = CreditTrendPoint;
export type StorageTrend = StorageTrendPoint;
export type QueryTrend = QueryTrendPoint;

// =============================================================================
// ACCOUNTS LIST RESPONSE
// =============================================================================

export interface AccountsListResponse {
  accounts: ClientAccount[];
  count: number;
  filters_applied: AccountFilters;
  execution_time_ms: number;
}

// =============================================================================
// CREDITS ADDITIONAL ENDPOINTS
// =============================================================================

export interface TopConsumer {
  account_name: string;
  total_credits: number;
  rank?: number;
}

export interface TopConsumersResponse {
  period_days: number;
  top_consumers: TopConsumer[];
  count: number;
  execution_time_ms: number;
}

export interface CreditTrendResponse {
  period_days: number;
  trend: CreditTrendPoint[];
  data_points: number;
  execution_time_ms: number;
}

export interface AccountCreditHistoryResponse {
  account_name: string;
  period_days: number;
  history: CreditTrendPoint[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// STORAGE ADDITIONAL ENDPOINTS
// =============================================================================

export interface StorageTrendResponse {
  period_days: number;
  trend: StorageTrendPoint[];
  data_points: number;
  execution_time_ms: number;
}

// =============================================================================
// WAREHOUSES ADDITIONAL ENDPOINTS
// =============================================================================

export interface AccountWarehousesResponse {
  account_name: string;
  period_days: number;
  warehouses: Warehouse[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// LOGINS ADDITIONAL ENDPOINTS
// =============================================================================

export interface FailedLogin {
  account_name: string;
  user_name: string;
  client_ip: string;
  error_code: string;
  error_message: string;
  event_timestamp: string;
}

export interface FailedLoginsResponse {
  period_days: number;
  failed_logins: FailedLogin[];
  count: number;
  execution_time_ms: number;
}

export interface LoginEvent {
  user_name: string;
  client_ip: string;
  is_success: boolean;
  error_message: string | null;
  event_timestamp: string;
}

export interface AccountLoginHistoryResponse {
  account_name: string;
  period_days: number;
  logins: LoginEvent[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// QUERIES ADDITIONAL ENDPOINTS
// =============================================================================

export interface QueryTrendResponse {
  period_days: number;
  trend: QueryTrendPoint[];
  data_points: number;
  execution_time_ms: number;
}

// =============================================================================
// DATA TRANSFER
// =============================================================================

export interface DataTransferUsage {
  account_name: string;
  account_locator: string;
  target_cloud: string;
  target_region: string;
  transfer_type: string;
  usage_date: string;
  total_bytes: number;
  total_tb: number;
}

export interface DataTransferResponse {
  usage_days: number;
  total_bytes: number;
  total_tb: number;
  transfers: DataTransferUsage[];
  execution_time_ms: number;
}

// =============================================================================
// READER ACCOUNTS & SHARES
// =============================================================================

export interface ReaderAccount {
  name: string;
  cloud: string;
  region: string;
  created_on: string;
  comment: string | null;
}

export interface ReaderAccountsResponse {
  reader_accounts: ReaderAccount[];
  count: number;
  execution_time_ms: number;
}

export interface CreateReaderAccountRequest {
  name: string;
  admin_name: string;
  admin_password: string;
  comment?: string;
}

export interface CreateReaderAccountResponse {
  success: boolean;
  name: string;
  message: string;
  execution_time_ms: number;
}

export interface Share {
  name: string;
  database_name: string;
  owner: string;
  kind: string;
  created_on: string;
  comment: string | null;
}

export interface SharesResponse {
  shares: Share[];
  count: number;
  execution_time_ms: number;
}

export interface ShareConsumer {
  consumer_account: string;
  consumer_region: string;
  consumer_name: string;
}

export interface ShareDetailResponse {
  share: Share;
  consumers: ShareConsumer[];
  objects: string[];
  execution_time_ms: number;
}

// =============================================================================
// HEALTH ADDITIONAL ENDPOINTS
// =============================================================================

export interface HealthScoresResponse {
  health_scores: HealthScore[];
  count: number;
  execution_time_ms: number;
}
