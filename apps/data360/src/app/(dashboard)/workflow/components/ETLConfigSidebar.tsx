'use client';

/**
 * ETL Config Sidebar.
 *
 * Hosts the right-side configuration panel for whichever node the user clicks
 * in the workflow canvas. The per-block forms (~75 of them) are each split
 * into their own file under `./config-forms/` and lazy-loaded via
 * `next/dynamic` so the workflow chunk only ships the form the user actually
 * opens.
 *
 * Adding a new block:
 *   1. Drop a new file under `./config-forms/<kebab-name>.tsx` with a default
 *      export.
 *   2. Add a `const <Name>ConfigForm = dynamic(...)` line below.
 *   3. Route the block type to it in the `renderConfig` switch.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Node } from 'reactflow';
import {
  X, AlertCircle, Trash2, Save,
} from 'lucide-react';
import { getBlockByType } from './etl-blocks';
import { FormField, Input } from './config-forms/_primitives';
import ConfigFormSkeleton from './config-forms/_skeleton';

// ============================================
// LAZY-LOADED CONFIG FORMS
// ============================================

const SourceConfigForm = dynamic(() => import('./config-forms/source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="source" />,
});
const JoinConfigForm = dynamic(() => import('./config-forms/join-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="join" />,
});
const FilterConfigForm = dynamic(() => import('./config-forms/filter-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="filter" />,
});
const AggregateConfigForm = dynamic(() => import('./config-forms/aggregate-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="aggregate" />,
});
const SelectConfigForm = dynamic(() => import('./config-forms/select-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="select" />,
});
const RenameConfigForm = dynamic(() => import('./config-forms/rename-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="rename" />,
});
const CastConfigForm = dynamic(() => import('./config-forms/cast-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="cast" />,
});
const FormulaConfigForm = dynamic(() => import('./config-forms/formula-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="formula" />,
});
const SortConfigForm = dynamic(() => import('./config-forms/sort-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="sort" />,
});
const UnionConfigForm = dynamic(() => import('./config-forms/union-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="union" />,
});
const DistinctConfigForm = dynamic(() => import('./config-forms/distinct-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="distinct" />,
});
const LimitConfigForm = dynamic(() => import('./config-forms/limit-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="limit" />,
});
const RecommendationConfigForm = dynamic(() => import('./config-forms/recommendation-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="recommendation" />,
});
const SegmentationConfigForm = dynamic(() => import('./config-forms/segmentation-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="segmentation" />,
});
const ClusteringConfigForm = dynamic(() => import('./config-forms/clustering-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="clustering" />,
});
const DestinationConfigForm = dynamic(() => import('./config-forms/destination-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="destination" />,
});
const ExportFileConfigForm = dynamic(() => import('./config-forms/export-file-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="export_file" />,
});
const SQLScriptConfigForm = dynamic(() => import('./config-forms/sql-script-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="sql_script" />,
});
const PythonScriptConfigForm = dynamic(() => import('./config-forms/python-script-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="python_script" />,
});
const NotebookRunConfigForm = dynamic(() => import('./config-forms/notebook-run-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="notebook_run" />,
});
const DynamicTableConfigForm = dynamic(() => import('./config-forms/dynamic-table-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="dynamic_table" />,
});
const StreamConsumeConfigForm = dynamic(() => import('./config-forms/stream-consume-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="stream_consume" />,
});
const CdcMergeConfigForm = dynamic(() => import('./config-forms/cdc-merge-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="cdc_merge" />,
});
const GitFileConfigForm = dynamic(() => import('./config-forms/git-file-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="git_file" />,
});
const ComputePoolConfigForm = dynamic(() => import('./config-forms/compute-pool-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="compute_pool" />,
});
const ContainerServiceConfigForm = dynamic(() => import('./config-forms/container-service-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="container_service" />,
});
const WindowRankConfigForm = dynamic(() => import('./config-forms/window-rank-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="window_rank" />,
});
const WindowLagLeadConfigForm = dynamic(() => import('./config-forms/window-lag-lead-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="window_lag_lead" />,
});
const WindowAggregateConfigForm = dynamic(() => import('./config-forms/window-aggregate-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="window_aggregate" />,
});
const WindowNtileConfigForm = dynamic(() => import('./config-forms/window-ntile-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="window_ntile" />,
});
const JsonFlattenConfigForm = dynamic(() => import('./config-forms/json-flatten-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="json_flatten" />,
});
const JsonExtractConfigForm = dynamic(() => import('./config-forms/json-extract-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="json_extract" />,
});
const JsonConstructConfigForm = dynamic(() => import('./config-forms/json-construct-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="json_construct" />,
});
const PivotConfigForm = dynamic(() => import('./config-forms/pivot-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="pivot" />,
});
const UnpivotConfigForm = dynamic(() => import('./config-forms/unpivot-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="unpivot" />,
});
const DateTransformConfigForm = dynamic(() => import('./config-forms/date-transform-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="date_transform" />,
});
const TimeSliceConfigForm = dynamic(() => import('./config-forms/time-slice-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="time_slice" />,
});
const FillNullsConfigForm = dynamic(() => import('./config-forms/fill-nulls-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="fill_nulls" />,
});
const CaseWhenConfigForm = dynamic(() => import('./config-forms/case-when-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="case_when" />,
});
const SplitColumnConfigForm = dynamic(() => import('./config-forms/split-column-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="split_column" />,
});
const S3SourceConfigForm = dynamic(() => import('./config-forms/s3-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="s3_source" />,
});
const AzureSourceConfigForm = dynamic(() => import('./config-forms/azure-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="azure_source" />,
});
const GCSSourceConfigForm = dynamic(() => import('./config-forms/gcs-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="gcs_source" />,
});
const PostgresSourceConfigForm = dynamic(() => import('./config-forms/postgres-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="postgres_source" />,
});
const MySQLSourceConfigForm = dynamic(() => import('./config-forms/my-sql-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="mysql_source" />,
});
const SalesforceSourceConfigForm = dynamic(() => import('./config-forms/salesforce-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="salesforce_source" />,
});
const SapSourceConfigForm = dynamic(() => import('./config-forms/sap-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="sap_source" />,
});
const OracleSourceConfigForm = dynamic(() => import('./config-forms/oracle-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="oracle_source" />,
});
const HubspotSourceConfigForm = dynamic(() => import('./config-forms/hubspot-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="hubspot_source" />,
});
const ServicenowSourceConfigForm = dynamic(() => import('./config-forms/servicenow-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="servicenow_source" />,
});
const ApiSourceConfigForm = dynamic(() => import('./config-forms/api-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="api_source" />,
});
const ExternalTableSourceConfigForm = dynamic(() => import('./config-forms/external-table-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="external_table_source" />,
});
const DynamicTableSourceConfigForm = dynamic(() => import('./config-forms/dynamic-table-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="dynamic_table_source" />,
});
const SharedDataSourceConfigForm = dynamic(() => import('./config-forms/shared-data-source-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="shared_data_source" />,
});
const CreateUDFConfigForm = dynamic(() => import('./config-forms/create-udf-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="create_udf" />,
});
const CreateProcedureConfigForm = dynamic(() => import('./config-forms/create-procedure-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="create_procedure" />,
});
const ApplyUDFConfigForm = dynamic(() => import('./config-forms/apply-udf-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="apply_udf" />,
});
const AIClassifyConfigForm = dynamic(() => import('./config-forms/ai-classify-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_classify" />,
});
const AISentimentConfigForm = dynamic(() => import('./config-forms/ai-sentiment-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_sentiment" />,
});
const AITranslateConfigForm = dynamic(() => import('./config-forms/ai-translate-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_translate" />,
});
const AICompleteConfigForm = dynamic(() => import('./config-forms/ai-complete-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_complete" />,
});
const FuzzyMatchConfigForm = dynamic(() => import('./config-forms/fuzzy-match-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="fuzzy_match" />,
});
const JSONPathExtractConfigForm = dynamic(() => import('./config-forms/json-path-extract-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="json_path_extract" />,
});
const QualifyFilterConfigForm = dynamic(() => import('./config-forms/qualify-filter-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="qualify_filter" />,
});
const CorrelationConfigForm = dynamic(() => import('./config-forms/correlation-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="correlation" />,
});
const HistogramConfigForm = dynamic(() => import('./config-forms/histogram-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="histogram" />,
});
const AIFilterConfigForm = dynamic(() => import('./config-forms/ai-filter-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_filter" />,
});
const AIAggConfigForm = dynamic(() => import('./config-forms/ai-agg-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_agg" />,
});
const RecursiveCTEConfigForm = dynamic(() => import('./config-forms/recursive-cte-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="recursive_cte" />,
});
const MLForecastConfigForm = dynamic(() => import('./config-forms/ml-forecast-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="forecast" />,
});
const MLAnomalyConfigForm = dynamic(() => import('./config-forms/ml-anomaly-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="anomaly_detect" />,
});
const AIExtractConfigForm = dynamic(() => import('./config-forms/ai-extract-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="ai_extract" />,
});
const DocumentAIConfigForm = dynamic(() => import('./config-forms/document-ai-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="document_ai" />,
});
const FinetuneConfigForm = dynamic(() => import('./config-forms/finetune-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="finetune" />,
});
const ClassificationTrainConfigForm = dynamic(() => import('./config-forms/classification-train-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="classification_train" />,
});
const MergeConfigForm = dynamic(() => import('./config-forms/merge-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="merge" />,
});
const RollupCubeConfigForm = dynamic(() => import('./config-forms/rollup-cube-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="rollup_cube" />,
});
const MatchRecognizeConfigForm = dynamic(() => import('./config-forms/match-recognize-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="match_recognize" />,
});
const TaskDagConfigForm = dynamic(() => import('./config-forms/task-dag-config-form'), {
  ssr: false,
  loading: () => <ConfigFormSkeleton type="task_dag" />,
});



// ============================================
// MAIN SIDEBAR COMPONENT
// ============================================

interface ETLConfigSidebarProps {
  node: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
  onDelete: (nodeId: string) => void;
  availableColumns: string[];
  accessToken?: string | null;
  leftInputColumns?: string[];
  rightInputColumns?: string[];
}

const ETLConfigSidebar: React.FC<ETLConfigSidebarProps> = ({
  node,
  onClose,
  onSave,
  onDelete,
  availableColumns,
  accessToken,
  leftInputColumns = [],
  rightInputColumns = [],
}) => {
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(false);

  // Memoize column options to avoid recreating 41 identical arrays per render
  const columnOptions = useMemo(
    () => availableColumns.map((c) => ({ value: c, label: c })),
    [availableColumns]
  );

  useEffect(() => {
    if (node) {
      setFormData(node.data || {});
      setErrors({});
      setHasChanges(false);
      setConfirmDeleteNode(false);
    }
  }, [node]);

  const handleChange = useCallback((data: any) => {
    setFormData(data);
    setHasChanges(true);
    setErrors({});
  }, []);

  // Real-time validation errors (computed on every formData change)
  const validationErrors = useMemo(() => {
    if (!node) return [];
    const config = formData.config || formData;
    const errs: string[] = [];
    const type = node.type || '';

    if (['source', 'src'].includes(type)) {
      if (!config.database && !config.database_name) errs.push('Database is required');
      if (!config.schema && !config.schema_name) errs.push('Schema is required');
      if (!config.table && !config.table_name) errs.push('Table is required');
    }
    if (['s3_source', 'azure_source', 'gcs_source'].includes(type)) {
      if (!config.stage_name) errs.push('Stage name is required');
      if (!config.file_path) errs.push('File path is required');
    }
    if (type === 'join') {
      if (!config.left_key && !config.join_key) errs.push('Left key is required');
      if (!config.right_key) errs.push('Right key is required');
    }
    if (type === 'destination') {
      if (!config.database && !config.database_name) errs.push('Database is required');
      if (!config.schema && !config.schema_name) errs.push('Schema is required');
      if (!config.table && !config.table_name) errs.push('Table name is required');
    }
    if (type === 'filter') {
      if (!config.filter_condition && (!config.conditions || config.conditions.length === 0)) {
        errs.push('At least one filter condition is required');
      }
    }
    if (type === 'aggregate') {
      if (!config.aggregations || config.aggregations.length === 0) {
        errs.push('At least one aggregation is required');
      }
    }
    if (type === 'select') {
      if (!config.columns || config.columns.length === 0) errs.push('Select at least one column');
    }
    return errs;
  }, [node, formData]);

  const isValid = validationErrors.length === 0;

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!node) return false;

    const config = formData.config || formData;

    switch (node.type) {
      case 'source':
      case 'src':
        if (!config.database) newErrors.database = 'Database is required';
        if (!config.schema) newErrors.schema = 'Schema is required';
        if (!config.table) newErrors.table = 'Table is required';
        break;
      case 'join':
        if (!config.left_key) newErrors.left_key = 'Left key is required';
        if (!config.right_key) newErrors.right_key = 'Right key is required';
        break;
      case 'select':
        if (!config.columns || config.columns.length === 0) newErrors.columns = 'Select at least one column';
        break;
      case 'limit':
        if (!config.limit || config.limit <= 0) newErrors.limit = 'Limit must be greater than 0';
        break;
      case 'recommendation':
        if (!config.score_column) newErrors.score_column = 'Score column name is required';
        break;
      case 'segmentation':
        if (!config.segment_column) newErrors.segment_column = 'Segment column name is required';
        break;
      case 'clustering':
        if (!config.cluster_column) newErrors.cluster_column = 'Cluster column name is required';
        break;
      case 'destination':
        if (!config.database) newErrors.database = 'Database is required';
        if (!config.schema) newErrors.schema = 'Schema is required';
        if (!config.table) newErrors.table = 'Table name is required';
        if (config.write_mode === 'merge' && (!config.merge_keys || config.merge_keys.length === 0)) {
          newErrors.merge_keys = 'Merge keys are required for merge mode';
        }
        break;
      case 'export_file':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        break;
      case 'sql_script':
        if (!config.sql_code) newErrors.sql_code = 'SQL code is required';
        break;
      case 'python_script':
        if (config.python_mode === 'inline') {
          if (!config.python_code) newErrors.python_code = 'Python code is required';
        } else {
          if (!config.database) newErrors.database = 'Database is required';
          if (!config.schema) newErrors.schema = 'Schema is required';
          if (!config.proc_name) newErrors.proc_name = 'Procedure name is required';
        }
        break;
      case 'notebook_run':
        if (!config.database) newErrors.database = 'Database is required';
        if (!config.schema) newErrors.schema = 'Schema is required';
        if (!config.notebook_name) newErrors.notebook_name = 'Notebook name is required';
        break;
      case 'dynamic_table':
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        if (!config.target_lag) newErrors.target_lag = 'Target lag is required';
        if (!config.warehouse) newErrors.warehouse = 'Warehouse is required';
        if (!config.query) newErrors.query = 'Query is required';
        break;
      case 'stream_consume':
        if (!config.stream_name) newErrors.stream_name = 'Stream name is required';
        if (!config.database) newErrors.database = 'Source database is required';
        if (!config.schema) newErrors.schema = 'Source schema is required';
        if (!config.source_object) newErrors.source_object = 'Source table/view is required';
        break;
      case 'cdc_merge':
        if (!config.stream_name) newErrors.stream_name = 'Stream name is required';
        if (!config.target_table) newErrors.target_table = 'Target table is required';
        if (!config.merge_keys) newErrors.merge_keys = 'Merge keys are required';
        break;
      case 'merge':
        if (!config.target_table) newErrors.target_table = 'Target table is required';
        if (!config.merge_keys) newErrors.merge_keys = 'Merge keys are required';
        if (!Array.isArray(config.clauses) || config.clauses.length === 0) {
          newErrors.clauses = 'At least one merge clause is required';
        }
        break;
      case 'rollup_cube':
        if (!config.group_by) newErrors.group_by = 'Group by columns are required';
        if (!config.aggregations) newErrors.aggregations = 'At least one aggregation is required';
        break;
      case 'match_recognize':
        if (!config.partition_by) newErrors.partition_by = 'Partition columns are required';
        if (!config.order_by) newErrors.order_by = 'Order columns are required';
        if (!config.pattern) newErrors.pattern = 'Pattern is required';
        if (!config.define) newErrors.define = 'At least one DEFINE rule is required';
        break;
      case 'task_dag':
        if (!config.root_task_name) newErrors.root_task_name = 'Root task name is required';
        if (!config.warehouse) newErrors.warehouse = 'Warehouse is required';
        break;
      case 'git_file':
        if (!config.repo_name) newErrors.repo_name = 'Repository name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      case 'compute_pool':
        if (!config.pool_name) newErrors.pool_name = 'Pool name is required';
        if (!config.min_nodes || config.min_nodes <= 0) newErrors.min_nodes = 'Min nodes must be greater than 0';
        if (!config.max_nodes || config.max_nodes <= 0) newErrors.max_nodes = 'Max nodes must be greater than 0';
        break;
      case 'container_service':
        if (!config.service_name) newErrors.service_name = 'Service name is required';
        if (!config.compute_pool) newErrors.compute_pool = 'Compute pool is required';
        if (!config.stage) newErrors.stage = 'Stage is required';
        if (!config.spec_file) newErrors.spec_file = 'Spec file is required';
        break;
      // Window Functions
      case 'window_rank':
        if (!config.order_by || config.order_by.length === 0) newErrors.order_by = 'At least one order by column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      case 'window_lag_lead':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.order_by || config.order_by.length === 0) newErrors.order_by = 'At least one order by column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      case 'window_aggregate':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      case 'window_ntile':
        if (!config.buckets || config.buckets <= 0) newErrors.buckets = 'Number of buckets must be greater than 0';
        if (!config.order_by || config.order_by.length === 0) newErrors.order_by = 'At least one order by column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // JSON
      case 'json_flatten':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        break;
      case 'json_extract':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        if (!config.extract_paths || config.extract_paths.length === 0) newErrors.extract_paths = 'At least one extract path is required';
        break;
      // AI Blocks validation
      case 'ai_classify':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        if (!config.categories) newErrors.categories = 'Categories are required';
        break;
      case 'ai_sentiment':
        if (!config.text_column) newErrors.text_column = 'Text column is required';
        break;
      case 'ai_translate':
        if (!config.text_column) newErrors.text_column = 'Text column is required';
        if (!config.target_lang) newErrors.target_lang = 'Target language is required';
        break;
      case 'ai_complete':
        if (!config.prompt_template) newErrors.prompt_template = 'Prompt template is required';
        break;
      case 'ml_forecast':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        if (!config.forecast_periods || config.forecast_periods <= 0) newErrors.forecast_periods = 'Forecast periods must be greater than 0';
        break;
      case 'ml_anomaly':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        break;
      case 'json_construct':
        if (!config.columns || config.columns.length === 0) newErrors.columns = 'Select at least one column';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // Pivot/Unpivot
      case 'pivot':
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        if (!config.pivot_column) newErrors.pivot_column = 'Pivot column is required';
        if (!config.pivot_values) newErrors.pivot_values = 'Pivot values are required';
        break;
      case 'unpivot':
        if (!config.unpivot_columns || config.unpivot_columns.length === 0) newErrors.unpivot_columns = 'Select at least one column to unpivot';
        break;
      // Date/Time
      case 'date_transform':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        if (config.operation === 'DATEDIFF' && !config.second_column) newErrors.second_column = 'Second column is required for DATEDIFF';
        break;
      case 'time_slice':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.slice_length || config.slice_length <= 0) newErrors.slice_length = 'Slice length must be greater than 0';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // Data Cleaning
      case 'fill_nulls':
        if (!config.column) newErrors.column = 'Column is required';
        if (config.strategy === 'VALUE' && !config.fill_value) newErrors.fill_value = 'Fill value is required when strategy is VALUE';
        if ((config.strategy === 'FORWARD_FILL' || config.strategy === 'BACKWARD_FILL') && !config.order_column) {
          newErrors.order_column = 'Order column is required for forward/backward fill';
        }
        break;
      case 'case_when':
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        if (!config.conditions || config.conditions.length === 0) newErrors.conditions = 'At least one condition is required';
        break;
      case 'split_column':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.delimiter) newErrors.delimiter = 'Delimiter is required';
        break;
      case 'fuzzy_match':
        if (!config.source_column) newErrors.source_column = 'Source column is required';
        if (!config.target_column) newErrors.target_column = 'Target column is required';
        break;
      case 'json_path_extract':
        if (!config.json_column) newErrors.json_column = 'JSON column is required';
        if (!config.json_path) newErrors.json_path = 'JSON path is required';
        break;
      case 'qualify_filter':
        if (!config.partition_columns) newErrors.partition_columns = 'Partition columns are required';
        if (!config.order_column) newErrors.order_column = 'Order column is required';
        break;
      case 'correlation':
        if (!config.column_a) newErrors.column_a = 'Column A is required';
        if (!config.column_b) newErrors.column_b = 'Column B is required';
        break;
      case 'histogram':
        if (!config.column) newErrors.column = 'Column is required';
        break;
      case 'ai_filter':
        if (!config.filter_prompt) newErrors.filter_prompt = 'Filter prompt is required';
        break;
      case 'ai_agg':
        if (!config.group_column) newErrors.group_column = 'Group column is required';
        if (!config.aggregation_prompt) newErrors.aggregation_prompt = 'Aggregation prompt is required';
        break;
      case 'recursive_cte':
        if (!config.id_column) newErrors.id_column = 'ID column is required';
        if (!config.parent_column) newErrors.parent_column = 'Parent column is required';
        if (!config.name_column) newErrors.name_column = 'Name column is required';
        break;
      // Cloud Sources
      case 's3_source':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      case 'azure_source':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      case 'gcs_source':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      // DB Sources
      case 'postgres_source':
        if (!config.connection_name) newErrors.connection_name = 'Connection name is required';
        if (!config.source_table) newErrors.source_table = 'Source table is required';
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.target_schema) newErrors.target_schema = 'Target schema is required';
        break;
      case 'mysql_source':
        if (!config.connection_name) newErrors.connection_name = 'Connection name is required';
        if (!config.source_table) newErrors.source_table = 'Source table is required';
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.target_schema) newErrors.target_schema = 'Target schema is required';
        break;
      // CRM/ERP Sources
      case 'salesforce_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.object_name) newErrors.object_name = 'Object name is required';
        break;
      case 'sap_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'oracle_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'hubspot_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.object_name) newErrors.object_name = 'Object name is required';
        break;
      case 'servicenow_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'api_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema name is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      // Other Sources
      case 'external_table_source':
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'dynamic_table_source':
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'shared_data_source':
        if (!config.share_database) newErrors.share_database = 'Shared database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      // Python UDF/Procedure
      case 'create_udf':
        if (!config.function_name) newErrors.function_name = 'Function name is required';
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.function_body) newErrors.function_body = 'Function body is required';
        break;
      case 'create_procedure':
        if (!config.procedure_name) newErrors.procedure_name = 'Procedure name is required';
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.procedure_body) newErrors.procedure_body = 'Procedure body is required';
        break;
      case 'apply_udf':
        if (!config.function_name) newErrors.function_name = 'Function name is required';
        if (!config.input_columns || config.input_columns.length === 0) newErrors.input_columns = 'At least one input column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // AI Functions
      case 'ai_extract':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        if (!config.extract_keys || config.extract_keys.length === 0) newErrors.extract_keys = 'Extract keys are required';
        break;
      // ML Training
      case 'forecast':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        break;
      case 'anomaly_detect':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        break;
      case 'document_ai':
        if (!config.model) newErrors.model = 'Model name is required';
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        break;
      case 'finetune':
        if (!config.base_model) newErrors.base_model = 'Base model is required';
        if (!config.training_table) newErrors.training_table = 'Training table is required';
        break;
      case 'classification_train':
        if (!config.target_column) newErrors.target_column = 'Target column is required';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [node, formData]);

  const handleSave = useCallback(() => {
    if (!node) return;
    if (validate()) {
      onSave(node.id, formData);
      setHasChanges(false);
    }
  }, [node, formData, validate, onSave]);

  const handleDelete = useCallback(() => {
    if (!node) return;
    setConfirmDeleteNode(true);
  }, [node]);

  const executeDeleteNode = useCallback(() => {
    if (!node) return;
    setConfirmDeleteNode(false);
    onDelete(node.id);
  }, [node, onDelete]);

  if (!node || !node.type) return null;

  const blockDef = getBlockByType(node.type);
  if (!blockDef) return null;

  const Icon = blockDef.icon;

  const renderConfig = () => {
    switch (node.type) {
      case 'source':
      case 'src':
        return <SourceConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'join':
        return <JoinConfigForm data={formData} onChange={handleChange} errors={errors} leftInputColumns={leftInputColumns} rightInputColumns={rightInputColumns} />;
      case 'filter':
      case 'drop_nulls':
        return <FilterConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'aggregate':
      case 'aggregate_kpi':
        return <AggregateConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'select':
        return <SelectConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'rename':
        return <RenameConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'cast':
        return <CastConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'formula':
      case 'normalize':
        return <FormulaConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'sort':
        return <SortConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'union':
        return <UnionConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'distinct':
      case 'drop_duplicates':
        return <DistinctConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'limit':
        return <LimitConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'recommendation':
        return <RecommendationConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'segmentation':
        return <SegmentationConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'clustering':
        return <ClusteringConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'destination':
        return <DestinationConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'export_file':
      case 'export_excel':
        return <ExportFileConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'sql_script':
        return <SQLScriptConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'python_script':
        return <PythonScriptConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'notebook_run':
        return <NotebookRunConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'dynamic_table':
        return <DynamicTableConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'stream_consume':
        return <StreamConsumeConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'cdc_merge':
        return <CdcMergeConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'git_file':
        return <GitFileConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'compute_pool':
        return <ComputePoolConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'container_service':
        return <ContainerServiceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // Window Functions
      case 'window_rank':
        return <WindowRankConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'window_lag_lead':
        return <WindowLagLeadConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'window_aggregate':
        return <WindowAggregateConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'window_ntile':
        return <WindowNtileConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // JSON
      case 'json_flatten':
        return <JsonFlattenConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'json_extract':
        return <JsonExtractConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'json_construct':
        return <JsonConstructConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // Pivot/Unpivot
      case 'pivot':
        return <PivotConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'unpivot':
        return <UnpivotConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // Date/Time
      case 'date_transform':
        return <DateTransformConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'time_slice':
        return <TimeSliceConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // Data Cleaning
      case 'fill_nulls':
        return <FillNullsConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'case_when':
        return <CaseWhenConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'split_column':
        return <SplitColumnConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // Cloud Sources
      case 's3_source':
        return <S3SourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'azure_source':
        return <AzureSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'gcs_source':
        return <GCSSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // DB Sources
      case 'postgres_source':
        return <PostgresSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'mysql_source':
        return <MySQLSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // CRM/ERP Sources
      case 'salesforce_source':
        return <SalesforceSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'sap_source':
        return <SapSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'oracle_source':
        return <OracleSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'hubspot_source':
        return <HubspotSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'servicenow_source':
        return <ServicenowSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'api_source':
        return <ApiSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // Other Sources
      case 'external_table_source':
        return <ExternalTableSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'dynamic_table_source':
        return <DynamicTableSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'shared_data_source':
        return <SharedDataSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // Python UDF/Procedure
      case 'create_udf':
        return <CreateUDFConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'create_procedure':
        return <CreateProcedureConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'apply_udf':
        return <ApplyUDFConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // AI Blocks
      case 'ai_classify':
        return <AIClassifyConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'ai_sentiment':
        return <AISentimentConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'ai_translate':
        return <AITranslateConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'ai_complete':
        return <AICompleteConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'ai_extract':
        return <AIExtractConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'forecast':
      case 'ml_forecast':
        return <MLForecastConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'anomaly_detect':
      case 'ml_anomaly':
        return <MLAnomalyConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'document_ai':
        return <DocumentAIConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'finetune':
        return <FinetuneConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'classification_train':
        return <ClassificationTrainConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // New blocks
      case 'fuzzy_match':
        return <FuzzyMatchConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'json_path_extract':
        return <JSONPathExtractConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'qualify_filter':
        return <QualifyFilterConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'correlation':
        return <CorrelationConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'histogram':
        return <HistogramConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'ai_filter':
        return <AIFilterConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'ai_agg':
        return <AIAggConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'recursive_cte':
        return <RecursiveCTEConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      // Advanced grouping / pattern / orchestration blocks
      case 'merge':
        return <MergeConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'rollup_cube':
        return <RollupCubeConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'match_recognize':
        return <MatchRecognizeConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} columnOptions={columnOptions} />;
      case 'task_dag':
        return <TaskDagConfigForm data={formData} onChange={handleChange} errors={errors} />;
      default:
        return <p className="text-slate-500">No configuration available for this block.</p>;
    }
  };

  return (
    <div className="w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className={cn('px-4 py-3 border-b border-slate-200 dark:border-slate-700', blockDef.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg bg-white/80 dark:bg-slate-700/80', blockDef.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                {blockDef.label}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {blockDef.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Node Name */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <FormField label="Component Name" hint="Optional display name">
          <Input
            value={formData.name || ''}
            onChange={(v) => handleChange({ ...formData, name: v })}
            placeholder={blockDef.label}
          />
        </FormField>
      </div>

      {/* Config form */}
      <div className="flex-1 overflow-auto p-4">
        {renderConfig()}
      </div>

      {/* Errors */}
      {Object.keys(errors).length > 0 && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Please fix the errors above</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2">
        {validationErrors.length > 0 && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Required fields missing:</p>
            {validationErrors.map((err, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span>•</span> {err}
              </p>
            ))}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={!hasChanges || !isValid}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
            hasChanges && isValid
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
          )}
        >
          <Save className="h-4 w-4" />
          Save Configuration
        </button>

        {!confirmDeleteNode ? (
          <button
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete Node
          </button>
        ) : (
          <div className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
            <span className="text-sm text-red-700 dark:text-red-300">Delete this node?</span>
            <button
              onClick={executeDeleteNode}
              className="px-3 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDeleteNode(false)}
              className="px-3 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ETLConfigSidebar);
