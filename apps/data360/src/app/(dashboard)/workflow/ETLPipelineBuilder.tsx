'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  ReactFlowInstance,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Play, Save, Trash2, ChevronRight, ChevronLeft,
  Loader2, History, AlertCircle, AlertTriangle, CheckCircle,
  Eye, Code, Calendar, Sparkles, Users, X, Clock
} from 'lucide-react';
import { Loader, Button } from 'rizzui';

// Components
import ETLPalette from './components/ETLPalette';
import ETLConfigSidebar from './components/ETLConfigSidebar';
import ScheduleManager from './components/ScheduleManager';
import TasksPanel from './components/TasksPanel';
import ETLExecutionHistory from './components/ETLExecutionHistory';
import AccessManagementSlot from '@/app/(dashboard)/explore-design/components/AccessManagementSlot';
import { etlNodeTypes } from './components/ETLNodeTypes';
import { getBlockByType, convertLegacyType } from './components/etl-blocks';

// Workflow API services
import * as workflowApi from '@/app/services/api/workflowApi';
import { listProjects, listContributors } from '@/app/services/api/projectsApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { ContributorRole } from '@/app/services/api/types';
import type {
  Workflow,
  WorkflowStep,
  WorkflowActionType,
  WorkflowExecutionResponse,
  CompileWorkflowResponse,
  ValidateWorkflowResponse,
} from '@/app/services/api/types';

// ============================================
// TYPES
// ============================================

interface ETLPipelineBuilderProps {
  className?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Safely extract a string from an error that might be an object {error_code, message} */
function extractErrorString(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.error_code === 'string') return obj.error_code;
    return JSON.stringify(err);
  }
  return String(err);
}

function generateId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Build CreateWorkflowStepInput array from ReactFlow nodes/edges
// Payload uses flat keys matching the API (database_name, schema_name, etc.)
// plus reserved keys: inputs (step_ids this step reads from), cte_alias, position, nodeId
function nodesToStepInputs(nodes: Node[], edges: Edge[]) {
  return nodes.map((node) => {
    const inputs = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => edge.source);

    const config = node.data?.config || node.data || {};
    const stepName = node.data?.name || node.type || 'step';
    const nodeType = node.type || 'source';

    // Derive flat payload keys from structured config for backend template compatibility
    const derived: Record<string, any> = {};

    // Filter: conditions[] → filter_condition string
    if (nodeType === 'filter' && Array.isArray(config.conditions) && config.conditions.length > 0 && !config.filter_condition) {
      const logic = config.logic || 'AND';
      derived.filter_condition = config.conditions
        .map((c: any) => {
          const val = typeof c.value === 'string' ? `'${c.value.replace(/'/g, "''")}'` : c.value;
          return `${c.column} ${c.operator || '='} ${val}`;
        })
        .join(` ${logic} `);
    }

    // Aggregate: aggregations[] → flat keys for template
    if (nodeType === 'aggregate' && Array.isArray(config.aggregations) && config.aggregations.length > 0) {
      const agg = config.aggregations[0];
      if (!config.agg_type) derived.agg_type = agg.function || 'COUNT';
      if (!config.column) derived.column = agg.column || '*';
      if (!config.new_kpi_name) derived.new_kpi_name = agg.alias || `${agg.function}_${agg.column}`;
      if (Array.isArray(config.group_by)) {
        derived.group_by_columns = config.group_by.join(', ');
      }
    }

    // Sort: order_by[] → flat string
    if (nodeType === 'sort' && Array.isArray(config.order_by)) {
      derived.order_by = config.order_by
        .map((o: any) => typeof o === 'object' ? `${o.column} ${o.direction || 'ASC'}` : o)
        .join(', ');
    }

    // Limit: limit → row_count
    if (nodeType === 'limit' && config.limit && !config.row_count) {
      derived.row_count = config.limit;
    }

    return {
      action_type: convertLegacyType(nodeType) as WorkflowActionType,
      step_name: stepName,
      payload: {
        ...config,
        ...derived,
        inputs,
        cte_alias: stepName.toLowerCase().replace(/\s+/g, '_'),
        position: node.position,
        nodeId: node.id,
      },
    };
  });
}

// Convert workflow steps to ReactFlow nodes/edges
// Payload stores flat keys (database_name, schema_name, etc.) + reserved keys (inputs, cte_alias, position, nodeId)
function stepsToReactFlow(steps: WorkflowStep[]): { nodes: Node[]; edges: Edge[] } {
  // Build step_order → nodeId map for API-created pipelines
  const orderToNodeId: Record<string, string> = {};

  const nodes: Node[] = steps.map((step, idx) => {
    const payload = step.payload || {};
    // Auto-layout: horizontal flow (left→right), stagger vertically for joins
    const isSource = step.action_type === 'source' || step.action_type?.endsWith('_source');
    const sourceCount = steps.filter((s, i) => i < idx && (s.action_type === 'source' || s.action_type?.endsWith('_source'))).length;
    const nonSourceIdx = idx - steps.filter((s, i) => i <= idx && (s.action_type === 'source' || s.action_type?.endsWith('_source'))).length + (isSource ? 0 : steps.filter(s => s.action_type === 'source' || s.action_type?.endsWith('_source')).length);
    const defaultPos = isSource
      ? { x: 50, y: 50 + sourceCount * 200 }
      : { x: 50 + nonSourceIdx * 280, y: 120 };
    const position = (payload.position as { x: number; y: number }) || defaultPos;
    const stepName = step.step_name;
    const nodeId = (payload.nodeId as string) || step.step_id;

    // Map step_order to nodeId for edge resolution
    orderToNodeId[String(step.step_order)] = nodeId;

    // Extract config (everything except reserved keys)
    const { inputs: _inputs, cte_alias: _cte, position: _pos, nodeId: _nid,
            input_step: _is, left_step: _ls, right_step: _rs, ...config } = payload;

    return {
      id: nodeId,
      type: convertLegacyType(step.action_type),
      position,
      data: {
        ...config,
        name: stepName,
        step_order: step.step_order,
        config,
      },
    };
  });

  const edges: Edge[] = [];
  steps.forEach((step) => {
    const payload = step.payload || {};
    const nodeId = (payload.nodeId as string) || step.step_id;
    const blockDef = getBlockByType(step.action_type);

    // Method 1: Frontend-saved format — payload.inputs = [nodeId1, nodeId2]
    const inputs = (payload.inputs as string[]) || [];
    if (inputs.length > 0) {
      inputs.forEach((inputId, index) => {
        edges.push({
          id: `${inputId}-${nodeId}`,
          source: inputId,
          target: nodeId,
          targetHandle: blockDef?.maxInputs === 2 ? `input${index + 1}` : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
          style: { strokeWidth: 2, stroke: '#10B981' },
          animated: false,
        });
      });
      return;
    }

    // Method 2: API-created format — left_step/right_step (join) or input_step (others)
    const leftStep = payload.left_step as string;
    const rightStep = payload.right_step as string;
    const inputStep = payload.input_step as string;

    if (leftStep && orderToNodeId[leftStep]) {
      edges.push({
        id: `${orderToNodeId[leftStep]}-${nodeId}-L`,
        source: orderToNodeId[leftStep],
        target: nodeId,
        targetHandle: 'input1',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
        style: { strokeWidth: 2, stroke: '#10B981' },
        animated: false,
      });
    }
    if (rightStep && orderToNodeId[rightStep]) {
      edges.push({
        id: `${orderToNodeId[rightStep]}-${nodeId}-R`,
        source: orderToNodeId[rightStep],
        target: nodeId,
        targetHandle: 'input2',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
        style: { strokeWidth: 2, stroke: '#10B981' },
        animated: false,
      });
    }
    if (inputStep && orderToNodeId[inputStep] && !leftStep) {
      edges.push({
        id: `${orderToNodeId[inputStep]}-${nodeId}`,
        source: orderToNodeId[inputStep],
        target: nodeId,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
        style: { strokeWidth: 2, stroke: '#10B981' },
        animated: false,
      });
    }
  });

  return { nodes, edges };
}

// ============================================
// MAIN COMPONENT
// ============================================

const ETLPipelineBuilder: React.FC<ETLPipelineBuilderProps> = ({ className }) => {
  const { isAuthenticated } = useAuth();
  const accessToken = typeof window !== 'undefined' ? (localStorage.getItem('access_token') || localStorage.getItem('snowflake_token') || '') : '';

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Pipeline/Workflow state
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = useState<string>('New Pipeline');
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [pipelineName, setPipelineName] = useState('New Pipeline');
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [executionRefreshKey, setExecutionRefreshKey] = useState(0);

  // UI state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'schedules' | 'sql' | 'ai' | 'tasks'>('runs');
  const [showMembers, setShowMembers] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showErrorPanel, setShowErrorPanel] = useState(false);

  // Role-based access
  const { username: currentUsername } = useAuth();
  const [userRole, setUserRole] = useState<ContributorRole | null>(null);
  const isReadOnly = userRole === 'viewer';

  const readOnlyGuard = useCallback(() => {
    if (isReadOnly) {
      toast.error('You have view-only access to this workflow');
      return true;
    }
    return false;
  }, [isReadOnly]);

  // Execution state
  const [lastExecution, setLastExecution] = useState<WorkflowExecutionResponse | null>(null);
  const [compiledSql, setCompiledSql] = useState<CompileWorkflowResponse | null>(null);
  const [validation, setValidation] = useState<ValidateWorkflowResponse | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  // Persistent error display (shown in Runs panel instead of disappearing toast)
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // ============================================
  // LOAD DATA
  // ============================================

  // Load workflows on mount
  const loadWorkflows = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await listProjects({ project_type: 'workflow', mine_only: true });
      setWorkflows(
        (response.projects || []).map((p) => ({ id: p.project_id, name: p.project_name }))
      );
    } catch (error) {
      console.error('Failed to load workflows:', error);
      setLoadError(getApiErrorMessage(error) || 'Failed to load workflows');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  // ============================================
  // DRAG AND DROP
  // ============================================

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isReadOnly) { toast.error('You have view-only access to this workflow'); return; }

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: generateId(),
        type,
        position,
        data: { config: {} },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  // ============================================
  // CONNECTIONS
  // ============================================

  const onConnect = useCallback(
    (params: Connection) => {
      if (isReadOnly) return;
      if (!params.source || !params.target) return;

      const targetNode = nodes.find((n) => n.id === params.target);
      if (!targetNode) return;

      const blockDef = getBlockByType(targetNode.type || '');
      if (!blockDef) return;

      // Check max inputs
      const existingInputs = edges.filter((e) => e.target === params.target).length;
      if (existingInputs >= blockDef.maxInputs) {
        toast.error(`${blockDef.label} can only have ${blockDef.maxInputs} input(s)`);
        return;
      }

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
            style: { strokeWidth: 2, stroke: '#10B981' },
            animated: false,
          },
          eds
        )
      );
    },
    [nodes, edges, setEdges]
  );

  // ============================================
  // NODE SELECTION & EDITING
  // ============================================

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setShowSidebar(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowSidebar(false);
  }, []);

  const handleNodeSave = useCallback(
    (nodeId: string, data: any) => {
      if (readOnlyGuard()) return;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...data } }
            : node
        )
      );
      toast.success('Node configuration saved');
    },
    [setNodes]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      if (readOnlyGuard()) return;
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      );
      setSelectedNode(null);
      setShowSidebar(false);
      toast.success('Node deleted');
    },
    [setNodes, setEdges]
  );

  // ============================================
  // COLUMN PROPAGATION
  // ============================================

  /**
   * Recursively calculate output columns for a node based on its type and upstream inputs.
   * This enables column propagation through the entire pipeline.
   */
  const getNodeOutputColumns = useCallback((nodeId: string, visited: Set<string> = new Set()): string[] => {
    // Prevent infinite loops in circular graphs
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];

    const nodeType = node.type || '';
    const config = node.data?.config || node.data || {};

    // Get input columns from upstream nodes
    const inputEdges = edges.filter((e) => e.target === nodeId);
    const getUpstreamColumns = (): string[] => {
      const allColumns: string[] = [];
      inputEdges.forEach((edge) => {
        const upstreamCols = getNodeOutputColumns(edge.source, new Set(visited));
        allColumns.push(...upstreamCols);
      });
      return Array.from(new Set(allColumns));
    };

    // Calculate output columns based on node type
    switch (nodeType) {
      // SOURCE: Returns selected columns from the table
      case 'source':
      case 'src':
      case 's3_source':
      case 'azure_source':
      case 'gcs_source':
      case 'postgres_source':
      case 'mysql_source':
      case 'external_table_source':
      case 'dynamic_table_source':
      case 'shared_data_source':
      case 'salesforce_source':
      case 'sap_source':
      case 'oracle_source':
      case 'hubspot_source':
      case 'servicenow_source':
      case 'api_source':
      case 'stream_consume': {
        const columns = config.columns || [];
        return Array.isArray(columns) ? (columns as string[]) : [];
      }

      // JOIN: Combine columns from both inputs (minus excluded columns)
      case 'join':
      case 'join_tables': {
        const sortedEdges = inputEdges.sort((a, b) =>
          (a.targetHandle || '').localeCompare(b.targetHandle || '')
        );
        const leftCols: string[] = [];
        const rightCols: string[] = [];

        sortedEdges.forEach((edge, index) => {
          const upstreamCols = getNodeOutputColumns(edge.source, new Set(visited));
          if (index === 0) {
            leftCols.push(...upstreamCols);
          } else {
            rightCols.push(...upstreamCols);
          }
        });

        // Exclude specified right columns (to avoid duplicates like join keys)
        const excludeRight = config.exclude_right_columns || [];
        const filteredRight = rightCols.filter((c) => !excludeRight.includes(c));

        return [...leftCols, ...filteredRight];
      }

      // AGGREGATE: Returns group_by columns + aggregation aliases
      case 'aggregate':
      case 'aggregate_kpi': {
        const groupBy = config.group_by || [];
        const aggregations = config.aggregations || [];
        const aggAliases = aggregations
          .map((agg: { alias?: string; column?: string; function?: string }) =>
            agg.alias || `${agg.function}_${agg.column}`)
          .filter(Boolean);
        return [...groupBy, ...aggAliases];
      }   

      // SELECT: Returns only the selected columns
      case 'select': {
        const selectedCols = config.columns || [];
        return Array.isArray(selectedCols) ? (selectedCols as string[]) : [];
      }

      // RENAME: Returns columns with renamed names applied
      case 'rename': {
        const upstreamCols = getUpstreamColumns();
        const mappings: Record<string, string> = config.mappings || {};
        return upstreamCols.map((col) => mappings[col] || col);
      }

      // FORMULA: Returns input columns + new formula column names
      case 'formula':
      case 'normalize': {
        const upstreamCols = getUpstreamColumns();
        const formulas = config.formulas || [];
        const newColumns = formulas
          .map((f: { name?: string }) => f.name)
          .filter(Boolean);
        return [...upstreamCols, ...newColumns];
      }

      // CAST: Columns remain the same (only types change)
      case 'cast': {
        return getUpstreamColumns();
      }

      // RECOMMENDATION: Passes through + adds score column
      case 'recommendation': {
        const upstreamCols = getUpstreamColumns();
        const scoreCol = config.score_column;
        return scoreCol ? [...upstreamCols, scoreCol] : upstreamCols;
      }

      // SEGMENTATION: Passes through + adds segment column
      case 'segmentation': {
        const upstreamCols = getUpstreamColumns();
        const segCol = config.segment_column;
        return segCol ? [...upstreamCols, segCol] : upstreamCols;
      }

      // CLUSTERING: Passes through + adds cluster column
      case 'clustering': {
        const upstreamCols = getUpstreamColumns();
        const clusterCol = config.cluster_column;
        return clusterCol ? [...upstreamCols, clusterCol] : upstreamCols;
      }

      // FILTER, SORT, DISTINCT, LIMIT: Pass through all upstream columns unchanged
      case 'filter':
      case 'drop_nulls':
      case 'sort':
      case 'distinct':
      case 'drop_duplicates':
      case 'limit':
      case 'fill_nulls':
      case 'date_transform':
      case 'time_slice': {
        return getUpstreamColumns();
      }

      // WINDOW functions: Pass through + add computed column
      case 'window_rank':
      case 'window_lag_lead':
      case 'window_aggregate':
      case 'window_ntile': {
        const upstreamCols = getUpstreamColumns();
        const outputCol = config.output_column || config.alias;
        return outputCol ? [...upstreamCols, outputCol] : upstreamCols;
      }

      // CASE WHEN / SPLIT: Pass through + add new column
      case 'case_when': {
        const upstreamCols = getUpstreamColumns();
        const newCol = config.output_column || config.alias;
        return newCol ? [...upstreamCols, newCol] : upstreamCols;
      }

      case 'split_column': {
        const upstreamCols = getUpstreamColumns();
        const parts = config.output_columns || [];
        return [...upstreamCols, ...(Array.isArray(parts) ? parts : [])];
      }

      // JSON transforms: Pass through + add extracted/flattened columns
      case 'json_flatten':
      case 'json_extract': {
        const upstreamCols = getUpstreamColumns();
        const extractedCols = config.output_columns || config.columns || [];
        return [...upstreamCols, ...(Array.isArray(extractedCols) ? extractedCols : [])];
      }

      case 'json_construct': {
        const upstreamCols = getUpstreamColumns();
        const jsonCol = config.output_column || 'JSON_OUTPUT';
        return [...upstreamCols, jsonCol];
      }

      // PIVOT / UNPIVOT: Schema-changing — use config output columns or pass through
      case 'pivot':
      case 'unpivot': {
        const outputCols = config.output_columns || config.columns || [];
        return Array.isArray(outputCols) && outputCols.length > 0
          ? outputCols
          : getUpstreamColumns();
      }

      // AI Functions: Pass through + add AI output column
      case 'ai_classify':
      case 'ai_sentiment':
      case 'ai_translate':
      case 'ai_extract':
      case 'ai_complete': {
        const upstreamCols = getUpstreamColumns();
        const aiCol = config.output_column || config.alias || `${nodeType}_result`;
        return [...upstreamCols, aiCol];
      }

      // ML Training / Prediction: Pass through + add prediction columns
      case 'classification_train':
      case 'anomaly_detect':
      case 'forecast': {
        const upstreamCols = getUpstreamColumns();
        const predCol = config.output_column || 'PREDICTION';
        return [...upstreamCols, predCol];
      }

      // Code blocks: Output columns unknown at design time — pass through
      case 'sql_script':
      case 'python_script':
      case 'notebook_run':
      case 'create_udf':
      case 'create_procedure':
      case 'apply_udf':
      case 'finetune':
      case 'document_ai': {
        return getUpstreamColumns();
      }

      // UNION: Combine columns from all inputs (use first input's column order)
      case 'union': {
        if (inputEdges.length === 0) return [];
        // Use columns from first input as the schema
        return getNodeOutputColumns(inputEdges[0].source, new Set(visited));
      }

      // DESTINATION / EXPORT / DYNAMIC TABLE: Sinks, pass through columns for reference
      case 'destination':
      case 'export_file':
      case 'export_excel':
      case 'dynamic_table': {
        return getUpstreamColumns();
      }

      default:
        return getUpstreamColumns();
    }
  }, [nodes, edges]);

  // Get available columns for selected node (uses column propagation)
  const getAvailableColumns = useCallback((): string[] => {
    if (!selectedNode) return [];

    // Get columns from all input nodes using propagation
    const inputEdges = edges.filter((e) => e.target === selectedNode.id);
    const columns: string[] = [];

    inputEdges.forEach((edge) => {
      const upstreamCols = getNodeOutputColumns(edge.source);
      columns.push(...upstreamCols);
    });

    return Array.from(new Set(columns));
  }, [selectedNode, edges, getNodeOutputColumns]);

  // Get columns for join node inputs (uses column propagation)
  const getJoinInputColumns = useCallback((): { left: string[]; right: string[] } => {
    if (!selectedNode || (selectedNode.type !== 'join_tables' && selectedNode.type !== 'join')) return { left: [], right: [] };

    const inputEdges = edges
      .filter((e) => e.target === selectedNode.id)
      .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || ''));

    const left: string[] = [];
    const right: string[] = [];

    inputEdges.forEach((edge, index) => {
      const upstreamCols = getNodeOutputColumns(edge.source);
      if (index === 0) {
        left.push(...upstreamCols);
      } else {
        right.push(...upstreamCols);
      }
    });

    return { left, right };
  }, [selectedNode, edges, getNodeOutputColumns]);

  // ============================================
  // PIPELINE OPERATIONS
  // ============================================

  const handleNewPipeline = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setActiveWorkflowId(null);
    setActiveWorkflowName('New Pipeline');
    setPipelineName('New Pipeline');
    setLastExecution(null);
    setCompiledSql(null);
    setValidation(null);
    setUserRole('owner'); // creating new = you're the owner
  }, [setNodes, setEdges]);

  const handleLoadPipeline = useCallback(
    async (wf: { id: string; name: string }) => {
      try {
        setIsLoading(true);
        const stepsResponse = await workflowApi.listSteps(wf.id);
        const { nodes: newNodes, edges: newEdges } = stepsToReactFlow(stepsResponse.steps || []);
        setNodes(newNodes);
        setEdges(newEdges);
        setActiveWorkflowId(wf.id);
        setActiveWorkflowName(wf.name);
        setPipelineName(wf.name);

        // Determine user's role for this workflow project
        try {
          const contributors = await listContributors(wf.id);
          const me = contributors.find(
            (c) => c.username.toLowerCase() === currentUsername.toLowerCase()
          );
          setUserRole(me?.role ?? 'owner');
        } catch {
          setUserRole('owner');
        }

        toast.success(`Loaded pipeline: ${wf.name}`);
      } catch (error) {
        console.error('Failed to load pipeline:', error);
        toast.error('Failed to load pipeline');
      } finally {
        setIsLoading(false);
      }
    },
    [setNodes, setEdges]
  );

  const handleSavePipeline = useCallback(async () => {
    if (readOnlyGuard()) return;
    if (nodes.length === 0) {
      toast.error('Cannot save empty pipeline');
      return;
    }

    setIsSaving(true);
    try {
      const stepInputs = nodesToStepInputs(nodes, edges);

      if (activeWorkflowId) {
        // Update existing: delete all steps then re-add
        const existing = await workflowApi.listSteps(activeWorkflowId);
        for (const step of existing.steps || []) {
          await workflowApi.deleteStep(activeWorkflowId, step.step_id);
        }
        for (const input of stepInputs) {
          await workflowApi.addStep(activeWorkflowId, input);
        }
        toast.success('Pipeline updated');
      } else {
        // Create new
        const response = await workflowApi.createWorkflow({
          project_name: pipelineName,
          steps: stepInputs,
        });
        setActiveWorkflowId(response.project_id);
        setActiveWorkflowName(response.project_name);
        toast.success('Pipeline created');
      }

      // Refresh workflow list
      const listResponse = await listProjects({ project_type: 'workflow', mine_only: true });
      setWorkflows(
        (listResponse.projects || []).map((p) => ({ id: p.project_id, name: p.project_name }))
      );
    } catch (error: any) {
      console.error('Failed to save pipeline:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to save pipeline');
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, pipelineName, activeWorkflowId]);

  const handleDeletePipeline = useCallback(async () => {
    if (readOnlyGuard()) return;
    if (!activeWorkflowId) return;

    if (!confirm(`Delete pipeline "${activeWorkflowName}"?`)) return;

    try {
      // Delete all steps to effectively clear the workflow
      const existing = await workflowApi.listSteps(activeWorkflowId);
      for (const step of existing.steps || []) {
        await workflowApi.deleteStep(activeWorkflowId, step.step_id);
      }
      setWorkflows((prev) => prev.filter((w) => w.id !== activeWorkflowId));
      handleNewPipeline();
      toast.success('Pipeline deleted');
    } catch (error) {
      console.error('Failed to delete pipeline:', error);
      toast.error('Failed to delete pipeline');
    }
  }, [activeWorkflowId, activeWorkflowName, handleNewPipeline]);

  // ============================================
  // EXECUTION
  // ============================================

  const handleExecute = useCallback(
    async (dryRun: boolean = false) => {
      if (!dryRun && readOnlyGuard()) return;
      setPipelineError(null); // Clear previous errors
      if (!activeWorkflowId && nodes.length === 0) {
        setPipelineError('No pipeline to execute. Add blocks to the canvas first.');
        return;
      }

      if (!activeWorkflowId) {
        setPipelineError('Save the pipeline first before executing.');
        return;
      }

      // Auto-save before execute to ensure backend has latest steps
      try {
        const stepInputs = nodesToStepInputs(nodes, edges);
        const existing = await workflowApi.listSteps(activeWorkflowId);
        // Only re-save if step count changed or it's a manual execute
        if (!dryRun || (existing.steps || []).length !== stepInputs.length) {
          for (const step of existing.steps || []) {
            await workflowApi.deleteStep(activeWorkflowId, step.step_id);
          }
          for (const input of stepInputs) {
            await workflowApi.addStep(activeWorkflowId, input);
          }
        }
      } catch (saveErr: any) {
        console.warn('Auto-save before execute failed:', saveErr);
        // Continue with execute — steps may already be current
      }

      setIsExecuting(true);
      try {
        if (dryRun) {
          // Compile (dry-run): generates SQL without executing
          const compileResult = await workflowApi.compileWorkflow(activeWorkflowId);
          setCompiledSql(compileResult);
          setActiveTab('sql');
          toast.success('SQL generated (dry run)');
        } else {
          // Execute
          const response = await workflowApi.executeWorkflow(activeWorkflowId, {
            trigger_type: 'manual',
          });
          setLastExecution(response);

          if (response.status === 'completed' || response.status === 'success') {
            toast.success(`Executed successfully! ${response.rows_affected || 0} rows affected`);
          } else if (response.status === 'failed') {
            const errorDetail = response.error
              ? extractErrorString(response.error)
              : 'Check execution history for details';
            setPipelineError(`Execution failed: ${errorDetail}`);
            setActiveTab('runs'); // Switch to runs tab to show error details
          }
        }
      } catch (error: any) {
        console.error('Execution failed:', error);
        setPipelineError(getApiErrorMessage(error) || 'Execution failed');
        setActiveTab('runs');
      } finally {
        setIsExecuting(false);
        // Force execution history to refresh after execution completes
        setExecutionRefreshKey((k) => k + 1);
      }
    },
    [activeWorkflowId, nodes]
  );

  const handleValidate = useCallback(async () => {
    setPipelineError(null);
    if (!activeWorkflowId) {
      setPipelineError('Save the pipeline first before validating.');
      return;
    }

    // Auto-save before validate
    try {
      const stepInputs = nodesToStepInputs(nodes, edges);
      const existing = await workflowApi.listSteps(activeWorkflowId);
      for (const step of existing.steps || []) {
        await workflowApi.deleteStep(activeWorkflowId, step.step_id);
      }
      for (const input of stepInputs) {
        await workflowApi.addStep(activeWorkflowId, input);
      }
    } catch (saveErr: any) {
      console.warn('Auto-save before validate failed:', saveErr);
    }

    try {
      setAiSuggestions(null);
      const result = await workflowApi.validateWorkflow(activeWorkflowId);
      setValidation(result);

      if (result.valid) {
        toast.success('Pipeline is valid');
        setPipelineError(null);
      } else {
        const errMsg = extractErrorString(result.error) || 'Check the error panel for details';
        setPipelineError(`Validation: ${errMsg}`);
      }
    } catch (error: any) {
      console.error('Validation failed:', error);
      setPipelineError(getApiErrorMessage(error) || 'Validation failed');
    }
  }, [activeWorkflowId]);

  const handleGetAiSuggestions = useCallback(async () => {
    if (!validation) return;
    setAiSuggestionsLoading(true);
    setAiSuggestions(null);
    try {
      // AI suggestions not available via workflow API — show validation info
      const info: string[] = [];
      if (validation.error) info.push(`Error: ${extractErrorString(validation.error)}`);
      if (validation.mode) info.push(`Mode: ${validation.mode}`);
      if (validation.steps_count) info.push(`Steps: ${validation.steps_count}`);
      if (validation.destination) info.push(`Destination: ${validation.destination}`);
      setAiSuggestions(info.length > 0 ? info.join('\n') : 'No suggestions available.');
    } catch (err: any) {
      toast.error('AI suggestions unavailable');
      setAiSuggestions(null);
    } finally {
      setAiSuggestionsLoading(false);
    }
  }, [validation]);

  // ============================================
  // SUBMIT FOR APPROVAL
  // ============================================

  const handleSubmitForApproval = useCallback(async () => {
    if (!activeWorkflowId) {
      toast.error('Save the pipeline first');
      return;
    }
    if (readOnlyGuard()) return;

    try {
      // Get the latest version ID
      const versionsResponse = await workflowApi.listVersions(activeWorkflowId, { limit: 1 });
      const versions = (versionsResponse as any)?.versions || [];
      if (versions.length === 0) {
        toast.error('No version found. Save the pipeline first to create a version.');
        return;
      }
      const latestVersionId = versions[0].version_id;

      await workflowApi.requestDeployment(activeWorkflowId, {
        version_id: latestVersionId,
        deployment_type: 'with_approval',
      });
      toast.success('Pipeline submitted for approval!');
    } catch (error: any) {
      console.error('Submit for approval failed:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to submit for approval');
    }
  }, [activeWorkflowId, readOnlyGuard]);

  // ============================================
  // RENDER
  // ============================================

  // Normalize validation errors into an array for the error panel and node states
  const validationErrors = useMemo(() => {
    if (!validation || validation.valid) return [];
    if (Array.isArray((validation as any).errors) && (validation as any).errors.length > 0) {
      return (validation as any).errors;
    }
    if (validation.error) {
      return [{ message: validation.error }];
    }
    return [];
  }, [validation]);

  // Map validation errors to node IDs for visual error states on canvas nodes
  const nodeErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    validationErrors.forEach((err: any) => {
      const nodeId = err.step_id || err.node_id;
      if (nodeId) errors[nodeId] = typeof err === 'string' ? err : err.message || err.error || '';
    });
    return errors;
  }, [validationErrors]);

  // Map execution step results to nodes for post-execution visual states
  const executionNodeState = useMemo(() => {
    const state: Record<string, {
      executionStatus: 'pending' | 'running' | 'completed' | 'failed';
      rowsAffected?: number;
      durationMs?: number;
      error?: string;
      stepIndex?: number;
    }> = {};

    if (!lastExecution) return state;

    // Map step results to node IDs by step order (nodes are ordered as steps)
    const stepResults = (lastExecution as any)?.execution_details?.steps_results
      || (lastExecution as any)?.steps_results
      || [];

    // Try to match by step_id first, then by order
    const orderedNodeIds = nodes
      .filter(n => n.type !== 'default')
      .sort((a, b) => {
        const aOrder = a.data?.stepOrder ?? a.data?.step_number ?? 999;
        const bOrder = b.data?.stepOrder ?? b.data?.step_number ?? 999;
        return aOrder - bOrder;
      })
      .map(n => n.id);

    stepResults.forEach((step: any, idx: number) => {
      // Match by step_id or by order
      const nodeId = step.step_id || step.node_id || orderedNodeIds[idx];
      if (!nodeId) return;

      state[nodeId] = {
        executionStatus: step.status === 'completed' || step.status === 'success'
          ? 'completed'
          : step.status === 'failed' || step.status === 'error'
            ? 'failed'
            : step.status === 'running' ? 'running' : 'pending',
        rowsAffected: step.rows_affected ?? step.row_count,
        durationMs: step.duration_ms ?? step.duration,
        error: step.error,
        stepIndex: idx + 1,
      };
    });

    // If execution failed but no step results, mark all as failed
    if (stepResults.length === 0 && (lastExecution.status === 'failed' || lastExecution.status === 'partial_failure')) {
      const errMsg = typeof lastExecution.error === 'string'
        ? lastExecution.error
        : (lastExecution as any).error_log || 'Execution failed';
      orderedNodeIds.forEach((id, idx) => {
        state[id] = { executionStatus: 'failed', error: errMsg, stepIndex: idx + 1 };
      });
    }

    return state;
  }, [lastExecution, nodes]);

  // Also set execution state when pipeline is running
  const runningNodeState = useMemo(() => {
    if (!isExecuting) return {};
    const state: Record<string, { executionStatus: 'running' }> = {};
    nodes.forEach(n => { state[n.id] = { executionStatus: 'running' }; });
    return state;
  }, [isExecuting, nodes]);

  // Enrich nodes with error data + execution state for visual states on canvas
  const enrichedNodes = useMemo(() => {
    const execState = isExecuting ? runningNodeState : executionNodeState;
    const hasErrors = Object.keys(nodeErrors).length > 0;
    const hasExec = Object.keys(execState).length > 0;

    if (!hasErrors && !hasExec) return nodes;

    return nodes.map((node) => {
      const error = nodeErrors[node.id];
      const exec = execState[node.id];
      if (!error && !exec) return node;
      return {
        ...node,
        data: {
          ...node.data,
          ...(error ? { error } : {}),
          ...(exec ? {
            executionStatus: exec.executionStatus,
            rowsAffected: exec.rowsAffected,
            durationMs: exec.durationMs,
            executionError: exec.error,
            stepIndex: exec.stepIndex,
          } : {}),
        },
      };
    });
  }, [nodes, nodeErrors, executionNodeState, runningNodeState, isExecuting]);

  // Enrich edges with execution state — red dashed for failed paths, green for completed
  const enrichedEdges = useMemo(() => {
    if (Object.keys(executionNodeState).length === 0 && !isExecuting) return edges;
    const execState = isExecuting ? runningNodeState : executionNodeState;
    return edges.map((edge) => {
      const sourceState = execState[edge.source];
      const targetState = execState[edge.target];
      if (sourceState?.executionStatus === 'failed' || targetState?.executionStatus === 'failed') {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: '#ef4444' },  // red-500
          animated: true,
          className: 'stroke-red-500',
        };
      }
      if (sourceState?.executionStatus === 'completed' && targetState?.executionStatus === 'completed') {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: '#22c55e' },  // green-500
          animated: false,
        };
      }
      if (isExecuting) {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: '#3b82f6' },  // blue-500
          animated: true,
        };
      }
      return edge;
    });
  }, [edges, executionNodeState, runningNodeState, isExecuting]);

  const joinInputColumns = useMemo(() => getJoinInputColumns(), [getJoinInputColumns]);

  // Page-level loading state
  if (isLoading && workflows.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    );
  }

  // Page-level error state
  if (loadError && workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
        <Button onClick={loadWorkflows} variant="outline">Retry</Button>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-slate-100 dark:bg-slate-900', className)}>
      {/* Breadcrumb Header */}
      <div className="px-3 lg:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
        <nav className="flex items-center text-xs text-gray-500 dark:text-gray-400 gap-1">
          <span>Home</span>
          <span>/</span>
          <span>Workflow</span>
          {activeWorkflowId && (
            <>
              <span>/</span>
              <span className="text-gray-900 dark:text-white font-medium truncate max-w-[200px]">
                {pipelineName || 'New Pipeline'}
              </span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={cn(
              'px-2.5 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors',
              showRightPanel
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            )}
            title={showRightPanel ? 'Hide side panel' : 'Show side panel'}
          >
            {showRightPanel ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            Panel
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        {/* Row 1: Pipeline selector + name + badges */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <select
            value={activeWorkflowId || ''}
            onChange={(e) => {
              const wf = workflows.find((w) => w.id === e.target.value);
              if (wf) handleLoadPipeline(wf);
              else handleNewPipeline();
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm min-w-[140px]"
          >
            <option value="">New Pipeline</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium flex-1 max-w-xs"
            placeholder="Pipeline name..."
            readOnly={isReadOnly}
          />

          {isReadOnly && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1.5 whitespace-nowrap">
              <Eye className="h-3 w-3" />
              View Only
            </span>
          )}

          {validation && (
            <div className="relative">
              <span
                onClick={() => !validation.valid && validationErrors.length > 0 && setShowErrorPanel(!showErrorPanel)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap',
                  validation.valid
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors'
                )}
              >
                {validation.valid ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {validation.valid ? 'Valid' : `${validationErrors.length} Error${validationErrors.length !== 1 ? 's' : ''}`}
              </span>
              {showErrorPanel && validationErrors.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg shadow-xl p-3 max-h-[300px] overflow-y-auto min-w-[320px]">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">
                      {validationErrors.length} Validation Error{validationErrors.length > 1 ? 's' : ''}
                    </h4>
                    <button onClick={() => setShowErrorPanel(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close error panel">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {validationErrors.map((err: any, i: number) => (
                      <div key={i}
                        className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30"
                        onClick={() => {
                          const nodeId = err.step_id || err.node_id;
                          if (nodeId) {
                            const node = nodes.find(n => n.id === nodeId);
                            if (node) { setSelectedNode(node); setShowSidebar(true); }
                          }
                          setShowErrorPanel(false);
                        }}
                      >
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-red-700 dark:text-red-300">
                            {err.step_name || err.action_type || `Step ${err.step_order || i + 1}`}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            {typeof err === 'string' ? err : err.message || err.error || JSON.stringify(err)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Actions */}
        <div className="flex items-center justify-between px-4 pb-2.5">
          {/* Left: view actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleValidate}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 text-slate-600 dark:text-slate-300"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Validate
            </button>
            <button
              onClick={() => handleExecute(true)}
              disabled={isExecuting}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 text-slate-600 dark:text-slate-300 disabled:opacity-50"
            >
              <Code className="h-3.5 w-3.5" />
              Preview SQL
            </button>

            {/* Members */}
            <div className="relative">
              <button
                onClick={() => activeWorkflowId && setShowMembers(!showMembers)}
                disabled={!activeWorkflowId}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed',
                  showMembers
                    ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                )}
                title={activeWorkflowId ? 'Manage members' : 'Save pipeline first'}
              >
                <Users className="h-3.5 w-3.5" />
                Members
              </button>
              {showMembers && activeWorkflowId && (
                <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-50">
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Project Members
                    </h3>
                    <button
                      onClick={() => setShowMembers(false)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600"
                      aria-label="Close members panel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <AccessManagementSlot projectId={activeWorkflowId} />
                </div>
              )}
            </div>
          </div>

          {/* Right: primary actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSavePipeline}
              disabled={isSaving || isReadOnly}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>

            <button
              onClick={handleValidate}
              disabled={!activeWorkflowId}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 text-white hover:bg-amber-600 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
              title="Validate pipeline DAG"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Validate
            </button>

            <button
              onClick={() => handleExecute(true)}
              disabled={isExecuting || !activeWorkflowId}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-600 text-white hover:bg-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
              title="Preview generated SQL"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview SQL
            </button>

            <button
              onClick={() => handleExecute(false)}
              disabled={isExecuting || !activeWorkflowId || isReadOnly}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Execute
            </button>

            <button
              onClick={handleSubmitForApproval}
              disabled={!activeWorkflowId || isReadOnly}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
              title="Submit for approval before production deployment"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Submit for Approval
            </button>

            {activeWorkflowId && !isReadOnly && (
              <button
                onClick={handleDeletePipeline}
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                title="Delete pipeline"
                aria-label="Delete pipeline"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left palette */}
        <div
          className={cn(
            'bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300',
            showPalette ? 'w-72' : 'w-0'
          )}
        >
          {showPalette && <ETLPalette className="h-full" />}
        </div>

        {/* Toggle palette button */}
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-lg shadow-sm"
          style={{ left: showPalette ? '288px' : '0' }}
          aria-label={showPalette ? 'Hide block palette' : 'Show block palette'}
        >
          {showPalette ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={enrichedNodes}
            edges={enrichedEdges}
            onNodesChange={isReadOnly ? undefined : onNodesChange}
            onEdgesChange={isReadOnly ? undefined : onEdgesChange}
            onConnect={isReadOnly ? undefined : onConnect}
            onInit={setReactFlowInstance}
            onDrop={isReadOnly ? undefined : onDrop}
            onDragOver={isReadOnly ? undefined : onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodesConnectable={!isReadOnly}
            nodesDraggable={!isReadOnly}
            nodeTypes={etlNodeTypes}
            fitView
            deleteKeyCode={null}
            onlyRenderVisibleElements
            className="bg-slate-50 dark:bg-slate-900"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Right panel — conditional, PUSHES canvas */}
        {showRightPanel && (
        <div className="w-80 flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            {[
              { id: 'runs', label: 'Runs', icon: History },
              { id: 'schedules', label: 'Schedules', icon: Calendar },
              { id: 'sql', label: 'SQL', icon: Code },
              { id: 'ai', label: 'AI', icon: Sparkles },
              { id: 'tasks', label: 'Tasks', icon: Clock },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex-1 px-3 py-2 text-sm font-medium flex items-center justify-center gap-1',
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Persistent error banner (replaces disappearing toasts) */}
          <div aria-live="polite" aria-atomic="true">
            {pipelineError && (
              <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2" role="alert">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">{pipelineError}</p>
                </div>
                <button onClick={() => setPipelineError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label="Dismiss error">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Execution status for screen readers */}
          <div aria-live="polite" className="sr-only">
            {isExecuting ? 'Pipeline is executing...' : ''}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'runs' && (
              <ETLExecutionHistory
                key={executionRefreshKey}
                pipelineId={activeWorkflowId}
                pipelineName={activeWorkflowName}
                compact
                className="-mx-4 -mt-4"
              />
            )}

            {activeTab === 'schedules' && (
              <>
                {validation && !validation.valid && (
                  <div className="px-3 py-2 mb-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Pipeline has validation errors. Fix errors and run successfully before scheduling.
                    </p>
                  </div>
                )}
                <ScheduleManager
                  pipelineId={activeWorkflowId}
                  pipelineName={activeWorkflowName}
                  compact
                  isReadOnly={isReadOnly}
                  className="-mx-4 -mt-4"
                />
              </>
            )}

            {activeTab === 'sql' && (
              <div className="space-y-3">
                {compiledSql?.compiled_sql ? (
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">
                      Mode: {compiledSql.mode} | Steps: {compiledSql.steps_count}
                    </div>
                    <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                      {compiledSql.compiled_sql}
                    </pre>
                  </div>
                ) : lastExecution?.compiled_sql ? (
                  <div className="p-3 bg-slate-900 rounded-lg">
                    <div className="text-xs text-slate-400 mb-1">Compiled SQL</div>
                    <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                      {lastExecution.compiled_sql}
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Run &quot;Preview SQL&quot; to see generated queries
                  </p>
                )}
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Corrections, avertissements et optimisations (Workflow & Explore & Design).
                </p>
                {validation ? (
                  <>
                    {validation.error && (
                      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-2">
                        <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Erreurs</div>
                        <p className="text-xs text-red-600 dark:text-red-300">{extractErrorString(validation.error)}</p>
                      </div>
                    )}
                    {!validation.valid && !validation.error && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-2">
                        <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Avertissements</div>
                        <p className="text-xs text-amber-600 dark:text-amber-300">Pipeline validation failed</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleGetAiSuggestions}
                      disabled={aiSuggestionsLoading}
                      className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {aiSuggestionsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {aiSuggestionsLoading ? 'Analyse…' : 'Suggestions IA (Cortex)'}
                    </button>
                    {aiSuggestions != null && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Réponse IA</div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {aiSuggestions}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Cliquez sur &quot;Validate&quot; pour voir erreurs, avertissements et demander des suggestions IA.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <TasksPanel
                workflowId={activeWorkflowId}
                onImported={() => {
                  // Refresh workflow list after import
                  loadWorkflows();
                }}
              />
            )}

          </div>
        </div>
        )}

        {/* Config sidebar */}
        {showSidebar && selectedNode && (
          <ETLConfigSidebar
            node={selectedNode}
            onClose={() => {
              setSelectedNode(null);
              setShowSidebar(false);
            }}
            onSave={handleNodeSave}
            onDelete={handleNodeDelete}
            availableColumns={getAvailableColumns()}
            accessToken={accessToken}
            leftInputColumns={joinInputColumns.left}
            rightInputColumns={joinInputColumns.right}
          />
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50">
          <Loader size="lg" />
        </div>
      )}
    </div>
  );
};

// Wrap with ReactFlowProvider
const ETLPipelineBuilderWithProvider: React.FC<ETLPipelineBuilderProps> = (props) => (
  <ReactFlowProvider>
    <ETLPipelineBuilder {...props} />
  </ReactFlowProvider>
);

export default ETLPipelineBuilderWithProvider;
