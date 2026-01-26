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
  Eye, Code, Calendar
} from 'lucide-react';

// Components
import ETLPalette from './components/ETLPalette';
import ETLConfigSidebar from './components/ETLConfigSidebar';
import ScheduleManager from './components/ScheduleManager';
import ETLExecutionHistory from './components/ETLExecutionHistory';
import { etlNodeTypes } from './components/ETLNodeTypes';
import { getBlockByType, convertLegacyType } from './components/etl-blocks';

// ETL Service
import * as etlService from '@/app/services/etl';
import type {
  Pipeline,
  PipelineComponent,
  ComponentType,
  CreatePipelineRequest,
  ExecutePipelineResponse,
  PipelineValidation,
} from '@/app/services/etl/types';

// ============================================
// TYPES
// ============================================

interface ETLPipelineBuilderProps {
  className?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Convert ReactFlow nodes/edges to Pipeline components
function nodesToComponents(nodes: Node[], edges: Edge[]): PipelineComponent[] {
  return nodes.map((node) => {
    const inputs = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => edge.source);

    return {
      id: node.id,
      type: convertLegacyType(node.type || 'source') as ComponentType,
      name: node.data?.name,
      config: node.data?.config || node.data || {},
      inputs,
      position: node.position,
    };
  });
}

// Convert Pipeline to ReactFlow nodes/edges
function pipelineToReactFlow(pipeline: Pipeline): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = pipeline.components.map((comp) => ({
    id: comp.id,
    type: comp.type,
    position: comp.position || { x: 0, y: 0 },
    data: {
      ...comp.config,
      name: comp.name,
      config: comp.config,
    },
  }));

  const edges: Edge[] = [];
  pipeline.components.forEach((comp) => {
    comp.inputs.forEach((inputId, index) => {
      const blockDef = getBlockByType(comp.type);
      edges.push({
        id: `${inputId}-${comp.id}`,
        source: inputId,
        target: comp.id,
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

  // Pipeline state
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineName, setPipelineName] = useState('New Pipeline');
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // UI state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'schedules' | 'sql'>('runs');

  // Execution state
  const [lastExecution, setLastExecution] = useState<ExecutePipelineResponse | null>(null);
  const [validation, setValidation] = useState<PipelineValidation | null>(null);

  // ============================================
  // LOAD DATA
  // ============================================

  // Load pipelines on mount
  useEffect(() => {
    if (!accessToken) return;

    const loadPipelines = async () => {
      setIsLoading(true);
      try {
        const response = await etlService.listPipelines();
        setPipelines(response.pipelines);
      } catch (error) {
        console.error('Failed to load pipelines:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPipelines();
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
      case 'join': {
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
    if (!selectedNode || selectedNode.type !== 'join') return { left: [], right: [] };

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
    setActivePipeline(null);
    setPipelineName('New Pipeline');
    setLastExecution(null);
    setValidation(null);
  }, [setNodes, setEdges]);

  const handleLoadPipeline = useCallback(
    async (pipeline: Pipeline) => {
      try {
        setIsLoading(true);
        const fullPipeline = await etlService.getPipeline(pipeline.pipeline_id);
        const { nodes: newNodes, edges: newEdges } = pipelineToReactFlow(fullPipeline);
        setNodes(newNodes);
        setEdges(newEdges);
        setActivePipeline(fullPipeline);
        setPipelineName(fullPipeline.name);
        toast.success(`Loaded pipeline: ${fullPipeline.name}`);
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
    if (nodes.length === 0) {
      toast.error('Cannot save empty pipeline');
      return;
    }

    setIsSaving(true);
    try {
      const components = nodesToComponents(nodes, edges);
      const request: CreatePipelineRequest = {
        name: pipelineName,
        components,
      };

      if (activePipeline) {
        // Update existing
        const updated = await etlService.updatePipeline(activePipeline.pipeline_id, request);
        setActivePipeline(updated);
        toast.success('Pipeline updated');
      } else {
        // Create new
        const response = await etlService.createPipeline(request);
        const newPipeline = await etlService.getPipeline(response.pipeline_id);
        setActivePipeline(newPipeline);
        setPipelines((prev) => [...prev, newPipeline]);
        setValidation(response.validation);
        toast.success('Pipeline created');
      }

      // Refresh pipeline list
      const listResponse = await etlService.listPipelines();
      setPipelines(listResponse.pipelines);
    } catch (error: any) {
      console.error('Failed to save pipeline:', error);
      toast.error(error.response?.data?.detail || 'Failed to save pipeline');
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, pipelineName, activePipeline]);

  const handleDeletePipeline = useCallback(async () => {
    if (!activePipeline) return;

    if (!confirm(`Delete pipeline "${activePipeline.name}"?`)) return;

    try {
      await etlService.deletePipeline(activePipeline.pipeline_id);
      setPipelines((prev) => prev.filter((p) => p.pipeline_id !== activePipeline.pipeline_id));
      handleNewPipeline();
      toast.success('Pipeline deleted');
    } catch (error) {
      console.error('Failed to delete pipeline:', error);
      toast.error('Failed to delete pipeline');
    }
  }, [activePipeline, handleNewPipeline]);

  // ============================================
  // EXECUTION
  // ============================================

  const handleExecute = useCallback(
    async (dryRun: boolean = false) => {
      if (!activePipeline && nodes.length === 0) {
        toast.error('No pipeline to execute');
        return;
      }

      setIsExecuting(true);
      try {
        let response: ExecutePipelineResponse;

        if (activePipeline) {
          // Execute saved pipeline
          response = await etlService.executePipeline(activePipeline.pipeline_id, dryRun);
        } else {
          // Execute inline
          const components = nodesToComponents(nodes, edges);
          response = await etlService.executeInline({ components, dry_run: dryRun });
        }

        setLastExecution(response);

        if (dryRun) {
          setActiveTab('sql');
          toast.success('SQL generated (dry run)');
        } else {
          if (response.status === 'completed') {
            toast.success(`Executed successfully! ${response.rows_processed || 0} rows processed`);
          } else if (response.status === 'failed') {
            toast.error('Execution failed');
          }
          // Note: ETLExecutionHistory component will auto-refresh runs
        }
      } catch (error: any) {
        console.error('Execution failed:', error);
        toast.error(error.response?.data?.detail || 'Execution failed');
      } finally {
        setIsExecuting(false);
      }
    },
    [activePipeline, nodes, edges]
  );

  const handleValidate = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error('No components to validate');
      return;
    }

    try {
      const components = nodesToComponents(nodes, edges);
      const result = await etlService.validatePipeline({ components });
      setValidation(result);

      if (result.is_valid) {
        toast.success('Pipeline is valid');
      } else {
        toast.error(`Validation failed: ${result.errors.join(', ')}`);
      }
    } catch (error: any) {
      console.error('Validation failed:', error);
      toast.error(error.response?.data?.detail || 'Validation failed');
    }
  }, [nodes, edges]);

  // ============================================
  // RENDER
  // ============================================

  const joinInputColumns = getJoinInputColumns();

  return (
    <div className={cn('h-full flex flex-col bg-slate-100 dark:bg-slate-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-4">
          {/* Pipeline selector */}
          <select
            value={activePipeline?.pipeline_id || ''}
            onChange={(e) => {
              const pipeline = pipelines.find((p) => p.pipeline_id === e.target.value);
              if (pipeline) handleLoadPipeline(pipeline);
              else handleNewPipeline();
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="">New Pipeline</option>
            {pipelines.map((p) => (
              <option key={p.pipeline_id} value={p.pipeline_id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Pipeline name */}
          <input
            type="text"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium w-64"
            placeholder="Pipeline name..."
          />

          {/* Validation badge */}
          {validation && (
            <div
              className={cn(
                'px-2 py-1 rounded text-xs font-medium flex items-center gap-1',
                validation.is_valid
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {validation.is_valid ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {validation.is_valid ? 'Valid' : `${validation.errors.length} errors`}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleValidate}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Validate
          </button>

          <button
            onClick={() => handleExecute(true)}
            disabled={isExecuting}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            Preview SQL
          </button>

          <button
            onClick={handleSavePipeline}
            disabled={isSaving}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>

          <button
            onClick={() => handleExecute(false)}
            disabled={isExecuting || !activePipeline}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
          >
            {isExecuting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Execute
          </button>

          {activePipeline && (
            <button
              onClick={handleDeletePipeline}
              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              title="Delete pipeline"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
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
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
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
                pipelineId={activePipeline?.pipeline_id || null}
                pipelineName={activePipeline?.name}
                compact
                className="-mx-4 -mt-4"
              />
            )}

            {activeTab === 'schedules' && (
              <ScheduleManager
                pipelineId={activePipeline?.pipeline_id || null}
                pipelineName={activePipeline?.name}
                compact
                className="-mx-4 -mt-4"
              />
            )}

            {activeTab === 'sql' && (
              <div className="space-y-3">
                {lastExecution?.generated_sql?.length ? (
                  lastExecution.generated_sql.map((sql, i) => (
                    <div key={i} className="p-3 bg-slate-900 rounded-lg">
                      <div className="text-xs text-slate-400 mb-1">{sql.component_id}</div>
                      <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                        {sql.sql}
                      </pre>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Run "Preview SQL" to see generated queries
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
