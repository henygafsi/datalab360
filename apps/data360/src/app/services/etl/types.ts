/**
 * ETL Pipeline Types
 *
 * Type definitions for the new ETL pipeline API
 * Migrated from /workflow/* to /etl/*
 */

// ============================================
// COMPONENT TYPES
// ============================================

export type ComponentCategory = 'source' | 'transform' | 'destination';

export type ComponentType =
  | 'source'
  | 'join'
  | 'filter'
  | 'aggregate'
  | 'select'
  | 'rename'
  | 'cast'
  | 'formula'
  | 'sort'
  | 'union'
  | 'distinct'
  | 'limit'
  | 'recommendation'
  | 'segmentation'
  | 'clustering'
  | 'destination'
  | 'export_file';

// Component position for visual builder
export interface Position {
  x: number;
  y: number;
}

// ============================================
// COMPONENT CONFIGURATIONS
// ============================================

export interface SourceConfig {
  database: string;
  schema: string;
  table: string;
  columns?: string[] | null; // null = SELECT *
  where_clause?: string;
}

export interface JoinConfig {
  join_type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  left_key: string;
  right_key: string;
  exclude_right_columns?: string[];
}

export interface FilterCondition {
  _key?: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value: string | number | boolean | null;
}

export interface FilterConfig {
  conditions: FilterCondition[];
  logic: 'AND' | 'OR';
}

export interface AggregationDef {
  _key?: string;
  column: string;
  function: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT_DISTINCT' | 'LISTAGG';
  alias: string;
}

export interface AggregateConfig {
  group_by: string[];
  aggregations: AggregationDef[];
}

export interface SelectConfig {
  columns: string[];
}

export interface RenameConfig {
  mappings: Record<string, string>; // { old_name: new_name }
}

export interface CastConfig {
  casts: Record<string, string>; // { column: type }
}

export interface FormulaDef {
  _key?: string;
  name: string;
  expression: string;
}

export interface FormulaConfig {
  formulas: FormulaDef[];
}

export interface SortOrderDef {
  _key?: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface SortConfig {
  order_by: SortOrderDef[];
}

export interface UnionConfig {
  union_all?: boolean;
}

export interface DistinctConfig {
  columns?: string[]; // empty = all columns
}

export interface LimitConfig {
  limit: number;
  offset?: number;
}

/** Recommendation: score/ranking (Cortex LLM or custom model). Default capability for workflow. */
export interface RecommendationConfig {
  score_column: string;
  model_type?: 'cortex' | 'custom';
  input_id_column?: string;
  output_table?: string;
}

/** Segmentation: assign segment (RFM, rules, or model). Default capability for workflow. */
export interface SegmentationConfig {
  segment_column: string;
  method: 'rules' | 'rfm' | 'model';
  rules?: Array<{ _key?: string; name: string; condition: string }>;
}

/** Clustering: assign cluster (Cortex ML or SQL). Default capability for workflow. */
export interface ClusteringConfig {
  cluster_column: string;
  method: 'cortex_ml' | 'kmeans_sql';
  n_clusters?: number;
  feature_columns?: string[];
}

export interface DestinationConfig {
  database: string;
  schema: string;
  table: string;
  write_mode: 'overwrite' | 'append' | 'merge';
  merge_keys?: string[]; // required for merge mode
}

export interface ExportFileConfig {
  format: 'csv' | 'parquet' | 'json';
  stage_name: string;
  file_name?: string;
  compression?: 'GZIP' | 'NONE';
}

// Union type for all configs
export type ComponentConfig =
  | SourceConfig
  | JoinConfig
  | FilterConfig
  | AggregateConfig
  | SelectConfig
  | RenameConfig
  | CastConfig
  | FormulaConfig
  | SortConfig
  | UnionConfig
  | DistinctConfig
  | LimitConfig
  | RecommendationConfig
  | SegmentationConfig
  | ClusteringConfig
  | DestinationConfig
  | ExportFileConfig;

// ============================================
// PIPELINE COMPONENT
// ============================================

export interface PipelineComponent {
  id: string;
  type: ComponentType;
  name?: string;
  config: ComponentConfig;
  inputs: string[]; // IDs of input components
  position?: Position;
}

// ============================================
// COMPONENT TEMPLATE (from API)
// ============================================

export interface ComponentTemplate {
  type: ComponentType;
  display_name: string;
  description: string;
  icon: string;
  category: ComponentCategory;
  config_schema: Record<string, any>;
  max_inputs: number;
  min_inputs: number;
  color: string;
}

export interface ComponentTemplatesResponse {
  templates: ComponentTemplate[];
  categories: ComponentCategory[];
}

// ============================================
// PIPELINE
// ============================================

export interface Pipeline {
  pipeline_id: string;
  name: string;
  description?: string;
  components: PipelineComponent[];
  tags?: string[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  status?: 'active' | 'inactive' | 'archived';
  run_count?: number;
}

export interface PipelineValidation {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  execution_order: string[];
  estimated_complexity: 'low' | 'medium' | 'high';
}

export interface CreatePipelineRequest {
  name: string;
  description?: string;
  components: PipelineComponent[];
  tags?: string[];
}

export interface CreatePipelineResponse {
  pipeline_id: string;
  name: string;
  message: string;
  validation: PipelineValidation;
}

export interface ListPipelinesResponse {
  pipelines: Pipeline[];
  total: number;
}

// ============================================
// EXECUTION
// ============================================

export interface GeneratedSQL {
  component_id: string;
  sql: string;
}

export interface PipelineRun {
  run_id: string;
  pipeline_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  components_executed: number;
  rows_processed?: number;
  generated_sql?: GeneratedSQL[];
  error_message?: string;
}

export interface ExecutePipelineResponse {
  run_id: string;
  pipeline_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  components_executed: number;
  rows_processed?: number;
  generated_sql?: GeneratedSQL[];
}

export interface InlineExecuteRequest {
  components: PipelineComponent[];
  dry_run?: boolean;
}

export interface PipelineRunsResponse {
  pipeline_id: string;
  runs: PipelineRun[];
}

// ============================================
// SCHEDULING
// ============================================

export interface Schedule {
  schedule_id: string;
  pipeline_id: string;
  pipeline_name?: string;
  task_name: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at?: string;
  created_by?: string;
}

export interface CreateScheduleRequest {
  pipeline_id: string;
  cron_expression: string;
  timezone?: string;
  is_active?: boolean;
}

export interface CreateScheduleResponse {
  schedule_id: string;
  pipeline_id: string;
  task_name: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  message: string;
}

export interface UpdateScheduleRequest {
  cron_expression?: string;
  timezone?: string;
  is_active?: boolean;
}

export interface ListSchedulesResponse {
  schedules: Schedule[];
  total: number;
}

export interface ScheduleHistoryEntry {
  run_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  rows_processed?: number;
  error_message?: string;
}

export interface ScheduleHistoryResponse {
  schedule_id: string;
  history: ScheduleHistoryEntry[];
}

// ============================================
// VALIDATION
// ============================================

export interface ValidatePipelineRequest {
  components: PipelineComponent[];
}

export interface ValidatePipelineResponse extends PipelineValidation {}

export interface ValidateSuggestionsRequest {
  errors?: string[];
  warnings?: string[];
  components?: PipelineComponent[];
  execution_order?: string[];
  estimated_complexity?: string;
  model?: string;
}

export interface ValidateSuggestionsResponse {
  response: string;
  model: string;
}

// ============================================
// UI HELPERS
// ============================================

// For ReactFlow integration
export interface ETLNode {
  id: string;
  type: ComponentType;
  position: Position;
  data: {
    component: PipelineComponent;
    template?: ComponentTemplate;
  };
}

export interface ETLEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// Convert Pipeline to ReactFlow format
export function pipelineToReactFlow(pipeline: Pipeline): { nodes: ETLNode[]; edges: ETLEdge[] } {
  const nodes: ETLNode[] = pipeline.components.map((component) => ({
    id: component.id,
    type: component.type,
    position: component.position || { x: 0, y: 0 },
    data: { component },
  }));

  const edges: ETLEdge[] = [];
  pipeline.components.forEach((component) => {
    component.inputs.forEach((inputId, index) => {
      edges.push({
        id: `${inputId}-${component.id}`,
        source: inputId,
        target: component.id,
        targetHandle: component.type === 'join' ? `input${index + 1}` : undefined,
      });
    });
  });

  return { nodes, edges };
}

// Convert ReactFlow to Pipeline format
export function reactFlowToPipeline(
  nodes: ETLNode[],
  edges: ETLEdge[],
  name: string,
  description?: string,
  tags?: string[]
): CreatePipelineRequest {
  const components: PipelineComponent[] = nodes.map((node) => {
    const inputs = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => edge.source);

    return {
      id: node.id,
      type: node.type,
      name: node.data.component?.name,
      config: node.data.component?.config || {},
      inputs,
      position: node.position,
    };
  });

  return { name, description, components, tags };
}
