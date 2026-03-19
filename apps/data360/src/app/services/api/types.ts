/**
 * Type definitions for the Unified Project Management API (/projects)
 * and the Explore & Design Module API (/explore-design).
 */

// ============================================================================
// PART 1 — Unified Project Management Types
// ============================================================================

// --- Enums / Union Types ---

export type ProjectType = 'explore_design' | 'workflow' | 'bi_dashboard';

export type ProjectStatus = 'draft' | 'active' | 'archived' | 'deleted';

export type DeploymentStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'in_progress'
  | 'deployed'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

export type UnifiedDeploymentType = 'with_approval' | 'scheduled' | 'immediate';

export type ContributorRole = 'owner' | 'editor' | 'viewer';

export type VersionStatus = 'draft' | 'active' | 'superseded' | 'rolled_back';

export type RunStatus = 'running' | 'success' | 'failed' | 'cancelled';

export type TriggerType = 'manual' | 'scheduled' | 'api';

// --- Project ---

export interface Project {
  project_id: string;
  project_name: string;
  project_type: ProjectType;
  description: string | null;
  status: ProjectStatus;
  step_name: string | null;
  current_version_id: string | null;
  current_version_num: number | null;
  deployment_version: number | null;
  locked_by: string | null;
  locked_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateProjectRequest {
  project_name: string;
  project_type: ProjectType;
  description?: string | null;
  step_name?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export interface CreateProjectResponse {
  project_id: string;
  project_name: string;
  project_type: ProjectType;
  status: ProjectStatus;
  step_name: string | null;
  created_by: string;
}

export interface UpdateProjectRequest {
  project_name?: string | null;
  description?: string | null;
  status?: ProjectStatus | null;
  step_name?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export interface DeleteProjectResponse {
  status: 'deleted';
  project_id: string;
}

export interface ListProjectsParams {
  project_type?: ProjectType | null;
  status?: ProjectStatus | null;
  mine_only?: boolean;
  limit?: number;
  offset?: number;
}

// --- Version ---

export interface ProjectVersion {
  version_id: string;
  project_id: string;
  version_number: number;
  version_name: string | null;
  status: VersionStatus;
  definition: Record<string, unknown>;
  changes_summary: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  description: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface CreateVersionRequest {
  definition: Record<string, unknown>;
  version_name?: string | null;
  description?: string | null;
}

export interface CreateVersionResponse {
  version_id: string;
  project_id: string;
  version_number: number;
  version_name: string | null;
  status: VersionStatus;
}

export interface VersionListResponse {
  project_id: string;
  current_version: ProjectVersion | null;
  versions: ProjectVersion[];
  total: number;
}

export interface ListVersionsParams {
  limit?: number;
  include_superseded?: boolean;
}

export interface RollbackRequest {
  target_version_id: string;
  reason?: string | null;
}

export interface RollbackResponse {
  status: 'success';
  project_id: string;
  rolled_back_to: string;
  target_version_number: number;
  versions_rolled_back: number;
  reason: string | null;
}

// --- Deployment (Unified) ---

export interface ProjectDeployment {
  deployment_id: string;
  project_id: string;
  version_id: string;
  environment: string;
  status: DeploymentStatus;
  deployment_method?: string | null;
  scheduled_at?: string | null;
  config?: Record<string, unknown> | null;
  requires_approval?: boolean;
  requested_by?: string;
  approved_by?: string | null;
  deployed_at?: string | null;
  created_at?: string;
}

export interface CreateDeploymentRequest {
  version_id: string;
  environment: string;
  deployment_method?: string | null;
  scheduled_at?: string | null;
  config?: Record<string, unknown> | null;
  requires_approval?: boolean;
}

export interface ListDeploymentsParams {
  environment?: string | null;
  status?: DeploymentStatus | null;
  limit?: number;
}

export interface RejectDeploymentRequest {
  reason?: string | null;
}

export interface ExecuteDeploymentRequest {
  execution_log?: Record<string, unknown> | null;
  error_message?: string | null;
}

// --- Execution Runs ---

export interface ProjectRun {
  run_id: string;
  project_id: string;
  version_id?: string | null;
  deployment_id?: string | null;
  trigger_type: TriggerType;
  status: RunStatus;
  steps_total: number;
  steps_executed?: number;
  steps_failed?: number;
  execution_details?: Record<string, unknown> | null;
  error_log?: Record<string, unknown> | null;
  created_at?: string;
  completed_at?: string | null;
}

export interface StartRunRequest {
  version_id?: string | null;
  deployment_id?: string | null;
  trigger_type: TriggerType;
  steps_total?: number;
}

export interface CompleteRunRequest {
  status: 'success' | 'failed' | 'cancelled';
  steps_executed?: number;
  steps_failed?: number;
  execution_details?: Record<string, unknown> | null;
  error_log?: Record<string, unknown> | null;
}

export interface ListRunsParams {
  status?: string | null;
  limit?: number;
}

// --- Contributors ---

export interface Contributor {
  contributor_id: string;
  username: string;
  role: ContributorRole;
  permissions: Record<string, unknown> | null;
  added_by: string;
  added_at: string;
}

export interface AddContributorRequest {
  username: string;
  role: 'viewer' | 'editor';
  permissions?: Record<string, unknown> | null;
}

// --- Wizard State ---

export interface WizardState {
  project_id: string;
  step: number;
  state: Record<string, unknown>;
}

export interface SaveStateRequest {
  step: number;
  state: Record<string, unknown>;
}

export interface SaveStateResponse {
  project_id: string;
  step: number;
  status: 'saved';
}

// --- Events ---

export interface ProjectEvent {
  event_id: string;
  project_id: string;
  module_name: string;
  event_type: string;
  event_subtype: string | null;
  status: string;
  username: string;
  timestamp: string;
  entity_id: string | null;
  entity_type: string | null;
  details: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
}

export interface EventListResponse {
  project_id: string;
  events: ProjectEvent[];
  count: number;
}

export interface ListEventsParams {
  module_name?: string | null;
  event_type?: string | null;
  limit?: number;
}

export interface GlobalEventsParams {
  module_name?: string | null;
  event_type?: string | null;
  username?: string | null;
  limit?: number;
}

export interface CreateEventRequest {
  module_name: string;
  event_type: string;
  status?: string;
  details?: Record<string, unknown> | null;
  error_message?: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  event_subtype?: string | null;
  duration_ms?: number | null;
}

export interface CreateEventResponse {
  event_id: string;
  project_id: string;
  event_type: string;
  status: string;
}

export interface UpdateEventRequest {
  status?: string;
  error_message?: string | null;
  details?: Record<string, unknown> | null;
}

export interface BulkUpdateEventsRequest {
  event_ids?: string[];
  filter_status?: string | null;
  filter_event_type?: string | null;
  new_status: string;
  new_details?: Record<string, unknown> | null;
  error_message?: string | null;
}

export interface BulkUpdateEventsResponse {
  updated: number;
  project_id: string;
}

// ============================================================================
// PART 2 — Explore & Design Module Types
// ============================================================================

// --- Enums / Union Types ---

export type NamingStrategy = 'version_suffix' | 'timestamp_suffix' | 'custom';

export type IngestionMode =
  | 'full_refresh'
  | 'incremental'
  | 'snapshot'
  | 'scd_type1'
  | 'scd_type2'
  | 'scd_type3';

export type DDLType =
  | 'CREATE_TABLE'
  | 'ALTER_ADD_COLUMN'
  | 'ALTER_DROP_COLUMN'
  | 'ALTER_RENAME_COLUMN'
  | 'ALTER_CHANGE_TYPE'
  | 'DROP_TABLE';

export type CronChoice =
  | 'EVERY_HOUR'
  | 'EVERY_6_HOURS'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'CUSTOM';

export type ExploreDeploymentType = 'with_approval' | 'scheduled' | 'immediate';

export type DDLActionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';

// --- TableRef ---

export interface TableRef {
  database: string;
  schema: string;
  table: string;
}

// --- Explore Project ---

export interface CreateExploreProjectRequest {
  project_name: string;
  description?: string | null;
  source_tables?: TableRef[];
  tags?: string[];
}

export interface CreateExploreProjectResponse {
  project_id: string;
  project_name: string;
  project_type: 'explore_design';
  status: ProjectStatus;
  step_name: string;
  created_by: string;
  version_id?: string;
}

// --- Templates ---

export interface ConfigTemplate {
  template_id: string;
  template_name: string;
  template_type: string;
  description: string | null;
  config: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface CreateTemplateRequest {
  template_name: string;
  template_type: string;
  description?: string | null;
  config: Record<string, unknown>;
}

export interface TemplateListResponse {
  templates: ConfigTemplate[];
}

// --- Metadata ---

export interface ColumnMetadata {
  name: string;
  data_type: string;
  nullable: boolean;
  default: string | null;
  position: number;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
}

export interface TableMetadata {
  database: string;
  schema: string;
  table: string;
  table_type?: string;
  row_count: number | null;
  bytes: number | null;
  created: string | null;
  last_altered: string | null;
  columns?: ColumnMetadata[];
  error?: string;
}

export interface BatchMetadataResponse {
  project_id: string;
  tables: TableMetadata[];
}

export interface BatchMetadataParams {
  include_columns?: boolean;
  include_statistics?: boolean;
}

// --- Profiling ---

export interface ColumnProfileSummary {
  column_name: string;
  data_type: string;
  nullable: boolean;
  position: number;
  null_count: number | null;
  distinct_count: number | null;
  min_value: string | null;
  max_value: string | null;
  quality_score: number | null;
}

export interface TableProfile {
  database: string;
  schema: string;
  table: string;
  row_count: number;
  bytes: number | null;
  column_count: number;
  created: string | null;
  last_altered: string | null;
  aggregate_quality_score: number | null;
  columns: ColumnProfileSummary[];
  sample_size: number;
}

export interface TopValue {
  value: string;
  count: number;
}

export interface DetectedPattern {
  pattern: string;
  match_count: number;
  match_ratio: number;
}

export interface ColumnProfile {
  database: string;
  schema: string;
  table: string;
  column: string;
  data_type: string;
  nullable: boolean;
  default_value: string | null;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  total_count: number;
  null_count: number;
  distinct_count: number;
  min_value: string | null;
  max_value: string | null;
  quality_score: number | null;
  top_values: TopValue[];
  sample_values: string[];
  detected_patterns: DetectedPattern[];
  sample_size: number;
}

// --- Preview ---

export interface TablePreview {
  database: string;
  schema: string;
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  limit: number;
}

export interface ColumnPreviewValue {
  value: string;
  count: number;
}

export interface ColumnPreview {
  database: string;
  schema: string;
  table: string;
  column: string;
  distinct_only: boolean;
  values: string[] | ColumnPreviewValue[];
  count: number;
  limit: number;
}

// --- Detection ---

export interface SensitiveDetection {
  detection_id: string;
  table: string;
  column: string;
  pattern_type: string;
  confidence: number;
}

export interface DetectSensitiveRequest {
  tables: TableRef[];
  patterns?: string[];
  confidence_threshold?: number;
}

export interface DetectSensitiveResponse {
  project_id: string;
  detections: SensitiveDetection[];
}

export interface RelationDetection {
  detection_id: string;
  left_table: string;
  left_column: string;
  right_table: string;
  right_column: string;
  relation_type: string;
  confidence: number;
}

export interface DetectRelationsRequest {
  tables: TableRef[];
  detection_method?: string;
  confidence_threshold?: number;
}

export interface DetectRelationsResponse {
  project_id: string;
  relations: RelationDetection[];
}

// --- Schema Clone ---

export interface SchemaCloneRequest {
  source_database: string;
  source_schema: string;
  target_database: string;
  target_schema?: string;
  naming_strategy: NamingStrategy;
  include_data?: boolean;
  include_constraints?: boolean;
  include_policies?: boolean;
  include_grants?: boolean;
}

export interface SchemaClone {
  clone_id: string;
  project_id: string;
  source: string;
  target: string;
  version_num: number;
  status: string;
}

export interface ExecuteCloneResponse {
  clone_id: string;
  status: 'executed';
  target: string;
  tables_cloned: number;
}

export interface RollbackCloneResponse {
  clone_id: string;
  status: 'rolled_back';
  target: string;
}

// --- WHERE Clause (shared) ---

export type WhereOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'IN'
  | 'BETWEEN'
  | 'LIKE'
  | 'IS NULL'
  | 'IS NOT NULL';

export interface WhereClauseCondition {
  column: string;
  operator: WhereOperator;
  value?: string;
  values?: string[];
  value_end?: string;
}

// --- Ingestion ---

export interface IngestionConfigRequest {
  source_database: string;
  source_schema: string;
  source_table: string;
  ingestion_mode: IngestionMode;
  config?: {
    key_columns?: string[];
    timestamp_column?: string;
    batch_size?: number;
    [key: string]: unknown;
  };
}

export interface IngestionConfigResponse {
  config_id: string;
  ingestion_mode: IngestionMode;
}

export interface BulkIngestionConfigRequest {
  tables: TableRef[];
  ingestion_mode: IngestionMode;
  config?: Record<string, unknown>;
}

export interface BulkIngestionConfigResponse {
  config_ids: string[];
  tables_configured: number;
}

export interface ColumnMappingInput {
  source_columns: string[];
  target_column: string;
  transformation?: string;
}

export interface ExecuteIngestionRequest {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  mappings?: ColumnMappingInput[];
  config?: Record<string, unknown>;
  where_clauses?: WhereClauseCondition[];
}

export interface ExecuteIngestionResponse {
  status: 'success' | 'failed';
  source: string;
  target: string;
  ingestion_mode: IngestionMode;
  rows_affected: number;
}

export interface IngestionScheduleRequest {
  cron_choice: CronChoice;
  custom_cron?: string | null;
  warehouse?: string | null;
  mappings?: ColumnMappingInput[] | null;
  config?: Record<string, unknown> | null;
}

export interface IngestionScheduleResponse {
  status: string;
  task_name: string;
  cron_expression: string;
  warehouse: string;
  project_id: string;
}

// --- Masking ---

export interface MaskingConfigRequest {
  database: string;
  schema: string;
  table: string;
  column_name: string;
  masking_policy: string;
  masking_type: string;
  preserve_format?: boolean;
}

export interface MaskingConfigResponse {
  config_id: string;
  column: string;
  policy: string;
}

// --- Column Mappings ---

export interface CreateMappingRequest {
  source_database: string;
  source_schema: string;
  source_table: string;
  source_columns: string[];
  target_database: string;
  target_schema: string;
  target_table: string;
  target_column: string;
  transformation?: string;
  data_type?: string;
  is_key?: boolean;
  is_nullable?: boolean;
}

export interface ColumnMapping {
  mapping_id: string;
  source: TableRef;
  source_columns: string[];
  target: TableRef;
  target_column: string;
  transformation: string | null;
  data_type: string | null;
  is_key: boolean;
  is_nullable: boolean;
  default_value: string | null;
}

export interface MappingListResponse {
  project_id: string;
  mappings: ColumnMapping[];
}

// --- DDL Actions ---

export interface CreateDDLActionRequest {
  ddl_sql: string;
  ddl_type: DDLType;
  priority?: number;
  description?: string;
  target_table?: string;
}

export interface DDLAction {
  event_id: string;
  project_id: string;
  status: DDLActionStatus;
  username: string;
  timestamp: string;
  ddl_sql: string;
  ddl_type: DDLType;
  priority: number;
  target_table: string | null;
  description: string | null;
  error_message: string | null;
}

export interface DDLActionListResponse {
  project_id: string;
  actions: DDLAction[];
  count: number;
}

export interface ExecuteDDLResult {
  event_id: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface ExecuteDDLResponse {
  project_id: string;
  executed: number;
  failed: number;
  total: number;
  results: ExecuteDDLResult[];
}

export interface RollbackDDLResponse {
  event_id: string;
  project_id: string;
  status: 'ROLLED_BACK';
  previous_status: string;
}

// --- Model Versions ---

export interface ModelColumnDef {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface SaveModelRequest {
  model_name: string;
  database: string;
  schema: string;
  table: string;
  columns: ModelColumnDef[];
}

export interface SaveModelResponse {
  version_id: string;
  version_number: number;
  table: string;
}

export interface ModelVersion {
  version_id: string;
  version_number: number;
  table: string;
  column_attributes: { columns: ModelColumnDef[] };
  column_groups: unknown[];
  semantic_model: Record<string, unknown>;
  status: string;
  created_by: string;
  created_at: string;
}

export interface ModelVersionListResponse {
  project_id: string;
  versions: ModelVersion[];
  count: number;
}

export interface ListModelsParams {
  table?: string;
  limit?: number;
}

// --- Deploy (Explore) ---

export interface QuickDeployResponse {
  status: 'success';
  project_id: string;
  version_id: string;
  version_number: number;
  deployed_by: string;
  ddl_executed: number;
}

export interface CreateExploreDeploymentRequest {
  deployment_type: ExploreDeploymentType;
  description?: string;
  scheduled_at?: string;
  scheduled_time?: string;
  warehouse?: string;
  config?: Record<string, unknown>;
}

export interface ExploreDeployment {
  deployment_id: string;
  status: string;
  deployment_type: ExploreDeploymentType;
  task_name?: string;
  version_id?: string;
  environment?: string;
  deployment_method?: string;
  requested_by?: string;
  requested_at?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  deployed_at?: string | null;
  deployed_by?: string | null;
  created_at?: string;
  config?: Record<string, unknown> | null;
  error_message?: string | null;
}

export interface ExploreDeploymentListResponse {
  deployments: ExploreDeployment[];
  count: number;
}

// --- Scheduling ---

export interface CreateScheduleRequest {
  cron_choice: CronChoice;
  custom_cron?: string;
  warehouse?: string;
  requires_approval?: boolean;
  config?: Record<string, unknown>;
}

export interface Schedule {
  schedule_id: string;
  cron_expression: string;
  status: string;
  warehouse?: string;
  requires_approval?: boolean;
  requested_by?: string;
  approved_by?: string | null;
  created_at?: string;
  task_name?: string;
}

export interface ScheduleListResponse {
  schedules: Schedule[];
  count: number;
}

export interface RejectScheduleRequest {
  reason?: string | null;
}

// ============================================================================
// PART 3 — Workflow Module Types (/workflows)
// ============================================================================

// --- Enums ---

export type WorkflowCronChoice = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type WorkflowDeploymentType = 'immediate' | 'with_approval' | 'scheduled';

export type StepStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped';

export type WorkflowActionType =
  | 'src'
  | 'destination'
  | 'join_tables'
  | 'filter_rows'
  | 'sort'
  | 'distinct'
  | 'deduplicate'
  | 'rename_col'
  | 'set_col_value'
  | 'normalize_col'
  | 'cast'
  | 'formula'
  | 'aggregate_kpi'
  | 'clustering'
  | 'segmentation'
  | 'recommendation'
  | string; // allow custom action types

// --- Workflow CRUD ---

export interface CreateWorkflowRequest {
  project_name: string;
  description?: string | null;
  tags?: string[];
  steps?: CreateWorkflowStepInput[];
}

export interface CreateWorkflowStepInput {
  action_type: WorkflowActionType;
  step_name: string;
  description?: string | null;
  payload: Record<string, unknown>;
}

export interface CreateWorkflowResponse {
  project_id: string;
  project_name: string;
  project_type: 'workflow';
  status: string;
  metadata: {
    steps: WorkflowStep[];
  };
  version_id: string;
  version_number: number;
}

export interface Workflow {
  project_id: string;
  project_name: string;
  project_type: 'workflow';
  status: string;
  description: string | null;
  created_by: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
}

// --- Steps ---

export interface WorkflowStep {
  step_id: string;
  step_order: number;
  action_type: WorkflowActionType;
  step_name: string;
  description: string | null;
  payload: Record<string, unknown>;
}

export interface WorkflowStepsResponse {
  workflow_id: string;
  steps: WorkflowStep[];
  count: number;
}

export interface AddStepRequest {
  action_type: WorkflowActionType;
  step_name: string;
  description?: string | null;
  payload: Record<string, unknown>;
  position?: number;
}

export interface AddStepResponse {
  step_id: string;
  step_order: number;
  action_type: WorkflowActionType;
  step_name: string;
  description: string | null;
  payload: Record<string, unknown>;
}

export interface UpdateStepRequest {
  step_name?: string;
  description?: string | null;
  payload?: Record<string, unknown>;
}

export interface UpdateStepResponse {
  step_id: string;
  step_order: number;
  action_type: WorkflowActionType;
  step_name: string;
  description: string | null;
  payload: Record<string, unknown>;
}

export interface DeleteStepResponse {
  status: 'deleted';
  step_id: string;
  deleted_order: number;
}

export interface ReorderStepsRequest {
  step_ids: string[];
}

export interface ReorderStepsResponse {
  workflow_id: string;
  steps: WorkflowStep[];
}

// --- Action Templates ---

export interface ActionTemplate {
  action_type: string;
  action_name: string;
  description: string | null;
  query_template: string;
  parameters: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
}

export interface ActionTemplatesResponse {
  templates: ActionTemplate[];
  count: number;
}

export interface CreateActionTemplateRequest {
  action_type: string;
  query_template: string;
  action_name: string;
  description?: string | null;
  parameters?: Record<string, unknown>;
}

export interface CreateActionTemplateResponse {
  action_type: string;
  status: 'created';
}

// --- Execution ---

export interface ExecuteWorkflowRequest {
  trigger_type?: TriggerType;
}

export interface StepResult {
  step_id: string;
  cte_alias?: string;
  status: string;
  rows_affected?: number;
}

export interface WorkflowExecutionResponse {
  run_id: string;
  project_id: string;
  status: string;
  mode: 'cte' | 'legacy';
  steps_total: number;
  steps_executed: number;
  steps_failed: number;
  compiled_sql?: string | null;
  rows_affected?: number | null;
  execution_details: {
    mode: 'cte' | 'legacy';
    compiled_sql?: string;
    rows_affected?: number;
    steps_results: StepResult[];
  };
  error: string | null;
}

export interface CompileWorkflowResponse {
  mode: 'cte' | 'legacy';
  compiled_sql: string;
  steps_count: number;
  topological_order: string[];
  cte_aliases: Record<string, string>;
}

export interface ValidateWorkflowResponse {
  valid: boolean;
  mode: 'cte' | 'legacy';
  steps_count?: number;
  topological_order?: string[];
  destination?: string;
  cte_aliases?: Record<string, string>;
  error?: string;
}

// --- Workflow Runs ---

export interface WorkflowRun {
  run_id: string;
  status: string;
  trigger_type: TriggerType;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  steps_total: number;
  steps_executed: number;
  steps_failed: number;
  version_id?: string | null;
  error_log?: Record<string, unknown> | null;
  execution_details?: Record<string, unknown> | null;
}

export interface WorkflowRunsResponse {
  runs: WorkflowRun[];
  count: number;
}

export interface ListWorkflowRunsParams {
  status?: string;
  limit?: number;
}

export interface WorkflowRunSummary {
  total_runs: number;
  completed: number;
  failed: number;
  avg_duration_seconds: number;
  last_run_at: string | null;
}

// --- Workflow Scheduling ---

export interface CreateWorkflowScheduleRequest {
  cron_choice?: WorkflowCronChoice;
  custom_cron?: string;
  warehouse?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowSchedule {
  schedule_id: string;
  project_id: string;
  task_name: string;
  status: string;
  state: string;
  cron_expression: string;
  schedule: string;
  warehouse?: string;
  requires_approval?: boolean;
  requested_by?: string;
  approved_by?: string | null;
  created_at?: string;
  created_on?: string;

}

export interface WorkflowScheduleListResponse {
  workflow_id: string;
  schedules: WorkflowSchedule[];
  count: number;
}

export interface ListScheduledWorkflowsParams {
  mine_only?: boolean;
}

export interface RejectWorkflowScheduleRequest {
  reason?: string;
}

// --- Workflow Versions ---

export interface WorkflowVersion {
  version_id: string;
  version_number: number;
  version_name?: string | null;
  description: string | null;
  status?: string;
  created_by: string;
  created_at: string;
  definition?: { steps: unknown[] };
  changes_summary?: {
    steps_count?: number;
    steps_added?: number;
    steps_removed?: number;
    steps_modified?: number;
  } | null;
  can_rollback?: boolean;
}

export interface WorkflowVersionsResponse {
  versions: WorkflowVersion[];
  count: number;
}

export interface ListWorkflowVersionsParams {
  limit?: number;
  include_superseded?: boolean;
}

export interface WorkflowRollbackParams {
  target_version_id: string;
  reason?: string;
}

// --- Workflow Deployments ---

export interface CreateWorkflowDeploymentRequest {
  version_id: string;
  deployment_type: WorkflowDeploymentType;
  scheduled_time?: string | null;
  warehouse?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowDeployment {
  deployment_id: string;
  project_id: string;
  status: DeploymentStatus;
  deployment_type: WorkflowDeploymentType;
  version_id?: string;
  requested_by?: string;
  approved_by?: string | null;
  deployed_at?: string | null;
  created_at?: string;
}

export interface WorkflowDeploymentListResponse {
  deployments: WorkflowDeployment[];
  count: number;
}

export interface ListWorkflowDeploymentsParams {
  status?: DeploymentStatus;
  limit?: number;
}

export interface RejectWorkflowDeploymentRequest {
  reason?: string;
}

// ============================================================================
// PART 4 — BI Dashboard Types (/bi-dashboard)
// ============================================================================

// --- Enums ---

export type FilterScope = 'global' | 'page';

export type PageLayout = 'grid' | 'freeform';

export type WidgetType = 'chart' | 'kpi_card' | 'table' | 'text';

export type DashboardChartType =
  | 'bar' | 'line' | 'pie' | 'donut' | 'area'
  | 'scatter' | 'heatmap' | 'funnel' | 'gauge' | 'treemap'
  | 'radar' | 'waterfall' | 'stacked_bar' | 'stacked_area'
  | 'histogram' | 'combo' | 'candlestick' | 'bubble'
  | 'radial_bar';

// --- Dashboard CRUD ---

export interface CreateDashboardRequest {
  project_name: string;
  description?: string | null;
  default_database?: string | null;
  default_schema?: string | null;
  tags?: string[];
}

export interface CreateDashboardResponse {
  project_id: string;
  default_page_id: string;
}

export interface UpdateDashboardRequest {
  project_name?: string;
  description?: string | null;
  tags?: string[];
}

// --- Pages ---

export interface DashboardPage {
  page_id: string;
  title: string;
  layout: PageLayout;
  page_order: number;
  created_at?: string;
  widgets?: DashboardWidget[];
  filters?: DashboardFilter[];
}

export interface CreatePageRequest {
  title: string;
  layout?: PageLayout;
  page_order?: number;
}

export interface UpdatePageRequest {
  title?: string;
  layout?: PageLayout;
  page_order?: number;
}

// --- Chart Config (used in chart/kpi_card/table widgets) ---

export interface TopNConfig {
  column: string;
  order: 'ASC' | 'DESC';
  limit: number;
}

export interface BIDashboardChartConfig {
  database: string;
  schema: string;
  table: string;
  mode?: 'raw' | 'aggregate';
  x?: string | null;
  measures?: Array<{
    column: string;
    aggregator: string;
    seuils?: Array<{
      operator: string;
      value: number | [number, number];
      label: string;
      color?: string;
    }>;
  }>;
  columns?: string[];
  filters?: Array<{
    column: string;
    operator: string;
    value: string | number | boolean | Array<string | number>;
  }>;
  groupBy?: string[];
  limit?: number | null;
  topN?: TopNConfig | null;
}

// --- Widget Style ---

export interface WidgetStyle {
  color_scheme?: string;
  show_legend?: boolean;
  [key: string]: unknown;
}

// --- Widgets ---

export interface DashboardWidget {
  widget_id: string;
  page_id: string;
  widget_type: WidgetType;
  chart_type?: DashboardChartType | null;
  title: string | null;
  chart_config?: BIDashboardChartConfig | null;
  text_content?: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  style?: WidgetStyle | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateWidgetRequest {
  page_id: string;
  widget_type: WidgetType;
  chart_type?: DashboardChartType | null;
  title?: string;
  chart_config?: BIDashboardChartConfig | null;
  text_content?: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  style?: WidgetStyle | null;
}

export interface CreateWidgetResponse {
  widget_id: string;
}

export interface UpdateWidgetRequest {
  title?: string;
  widget_type?: WidgetType;
  chart_type?: DashboardChartType | null;
  chart_config?: BIDashboardChartConfig | null;
  text_content?: string | null;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  style?: WidgetStyle | null;
}

// --- Filters ---

export interface DashboardFilter {
  filter_id: string;
  column: string;
  operator: string;
  default_value?: string | number | null;
  page_id: string | null;
  scope: FilterScope;
}

export interface CreateFilterRequest {
  column: string;
  operator: string;
  default_value?: string | number | null;
  page_id?: string | null;
  scope: FilterScope;
}

export interface ListWidgetsParams {
  page_id?: string;
}

export interface ListFiltersParams {
  page_id?: string;
}

// --- Full Dashboard (GET response) ---

export interface FullDashboardPage {
  page_id: string;
  title: string;
  layout: PageLayout;
  page_order: number;
  widgets: DashboardWidget[];
  filters: DashboardFilter[];
}

export interface FullDashboard {
  project_id: string;
  project_name: string;
  description: string | null;
  default_database: string | null;
  default_schema: string | null;
  tags: string[] | null;
  pages: FullDashboardPage[];
  global_filters: DashboardFilter[];
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

// --- Chart Data (POST /charts/data) ---

export interface ChartDataRequest extends Partial<BIDashboardChartConfig> {}

export interface ChartDataResponse {
  config: BIDashboardChartConfig;
  query: string;
  data: Record<string, unknown>[];
}

// --- Retail KPIs ---

export interface RetailKpisParams {
  database?: string;
  schema?: string;
  days?: number;
}

// --- Snapshot ---

export interface SnapshotResponse {
  version_id: string;
}

// ============================================================================
// PART 6 — Explore & Design: New Feature Endpoints
// ============================================================================

// --- Dry-Run ---

export interface DryRunRequest {
  warehouse?: string;
  sample_rows?: number;
}

export interface DryRunSampleRow {
  [column: string]: unknown;
}

export interface DryRunEventResult {
  event_id: string;
  ddl_sql: string;
  status: 'SUCCESS' | 'FAILED';
  sample_rows?: DryRunSampleRow[] | null;
  error?: string;
}

export interface DryRunResult {
  project_id: string;
  clone_schema: string | null;
  total_events: number;
  passed: number;
  failed: number;
  results: DryRunEventResult[];
  duration_ms: number;
  message?: string;
}

// --- Post-Verify ---

export interface PostVerifyRequest {
  database: string;
  schema_name: string;
  deployment_id?: string;
}

export interface PostVerifyMismatch {
  object_type: 'table' | 'column' | 'constraint' | 'index';
  object_name: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface PostVerifyResult {
  status: 'match' | 'drift' | 'error';
  verified: boolean;
  checked_at: string;
  tables_checked: number;
  columns_checked: number;
  passed: number;
  failed: number;
  mismatches: PostVerifyMismatch[];
  duration_ms: number;
}

// --- Impact Analysis ---

export interface ImpactAnalysisRequest {
  database: string;
  schema_name: string;
  table: string;
  column?: string;
}

export interface ImpactItem {
  object_type: 'view' | 'stream' | 'task' | 'dynamic_table' | 'procedure' | 'function';
  object_name: string;
  schema: string;
  database: string;
  risk_level: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ImpactAnalysisResult {
  table: string;
  column?: string;
  total: number;
  impacts: ImpactItem[];
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
}

// --- Ingestion Dry-Run ---

export interface IngestionDryRunRequest {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  mappings?: ColumnMappingInput[];
  config?: Record<string, unknown>;
  sample_size?: number;
  where_clauses?: WhereClauseCondition[];
}

export interface IngestionDryRunRow {
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'UNCHANGED' | 'NO_CHANGE' | 'UNKNOWN';
  data: Record<string, unknown>;
}

/** Actual shape returned by the backend dry_run_ingestion function */
export interface IngestionDryRunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  sample_size: number;
  sql_preview: string;
  source: string;
  target: string;
  ingestion_mode: string;
}

// --- Quality Gates ---

export interface QualityGateConfig {
  gate_id: string;
  gate_type: 'null_rate' | 'min_rows' | 'max_rows' | 'schema_match' | 'freshness' | 'unique_rate' | 'custom_sql';
  column?: string;
  threshold?: number;
  expected_value?: string;
  custom_sql?: string;
  block_on_fail?: boolean;
}

export interface QualityGatesRunRequest {
  database: string;
  schema_name: string;
  table: string;
  gates: QualityGateConfig[];
}

export interface QualityGateResult {
  gate_id: string;
  gate_type: string;
  status: 'passed' | 'failed' | 'error';
  actual_value?: number | string;
  threshold?: number | string;
  message?: string;
}

export interface QualityGatesRunResult {
  table: string;
  gates_run: number;
  passed: number;
  failed: number;
  blocked: boolean;
  results: QualityGateResult[];
  duration_ms: number;
}

// --- Ingestion Runs ---

export interface IngestionRun {
  run_id: string;
  project_id: string;
  source_table: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  rows_inserted: number;
  rows_updated: number;
  rows_deleted: number;
  rows_failed: number;
  error_message?: string;
  triggered_by: string;
}

export interface IngestionRunsResponse {
  runs: IngestionRun[];
  total: number;
  limit: number;
  offset: number;
}

// --- Conflict Check ---

export interface ConflictCheckRequest {
  event_ids?: string[];
}

export interface EventConflict {
  event_id: string;
  event_type: string;
  object_name: string;
  conflict_type: 'duplicate' | 'contradictory' | 'circular';
  conflicting_event_id?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ConflictCheckResult {
  has_conflicts: boolean;
  conflicts: EventConflict[];
  total_checked: number;
  duplicates: number;
  contradictions: number;
  circular_deps: number;
}

// ============================================================================
// PART 7 — Phase A: Event Validation
// ============================================================================

export interface ValidateFkTypesRequest {
  source_database: string;
  source_schema: string;
  source_table: string;
  source_column: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  target_column: string;
}

export interface ValidateFkTypesResult {
  compatible: boolean;
  source_type: string;
  source_family: string;
  target_type: string;
  target_family: string;
  message: string;
}

export interface CascadeRenameRequest {
  old_table_name: string;
  new_table_name: string;
}

export interface CascadeRenameResult {
  project_id: string;
  old_name: string;
  new_name: string;
  events_updated: number;
  updated_event_ids: string[];
}

export interface CascadeDropRequest {
  table_name: string;
}

export interface CascadeDropResult {
  project_id: string;
  table_name: string;
  events_invalidated: number;
  invalidated_event_ids: string[];
}

export interface EnhancedImpactDetail {
  object_type: string;
  object_name: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: string;
  last_accessed: string | null;
}

export interface EnhancedImpactAnalysisRequest {
  database: string;
  schema: string;
  table_name: string;
  ddl_type: string;
}

export interface EnhancedImpactAnalysisResult {
  table_name: string;
  ddl_type: string;
  risk_score: number;
  safe_to_proceed: boolean;
  impacts: EnhancedImpactDetail[];
  summary: {
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    total_score: number;
  };
}

// ============================================================================
// PART 8 — Phase B: Deployment Pipeline
// ============================================================================

export interface ExecuteDDLAtomicBody {
  database?: string;
  schema?: string;
  atomic?: boolean;
}

export type PreDeployCheckType =
  | 'warehouse'
  | 'fk_types'
  | 'circular_deps'
  | 'naming'
  | 'schema_drift';

export interface PreDeployChecksRequest {
  warehouse?: string;
  check_types?: PreDeployCheckType[];
}

export interface PreDeployCheckItem {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: Record<string, unknown>;
}

export interface PreDeployChecksResult {
  project_id: string;
  all_passed: boolean;
  checks: PreDeployCheckItem[];
}

export interface SqlDiffRequest {
  database: string;
  schema_name: string;
  event_ids?: string[];
}

export interface SqlDiffChange {
  type: string;
  column: string;
  data_type: string;
}

export interface SqlDiffItem {
  event_id: string;
  ddl_type: string;
  target_table: string;
  before: { columns: string[] };
  after: { columns: string[] };
  changes: SqlDiffChange[];
}

export interface SqlDiffResult {
  project_id: string;
  diffs: SqlDiffItem[];
  total_events: number;
}

// ============================================================================
// PART 9 — Phase C: Self-Serve Ingestion (new endpoints)
// ============================================================================

export interface SqlPreviewRequest {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  mappings?: ColumnMappingInput[];
  where_clauses?: WhereClauseCondition[];
}

export interface SqlPreviewResult {
  sql: string;
  ingestion_mode: string;
  source: string;
  target: string;
  estimated_columns: number;
  has_where_filter: boolean;
}

export interface Watermark {
  watermark_id: string;
  source_fqn: string;
  watermark_column: string;
  last_value: string;
  rows_loaded: number;
  last_run_at: string;
  updated_by: string;
}

export interface WatermarkListResult {
  project_id: string;
  watermarks: Watermark[];
  total: number;
}

// ============================================================================
// PART 10 — Phase D: Event Lifecycle
// ============================================================================

export interface AuditTrailParams {
  entity_type?: string;
  entity_fqn?: string;
  action?: string;
  username?: string;
  from_timestamp?: string;
  to_timestamp?: string;
  limit?: number;
}

export interface AuditEntry {
  audit_id: string;
  project_id: string;
  event_id: string;
  entity_type: string;
  entity_fqn: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  username: string;
  timestamp: string;
}

export interface AuditTrailResult {
  project_id: string;
  entries: AuditEntry[];
  total: number;
  limit: number;
}

export interface EventTemplateEvent {
  ddl_type: string;
  ddl_sql: string;
  target_table: string;
  description: string;
  priority: number;
}

export interface CreateEventTemplateRequest {
  template_name: string;
  description: string;
  category: string;
  events: EventTemplateEvent[];
}

export interface CreateEventTemplateResult {
  template_id: string;
  template_name: string;
  category: string;
  events_count: number;
}

export interface EventTemplate {
  template_id: string;
  template_name: string;
  description: string;
  category: string;
  events: EventTemplateEvent[];
  is_builtin: boolean;
  created_by: string;
  created_at: string;
}

export interface ApplyEventTemplateRequest {
  template_id: string;
  target_database: string;
  target_schema: string;
  variable_overrides?: Record<string, string>;
}

export interface ApplyEventTemplateResult {
  project_id: string;
  template_id: string;
  template_name: string;
  events_created: number;
  events: Array<{
    event_id: string;
    ddl_type: string;
    target_table: string;
    status: string;
  }>;
}

// ============================================================================
// PART 11 — AI Phase 1: Schema Intelligence
// ============================================================================

export type AiColumnCategory =
  | 'PII'
  | 'METRIC'
  | 'DIMENSION'
  | 'KEY'
  | 'AUDIT'
  | 'TECHNICAL'
  | 'UNKNOWN';

export interface AiColumnClassification {
  column: string;
  data_type: string;
  category: AiColumnCategory;
  sub_category: string;
  confidence: number;
  suggestion: string | null;
}

export interface ClassifyColumnsRequest {
  database: string;
  schema: string;
  table: string;
  profile_data?: Record<string, unknown>;
}

export interface ClassifyColumnsResult {
  database: string;
  schema: string;
  table: string;
  classifications: AiColumnClassification[];
  cortex_credits: number;
}

export interface AiRelationship {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  confidence: number;
  discovery_method: string;
  suggested_fk: string;
}

export interface DiscoverRelationshipsRequest {
  database: string;
  schema: string;
  tables?: string[];
}

export interface DiscoverRelationshipsResult {
  database: string;
  schema: string;
  relationships: AiRelationship[];
  tables_analyzed: number;
  cortex_credits: number;
}

export interface SchemaHealthRequest {
  database: string;
  schema: string;
}

export interface SchemaHealthResult {
  database: string;
  schema: string;
  overall_score: number;
  sub_scores: {
    completeness: {
      score: number;
      details: Record<string, unknown>;
    };
    naming: {
      score: number;
      violations: Array<{ table: string; column: string; issue: string }>;
    };
    type_efficiency: {
      score: number;
      suggestions: Array<{
        table: string;
        column: string;
        current: string;
        suggested: string;
        reason: string;
      }>;
    };
  };
  recommendations: string[];
  cortex_credits: number;
}

// ============================================================================
// PART 12 — AI Phase 2: Modeling Copilot
// ============================================================================

export interface SuggestColumnsRequest {
  table_purpose: string;
  domain?: string;
  existing_tables?: string[];
}

export interface SuggestedColumn {
  name: string;
  type: string;
  role: string;
  nullable: boolean;
  references?: string;
}

export interface SuggestColumnsResult {
  table_purpose: string;
  suggested_columns: SuggestedColumn[];
  cortex_credits: number;
}

export type NamingConvention = 'UPPER_SNAKE' | 'lower_snake' | 'camelCase' | 'PascalCase';

export type NamingEntityType = 'table' | 'column' | 'schema';

export interface CheckNamingRequest {
  names: string[];
  entity_type: NamingEntityType;
  convention: NamingConvention;
}

export interface NamingCheckItem {
  name: string;
  valid: boolean;
  suggested: string | null;
}

export interface CheckNamingResult {
  convention: NamingConvention;
  entity_type: NamingEntityType;
  total: number;
  valid: number;
  invalid: number;
  results: NamingCheckItem[];
  cortex_credits: number;
}

export interface OptimizeTypesRequest {
  database: string;
  schema: string;
  table: string;
}

export interface TypeOptimization {
  column: string;
  current_type: string;
  suggested_type: string;
  reason: string;
  savings_estimate: string | null;
}

export interface OptimizeTypesResult {
  database: string;
  schema: string;
  table: string;
  optimizations: TypeOptimization[];
  cortex_credits: number;
}

export interface RecommendScdRequest {
  database: string;
  schema: string;
  table: string;
  business_context?: string;
}

export interface ScdAlternative {
  type: string;
  fit_score: number;
  reason: string;
}

export interface RecommendScdResult {
  database: string;
  schema: string;
  table: string;
  recommended_type: string;
  confidence: number;
  reasoning: string;
  alternatives: ScdAlternative[];
  implementation_hints: Record<string, unknown>;
  cortex_credits: number;
}

// ============================================================================
// PART 13 — AI Phase 3: Cost Optimizer
// ============================================================================

export interface WarehouseSizingRequest {
  warehouse: string;
  lookback_days?: number;
}

export interface WarehouseSizingResult {
  warehouse: string;
  current_size: string;
  lookback_days: number;
  analysis: {
    total_queries: number;
    avg_execution_time_ms: number;
    p95_execution_time_ms: number;
    avg_queue_time_ms: number;
    peak_concurrency: number;
    utilization_pct: number;
  };
  recommendation: {
    suggested_size: string;
    reason: string;
    estimated_savings_pct: number;
    estimated_savings_credits: number;
  };
  cortex_credits: number;
}

export interface ClusteringKeysRequest {
  database: string;
  schema: string;
  table: string;
}

export interface ClusteringKeySuggestion {
  column: string;
  where_frequency: number;
  join_frequency: number;
  relevance_score: number;
}

export interface ClusteringKeysResult {
  table: string;
  table_size_gb: number;
  row_count: number;
  suggestions: ClusteringKeySuggestion[];
  recommended_cluster_by: string[];
  estimated_scan_reduction_pct: number;
  ddl: string;
  execution_time_ms: number;
}

export interface MaterializationRequest {
  database: string;
  schema: string;
  table: string;
}

export interface MaterializationAlternativeInfo {
  best_for: string;
  target_lag?: string;
}

export interface MaterializationResult {
  table: string;
  recommendation: string;
  rationale: string;
  read_count_30d: number;
  write_count_30d: number;
  read_write_ratio: number;
  ddl_hint: string | null;
  alternatives: Record<string, MaterializationAlternativeInfo>;
  execution_time_ms: number;
}

export interface IngestionModeOptimizerRequest {
  database: string;
  schema: string;
  table: string;
}

export interface IngestionModeAlternative {
  mode: string;
  fit_score: number;
  reason: string;
}

export interface IngestionModeOptimizerResult {
  database: string;
  schema: string;
  table: string;
  analysis: {
    row_count: number;
    has_timestamp_columns: boolean;
    timestamp_columns: string[];
    has_primary_key: boolean;
    estimated_daily_inserts_pct: number;
    estimated_daily_updates_pct: number;
  };
  recommendation: {
    mode: string;
    watermark_column: string;
    reason: string;
    estimated_scan_reduction_pct: number;
  };
  alternatives: IngestionModeAlternative[];
  cortex_credits: number;
}

// ============================================================================
// PART 14 — AI Phase 4: Deployment Intelligence
// ============================================================================

export interface DeploymentRiskAction {
  ddl_type: string;
  target_table: string;
  ddl_sql: string;
}

// Backend now queries DDL actions internally — no body needed
export type DeploymentRiskRequest = Record<string, never>;

export interface DeploymentRiskActionResult {
  ddl_type: string;
  target_table: string;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  risk_score: number;
  factors: string[];
  mitigation: string | null;
}

export interface DeploymentRiskResult {
  overall_risk: string;
  risk_score: number;
  max_score: number;
  actions: DeploymentRiskActionResult[];
  recommendation: string;
  cortex_credits: number;
}

export interface DeployScheduleRequest {
  warehouse: string;
  preferred_window_hours?: number;
}

export interface DeployScheduleWindow {
  day_of_week: string;
  start_hour_utc: number;
  end_hour_utc: number;
  avg_utilization_pct: number;
  avg_concurrent_queries: number;
}

export interface AvoidWindow {
  day_of_week: string;
  start_hour_utc: number;
  end_hour_utc: number;
  reason: string;
}

export interface DeployScheduleResult {
  warehouse: string;
  optimal_window: DeployScheduleWindow;
  alternative_windows: DeployScheduleWindow[];
  avoid_windows: AvoidWindow[];
  cortex_credits: number;
}

// ============================================================================
// PART 15 — AI Phase 5: Continuous Learning
// ============================================================================

export interface AiFeedbackRequest {
  feature: string;
  suggestion_id: string;
  accepted: boolean;
  reason?: string;
}

export interface AiFeedbackResponse {
  feedback_id: string;
  project_id: string;
  feature: string;
  suggestion_id: string;
  accepted: boolean;
  recorded_at: string;
}

export interface AiFeedbackStatItem {
  feature: string;
  total: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number;
}

export interface AiFeedbackStatsResponse {
  project_id: string;
  stats: AiFeedbackStatItem[];
  overall_acceptance_rate: number;
}

export interface AiSavingsFeatureItem {
  feature: string;
  actions: number;
  estimated_savings: number;
  actual_savings: number;
}

export interface AiSavingsResponse {
  project_id: string;
  period_days: number;
  total_estimated_savings_credits: number;
  total_actual_savings_credits: number;
  by_feature: AiSavingsFeatureItem[];
  roi_multiplier: number;
}
