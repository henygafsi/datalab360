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
  status: 'healthy' | 'degraded' | 'inactive';
  events_7d: number;
  failures_7d: number;
  key_metric: string;
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
