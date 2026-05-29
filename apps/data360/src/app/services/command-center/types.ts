/**
 * Command Center API Response Types
 */

// ── Summary ──────────────────────────────────────────────────────────────────

export interface PlatformKpis {
  total_users: number;
  active_users_7d: number;
  total_projects: number;
  total_workflows: number;
  events_today: number;
  data_sources: number;
}

export interface QualityKpis {
  health_score: number;
  freshness_violations: number;
  total_tables: number;
}

export interface CostKpis {
  credits_30d: number;
  storage_tb: number;
  credit_trend_pct: number;
}

export interface SecurityKpis {
  failed_logins_7d: number;
  masking_policies: number;
  rls_policies: number;
  mfa_coverage_pct: number;
}

export interface AiKpis {
  semantic_models: number;
  ml_jobs: number;
}

export interface SummaryResponse {
  platform: PlatformKpis;
  quality: QualityKpis;
  cost: CostKpis;
  security: SecurityKpis;
  ai: AiKpis;
  execution_time_ms: number;
}

// ── Module Health ────────────────────────────────────────────────────────────

export interface ModuleHealthItem {
  module: string;
  module_key: string;
  // Backend emits 'healthy' | 'degraded' | 'needs_setup' | 'warning' | 'critical' | 'inactive'
  status: string;
  // Legacy fields (kept optional for back-compat with older payloads)
  events_7d?: number;
  failures_7d?: number;
  key_metric?: string;
  // Current backend fields
  status_reason?: string;
  kpi1?: number | string;
  kpi1_label?: string;
  kpi1_status?: string;
  kpi2?: number | string;
  kpi2_label?: string;
  kpi2_status?: string;
  kpi3?: number | string;
  kpi3_label?: string;
  kpi3_status?: string;
  health_score?: number;
  issues?: Array<{ severity: string; message: string }>;
  recent_events?: unknown[];
  page_url?: string;
  icon?: string;
}

export interface ModuleHealthResponse {
  modules: ModuleHealthItem[];
  execution_time_ms: number;
}

// ── Activity Feed ────────────────────────────────────────────────────────────

export interface ActivityEvent {
  username: string;
  module: string;
  event_type: string;
  status: string;
  timestamp: string | null;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  count: number;
  execution_time_ms: number;
}

// ── Infrastructure ───────────────────────────────────────────────────────────

export interface WarehouseInfo {
  warehouse_name: string;
  total_credits: number;
  compute_credits: number;
  cloud_credits: number;
}

export interface StorageInfo {
  database_tb: number;
  stage_tb: number;
  failsafe_tb: number;
}

export interface QueryPerformance {
  total_queries: number;
  success: number;
  failed: number;
  avg_exec_ms: number;
  p95_ms: number;
}

export interface TaskState {
  state: string;
  count: number;
  avg_duration_s: number;
}

export interface TasksSummary {
  by_state: TaskState[];
  total_7d: number;
  succeeded_7d: number;
  failed_7d: number;
}

export interface PipeInfo {
  pipe_name: string;
  credits: number;
  bytes_inserted: number;
  files_inserted: number;
}

export interface PipesSummary {
  pipes: PipeInfo[];
  total_credits: number;
  total_files: number;
}

export interface ClusteringTable {
  table_name: string;
  credits: number;
  bytes_reclustered: number;
}

export interface ClusteringSummary {
  tables: ClusteringTable[];
  total_credits: number;
}

export interface MvInfo {
  table_name: string;
  credits: number;
}

export interface MvSummary {
  views: MvInfo[];
  total_credits: number;
}

export interface ReplicationDb {
  database_name: string;
  credits: number;
  bytes_transferred: number;
}

export interface ReplicationSummary {
  databases: ReplicationDb[];
  total_credits: number;
}

export interface InfrastructureResponse {
  warehouses: WarehouseInfo[];
  storage: StorageInfo;
  query_performance: QueryPerformance;
  tasks: TasksSummary;
  pipes: PipesSummary;
  clustering: ClusteringSummary;
  materialized_views: MvSummary;
  replication: ReplicationSummary;
  execution_time_ms: number;
}

// ── Pipelines ────────────────────────────────────────────────────────────────

export interface ConnectorType {
  type: string;
  count: number;
}

export interface ConnectorsSummary {
  total: number;
  by_type: ConnectorType[];
}

export interface WorkflowsSummary {
  total: number;
  executions_7d: number;
  success_rate: number;
  by_status: { success: number; failed: number };
}

export interface IngestionSummary {
  copy_loads_7d: number;
  success_rate: number;
  failed_loads: number;
  rows_loaded: number;
  bytes_loaded: number;
  pipe_credits_7d: number;
}

export interface PipelineTasksSummary {
  total_7d: number;
  succeeded_7d: number;
  failed_7d: number;
  avg_duration_s: number;
}

export interface PipelinesResponse {
  connectors: ConnectorsSummary;
  workflows: WorkflowsSummary;
  ingestion: IngestionSummary;
  tasks: PipelineTasksSummary;
  execution_time_ms: number;
}

// ── Cost Breakdown ───────────────────────────────────────────────────────────

export interface CostByCategory {
  warehouses: number;
  cloud_services: number;
  clustering: number;
  materialized_views: number;
  pipes: number;
  replication: number;
}

export interface DailyTrendPoint {
  date: string | null;
  credits: number;
}

export interface TopWarehouse {
  name: string;
  credits: number;
}

export interface CreditBalance {
  free_remaining: number;
  capacity: number;
  on_demand: number;
  rollover: number;
}

export interface CostBreakdownResponse {
  total_credits: number;
  credit_trend_pct: number;
  by_category: CostByCategory;
  storage: StorageInfo;
  daily_trend: DailyTrendPoint[];
  top_warehouses: TopWarehouse[];
  balance: CreditBalance;
  execution_time_ms: number;
}

// ── Filter Options ──────────────────────────────────────────────────────────

export interface FilterUser {
  name: string;
  query_count: number;
  last_active: string | null;
}

export interface FilterWarehouse {
  name: string;
  size: string;
  credits: number;
  active_days: number;
}

export interface FilterDatabase {
  name: string;
  table_count: number;
  total_bytes: number;
}

export interface FilterRole {
  name: string;
  user_count: number;
}

export interface FilterModule {
  name: string;
  event_count: number;
  user_count: number;
}

export interface FilterSchema {
  database: string;
  schema: string;
  object_count: number;
}

export interface FilterOptionsData {
  users: FilterUser[];
  warehouses: FilterWarehouse[];
  databases: FilterDatabase[];
  roles: FilterRole[];
  modules: FilterModule[];
  schemas: FilterSchema[];
}

export interface FilterOptionsResponse {
  filters: FilterOptionsData;
  days: number;
}

// ── Cross-Module Intelligence ───────────────────────────────────────────────

export interface QueryByModule {
  module: string;
  query_count: number;
  total_seconds: number;
  credits: number;
}

export interface GovernanceCoverage {
  database: string;
  total_tables: number;
  tables_with_policies: number;
  coverage_pct: number;
}

export interface FreshnessBySchema {
  database: string;
  schema: string;
  table_count: number;
  freshest_hours: number;
  stalest_hours: number;
  avg_staleness_hours: number;
}

export interface CostByDatabase {
  database: string;
  query_count: number;
  credits: number;
  avg_ms: number;
}

export interface CrossModuleData {
  queries_by_module: QueryByModule[];
  governance_coverage: GovernanceCoverage[];
  freshness_by_schema: FreshnessBySchema[];
  cost_by_database: CostByDatabase[];
}

export interface CrossModuleResponse {
  intelligence: CrossModuleData;
  filters_applied: Record<string, string | number>;
}

// ── Security Audit ──────────────────────────────────────────────────────────

export interface LoginSummary {
  total_logins_7d: number;
  failed_logins_7d: number;
  unique_users_7d: number;
  mfa_enabled_pct: number;
}

export interface LoginEvent {
  user: string;
  ip: string;
  status: string;
  auth_method: string;
  timestamp: string | null;
}

export interface AccessGrant {
  user: string;
  role: string;
  granted_by: string;
  granted_on: string | null;
}

export interface PolicyCoverage {
  masking_policies: number;
  rls_policies: number;
  total_tables: number;
  tables_with_policies: number;
  coverage_pct: number;
}

export interface SensitiveData {
  pii_columns_detected: number;
  pii_columns_masked: number;
  unmasked_pct: number;
}

export interface SecurityAuditResponse {
  login_summary: LoginSummary;
  login_history: LoginEvent[];
  access_grants: AccessGrant[];
  policy_coverage: PolicyCoverage;
  sensitive_data: SensitiveData;
  execution_time_ms: number;
}

// ── Warehouse Performance ───────────────────────────────────────────────────

export interface WarehouseDetail {
  name: string;
  size: string;
  state: string;
  auto_suspend: number;
  auto_resume: boolean;
  credits_used: number;
  avg_execution_ms: number;
  total_queries: number;
  queue_time_avg_ms: number;
  utilization_pct: number;
}

export interface ResourceMonitor {
  name: string;
  quota: number;
  used: number;
  remaining: number;
  status: string;
}

export interface WarehouseQueryPerformance {
  total_queries_7d: number;
  avg_execution_ms: number;
  p95_execution_ms: number;
  failed_queries_7d: number;
  queued_queries_7d: number;
}

export interface WarehousePerformanceResponse {
  warehouses: WarehouseDetail[];
  resource_monitors: ResourceMonitor[];
  query_performance: WarehouseQueryPerformance;
  execution_time_ms: number;
}

// ── Query Intelligence ──────────────────────────────────────────────────────

export interface SlowQuery {
  query_id: string;
  query_text: string;
  execution_time_ms: number;
  user: string;
  warehouse: string;
  timestamp: string | null;
}

export interface FrequentQuery {
  query_hash: string;
  count: number;
  avg_ms: number;
  total_credits: number;
  sample_text: string;
}

export interface ErrorQuery {
  query_id: string;
  error_code: string;
  error_message: string;
  query_text: string;
  user: string;
  timestamp: string | null;
}

export interface QueryVolumeTrend {
  date: string | null;
  count: number;
  avg_ms: number;
}

export interface QueryIntelligenceResponse {
  slow_queries: SlowQuery[];
  frequent_queries: FrequentQuery[];
  error_queries: ErrorQuery[];
  query_volume_trend: QueryVolumeTrend[];
  execution_time_ms: number;
}
