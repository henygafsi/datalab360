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
// @ts-ignore — CSS import handled by Next.js bundler
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Play, Save, Trash2, ChevronRight, ChevronLeft,
  Loader2, History, AlertCircle, AlertTriangle, CheckCircle,
  Eye, Code, Calendar, Sparkles, Users, X, Clock,
  Download, Copy, FolderOpen, Plus,
} from 'lucide-react';
import { Loader, Button } from 'rizzui';
import { motion, AnimatePresence } from 'framer-motion';

// Components
import ETLPalette from './components/ETLPalette';
import ETLConfigSidebar from './components/ETLConfigSidebar';
import ScheduleManager from './components/ScheduleManager';
import WorkflowProjectGate from './components/WorkflowProjectGate';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

import ETLExecutionHistory from './components/ETLExecutionHistory';
import AccessManagementSlot from '@/app/(dashboard)/explore-design/components/AccessManagementSlot';
import { etlNodeTypes } from './components/ETLNodeTypes';
import { getBlockByType, convertLegacyType } from './components/etl-blocks';
import GuidedAiWorkflowWizard from './components/GuidedAiWorkflowWizard';
import ImportTasksModal from './components/ImportTasksModal';

// Workflow API services
import * as workflowApi from '@/app/services/api/workflowApi';
import { listProjects, listContributors } from '@/app/services/api/projectsApi';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
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

    // Sort: keep order_by array for reload, add flat order_by_str for backend
    if (nodeType === 'sort' && Array.isArray(config.order_by) && config.order_by.length > 0) {
      derived.order_by = config.order_by; // keep structured array
      derived.order_by_str = config.order_by
        .map((o: any) => typeof o === 'object' ? `${o.column} ${o.direction || 'ASC'}` : o)
        .join(', ');
    }

    // Formula: formulas[] → backend expects { formulas: [{ name, expression }] }
    // For single formula also derive flat expression + output_column as fallback
    if (nodeType === 'formula' && Array.isArray(config.formulas) && config.formulas.length > 0) {
      derived.formulas = config.formulas.map((f: any) => ({
        name: f.name || f.alias || 'COMPUTED',
        expression: f.expression || '',
      }));
      if (!config.expression) {
        const f = config.formulas[0];
        derived.expression = f.expression || '';
        derived.output_column = f.name || f.alias || 'COMPUTED';
      }
    }

    // Limit: limit → row_count
    if (nodeType === 'limit' && config.limit && !config.row_count) {
      derived.row_count = config.limit;
    }

    // Select: columns array → comma-separated string for backend template
    if (nodeType === 'select' && Array.isArray(config.columns) && config.columns.length > 0) {
      derived.columns = config.columns.join(', ');
    }

    // Rename: mappings object → flat old_name/new_name for backend template
    if (nodeType === 'rename' && config.mappings && typeof config.mappings === 'object') {
      const entries = Object.entries(config.mappings);
      if (entries.length > 0) {
        derived.old_name = entries[0][0];
        derived.new_name = entries[0][1];
      }
    }

    // Cast: casts object → flat column/target_type for backend template
    if (nodeType === 'cast' && config.casts && typeof config.casts === 'object') {
      const entries = Object.entries(config.casts);
      if (entries.length > 0) {
        derived.column = entries[0][0];
        derived.target_type = entries[0][1];
      }
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
      ? { x: 50, y: 50 + sourceCount * 250 }
      : { x: 100 + nonSourceIdx * 350, y: 150 };
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

  // Method 3: Infer edges from step_order when no explicit connections exist
  // If a non-source step has no incoming edge, connect it to the previous step by order
  if (edges.length === 0 && steps.length > 1) {
    const sortedSteps = [...steps].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));
    for (let i = 1; i < sortedSteps.length; i++) {
      const prevStep = sortedSteps[i - 1];
      const currStep = sortedSteps[i];
      const prevId = (prevStep.payload?.nodeId as string) || prevStep.step_id;
      const currId = (currStep.payload?.nodeId as string) || currStep.step_id;
      const currBlockDef = getBlockByType(currStep.action_type);
      // Skip if current step is a source (sources have no input)
      if (currStep.action_type === 'source' || currStep.action_type?.endsWith('_source')) continue;
      edges.push({
        id: `inferred-${prevId}-${currId}`,
        source: prevId,
        target: currId,
        targetHandle: currBlockDef?.maxInputs === 2 ? 'input1' : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
        style: { strokeWidth: 1.5, stroke: '#94A3B8', strokeDasharray: '5,5' },
        animated: false,
        label: 'inferred',
      });
    }
  }

  return { nodes, edges };
}

// ============================================
// MAIN COMPONENT
// ============================================

const ETLPipelineBuilder: React.FC<ETLPipelineBuilderProps> = ({ className }) => {
  const { isAuthenticated } = useAuth();
  const accessToken = typeof window !== 'undefined' ? (localStorage.getItem('access_token') || localStorage.getItem('snowflake_token') || '') : '';

  // URL search params for shareable links: ?project=<workflow_id>
  // Capture the initial ?project value ONCE at mount so the URL-sync effect can't
  // strip it before the workflows list arrives.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialProjectIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('project')
      : null,
  );
  const projectGateDismissedRef = useRef(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Pipeline/Workflow state
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = useState<string>('New Workflow');
  const [pipelineName, setPipelineName] = useState('New Workflow');
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPipelineLoading, setIsPipelineLoading] = useState(false);
  // Approval state: 'none' | 'pending' | 'approved'
  const [approvalStatus, setApprovalStatus] = useState<'none' | 'pending' | 'approved'>('none');
  const isPendingApproval = approvalStatus === 'pending';
  const isApproved = approvalStatus === 'approved';
  const [executionRefreshKey, setExecutionRefreshKey] = useState(0);

  // SSE: listen for deployment approval changes and refresh approval status
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation || !activeWorkflowId) return;
    const relevant = lastInvalidation.keys.some((k: string) =>
      k === 'deployments' || k === 'projects'
    );
    if (!relevant || approvalStatus === 'none') return;
    // Re-check deployment status from backend
    workflowApi.listDeployments(activeWorkflowId, { limit: 1 })
      .then((res: any) => {
        const latest = res?.deployments?.[0];
        if (!latest) return;
        if (latest.status === 'approved') setApprovalStatus('approved');
        else if (latest.status === 'pending_approval') setApprovalStatus('pending');
        else setApprovalStatus('none');
      })
      .catch(() => {});
  }, [lastInvalidation, activeWorkflowId, approvalStatus]);

  // Dirty state tracking for unsaved indicator + incremental save
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const lastSavedNodesRef = useRef<string>('');
  const lastSavedEdgesRef = useRef<string>('');
  const dirtyNodeIdsRef = useRef<Set<string>>(new Set());

  // UI state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'schedules' | 'sql' | 'ai' | 'results'>('runs');
  const [showMembers, setShowMembers] = useState(false);
  // Right panel closed by default — gives the canvas full width on landing.
  // User opens it via the "Panel" toggle button in the top-right when they
  // need Results / Runs / SQL / Schedule / AI tabs.
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showErrorPanel, setShowErrorPanel] = useState(false);
  // Modals — both opened from the header (PDF page 8 #1 + #2).
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [showImportTasks, setShowImportTasks] = useState(false);

  // Results preview state
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: Record<string, any>[]; total_rows: number; table: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
  const loadWorkflowsFn = useCallback(
    // mine_only=false: same reason as ProjectSelector — backend's "mine" filter
    // is contributor-based and returns 0 for accountadmins on projects they made.
    () => listProjects({ project_type: 'workflow', mine_only: false }),
    [accessToken]
  );

  const { data: workflowsData, loading: isLoading, error: loadErrorObj, refetch: loadWorkflows } = useCacheAwareQuery(
    loadWorkflowsFn,
    { cacheKeys: [CACHE_KEYS.WORKFLOWS], enabled: !!accessToken, initialData: null }
  );

  const workflows = useMemo(
    () => (workflowsData?.projects || []).map((p: any) => ({ id: p.project_id, name: p.project_name })),
    [workflowsData]
  );
  const loadError = loadErrorObj ? (getApiErrorMessage(loadErrorObj) || 'Failed to load workflows') : null;

  // Keyboard shortcuts
  const handleSaveRef = useRef<(() => void) | null>(null);
  const handleExecuteRef = useRef<((dryRun: boolean) => void) | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteRef.current?.(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && nodes.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, nodes.length]);

  // Auto-fit canvas after loading a workflow
  useEffect(() => {
    if (reactFlowInstance && nodes.length > 0 && !isLoading) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2, duration: 300 }), 100);
    }
  }, [reactFlowInstance, isLoading]);

  // Collapse right panel on small screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1200) {
      setShowRightPanel(false);
    }
  }, []);

  // Keep URL in sync with the active workflow for shareable links.
  // Guard the strip branch with !isLoading && !isPipelineLoading so we don't clobber a
  // deep-link ?project=<id> before the auto-select effect has had a chance to consume it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = searchParams?.get('project') || null;
    if (activeWorkflowId && current !== activeWorkflowId) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.set('project', activeWorkflowId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else if (!activeWorkflowId && current && !isLoading && !isPipelineLoading) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.delete('project');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname || '/workflow'), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkflowId, isLoading, isPipelineLoading]);

  // If the active right-pane tab becomes disabled (canvas empty), fall back to AI
  useEffect(() => {
    const emptyDisabledTabs: Array<typeof activeTab> = ['results', 'runs', 'sql', 'schedules'];
    if (nodes.length === 0 && emptyDisabledTabs.includes(activeTab)) {
      setActiveTab('ai');
    }
  }, [nodes.length, activeTab]);

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
      setIsDirty(true);
      dirtyNodeIdsRef.current.add(newNode.id);
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
      setIsDirty(true);
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
      setIsDirty(true);
      dirtyNodeIdsRef.current.add(nodeId);
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

      // AGGREGATE: Returns ALL upstream columns + aggregation aliases (window function approach)
      case 'aggregate':
      case 'aggregate_kpi': {
        const upstreamCols = getUpstreamColumns();
        const aggregations = config.aggregations || [];
        const aggAliases = aggregations
          .map((agg: { alias?: string; column?: string; function?: string }) =>
            agg.alias || `${agg.function}_${agg.column}`)
          .filter(Boolean);
        return [...upstreamCols, ...aggAliases];
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
        const parts: string[] = config.output_columns || [];
        return [...upstreamCols, ...(Array.isArray(parts) ? parts : [])];
      }

      // JSON transforms: Pass through + add extracted/flattened columns
      case 'json_flatten':
      case 'json_extract': {
        const upstreamCols = getUpstreamColumns();
        const extractedCols: string[] = config.output_columns || config.columns || [];
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
        const outputCols: string[] = config.output_columns || config.columns || [];
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
    setActiveWorkflowName('New Workflow');
    setPipelineName('New Workflow');
    setLastExecution(null);
    setCompiledSql(null);
    setValidation(null);
    setUserRole('owner'); // creating new = you're the owner
    setIsDirty(false);
    dirtyNodeIdsRef.current.clear();
    setSaveStatus('idle');
  }, [setNodes, setEdges]);

  const handleLoadPipeline = useCallback(
    async (wf: { id: string; name: string }) => {
      try {
        setIsPipelineLoading(true);
        const stepsResponse = await workflowApi.listSteps(wf.id);
        const { nodes: newNodes, edges: newEdges } = stepsToReactFlow(stepsResponse.steps || []);
        setNodes(newNodes);
        setEdges(newEdges);
        setActiveWorkflowId(wf.id);
        setActiveWorkflowName(wf.name);
        setPipelineName(wf.name);
        setIsDirty(false);
        setApprovalStatus('none');
        dirtyNodeIdsRef.current.clear();
        setSaveStatus('idle');

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

        // Check if there's an active pending/approved deployment
        try {
          const deploymentsRes = await workflowApi.listDeployments(wf.id, { limit: 1 });
          const latest = (deploymentsRes as any)?.deployments?.[0];
          if (latest?.status === 'pending_approval') {
            setApprovalStatus('pending');
          } else if (latest?.status === 'approved') {
            setApprovalStatus('approved');
          }
        } catch {
          // ignore — deployment check is non-critical
        }

        toast.success(`Loaded workflow: ${wf.name}`);
      } catch (error) {
        console.error('Failed to load workflow:', error);
        toast.error('Failed to load workflow');
      } finally {
        setIsPipelineLoading(false);
      }
    },
    [setNodes, setEdges]
  );

  // Auto-select workflow from URL ?project=<id> once workflows are loaded
  useEffect(() => {
    const initialId = initialProjectIdRef.current;
    if (
      initialId &&
      !activeWorkflowId &&
      workflows.length > 0 &&
      !isPipelineLoading
    ) {
      const wf = workflows.find((w) => w.id === initialId);
      if (wf) {
        projectGateDismissedRef.current = true;
        handleLoadPipeline(wf);
      }
      // Consume the initial value so a subsequent state change can't retrigger this.
      initialProjectIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows.length]);

  const handleSavePipeline = useCallback(async () => {
    if (readOnlyGuard()) return;
    if (nodes.length === 0) {
      toast.error('Cannot save empty workflow');
      return;
    }

    setIsSaving(true);
    setPipelineError(null);
    try {
      const stepInputs = nodesToStepInputs(nodes, edges);

      if (activeWorkflowId) {
        // Incremental save: only update modified steps
        const existing = await workflowApi.listSteps(activeWorkflowId);
        const existingSteps = existing.steps || [];
        const dirtyIds = dirtyNodeIdsRef.current;

        for (let i = 0; i < stepInputs.length; i++) {
          const nodeId = stepInputs[i].payload?.nodeId;
          const isNew = i >= existingSteps.length;
          const isModified = !nodeId || dirtyIds.has(nodeId) || dirtyIds.size === 0;

          if (isNew) {
            await workflowApi.addStep(activeWorkflowId, stepInputs[i]);
          } else if (isModified) {
            await workflowApi.updateStep(activeWorkflowId, existingSteps[i].step_id, {
              step_name: stepInputs[i].step_name,
              payload: { ...stepInputs[i].payload, action_type: stepInputs[i].action_type },
            });
          }
          // else: unchanged — skip API call
        }

        // Delete removed steps
        if (existingSteps.length > stepInputs.length) {
          for (let i = stepInputs.length; i < existingSteps.length; i++) {
            await workflowApi.deleteStep(activeWorkflowId, existingSteps[i].step_id).catch(() => {});
          }
        }

        toast.success('Workflow updated');
      } else {
        // Create new
        const response = await workflowApi.createWorkflow({
          project_name: pipelineName,
          steps: stepInputs,
        });
        setActiveWorkflowId(response.project_id);
        setActiveWorkflowName(response.project_name);
        toast.success('Workflow created');
      }

      // Mark clean
      setIsDirty(false);
      dirtyNodeIdsRef.current.clear();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);

      // Refresh workflow list
      await loadWorkflows();
    } catch (error: any) {
      console.error('Failed to save workflow:', error);
      const errMsg = getApiErrorMessage(error) || 'Failed to save workflow';
      toast.error(errMsg);
      setPipelineError(`Save failed: ${errMsg}`);
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, pipelineName, activeWorkflowId]);
  handleSaveRef.current = handleSavePipeline;

  const handleDeletePipeline = useCallback(async () => {
    if (readOnlyGuard()) return;
    if (!activeWorkflowId) return;

    if (!confirm(`Delete workflow "${activeWorkflowName}"?`)) return;

    try {
      // Delete all steps to effectively clear the workflow
      const existing = await workflowApi.listSteps(activeWorkflowId);
      for (const step of existing.steps || []) {
        await workflowApi.deleteStep(activeWorkflowId, step.step_id).catch((err: any) => {
          if (err?.response?.status !== 404) throw err;
        });
      }
      await loadWorkflows();
      handleNewPipeline();
      toast.success('Workflow deleted');
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error('Failed to delete workflow');
    }
  }, [activeWorkflowId, activeWorkflowName, handleNewPipeline]);

  // ============================================
  // RESULTS PREVIEW
  // ============================================

  const loadResultsPreview = useCallback(async () => {
    // Find the destination node to get database/schema/table
    const destNode = nodes.find((n) => n.type === 'destination');
    const config = destNode?.data?.config || destNode?.data || {};
    const database = config.database_name || config.database;
    const schema = config.schema_name || config.schema;
    const table = config.table_name || config.table;

    if (!database || !schema || !table) {
      // No destination configured — show execution summary only
      setPreviewData(null);
      setPreviewError(null);
      setActiveTab('results');
      setShowRightPanel(true);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setActiveTab('results');
    setShowRightPanel(true);

    try {
      const { data } = await apiClient.get('/workflow/preview-table', {
        params: { database, schema, table, limit: 100 },
      });
      setPreviewData(data);
    } catch (err: any) {
      console.error('Failed to load results preview:', err);
      setPreviewError(getApiErrorMessage(err) || 'Failed to load table preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [nodes]);

  // ============================================
  // EXECUTION
  // ============================================

  const handleExecute = useCallback(
    async (dryRun: boolean = false) => {
      if (!dryRun && readOnlyGuard()) return;
      setPipelineError(null); // Clear previous errors
      if (!activeWorkflowId && nodes.length === 0) {
        setPipelineError('No workflow to execute. Add blocks to the canvas first.');
        return;
      }

      if (!activeWorkflowId) {
        setPipelineError('Save the workflow first before executing.');
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
            // Auto-load destination table preview
            loadResultsPreview();
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
  handleExecuteRef.current = handleExecute;

  const handleValidate = useCallback(async () => {
    setPipelineError(null);
    if (!activeWorkflowId) {
      setPipelineError('Save the workflow first before validating.');
      return;
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
      setApprovalStatus('pending');
    } catch (error: any) {
      console.error('Submit for approval failed:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to submit for approval');
    }
  }, [activeWorkflowId, readOnlyGuard]);

  // ============================================
  // EXPORT & DUPLICATE
  // ============================================

  const handleExportJSON = useCallback(() => {
    const data = {
      name: pipelineName,
      workflow_id: activeWorkflowId,
      steps: nodesToStepInputs(nodes, edges),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineName.replace(/\s+/g, '_').toLowerCase()}_workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Workflow exported');
  }, [pipelineName, activeWorkflowId, nodes, edges]);

  const handleDuplicate = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error('Nothing to duplicate');
      return;
    }
    const newName = `${pipelineName} (copy)`;
    try {
      const stepInputs = nodesToStepInputs(nodes, edges);
      const response = await workflowApi.createWorkflow({
        project_name: newName,
        steps: stepInputs,
      });
      setActiveWorkflowId(response.project_id);
      setActiveWorkflowName(response.project_name);
      setPipelineName(response.project_name);
      setIsDirty(false);
      await loadWorkflows();
      toast.success(`Duplicated as "${newName}"`);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error) || 'Failed to duplicate');
    }
  }, [pipelineName, nodes, edges]);

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
    if (!isExecuting) return {} as Record<string, {
      executionStatus: 'pending' | 'running' | 'completed' | 'failed';
      rowsAffected?: number;
      durationMs?: number;
      error?: string;
      stepIndex?: number;
    }>;
    const state: Record<string, {
      executionStatus: 'pending' | 'running' | 'completed' | 'failed';
      rowsAffected?: number;
      durationMs?: number;
      error?: string;
      stepIndex?: number;
    }> = {};
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

  // Project-gate selector callback — declared BEFORE any early returns so
  // React's rules-of-hooks aren't violated when the gate renders.
  const handleGateSelect = useCallback(
    (workflowId: string, workflowName: string) => {
      projectGateDismissedRef.current = true;
      const wf = workflows.find((w) => w.id === workflowId);
      if (wf) {
        handleLoadPipeline(wf);
      } else {
        // Newly-created workflow may not be in the list yet — set directly
        setActiveWorkflowId(workflowId);
        setActiveWorkflowName(workflowName);
        setPipelineName(workflowName);
        setUserRole('owner');
        setNodes([]);
        setEdges([]);
        setIsDirty(false);
        loadWorkflows();
      }
    },
    [workflows, handleLoadPipeline, setNodes, setEdges, loadWorkflows],
  );

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

  // Show the project gate when no workflow is loaded (after workflows finished loading) and the
  // user hasn't dismissed it via "New Workflow" creation. Skipping the gate while loading avoids
  // a flash before URL-auto-select can run.
  const showProjectGate =
    !activeWorkflowId &&
    !isLoading &&
    !isPipelineLoading &&
    !projectGateDismissedRef.current;

  // Inline pre-state: render a visible project picker + create CTA when no
  // workflow is selected. Replaces the modal-only gate so the page never
  // shows a blank canvas (rizzui Modal portaling could fail silently).
  if (showProjectGate) {
    return (
      <div className={cn('h-full flex flex-col bg-slate-50 dark:bg-slate-900', className)}>
        <div className="px-3 lg:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <nav className="flex items-center text-xs text-gray-500 dark:text-gray-400 gap-1" aria-label="Breadcrumb">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span className="text-gray-900 dark:text-white font-medium">Workflow</span>
          </nav>
        </div>
        <div className="flex-1 overflow-auto flex items-start justify-center p-6">
          <div className="w-full max-w-2xl mt-8">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                  <FolderOpen className="h-5 w-5 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Choose a workflow project
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Pick an existing workflow to continue, or create a new one.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {workflows.length} workflow{workflows.length === 1 ? '' : 's'} available
                </p>
                <button
                  type="button"
                  onClick={() => {
                    projectGateDismissedRef.current = true;
                    handleNewPipeline();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New workflow
                </button>
              </div>

              <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg max-h-[420px] overflow-y-auto">
                {workflows.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-600 dark:text-slate-300">No workflows yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Create your first workflow to get started.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        projectGateDismissedRef.current = true;
                        handleNewPipeline();
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create workflow
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {workflows.map((w) => (
                      <li key={w.id}>
                        <button
                          type="button"
                          onClick={() => {
                            projectGateDismissedRef.current = true;
                            handleLoadPipeline(w);
                          }}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors focus:outline-none focus:bg-indigo-50 dark:focus:bg-indigo-900/20"
                        >
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex-shrink-0">
                            <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {w.name}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-slate-100 dark:bg-slate-900', className)}>
      {/* Project Gate: blocks the canvas until a workflow project is selected */}
      <WorkflowProjectGate
        isOpen={showProjectGate}
        onSelect={handleGateSelect}
      />

      {/* Breadcrumb Header */}
      <div className="px-3 lg:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
        <nav className="flex items-center text-xs text-gray-500 dark:text-gray-400 gap-1" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden="true">/</span>
          <span>Workflow</span>
          <span aria-hidden="true">/</span>
          <span className="text-gray-900 dark:text-white font-medium truncate max-w-[240px]">
            {activeWorkflowName || pipelineName || 'New Workflow'}
          </span>
          {activeWorkflowId && (
            <button
              type="button"
              onClick={() => {
                projectGateDismissedRef.current = false;
                setActiveWorkflowId(null);
              }}
              className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Change workflow project"
            >
              Change
            </button>
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

      {/* ── Header — grouped clusters with subtle separators ──
          Cluster 1 (Create):   New / AI / Import
          Cluster 2 (Project):  selector | name | status badges
          Cluster 3 (Actions):  Save / Validate / SQL / Run / Approve | utilities
          Each cluster sits in a pill-shaped surface with consistent height
          and gap rhythm so the eye groups them automatically. */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">

          {/* ── Cluster 1: Create ── */}
          <div className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/60">
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              onClick={handleNewPipeline}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-sm shadow-green-500/40 transition-shadow hover:shadow-md hover:shadow-green-500/50"
              title="Create new workflow"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </motion.button>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAiGenerate(true)}
              className="group relative flex h-7 items-center gap-1 overflow-hidden rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-2 text-[11px] font-semibold text-white shadow-sm shadow-purple-500/40 transition-shadow hover:shadow-md hover:shadow-purple-500/60"
              title="Generate workflow with AI"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Sparkles className="h-3 w-3" />
              AI
            </motion.button>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowImportTasks(true)}
              className="flex h-7 items-center gap-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-2 text-[11px] font-semibold text-white shadow-sm shadow-cyan-500/40 transition-shadow hover:shadow-md hover:shadow-cyan-500/60"
              title="Import Snowflake task graphs as workflow projects"
            >
              <Download className="h-3 w-3" />
              <span className="hidden md:inline">Import</span>
            </motion.button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          {/* ── Cluster 2: Project context ── */}
          <div className="flex items-center gap-2">
            <select
              value={activeWorkflowId || ''}
              onChange={(e) => {
                const wf = workflows.find((w) => w.id === e.target.value);
                if (wf) handleLoadPipeline(wf);
                else handleNewPipeline();
              }}
              className="h-8 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs shadow-sm transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <option value="">New workflow</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={pipelineName}
              onChange={(e) => { setPipelineName(e.target.value); setIsDirty(true); }}
              className="h-8 w-[180px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold shadow-sm transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
              placeholder="Workflow name…"
              readOnly={isReadOnly}
            />

            {/* Status badges — animated entrance so they don't pop in jarringly */}
            <AnimatePresence>
              {isDirty && (nodes.length > 0 || activeWorkflowId) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-orange-600 dark:text-orange-400"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                  Unsaved
                </motion.span>
              )}
              {!isDirty && saveStatus === 'saved' && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle className="h-3 w-3" />
                  Saved
                </motion.span>
              )}
              {isReadOnly && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  <Eye className="h-3 w-3" />
                  View only
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {validation && (
            <div className="relative">
              <span
                onClick={() => !validation.valid && validationErrors.length > 0 && setShowErrorPanel(!showErrorPanel)}
                className={cn(
                  'px-2 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap',
                  validation.valid
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors'
                )}
              >
                {validation.valid ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {validation.valid ? 'Valid' : `${validationErrors.length} Error${validationErrors.length !== 1 ? 's' : ''}`}
              </span>
              {showErrorPanel && validationErrors.length > 0 && (
                <div className="absolute top-full left-0 z-50 mt-1 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg shadow-xl p-3 max-h-[300px] overflow-y-auto min-w-[320px]">
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Cluster 3: Actions ──
              Primary lifecycle buttons grouped in their own pill surface,
              utility icons sit slightly apart so they read as secondary. */}
          <div className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/60">
            <motion.button
              whileHover={!(isSaving || isReadOnly || isPendingApproval) ? { scale: 1.04 } : undefined}
              whileTap={!(isSaving || isReadOnly || isPendingApproval) ? { scale: 0.96 } : undefined}
              onClick={handleSavePipeline}
              disabled={isSaving || isReadOnly || isPendingApproval}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-blue-500/40 transition-shadow hover:shadow-md hover:shadow-blue-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title={isPendingApproval ? 'Pending approval — cannot modify' : 'Save workflow (Ctrl+S)'}
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </motion.button>

            <motion.button
              whileHover={activeWorkflowId ? { scale: 1.04 } : undefined}
              whileTap={activeWorkflowId ? { scale: 0.96 } : undefined}
              onClick={handleValidate}
              disabled={!activeWorkflowId}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-amber-500/40 transition-shadow hover:shadow-md hover:shadow-amber-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title="Check for errors in the workflow DAG before execution"
            >
              <CheckCircle className="h-3 w-3" />
              Validate
            </motion.button>

            <motion.button
              whileHover={!(isExecuting || !activeWorkflowId) ? { scale: 1.04 } : undefined}
              whileTap={!(isExecuting || !activeWorkflowId) ? { scale: 0.96 } : undefined}
              onClick={() => handleExecute(true)}
              disabled={isExecuting || !activeWorkflowId}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-slate-500/30 transition-shadow hover:shadow-md disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title="Preview the compiled SQL without executing it"
            >
              <Eye className="h-3 w-3" />
              SQL
            </motion.button>

            <motion.button
              whileHover={!(isExecuting || !activeWorkflowId || isReadOnly || (isPendingApproval && !isApproved)) ? { scale: 1.04 } : undefined}
              whileTap={!(isExecuting || !activeWorkflowId || isReadOnly || (isPendingApproval && !isApproved)) ? { scale: 0.96 } : undefined}
              onClick={() => handleExecute(false)}
              disabled={isExecuting || !activeWorkflowId || isReadOnly || (isPendingApproval && !isApproved)}
              className="group relative flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-green-500/40 transition-shadow hover:shadow-md hover:shadow-green-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title={isPendingApproval ? 'Pending approval — waiting for admin' : 'Run the workflow now (Ctrl+Enter)'}
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run
            </motion.button>

            <motion.button
              whileHover={!(!activeWorkflowId || isReadOnly || isPendingApproval) ? { scale: 1.04 } : undefined}
              whileTap={!(!activeWorkflowId || isReadOnly || isPendingApproval) ? { scale: 0.96 } : undefined}
              onClick={handleSubmitForApproval}
              disabled={!activeWorkflowId || isReadOnly || isPendingApproval}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-violet-500/40 transition-shadow hover:shadow-md hover:shadow-violet-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title={isPendingApproval ? 'Already submitted for approval' : 'Request approval for production deployment'}
            >
              <AlertCircle className="h-3 w-3" />
              Approve
            </motion.button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          {/* ── Cluster 4: Utility icons ── */}
          <div className="flex shrink-0 items-center gap-0.5">
            <motion.button
              whileHover={nodes.length > 0 ? { scale: 1.1 } : undefined}
              whileTap={nodes.length > 0 ? { scale: 0.92 } : undefined}
              onClick={handleExportJSON}
              disabled={nodes.length === 0}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="Export workflow as JSON"
              aria-label="Export workflow"
            >
              <Download className="h-3.5 w-3.5" />
            </motion.button>

            <motion.button
              whileHover={nodes.length > 0 ? { scale: 1.1 } : undefined}
              whileTap={nodes.length > 0 ? { scale: 0.92 } : undefined}
              onClick={handleDuplicate}
              disabled={nodes.length === 0}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="Duplicate workflow"
              aria-label="Duplicate workflow"
            >
              <Copy className="h-3.5 w-3.5" />
            </motion.button>

            {activeWorkflowId && !isReadOnly && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleDeletePipeline}
                className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                title="Delete workflow"
                aria-label="Delete workflow"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </motion.button>
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
        <div ref={reactFlowWrapper} className="flex-1 relative">
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

          {/* Empty state overlay — pointer-events-none so drops pass through to ReactFlow */}
          {nodes.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center space-y-5 max-w-md">
                {/* Visual flow diagram */}
                <div className="flex items-center justify-center gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2 shadow-sm">
                      <svg className="h-7 w-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Source</span>
                  </div>
                  <svg className="h-5 w-5 text-slate-300 dark:text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2 shadow-sm">
                      <svg className="h-7 w-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Transform</span>
                  </div>
                  <svg className="h-5 w-5 text-slate-300 dark:text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-2 shadow-sm">
                      <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Destination</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Drag blocks from the left panel to start building your workflow
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Connect blocks to define data flow, then click each block to configure it
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — conditional, PUSHES canvas */}
        {showRightPanel && (
        <div className="w-[420px] flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col">
          {/* Tabs — single compact row */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            {[
              { id: 'results', label: 'Results', icon: Eye, disabledWhenEmpty: true },
              { id: 'runs', label: 'Runs', icon: History, disabledWhenEmpty: true },
              { id: 'sql', label: 'SQL', icon: Code, disabledWhenEmpty: true },
              { id: 'schedules', label: 'Schedule', icon: Calendar, disabledWhenPending: true, disabledWhenEmpty: true },
              { id: 'ai', label: 'AI', icon: Sparkles },
            ].map((tab) => {
              const isEmpty = nodes.length === 0;
              const disabledByEmpty = (tab as any).disabledWhenEmpty && isEmpty;
              const disabledByPending = (tab as any).disabledWhenPending && isPendingApproval;
              const isTabDisabled = disabledByEmpty || disabledByPending;
              const disabledTitle = disabledByEmpty
                ? `Add at least one block to view ${tab.label}`
                : disabledByPending
                ? 'Pending approval — scheduling disabled'
                : undefined;
              return (
              <button
                key={tab.id}
                onClick={() => !isTabDisabled && setActiveTab(tab.id as any)}
                disabled={isTabDisabled}
                aria-disabled={isTabDisabled || undefined}
                title={disabledTitle}
                className={cn(
                  'flex-1 px-2 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap min-w-0',
                  isTabDisabled && 'opacity-40 cursor-not-allowed',
                  activeTab === tab.id && !isTabDisabled
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                )}
              >
                <tab.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            );
            })}
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
            {activeTab === 'results' && (
              <div className="space-y-3 -mx-4 -mt-4">
                {/* Execution summary */}
                {lastExecution && (
                  <div className="px-4 pt-4 space-y-2">
                    <div className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
                      lastExecution.status === 'completed' || lastExecution.status === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : lastExecution.status === 'failed'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    )}>
                      {lastExecution.status === 'completed' || lastExecution.status === 'success'
                        ? <CheckCircle className="h-4 w-4" />
                        : lastExecution.status === 'failed'
                        ? <AlertCircle className="h-4 w-4" />
                        : <Loader2 className="h-4 w-4 animate-spin" />}
                      <span className="capitalize">{lastExecution.status}</span>
                      <span className="text-xs opacity-75 ml-auto">
                        {lastExecution.rows_affected != null && `${lastExecution.rows_affected} rows`}
                        {lastExecution.steps_executed != null && ` · ${lastExecution.steps_executed}/${lastExecution.steps_total} steps`}
                      </span>
                    </div>

                    {/* Step-by-step results */}
                    {lastExecution.execution_details?.steps_results?.length > 0 && (
                      <div className="space-y-1">
                        {lastExecution.execution_details.steps_results.map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-slate-50 dark:bg-slate-700/50">
                            <span className={cn(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              step.status === 'completed' || step.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                            )} />
                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                              {step.cte_alias || step.step_id || `Step ${i + 1}`}
                            </span>
                            {step.rows_affected != null && (
                              <span className="ml-auto text-slate-500">{step.rows_affected} rows</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Table data preview */}
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    <span className="ml-2 text-sm text-slate-500">Loading preview...</span>
                  </div>
                ) : previewError ? (
                  <div className="mx-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p>
                    <button
                      onClick={loadResultsPreview}
                      className="mt-2 text-xs text-red-700 dark:text-red-300 underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : previewData ? (
                  <div className="px-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {previewData.table}
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        {previewData.rows.length} of {previewData.total_rows} rows
                      </span>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto max-h-[500px]">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                          <tr>
                            {previewData.columns.map((col) => (
                              <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-200 dark:border-slate-600">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              {previewData.columns.map((col) => (
                                <td key={col} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                                  {row[col] != null ? String(row[col]) : <span className="text-slate-400 italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={loadResultsPreview}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                ) : !lastExecution ? (
                  <div className="px-4 py-8 text-center">
                    <Eye className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No results yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Execute the workflow to see the destination table data here.
                    </p>
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm text-slate-500">No destination table configured.</p>
                    <p className="text-xs text-slate-400 mt-1">Add a Destination block to preview output data.</p>
                  </div>
                )}
              </div>
            )}

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
                  Corrections, warnings, and optimizations for your workflow.
                </p>
                {validation ? (
                  <>
                    {validation.error && (
                      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-2">
                        <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Errors</div>
                        <p className="text-xs text-red-600 dark:text-red-300">{extractErrorString(validation.error)}</p>
                      </div>
                    )}
                    {!validation.valid && !validation.error && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-2">
                        <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Warnings</div>
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
                      {aiSuggestionsLoading ? 'Analyzing...' : 'AI Suggestions (Cortex)'}
                    </button>
                    {aiSuggestions != null && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">AI Response</div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {aiSuggestions}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Click &quot;Validate&quot; to see errors, warnings, and request AI suggestions.
                  </p>
                )}
              </div>
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

      {/* AI Guided Workflow — 9-step wizard. Generated nodes/edges are
          dropped onto the React Flow canvas via setNodes/setEdges. */}
      <GuidedAiWorkflowWizard
        open={showAiGenerate}
        onClose={() => setShowAiGenerate(false)}
        onCreated={(genNodes, genEdges) => {
          setNodes(genNodes as unknown as typeof nodes);
          setEdges(genEdges as unknown as typeof edges);
          setIsDirty(true);
          toast.success('AI workflow ready — review, save and run');
        }}
      />

      {/* Import Snowflake task graphs as workflow projects */}
      <ImportTasksModal
        open={showImportTasks}
        onClose={() => setShowImportTasks(false)}
        onImported={(projectName) => {
          // Refresh the workflow list via the cache-aware query's refetch
          // so the imported project shows up in the header selector.
          void loadWorkflows();
          toast.success(`"${projectName}" imported — pick it from the workflow selector`);
        }}
      />
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
