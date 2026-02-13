/**
 * Type definitions for the Unified Project Management API (/api/v1/projects)
 * and the Explore & Design Module API (/api/v1/explore-design).
 */

// ============================================================================
// PART 1 — Unified Project Management Types
// ============================================================================

// --- Enums / Union Types ---

export type ProjectType = 'explore_design' | 'workflow';

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
  requested_by?: string;
  approved_by?: string | null;
  deployed_at?: string | null;
  created_at?: string;
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
// PART 3 — Workflow Module Types (/api/v1/workflows)
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
