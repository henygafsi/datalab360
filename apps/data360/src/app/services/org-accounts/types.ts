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
  deleted_on: string | null;
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
    organization_name?: string;
    total_client_accounts: number;
    active_accounts: number;
    inactive_accounts: number;
    suspended_accounts?: number;
    accounts_by_region: Record<string, number>;
    accounts_by_edition: Record<string, number>;
    accounts_by_cloud: Record<string, number>;
    total_credits_30d?: number;
    credits_prev_30d?: number;
    credits_trend_pct?: number | null;
    total_storage_bytes?: number;
    replication_groups_count?: number;
    failover_groups_count?: number;
    managed_accounts_count?: number;
    network_policies_count?: number;
    org_admin_available?: boolean;
  };
  accounts?: ClientAccount[];
  generated_at: string;
  execution_time_ms?: number;
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
  queries?: QueryTrendPoint[];
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
  region?: string;
  total_bytes: number;
  storage_credits: number;
  by_type?: Record<string, number>;
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
  activity_score?: number;
  security_score?: number;
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
  source_cloud: string;
  source_region: string;
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

// =============================================================================
// DATABASE STORAGE (/storage/databases)
// =============================================================================

export interface DatabaseStorage {
  account_name: string;
  database_name: string;
  database_bytes: number;
  failsafe_bytes: number;
  database_tb: number;
}

export interface DatabaseStorageResponse {
  databases: DatabaseStorage[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// STAGE STORAGE (/storage/stages)
// =============================================================================

export interface StageStorage {
  account_name: string;
  stage_bytes: number;
  stage_tb: number;
}

export interface StageStorageResponse {
  stages: StageStorage[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// CONTRACT (/contract)
// =============================================================================

export interface ContractItem {
  organization_name: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  expiration_date: string;
  contract_item: string;
  currency: string;
  amount: number;
  contract_modified_date: string;
}

export interface ContractResponse {
  contracts: ContractItem[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// RATE SHEET (/rate-sheet)
// =============================================================================

export interface RateSheetEntry {
  account_name: string;
  account_locator: string;
  region: string;
  service_level: string;
  usage_type: string;
  service_type: string;
  currency: string;
  effective_rate: number;
  rating_type: string;
  billing_type: string;
  is_adjustment: boolean;
}

export interface RateSheetResponse {
  rates: RateSheetEntry[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// METERING (/metering)
// =============================================================================

export interface MeteringEntry {
  account_name: string;
  service_type: string;
  compute_credits: number;
  cloud_services_credits: number;
  total_credits: number;
  cloud_adjustment: number;
  total_billed: number;
}

export interface MeteringResponse {
  period_days: number;
  metering: MeteringEntry[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// METERING TREND (/metering/trend)
// =============================================================================

export interface MeteringTrendPoint {
  usage_date: string;
  compute_credits: number;
  cloud_services_credits: number;
  total_credits: number;
  total_billed: number;
  account_count: number;
}

export interface MeteringTrendResponse {
  period_days: number;
  trend: MeteringTrendPoint[];
  data_points: number;
  execution_time_ms: number;
}

// =============================================================================
// COMPUTE SERVICES
// =============================================================================

// /services/clustering
export interface ClusteringEntry {
  account_name: string;
  total_credits: number;
  bytes_reclustered: number;
  rows_reclustered: number;
}

export interface ClusteringResponse {
  period_days: number;
  clustering: ClusteringEntry[];
  count: number;
  execution_time_ms: number;
}

// /services/materialized-views
export interface MaterializedViewEntry {
  account_name: string;
  total_credits: number;
}

export interface MaterializedViewResponse {
  period_days: number;
  materialized_views: MaterializedViewEntry[];
  count: number;
  execution_time_ms: number;
}

// /services/pipes
export interface PipeEntry {
  account_name: string;
  total_credits: number;
  total_bytes_inserted: number;
  total_files_inserted: number;
}

export interface PipeResponse {
  period_days: number;
  pipes: PipeEntry[];
  count: number;
  execution_time_ms: number;
}

// /services/search-optimization
export interface SearchOptimizationEntry {
  account_name: string;
  total_credits: number;
}

export interface SearchOptimizationResponse {
  period_days: number;
  search_optimization: SearchOptimizationEntry[];
  count: number;
  execution_time_ms: number;
}

// /services/query-acceleration
export interface QueryAccelerationEntry {
  account_name: string;
  total_credits: number;
}

export interface QueryAccelerationResponse {
  period_days: number;
  query_acceleration: QueryAccelerationEntry[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// REPLICATION (/replication)
// =============================================================================

export interface ReplicationEntry {
  account_name: string;
  total_credits: number;
  total_bytes_transferred: number;
}

export interface ReplicationResponse {
  period_days: number;
  replication: ReplicationEntry[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// ANOMALIES (/anomalies)
// =============================================================================

export interface AnomalyEntry {
  date: string;
  account_name: string;
  account_locator: string;
  region: string;
  actual_value: number;
  currency: string;
  upper_bound: number;
  lower_bound: number;
  forecasted_value: number;
}

export interface AnomalyResponse {
  period_days: number;
  anomalies: AnomalyEntry[];
  count: number;
  execution_time_ms: number;
}

// =============================================================================
// SECURITY OVERVIEW (/security-overview)
// =============================================================================

export interface SecurityOverviewResponse {
  period_days: number;
  login_summary: { event_type: string; is_success: string; event_count: number; unique_users: number }[];
  login_trend: { date: string; success: number; failure: number; total: number }[];
  failed_logins: { user_name: string; failure_count: number; last_failure: string; last_error: string }[];
  client_types: { client_type: string; login_count: number; unique_users: number }[];
  mfa_coverage: { total_users: number; mfa_enabled: number; disabled_users: number; mfa_percentage: number };
  network_policies: { name: string; created_on: string; comment: string }[];
  network_policy_count: number;
  execution_time_ms: number;
}

// =============================================================================
// GOVERNANCE OVERVIEW (/governance-overview)
// =============================================================================

export interface GovernanceOverviewResponse {
  policy_coverage: { policy_kind: string; policy_count: number; unique_policies: number; objects_covered: number }[];
  tag_usage: { tag_name: string; tag_schema: string; tag_database: string; object_type: string; tag_count: number }[];
  role_count: number;
  grant_summary: { privilege: string; granted_on: string; grant_count: number }[];
  policies: { masking: number; row_access: number; aggregation: number; total: number };
  audit_log: { entity_type: string; entity_name: string; action: string; target_type: string; target_name: string; performed_by: string; performed_at: string }[];
  execution_time_ms: number;
}

// =============================================================================
// DATA LOADING OVERVIEW (/data-loading-overview)
// =============================================================================

export interface DataLoadingOverviewResponse {
  period_days: number;
  summary: { total_files: number; total_rows: number; total_bytes: number; total_errors: number; success_rate: number };
  daily_volume: { date: string; file_count: number; total_rows: number; total_bytes: number; errors: number; success: number; failure: number }[];
  recent_loads: { database: string; schema: string; table: string; file: string; status: string; rows: number; size_bytes: number; errors: number; error_message: string; load_time: string }[];
  pipe_activity: { pipe_name: string; credits: number; bytes_inserted: number; files_inserted: number; start_time: string }[];
  loading_errors: { table: string; file: string; error_count: number; error_message: string; status: string; load_time: string }[];
  pipe_count: number;
  execution_time_ms: number;
}

// =============================================================================
// AUTOMATION OVERVIEW (/automation-overview)
// =============================================================================

export interface AutomationOverviewResponse {
  period_days: number;
  summary: { total_runs: number; success_count: number; failure_count: number; success_rate: number; active_tasks: number; dynamic_tables: number };
  task_daily: { date: string; total: number; success: number; failure: number; skipped: number; avg_duration: number }[];
  recent_tasks: { task_name: string; database: string; schema: string; state: string; error_code: string; error_message: string; scheduled_time: string; completed_time: string; duration_seconds: number }[];
  active_tasks: { name: string; database: string; schema: string; state: string; schedule: string; warehouse: string }[];
  serverless_credits: { date: string; credits: number }[];
  dynamic_tables: { name: string; database: string; schema: string; target_lag: string; refresh_mode: string }[];
  execution_time_ms: number;
}

// =============================================================================
// PERFORMANCE OVERVIEW (/performance-overview)
// =============================================================================

export interface PerformanceOverviewResponse {
  period_days: number;
  query_performance: { date: string; query_count: number; p50_ms: number; p95_ms: number; p99_ms: number; avg_compile_ms: number; avg_exec_ms: number; avg_queue_ms: number; bytes_scanned: number }[];
  slow_queries: { query_id: string; query_text: string; user: string; warehouse: string; duration_ms: number; compile_ms: number; exec_ms: number; queue_ms: number; bytes_scanned: number; start_time: string }[];
  query_types: { type: string; count: number; avg_duration_ms: number; total_credits: number }[];
  clustering: { date: string; table: string; credits: number; bytes_reclustered: number }[];
  search_optimization: { date: string; credits: number; bytes_persisted: number }[];
  mv_refresh: { date: string; table: string; credits: number }[];
  execution_time_ms: number;
}

// =============================================================================
// CORTEX / AI COSTS (/cortex-costs)
// =============================================================================

export interface CortexCostsResponse {
  period_days: number;
  summary: { ai_credits: number; ml_compute_credits: number; total_credits: number };
  daily_costs: { date: string; service_type: string; credits: number; tokens: number; requests: number }[];
  ml_compute: { date: string; credits: number }[];
  execution_time_ms: number;
}

// =============================================================================
// PLATFORM ACTIVITY (/platform-activity)
// =============================================================================

export interface PlatformActivityResponse {
  period_days: number;
  event_activity: { date: string; event_type: string; count: number }[];
  module_usage: { module: string; action: string; count: number; unique_users: number }[];
  user_sessions: { date: string; sessions: number; unique_users: number }[];
  recent_audit: { entity_type: string; entity_name: string; action: string; target_type: string; target_name: string; performed_by: string; performed_at: string }[];
  governance_stats: { roles: number; permissions: number; module_grants: number };
  execution_time_ms: number;
}

// =============================================================================
// ACCOUNT HEALTH SCORE (/account-health-score)
// =============================================================================

export interface AccountHealthScoreResponse {
  health_score: number;
  max_score: number;
  grade: string;
  breakdown: { security: number; governance: number; performance: number; cost_efficiency: number };
  details: { total_users: number; mfa_coverage_pct: number; total_policies: number; total_roles: number; total_warehouses: number };
  execution_time_ms: number;
}

// =============================================================================
// GRANTS OVERVIEW (/grants-overview)
// =============================================================================

export interface GrantsOverviewResponse {
  period_days: number;
  summary: {
    total_role_grants: number;
    total_user_role_mappings: number;
    roles_with_grants: number;
    users_with_roles: number;
    unique_privileges: number;
    object_types_covered: number;
  };
  privilege_distribution: { privilege: string; object_type: string; grant_count: number; role_count: number }[];
  role_grant_distribution: { role_name: string; total_grants: number; unique_privileges: number; object_type_count: number; database_count: number }[];
  user_role_distribution: { user_name: string; role_count: number; roles: string }[];
  object_coverage: { object_type: string; grant_count: number; role_count: number; object_count: number }[];
  recent_changes: { role_name: string; privilege: string; object_type: string; object_name: string; action: string; created_on: string; deleted_on: string }[];
  recent_role_grants: { role_name: string; privilege: string; object_type: string; object_name: string; database: string; schema: string; grant_option: string; granted_on: string }[];
  user_role_mappings: { user_name: string; role_name: string; granted_by: string; granted_on: string }[];
  execution_time_ms: number;
}

// ─── Projects & Deployments Overview ─────────────────────────────────────────

export interface ProjectsOverviewResponse {
  period_days: number;
  summary: {
    total_projects: number;
    by_type: Record<string, number>;
    by_status: Record<string, number>;
    deployments_period: number;
    deployment_success_rate: number;
    pending_approvals: number;
    failed_deployments: number;
    unique_members: number;
  };
  project_distribution: { type: string; status: string; count: number }[];
  deployment_status: { status: string; count: number }[];
  execution_daily: { date: string; total: number; success: number; failed: number; avg_duration: number; steps_executed: number; steps_failed: number }[];
  recent_deployments: {
    deployment_id: string; project_id: string; project_name: string; project_type: string;
    status: string; deployment_type: string; environment: string;
    requested_by: string; requested_at: string;
    approved_by: string; approved_at: string;
    deployed_by: string; deployed_at: string;
    rejected_by: string; rejection_reason: string;
    error_message: string; retry_count: number;
  }[];
  pending_approvals: {
    deployment_id: string; project_id: string; project_name: string; project_type: string;
    requested_by: string; requested_at: string; environment: string;
  }[];
  members: {
    username: string; role: string; project_id: string;
    project_name: string; project_type: string;
    added_by: string; added_at: string;
  }[];
  member_roles: { role: string; user_count: number; project_count: number }[];
  top_contributors: { username: string; role: string; project_count: number }[];
  execution_time_ms: number;
}

// ─── Governance & Grants Overview (merged) ───────────────────────────────────

export interface GovernanceGrantsOverviewResponse {
  period_days: number;
  summary: {
    role_count: number;
    total_policies: number;
    masking_policies: number;
    rls_policies: number;
    aggregation_policies: number;
    total_tags: number;
    total_role_grants: number;
    users_with_roles: number;
    object_types_covered: number;
  };
  policy_coverage: { policy_kind: string; policy_count: number; unique_policies: number; objects_covered: number }[];
  tag_usage: { tag_name: string; tag_schema: string; tag_database: string; object_type: string; tag_count: number }[];
  privilege_distribution: { privilege: string; object_type: string; grant_count: number; role_count: number }[];
  role_grant_distribution: { role_name: string; total_grants: number; unique_privileges: number; object_type_count: number; database_count: number }[];
  user_role_distribution: { user_name: string; role_count: number; roles: string }[];
  object_coverage: { object_type: string; grant_count: number; role_count: number; object_count: number }[];
  recent_changes: { role_name: string; privilege: string; object_type: string; object_name: string; action: string; created_on: string; deleted_on: string }[];
  audit_log: { entity_type: string; entity_name: string; action: string; target_type: string; target_name: string; performed_by: string; performed_at: string }[];
  execution_time_ms: number;
}

// ─── Data Operations Overview (merged) ───────────────────────────────────────

export interface DataOperationsOverviewResponse {
  period_days: number;
  summary: {
    total_files_loaded: number;
    total_rows_loaded: number;
    total_bytes_loaded: number;
    load_error_count: number;
    load_success_rate: number;
    pipe_count: number;
    total_task_runs: number;
    task_success_count: number;
    task_failure_count: number;
    task_success_rate: number;
    active_tasks: number;
    dynamic_tables: number;
  };
  daily_volume: { date: string; file_count: number; total_rows: number; total_bytes: number; errors: number; success: number; failure: number }[];
  pipe_activity: { pipe_name: string; credits: number; bytes_inserted: number; files_inserted: number; start_time: string }[];
  loading_errors: { table: string; file: string; error_count: number; error_message: string; status: string; load_time: string }[];
  task_daily: { date: string; total: number; success: number; failure: number; skipped: number; avg_duration: number }[];
  recent_tasks: { task_name: string; database: string; schema: string; state: string; error_message: string; scheduled_time: string; completed_time: string; duration_seconds: number }[];
  active_tasks: { name: string; database: string; schema: string; state: string; schedule: string; warehouse: string }[];
  serverless_credits: { date: string; credits: number }[];
  dynamic_tables: { name: string; database: string; schema: string; target_lag: string; refresh_mode: string }[];
  execution_time_ms: number;
}

// =============================================================================
// CROSS-TAB FILTERS
// =============================================================================

export interface CommandCenterFilters {
  days: number;
  start_date?: string;
  end_date?: string;
  project_type?: string;
  username?: string;
  status?: string;
  environment?: string;
  role_name?: string;
  module_name?: string;
  event_type?: string;
  warehouse_name?: string;
  query_type?: string;
}

export interface FilterOptionsResponse {
  project_types: string[];
  project_statuses: string[];
  environments: string[];
  usernames: string[];
  roles: string[];
  modules: string[];
  warehouses: string[];
  deployment_statuses: string[];
  execution_time_ms: number;
}

// ─── Snowflake Intelligence Types ──────────────────────────────────────────

export interface RowTimestampActivationResponse {
  database: string;
  activation_result: string;
  tables_count: number;
  tables: Array<{ TABLE_SCHEMA: string; TABLE_NAME: string; ROW_COUNT: number }>;
  execution_time_ms: number;
}

export interface RowTimestampStatusResponse {
  database: string;
  schema_filter: string | null;
  tables: Array<{
    TABLE_SCHEMA: string;
    TABLE_NAME: string;
    TABLE_TYPE: string;
    ROW_COUNT: number;
    LAST_ALTERED: string;
    CREATED: string;
  }>;
  total_tables: number;
  execution_time_ms: number;
}

export interface CrossAccountUsageResponse {
  period_days: number;
  account_summary: Array<{
    account_name: string;
    total_credits: number;
    total_cost: number;
    currency: string;
  }>;
  daily_credits: any[];
  storage: any[];
  warehouse_usage: any[];
  data_transfer: any[];
  execution_time_ms: number;
}

export interface QueryAuditResponse {
  period_days: number;
  queries: Array<{
    QUERY_ID: string;
    QUERY_TEXT: string;
    QUERY_TYPE: string;
    USER_NAME: string;
    ROLE_NAME: string;
    WAREHOUSE_NAME: string;
    DATABASE_NAME: string;
    EXECUTION_STATUS: string;
    START_TIME: string;
    END_TIME: string;
    TOTAL_ELAPSED_TIME: number;
    BYTES_SCANNED: number;
    ROWS_PRODUCED: number;
  }>;
  total_returned: number;
  summary_by_type: Array<{
    QUERY_TYPE: string;
    QUERY_COUNT: number;
    AVG_DURATION_MS: number;
    TOTAL_BYTES_SCANNED: number;
    UNIQUE_USERS: number;
  }>;
  execution_time_ms: number;
}

export interface AccessAuditResponse {
  period_days: number;
  access_records: any[];
  total_returned: number;
  execution_time_ms: number;
}

export interface LoginAuditResponse {
  period_days: number;
  logins: Array<{
    EVENT_TIMESTAMP: string;
    USER_NAME: string;
    CLIENT_IP: string;
    REPORTED_CLIENT_TYPE: string;
    IS_SUCCESS: string;
    ERROR_MESSAGE: string | null;
  }>;
  total_returned: number;
  summary: Array<{
    IS_SUCCESS: string;
    LOGIN_COUNT: number;
    UNIQUE_USERS: number;
    UNIQUE_IPS: number;
  }>;
  execution_time_ms: number;
}
