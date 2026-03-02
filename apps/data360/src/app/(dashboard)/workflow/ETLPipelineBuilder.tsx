'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
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
  Loader2, History, AlertCircle, CheckCircle,
  Eye, Code, Calendar, Sparkles, Users, X
} from 'lucide-react';

// Components
import ETLPalette from './components/ETLPalette';
import ETLConfigSidebar from './components/ETLConfigSidebar';
import ScheduleManager from './components/ScheduleManager';
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

    return {
      action_type: convertLegacyType(node.type || 'source') as WorkflowActionType,
      step_name: stepName,
      payload: {
        ...config,
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
  const nodes: Node[] = steps.map((step) => {
    const payload = step.payload || {};
    const position = (payload.position as { x: number; y: number }) || { x: 0, y: 0 };
    const stepName = step.step_name;

    // Extract config (everything except reserved keys)
    const { inputs: _inputs, cte_alias: _cte, position: _pos, nodeId: _nid, ...config } = payload;

    return {
      id: (payload.nodeId as string) || step.step_id,
      type: step.action_type,
      position,
      data: {
        ...config,
        name: stepName,
        config,
      },
    };
  });

  const edges: Edge[] = [];
  steps.forEach((step) => {
    const payload = step.payload || {};
    const inputs = (payload.inputs as string[]) || [];
    const nodeId = (payload.nodeId as string) || step.step_id;
    inputs.forEach((inputId, index) => {
      const blockDef = getBlockByType(step.action_type);
      edges.push({
        id: `${inputId}-${nodeId}`,
        source: inputId,
        target: nodeId,
        targetHandle: blockDef?.maxInputs === 2 ? `input${index + 1}` : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
      });
    });
  });

  return { nodes, edges };
}

// ============================================
// MAIN COMPONENT
// ============================================

const ETLPipelineBuilder: React.FC<ETLPipelineBuilderProps> = ({ className }) => {
  const { data: session } = useSession();
  const accessToken = (session as any)?.user?.access_token || (session as any)?.accessToken;

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
  const [isLoading, setIsLoading] = useState(false);
  const [executionRefreshKey, setExecutionRefreshKey] = useState(0);

  // UI state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'schedules' | 'sql' | 'ai'>('runs');
  const [showMembers, setShowMembers] = useState(false);

  // Role-based access
  const currentUsername = (session?.user as any)?.username || '';
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

  // ============================================
  // LOAD DATA
  // ============================================

  // Load workflows on mount
  useEffect(() => {
    if (!accessToken) return;

    const loadWorkflows = async () => {
      setIsLoading(true);
      try {
        const response = await listProjects({ project_type: 'workflow', mine_only: true });
        setWorkflows(
          (response.projects || []).map((p) => ({ id: p.project_id, name: p.project_name }))
        );
      } catch (error) {
        console.error('Failed to load workflows:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkflows();
  }, [accessToken]);

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

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
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
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2 },
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
      case 'src': {
        const columns = config.columns || [];
        return Array.isArray(columns) ? (columns as string[]) : [];
      }

      // JOIN: Combine columns from both inputs (minus excluded columns)
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
      case 'limit': {
        return getUpstreamColumns();
      }

      // UNION: Combine columns from all inputs (use first input's column order)
      case 'union': {
        if (inputEdges.length === 0) return [];
        // Use columns from first input as the schema
        return getNodeOutputColumns(inputEdges[0].source, new Set(visited));
      }

      // DESTINATION / EXPORT: These are sinks, but still pass through columns for reference
      case 'destination':
      case 'export_file':
      case 'export_excel': {
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
    if (!selectedNode || selectedNode.type !== 'join_tables') return { left: [], right: [] };

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
      if (!activeWorkflowId && nodes.length === 0) {
        toast.error('No pipeline to execute');
        return;
      }

      if (!activeWorkflowId) {
        toast.error('Save the pipeline first before executing');
        return;
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
            toast.error(`Execution failed: ${errorDetail}`, { duration: 6000 });
          }
        }
      } catch (error: any) {
        console.error('Execution failed:', error);
        toast.error(getApiErrorMessage(error) || 'Execution failed');
      } finally {
        setIsExecuting(false);
        // Force execution history to refresh after execution completes
        setExecutionRefreshKey((k) => k + 1);
      }
    },
    [activeWorkflowId, nodes]
  );

  const handleValidate = useCallback(async () => {
    if (!activeWorkflowId) {
      toast.error('Save the pipeline first before validating');
      return;
    }

    try {
      setAiSuggestions(null);
      const result = await workflowApi.validateWorkflow(activeWorkflowId);
      setValidation(result);

      if (result.valid) {
        toast.success('Pipeline is valid');
      } else {
        toast.error(`Validation failed: ${extractErrorString(result.error) || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Validation failed:', error);
      toast.error(getApiErrorMessage(error) || 'Validation failed');
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

  const joinInputColumns = getJoinInputColumns();

  return (
    <div className={cn('h-full flex flex-col bg-slate-100 dark:bg-slate-900', className)}>
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
            <span
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap',
                validation.valid
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {validation.valid ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {validation.valid ? 'Valid' : 'Errors'}
            </span>
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
            nodes={nodes}
            edges={edges}
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
            className="bg-slate-50 dark:bg-slate-900"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Right panel */}
        <div className="w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            {[
              { id: 'runs', label: 'Runs', icon: History },
              { id: 'schedules', label: 'Schedules', icon: Calendar },
              { id: 'sql', label: 'SQL', icon: Code },
              { id: 'ai', label: 'AI', icon: Sparkles },
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
              <ScheduleManager
                pipelineId={activeWorkflowId}
                pipelineName={activeWorkflowName}
                compact
                isReadOnly={isReadOnly}
                className="-mx-4 -mt-4"
              />
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

          </div>
        </div>

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
        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center z-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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
