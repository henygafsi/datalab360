/**
 * Types for Observability API
 * Real-time monitoring, compliance, and intelligent KPIs
 */

// =============================================================================
// INTELLIGENT KPIs
// =============================================================================

export interface KpiCategory {
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  metrics: Record<string, number | string>;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
}

export interface IntelligentKpis {
  overall_health_score: number;
  overall_status: 'healthy' | 'warning' | 'critical';
  governance: KpiCategory;
  cost: KpiCategory;
  performance: KpiCategory;
  usage: KpiCategory;
  compliance: KpiCategory;
  recommendations: Recommendation[];
  computed_at: string;
}

// =============================================================================
// DASHBOARD
// =============================================================================

export interface DashboardSummary {
  kpis: IntelligentKpis;
  recent_activity: UserActivitySummary;
  warehouse_summary: WarehouseUsageSummary;
  storage_summary: StorageMetrics;
}

// =============================================================================
// COMPLIANCE - GDPR & SOC 2
// =============================================================================

export interface ComplianceControl {
  control_id: string;
  name: string;
  description: string;
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_applicable';
  findings: string[];
  recommendations: string[];
}

export interface GdprReport {
  overall_score: number;
  overall_status: 'compliant' | 'partial' | 'non_compliant';
  article_17: ComplianceControl; // Right to Erasure
  article_32: ComplianceControl; // Security
  article_30: ComplianceControl; // Records
  sensitive_data_locations: SensitiveDataLocation[];
  data_retention_status: DataRetentionStatus;
  generated_at: string;
}

export interface Soc2Report {
  overall_score: number;
  overall_status: 'compliant' | 'partial' | 'non_compliant';
  cc6_1: ComplianceControl; // Logical Access
  cc7_2: ComplianceControl; // Security Monitoring
  cc8_1: ComplianceControl; // Change Management
  access_controls: AccessControlSummary;
  audit_logging: AuditLoggingSummary;
  generated_at: string;
}

export interface SensitiveDataLocation {
  database: string;
  schema: string;
  table: string;
  column: string;
  data_type: string;
  classification: string;
}

export interface DataRetentionStatus {
  policy_defined: boolean;
  tables_compliant: number;
  tables_non_compliant: number;
}

export interface AccessControlSummary {
  total_users: number;
  users_with_mfa: number;
  dormant_users: number;
  privileged_users: number;
}

export interface AuditLoggingSummary {
  logging_enabled: boolean;
  retention_days: number;
  coverage_percentage: number;
}

// =============================================================================
// DATA LINEAGE
// =============================================================================

export interface LineageRecord {
  query_id: string;
  user_name: string;
  query_start_time: string;
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  operation_type: string;
}

export interface LineageResponse {
  lineage: LineageRecord[];
  count: number;
}

export interface AccessPattern {
  database: string;
  schema: string;
  table: string;
  access_count: number;
  unique_users: number;
  last_accessed: string;
  access_type: string;
}

export interface AccessPatternsResponse {
  patterns: AccessPattern[];
  count: number;
}

// =============================================================================
// USER ACTIVITY
// =============================================================================

export interface UserActivityUser {
  user_name: string;
  total_queries: number;
  successful_queries: number;
  failed_queries: number;
  total_execution_time_sec: number;
  last_active: string;
  warehouses_used: number;
  databases_accessed: number;
  total_gb_scanned: number;
}

export interface UserActivitySummary {
  period_days: number;
  total_users: number;
  users: UserActivityUser[];
  // Legacy fields for backward compatibility
  total_queries?: number;
  unique_users?: number;
  successful_queries?: number;
  failed_queries?: number;
  avg_execution_time_ms?: number;
  top_users?: TopUser[];
  queries_by_type?: Record<string, number>;
}

export interface TopUser {
  username: string;
  query_count: number;
  avg_execution_time_ms: number;
}

export interface HeatmapData {
  hour: number;
  day_of_week: number;
  query_count: number;
}

export interface HeatmapResponse {
  heatmap: HeatmapData[];
  peak_hour: number;
  peak_day: string;
}

export interface LoginRecord {
  event_timestamp: string;
  user_name: string;
  client_ip: string;
  reported_client_type: string;
  first_authentication_factor: string;
  second_authentication_factor: string | null;
  is_success: boolean;
  error_code: string | null;
  error_message: string | null;
}

export interface LoginsResponse {
  logins: LoginRecord[];
  count: number;
}

// =============================================================================
// SECURITY
// =============================================================================

export interface SecurityPosture {
  // New API fields
  mfa_enabled_users: number;
  total_users: number;
  mfa_coverage_percent: number;
  failed_logins_7days: number;
  masking_policies: number;
  rls_policies: number;
  assessment_timestamp: string;
  // Legacy fields for backward compatibility
  overall_score?: number;
  status?: 'secure' | 'moderate' | 'at_risk';
  mfa_adoption_rate?: number;
  password_policy_compliance?: number;
  network_policies_count?: number;
  failed_login_attempts_24h?: number;
  privileged_users_count?: number;
  recommendations?: string[];
}

export interface SensitiveDataSummary {
  total_tables_with_pii: number;
  total_columns_with_pii: number;
  tables: SensitiveTable[];
  classification_breakdown: Record<string, number>;
}

export interface SensitiveTable {
  database: string;
  schema: string;
  table: string;
  pii_columns: PiiColumn[];
}

export interface PiiColumn {
  column_name: string;
  data_type: string;
  classification: string;
  is_masked: boolean;
}

// =============================================================================
// UNUSED RESOURCES
// =============================================================================

export interface UnusedTable {
  database: string;
  schema: string;
  table: string;
  last_accessed: string | null;
  days_since_access: number;
  storage_gb: number;
  row_count: number;
}

export interface UnusedTablesResponse {
  tables: UnusedTable[];
  count: number;
  total_storage_gb: number;
  potential_savings_estimate: number;
}

export interface DormantUser {
  username: string;
  last_login: string | null;
  days_inactive: number;
  created_date: string;
  roles: string[];
}

export interface DormantUsersResponse {
  users: DormantUser[];
  count: number;
}

// =============================================================================
// COST & WAREHOUSE
// =============================================================================

export interface WarehouseUsage {
  warehouse_name: string;
  total_credits: number;
  compute_credits?: number;
  cloud_services_credits?: number;
  active_days?: number;
  first_use?: string;
  last_use?: string;
  // Legacy fields
  credits_used?: number;
  hours_used?: number;
  queries_executed?: number;
  avg_queue_time_ms?: number;
}

export interface WarehouseUsageSummary {
  period_days: number;
  total_credits: number;
  estimated_cost_usd: number;
  warehouses: WarehouseUsage[];
  // Legacy fields
  total_cost_estimate?: number;
  credit_trend?: 'increasing' | 'stable' | 'decreasing';
}

export interface DailyCreditUsage {
  date: string;
  credits_used: number;
  warehouse_name?: string;
}

export interface DailyCreditsResponse {
  daily_usage: DailyCreditUsage[];
  count: number;
}

export interface StorageHistoryItem {
  usage_date: string;
  storage_gb: number;
  stage_gb: number;
  failsafe_gb: number;
}

export interface StorageMetrics {
  current_storage_gb: number;
  current_stage_gb: number;
  current_failsafe_gb: number;
  history: StorageHistoryItem[];
  // Legacy fields
  total_storage_tb?: number;
  active_storage_tb?: number;
  time_travel_storage_tb?: number;
  failsafe_storage_tb?: number;
  stage_storage_tb?: number;
  storage_cost_estimate?: number;
  databases?: DatabaseStorage[];
}

export interface DatabaseStorage {
  database_name: string;
  storage_gb: number;
  table_count: number;
}

// =============================================================================
// PERFORMANCE
// =============================================================================

export interface PerformanceMetrics {
  total_queries: number;
  successful_queries: number;
  failed_queries: number;
  avg_execution_time_ms: number;
  p50_execution_time_ms: number;
  p95_execution_time_ms: number;
  p99_execution_time_ms: number;
  total_bytes_scanned: number;
  total_rows_produced: number;
  // Legacy fields
  median_execution_time_ms?: number;
  cache_hit_rate?: number;
  spill_to_disk_rate?: number;
  queries_by_status?: Record<string, number>;
}

export interface SlowQuery {
  query_id: string;
  query_text: string;
  user_name: string;
  warehouse_name: string;
  execution_time_sec: number;
  mb_scanned: number;
  rows_produced: number;
  start_time: string;
  end_time: string;
  query_type: string;
  error_message: string | null;
  // Legacy fields
  execution_time_seconds?: number;
  bytes_scanned?: number;
}

export interface SlowQueriesResponse {
  slow_queries: SlowQuery[];
  count?: number;
  threshold_seconds?: number;
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
  version: string;
}

// =============================================================================
// DYNAMIC SNOWFLAKE PASS-THROUGH RESPONSES
// =============================================================================

/**
 * Several observability endpoints (cross-module lineage, dependency graph,
 * task-enriched lineage, Trust Center, freshness probes) return Snowflake
 * metadata graphs whose shape varies by account configuration. Consumers
 * navigate them defensively (`result.data ?? result.nodes ?? result`), so we
 * type them as an indexable record rather than locking a brittle interface or
 * leaking `any`. Property access yields `unknown`, keeping call sites honest.
 */
export type ObservabilityRecord = Record<string, unknown>;
