'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSession } from 'next-auth/react';
import toast, { Toaster } from 'react-hot-toast';
import { Node, Edge } from 'reactflow';
import { WorkflowBuilder, ETLPalette } from './components';
import WorkflowCard from './WorkflowCard';
import { cn } from '@/lib/utils';
import VersionHistory from './components/VersionHistory';
import ExecutionHistory from './components/ExecutionHistory';
import DeploymentScheduler from './components/DeploymentScheduler';
import DeploymentHistory from './components/DeploymentHistory';
import { History, PlayCircle, Rocket, ChevronLeft, ChevronRight, X, FileCheck, ToggleLeft, ToggleRight } from 'lucide-react';
import ETLPipelineBuilder from './ETLPipelineBuilder';
import { ProjectContextPanel } from '@/app/shared/project-context';
import * as workflowApi from '@/app/services/api/workflowApi';
import { listProjects, updateProject } from '@/app/services/api/projectsApi';
import { getApiErrorMessage } from '@/lib/api-client';

interface BackendWorkflow {
  workflow_id?: string;
  workflow_name: string;
  steps: BackendStep[];
  schedule_interval_str?: string;
}

interface BackendStep {
  step_order: number;
  action_type: string;
  payload: { [key: string]: any };
}

interface ReactFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { [key: string]: any };
}

interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

let globalNodeIdCounter = 0;

const WorkflowHomePage: React.FC = () => {
  const [workflows, setWorkflows] = useState<BackendWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = useState<string>('');
  const [activeNodes, setActiveNodes] = useState<ReactFlowNode[]>([]);
  const [activeEdges, setActiveEdges] = useState<ReactFlowEdge[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<string>('');
  const [isWorkflowSaved, setIsWorkflowSaved] = useState<boolean>(false);
  const [showScheduleDropdown, setShowScheduleDropdown] = useState(false);
  const workflowCardsScrollContainerRef = useRef<HTMLDivElement>(null);
  const fetchWorkflowsRef = useRef<((_token?: string) => Promise<void>) | null>(null);

  // Right panel state for Version History, Execution History, Deployment History, and Deploy
  const [rightPanelTab, setRightPanelTab] = useState<'versions' | 'runs' | 'deployments' | null>(null);
  const [showDeployModal, setShowDeployModal] = useState(false);

  // Get workflow ID for the active workflow
  const activeWorkflowId = useMemo(() => {
    const workflow = workflows.find(w => w.workflow_name === activeWorkflowName);
    return workflow?.workflow_id || (workflow ? activeWorkflowName : null);
  }, [workflows, activeWorkflowName]);

  const cronScheduleOptions = useMemo(() => ([
    { value: 'hourly', label: 'Every hour' },
    { value: 'daily', label: 'Every day at 8 AM' },
    { value: 'weekly', label: 'Every Monday at 8 AM' },
    { value: 'monthly', label: 'Every first day of the month at 8 AM' },
  ]), []);

  useEffect(() => {
    const fetchSessionAndWorkflows = async () => {
      const session = await getSession();
      if (session?.user?.access_token) {
        const token = session.user.access_token as string;
        setAccessToken(token);
        await fetchWorkflowsRef.current?.(token);
      } else {
        setError("No access token found. Please log in.");
        setLoading(false);
      }
    };
    fetchSessionAndWorkflows();
  }, []);

  const fetchWorkflows = useCallback(async (_token?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch workflow projects via unified project API
      const projectsData = await listProjects({ project_type: 'workflow' });
      const projectList = projectsData.projects || [];

      // For each project, fetch its steps to build BackendWorkflow objects
      const backendWorkflows: BackendWorkflow[] = await Promise.all(
        projectList.map(async (proj) => {
          try {
            const stepsData = await workflowApi.listSteps(proj.project_id);
            const steps: BackendStep[] = (stepsData.steps || []).map((s) => ({
              step_order: s.step_order,
              action_type: s.action_type,
              payload: s.payload as { [key: string]: any },
            }));
            return {
              workflow_id: proj.project_id,
              workflow_name: proj.project_name,
              steps,
              schedule_interval_str: undefined,
            };
          } catch {
            return {
              workflow_id: proj.project_id,
              workflow_name: proj.project_name,
              steps: [],
            };
          }
        })
      );

      setWorkflows(backendWorkflows);
      if (backendWorkflows.length > 0 && !activeWorkflowName) {
        const firstWorkflow = backendWorkflows[0];
        setActiveWorkflowName(firstWorkflow.workflow_name);
        const { nodes, edges } = convertBackendToReactFlow(firstWorkflow.steps);
        setActiveNodes(nodes);
        setActiveEdges(edges);
        setActiveSchedule(firstWorkflow.schedule_interval_str || '');
        setIsWorkflowSaved(true);
        toast.success(`Loaded workflow: ${firstWorkflow.workflow_name}`);
      }
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      toast.error(`Error: ${msg || 'Failed to load workflows'}`);
      setError(msg || 'An unknown error occurred while fetching workflows.');
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, [activeWorkflowName]);

  // Store the function in ref to avoid circular dependency
  fetchWorkflowsRef.current = fetchWorkflows;

  const convertBackendToReactFlow = useCallback((backendSteps: BackendStep[]): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } => {
    const newNodes: ReactFlowNode[] = [];
    const newEdges: ReactFlowEdge[] = [];
    const stepOrderToNodeIdMap = new Map<number, string>();
    let currentMaxId = -1;
    backendSteps.sort((a, b) => a.step_order - b.step_order);
    backendSteps.forEach((step) => {
      const newNodeId = `node_${++currentMaxId}`;
      stepOrderToNodeIdMap.set(step.step_order, newNodeId);
      let nodeType = step.action_type;
      let nodeData = { ...step.payload };
      if (nodeType === 'join_tables') {
        nodeType = 'join';
      } else if (nodeType.startsWith('normalize_')) {
        nodeType = 'normalize';
        nodeData.normalize_type = step.action_type.split('_')[1];
        if (nodeData.column) {
          if (nodeData.normalize_type === 'zscore') {
            nodeData.zscore_column = nodeData.column;
            nodeData.zscore_column_normalized = nodeData.zscore_column + '_zscore';
          } else {
            nodeData.minmax_column = nodeData.column;
            nodeData.minmax_column_normalized = nodeData.minmax_column + '_norm';
          }
          delete nodeData.column;
        }
      }
      if (nodeType === 'src' && typeof nodeData.columns === 'string') {
        nodeData.columns = nodeData.columns.split(', ').map((col: string) => col.trim());
      }
      if (nodeType === 'destination' && Array.isArray(nodeData.destination_columns_str)) {
        nodeData.columns = nodeData.destination_columns_str;
        delete nodeData.destination_columns_str;
      }
      if (nodeType === 'aggregate_kpi' && typeof nodeData.columns === 'string') {
        nodeData.columns = nodeData.columns.split(',').map((c: string) => c.trim());
      }
      if (nodeType === 'drop_duplicates' && typeof nodeData.dedup_columns === 'string') {
        nodeData.dedup_columns = nodeData.dedup_columns.split(',').map((c: string) => c.trim());
      }
      if (nodeType === 'rename_col' && typeof nodeData.all_columns === 'string') {
        nodeData.all_columns = nodeData.all_columns.split(',').map((c: string) => c.trim());
      }
      newNodes.push({
        id: newNodeId,
        type: nodeType,
        position: { x: step.step_order * 200, y: 100 },
        data: nodeData,
      });
      if (step.payload.input_step && step.action_type !== 'join_tables') {
        const sourceId = stepOrderToNodeIdMap.get(parseInt(step.payload.input_step));
        if (sourceId) {
          newEdges.push({
            id: `edge_${sourceId}-${newNodeId}`,
            source: sourceId,
            target: newNodeId,
            type: 'default',
          });
        }
      }
      if (step.action_type === 'join_tables') {
        const leftSourceId = stepOrderToNodeIdMap.get(parseInt(step.payload.left_step));
        const rightSourceId = stepOrderToNodeIdMap.get(parseInt(step.payload.right_step));
        if (leftSourceId) {
          newEdges.push({
            id: `edge_${leftSourceId}-${newNodeId}-input1`,
            source: leftSourceId,
            target: newNodeId,
            targetHandle: 'input1',
            type: 'default',
          });
        }
        if (rightSourceId) {
          newEdges.push({
            id: `edge_${rightSourceId}-${newNodeId}-input2`,
            source: rightSourceId,
            target: newNodeId,
            targetHandle: 'input2',
            type: 'default',
          });
        }
      }
    });
    globalNodeIdCounter = currentMaxId + 1;
    return { nodes: newNodes, edges: newEdges };
  }, []);

  const loadWorkflow = useCallback((workflow: BackendWorkflow) => {
    setActiveWorkflowName(workflow.workflow_name);
    const { nodes, edges } = convertBackendToReactFlow(workflow.steps);
    setActiveNodes(nodes);
    setActiveEdges(edges);
    setActiveSchedule(workflow.schedule_interval_str || '');
    setIsWorkflowSaved(true);
    toast.success(`Loaded workflow: ${workflow.workflow_name}`);
  }, [convertBackendToReactFlow]);

  const createNewWorkflow = useCallback(() => {
    setActiveWorkflowName('');
    setActiveNodes([]);
    setActiveEdges([]);
    setActiveSchedule('');
    globalNodeIdCounter = 0;
    setIsWorkflowSaved(false);
    toast.success('Ready to create a new workflow!');
  }, []);

  const handleUpdateWorkflowName = useCallback(async (oldName: string, newName: string) => {
    if (oldName === newName) return;
    const workflow = workflows.find(w => w.workflow_name === oldName);
    const wfId = workflow?.workflow_id;
    if (!wfId) {
      toast.error('Workflow ID not found.');
      return;
    }
    try {
      await updateProject(wfId, { project_name: newName });
      toast.success(`Workflow '${oldName}' renamed to '${newName}' successfully!`);
      await fetchWorkflows();
      if (activeWorkflowName === oldName) {
        setActiveWorkflowName(newName);
      }
    } catch (error: any) {
      console.error("Error renaming workflow:", error);
      toast.error(`Error renaming workflow: ${getApiErrorMessage(error)}`);
    }
  }, [workflows, fetchWorkflows, activeWorkflowName]);

  const onSetIdCounterFromBuilder = useCallback((count: number) => {
    globalNodeIdCounter = count;
  }, []);

  const scrollWorkflows = (direction: 'left' | 'right') => {
    if (workflowCardsScrollContainerRef.current) {
      const scrollAmount = workflowCardsScrollContainerRef.current.clientWidth / 2;
      if (direction === 'left') {
        workflowCardsScrollContainerRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        workflowCardsScrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  const saveWorkflow = async () => {
    if (!activeWorkflowName) {
      toast.error("Please enter a workflow name before saving.");
      return;
    }
    const orderedSteps: any[] = [];
    const nodeIdToStepOrderMap = new Map<string, number>();
    const graph: { [key: string]: string[] } = {};
    const inDegree: { [key: string]: number } = {};
    activeNodes.forEach(node => {
      graph[node.id] = [];
      inDegree[node.id] = 0;
    });
    activeEdges.forEach(edge => {
      if (graph[edge.source] && inDegree[edge.target] !== undefined) {
        graph[edge.source].push(edge.target);
      }
      if (inDegree[edge.target] !== undefined) {
        inDegree[edge.target]++;
      }
    });
    const queue: string[] = [];
    activeNodes.forEach(node => {
      if (inDegree[node.id] === 0) {
        queue.push(node.id);
      }
    });
    let currentStepOrder = 1;
    let tempOrderedNodeIds: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      tempOrderedNodeIds.push(nodeId);
      nodeIdToStepOrderMap.set(nodeId, currentStepOrder++);
      graph[nodeId].sort((a, b) => {
        const nodeA = activeNodes.find(n => n.id === a);
        const nodeB = activeNodes.find(n => n.id === b);
        if (!nodeA || !nodeB) return 0;
        return nodeA.position.x - nodeB.position.x || nodeA.position.y - nodeB.position.y;
      }).forEach(neighborId => {
        if (inDegree[neighborId] !== undefined) {
          inDegree[neighborId]--;
          if (inDegree[neighborId] === 0) {
            queue.push(neighborId);
          }
        }
      });
    }
    if (tempOrderedNodeIds.length !== activeNodes.length) {
      toast.error("Failed to save workflow: Circular dependency detected or disconnected nodes. Please ensure all nodes are connected and there are no cycles.");
      return;
    }
    const topologicallySortedNodes = tempOrderedNodeIds.map(nodeId => activeNodes.find(n => n.id === nodeId)!);

    // Helper: derive output columns of a node by walking upstream when needed
    const getAllOutputColumnsOfNodeLocal = (node: ReactFlowNode | undefined): string[] => {
      if (!node) return [];
      switch (node.type) {
        case 'src':
          if (Array.isArray(node.data.columns)) return node.data.columns as string[];
          if (typeof node.data.columns === 'string') return (node.data.columns as string).split(',').map((c: string) => c.trim()).filter(Boolean);
          return [];
        case 'join': {
          const lc = Array.isArray(node.data.left_columns) ? node.data.left_columns as string[] : [];
          const rc = Array.isArray(node.data.right_columns) ? node.data.right_columns as string[] : [];
          return Array.from(new Set([...lc, ...rc]));
        }
        case 'aggregate_kpi': {
          const incomingEdge = activeEdges.find(edge => edge.target === node.id);
          const beforeCols = incomingEdge ? getAllOutputColumnsOfNodeLocal(activeNodes.find(n => n.id === incomingEdge.source)) : [];
          const aggregatedColumns = Array.isArray(node.data.columns)
            ? (node.data.columns as string[])
            : (typeof node.data.columns === 'string' ? (node.data.columns as string).split(',').map((c: string) => c.trim()) : []);
          const kpiName = node.data.kpi_name ? [node.data.kpi_name as string] : [];
          const nonAggregated = beforeCols.filter(col => !aggregatedColumns.includes(col));
          return Array.from(new Set([...nonAggregated, ...kpiName].filter(Boolean)));
        }
        case 'sort':
        case 'drop_nulls':
        case 'drop_duplicates': {
          const incomingEdge = activeEdges.find(edge => edge.target === node.id);
          return incomingEdge ? getAllOutputColumnsOfNodeLocal(activeNodes.find(n => n.id === incomingEdge.source)) : [];
        }
        case 'normalize': {
          const incomingEdge = activeEdges.find(edge => edge.target === node.id);
          const inputCols = incomingEdge ? getAllOutputColumnsOfNodeLocal(activeNodes.find(n => n.id === incomingEdge.source)) : [];
          const normalizedOutputColumn = node.data.normalize_type === 'zscore'
            ? node.data.zscore_column_normalized
            : node.data.minmax_column_normalized;
          const targetColumn = node.data.normalize_type === 'zscore' ? node.data.zscore_column : node.data.minmax_column;
          const after = inputCols.filter(col => col !== targetColumn);
          return Array.from(new Set([...after, normalizedOutputColumn].filter(Boolean)));
        }
        case 'destination':
        default:
          return [];
      }
    };

    // Build a map from nodeId → a temp alias for CTE inputs referencing
    // After steps are created by the backend, real step_ids will be assigned.
    // We use nodeId as a placeholder so the backend can resolve CTE dependencies.
    const nodeIdToAliasMap = new Map<string, string>();
    topologicallySortedNodes.forEach((node, idx) => {
      const alias = (node.data?.name || node.type || `step_${idx + 1}`)
        .toString().toLowerCase().replace(/\s+/g, '_');
      nodeIdToAliasMap.set(node.id, alias);
    });

    const finalSteps = topologicallySortedNodes.map(node => {
      const step: any = {
        step_order: nodeIdToStepOrderMap.get(node.id),
        payload: { ...node.data },
      };
      const incomingEdgesForStep = activeEdges.filter(edge => edge.target === node.id);

      // Build inputs array (nodeIds of upstream steps) for CTE mode
      const inputNodeIds = incomingEdgesForStep.map(edge => edge.source);

      // Also keep legacy input_step for backward compatibility
      let inputStep: string | undefined;
      if (incomingEdgesForStep.length > 0 && node.type !== 'join') {
        inputStep = nodeIdToStepOrderMap.get(incomingEdgesForStep[0].source)?.toString();
      }

      // Set CTE-mode reserved keys
      step.payload.inputs = inputNodeIds;
      step.payload.cte_alias = nodeIdToAliasMap.get(node.id) || `step_${step.step_order}`;
      step.payload.nodeId = node.id;

      switch (node.type) {
        case 'src':
          step.action_type = 'src';
          if (Array.isArray(step.payload.columns)) {
            step.payload.columns = step.payload.columns.join(', ');
          }
          step.payload.inputs = []; // src has no inputs
          break;
        case 'drop_nulls':
          step.action_type = 'drop_nulls';
          step.payload.input_step = inputStep;
          delete step.payload.columns;
          break;
        case 'drop_duplicates':
          step.action_type = 'drop_duplicates';
          step.payload.input_step = inputStep;
          if (Array.isArray(step.payload.dedup_columns)) {
            step.payload.dedup_columns = step.payload.dedup_columns.join(', ');
          }
          delete step.payload.columns;
          break;
        case 'normalize':
          step.action_type = `normalize_${step.payload.normalize_type}`;
          step.payload.input_step = inputStep;
          if (step.payload.normalize_type === 'zscore') {
            step.payload.column = step.payload.zscore_column;
            delete step.payload.zscore_column;
            delete step.payload.minmax_column;
            delete step.payload.minmax_column_normalized;
          } else {
            step.payload.column = step.payload.minmax_column;
            delete step.payload.minmax_column;
            delete step.payload.zscore_column;
            delete step.payload.zscore_column_normalized;
          }
          delete step.payload.normalize_type;
          delete step.payload.columns;
          break;
        case 'join':
          step.action_type = 'join_tables';
          const leftEdge = incomingEdgesForStep.find(edge => edge.targetHandle === 'input1');
          const rightEdge = incomingEdgesForStep.find(edge => edge.targetHandle === 'input2');
          if (leftEdge) {
            step.payload.left_step = nodeIdToStepOrderMap.get(leftEdge.source)?.toString();
          }
          if (rightEdge) {
            step.payload.right_step = nodeIdToStepOrderMap.get(rightEdge.source)?.toString();
          }
          if (!Array.isArray(step.payload.left_columns)) {
            step.payload.left_columns = [];
          }
          if (!Array.isArray(step.payload.right_columns)) {
            step.payload.right_columns = [];
          }
          break;
        case 'aggregate_kpi':
          step.action_type = 'aggregate_kpi';
          step.payload.input_step = inputStep;
          if (typeof step.payload.columns === 'string') {
            step.payload.columns = step.payload.columns.split(',').map((c: string) => c.trim());
          } else if (!Array.isArray(step.payload.columns)) {
            step.payload.columns = [];
          }
          if (step.payload.agg_column) {
            delete step.payload.agg_column;
          }
          break;
        case 'sort':
          step.action_type = 'sort';
          step.payload.input_step = inputStep;
          delete step.payload.columns;
          break;
        case 'destination': {
          step.action_type = 'destination';
          step.payload.input_step = inputStep;
          let destCols: string[] = [];
          if (typeof step.payload.columns === 'string') {
            destCols = step.payload.columns.split(',').map((c: string) => c.trim());
          } else if (Array.isArray(step.payload.columns)) {
            destCols = step.payload.columns;
          }
          if (!destCols || destCols.length === 0) {
            const prevNode = incomingEdgesForStep.length > 0 ? activeNodes.find(n => n.id === incomingEdgesForStep[0].source) : undefined;
            destCols = getAllOutputColumnsOfNodeLocal(prevNode);
            // If destination DB/schema not set, inherit from upstream node when available
            if (!step.payload.database && prevNode?.data?.database) {
              step.payload.database = prevNode.data.database;
            }
            if (!step.payload.schema && prevNode?.data?.schema) {
              step.payload.schema = prevNode.data.schema;
            }
          }
          step.payload.destination_columns_str = destCols;
          delete step.payload.columns;
          break;
        }
        case 'rename_col':
          step.action_type = 'rename_col';
          step.payload.input_step = inputStep;
          if (step.payload.rename_columns && typeof step.payload.rename_columns !== 'object') {
            step.payload.rename_columns = {};
          }
          if (Array.isArray(step.payload.all_columns)) {
            step.payload.all_columns = step.payload.all_columns.join(', ');
          }
          break;
        case 'set_col_value':
          step.action_type = 'set_col_value';
          step.payload.input_step = inputStep;
          if (step.payload.set_columns && typeof step.payload.set_columns !== 'object') {
            step.payload.set_columns = {};
          }
          break;
        default:
          step.action_type = node.type;
          break;
      }
      orderedSteps.push(step);
      return step;
    });
    const workflowJson = {
      workflow_name: activeWorkflowName,
      steps: finalSteps,
    };
    console.log("Generated Workflow JSON:", JSON.stringify(workflowJson, null, 2));

    // Check if workflow already exists (update) or is new (create)
    const existingWorkflow = workflows.find(w => w.workflow_name === activeWorkflowName);

    try {
      if (existingWorkflow?.workflow_id) {
        // Update existing workflow: clear old steps, then add new ones
        const wfId = existingWorkflow.workflow_id;
        // Get current steps to delete them
        try {
          const currentSteps = await workflowApi.listSteps(wfId);
          for (const step of currentSteps.steps || []) {
            await workflowApi.deleteStep(wfId, step.step_id);
          }
        } catch { /* ignore if no steps exist */ }
        // Add new steps
        for (const step of finalSteps) {
          await workflowApi.addStep(wfId, {
            action_type: step.action_type,
            step_name: `step_${step.step_order}`,
            payload: step.payload,
            position: step.step_order,
          });
        }
        toast.success('Workflow updated successfully!');
      } else {
        // Create new workflow with steps
        await workflowApi.createWorkflow({
          project_name: activeWorkflowName,
          steps: finalSteps.map((step) => ({
            action_type: step.action_type,
            step_name: `step_${step.step_order}`,
            payload: step.payload,
          })),
        });
        toast.success('Workflow created successfully!');
      }
      setIsWorkflowSaved(true);
      await fetchWorkflows();
    } catch (err: any) {
      console.error('Error saving workflow:', err);
      toast.error(`Failed to save workflow: ${getApiErrorMessage(err)}`);
      setIsWorkflowSaved(false);
    }
  };

  const executeWorkflow = async () => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!activeWorkflowId) {
      toast.error("Workflow ID not found. Please save the workflow first.");
      return;
    }
    try {
      const result = await workflowApi.executeWorkflow(activeWorkflowId, { trigger_type: 'manual' });
      toast.success(`Workflow execution initiated: ${result.run_id}`);
    } catch (err: any) {
      console.error('Error executing workflow:', err);
      toast.error(`Failed to execute workflow: ${getApiErrorMessage(err)}`);
    }
  };

  const scheduleWorkflow = async (cron_schedule_value: string) => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!cron_schedule_value) {
      toast.error("Please select a scheduling frequency.");
      return;
    }
    if (!activeWorkflowId) {
      toast.error("Workflow ID not found. Please save the workflow first.");
      return;
    }
    try {
      // API expects lowercase cron_choice: 'hourly' | 'daily' | 'weekly' | 'monthly'
      const validChoices = ['hourly', 'daily', 'weekly', 'monthly'] as const;
      if (!validChoices.includes(cron_schedule_value as any)) {
        toast.error("Invalid scheduling frequency.");
        return;
      }
      await workflowApi.scheduleWorkflow(activeWorkflowId, {
        cron_choice: cron_schedule_value as typeof validChoices[number],
        warehouse: 'COMPUTE_WH',
      });
      toast.success(`Workflow '${activeWorkflowName}' scheduled successfully!`);
      setActiveSchedule(cron_schedule_value);
      setShowScheduleDropdown(false);
      await fetchWorkflows();
    } catch (err: any) {
      console.error('Error scheduling workflow:', err);
      toast.error(`Failed to schedule workflow: ${getApiErrorMessage(err)}`);
    }
  };

  const suspendTask = async () => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!activeWorkflowId) {
      toast.error("Workflow ID not found. Please save the workflow first.");
      return;
    }
    try {
      await workflowApi.suspendTask(activeWorkflowId);
      toast.success(`Workflow '${activeWorkflowName}' suspended successfully!`);
      setActiveSchedule('');
      await fetchWorkflows();
    } catch (err: any) {
      console.error('Error suspending workflow:', err);
      toast.error(`Failed to suspend workflow: ${getApiErrorMessage(err)}`);
    }
  };

  const resumeTask = async () => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!activeWorkflowId) {
      toast.error("Workflow ID not found. Please save the workflow first.");
      return;
    }
    try {
      await workflowApi.resumeTask(activeWorkflowId);
      toast.success(`Workflow '${activeWorkflowName}' resumed successfully!`);
      await fetchWorkflows();
    } catch (err: any) {
      console.error('Error resuming workflow:', err);
      toast.error(`Failed to resume workflow: ${getApiErrorMessage(err)}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-xl bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <span className="text-slate-600 dark:text-slate-300">Loading workflows...</span>
        </div>
      </div>
    );
  }
  if (error) {
    const errorText = typeof error === 'string' ? error : (error && typeof (error as any).message === 'string' ? (error as any).message : JSON.stringify(error));
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 dark:bg-slate-900">
        <div className="text-red-500 text-xl p-6 bg-white dark:bg-slate-800 rounded-lg shadow-lg">
          Error: {errorText}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      <Toaster position="bottom-right" />

      {/* Left Sidebar - ETL Palette */}
      <div className="w-72 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-sm">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-indigo-50/80 dark:bg-indigo-900/20">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Glissez les blocs sur le canvas : <strong>Source</strong> → <strong>Transformations</strong> → <strong>Destination</strong>. Planifiez ou exécutez pour automatiser.
          </p>
        </div>
        <div className="flex-1 overflow-hidden">
          <ETLPalette />
        </div>

        {/* Workflow Controls */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-slate-50 dark:bg-slate-800/50">
          {/* Workflow Name */}
          <div>
            <label htmlFor="workflowName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Workflow Name
            </label>
            <input
              type="text"
              id="workflowName"
              className={cn(
                "w-full border px-3 py-2 rounded-lg text-sm",
                "border-slate-200 dark:border-slate-600",
                "bg-white dark:bg-slate-700",
                "text-slate-800 dark:text-slate-100",
                "focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
                "placeholder:text-slate-400"
              )}
              value={activeWorkflowName}
              onChange={(e) => {
                setActiveWorkflowName(e.target.value);
                setIsWorkflowSaved(false);
              }}
              placeholder="Enter workflow name"
              readOnly={!!activeWorkflowName && activeWorkflowName !== '' && workflows.some(w => w.workflow_name === activeWorkflowName)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={saveWorkflow}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg font-semibold text-sm transition",
                activeWorkflowName
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
              )}
              disabled={!activeWorkflowName}
            >
              {workflows.some(w => w.workflow_name === activeWorkflowName) ? 'Update' : 'Save'}
            </button>
            <button
              onClick={executeWorkflow}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg font-semibold text-sm transition",
                isWorkflowSaved && activeWorkflowName
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
              )}
              disabled={!isWorkflowSaved || !activeWorkflowName}
            >
              Execute
            </button>
          </div>

          {/* Schedule Section */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 text-center">
              Schedule: {activeSchedule ? cronScheduleOptions.find(opt => opt.value === activeSchedule)?.label : 'None'}
            </div>
            <div className="relative">
              <button
                onClick={() => setShowScheduleDropdown(!showScheduleDropdown)}
                className={cn(
                  "w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm font-medium transition",
                  isWorkflowSaved && activeWorkflowName
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                )}
                disabled={!isWorkflowSaved || !activeWorkflowName}
              >
                <span>Schedule</span>
                <span>{showScheduleDropdown ? '▲' : '▼'}</span>
              </button>
              {showScheduleDropdown && (
                <div className="absolute bottom-full mb-1 w-full z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden">
                  <select
                    className="w-full p-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-none focus:outline-none"
                    value={activeSchedule}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value && isWorkflowSaved && activeWorkflowName) {
                        scheduleWorkflow(value);
                      }
                    }}
                  >
                    <option value="">Select Frequency</option>
                    {cronScheduleOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={resumeTask}
                className={cn(
                  "flex-1 p-2 rounded-lg flex items-center justify-center text-sm font-medium transition",
                  isWorkflowSaved && activeWorkflowName
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                )}
                title="Resume Task"
                disabled={!isWorkflowSaved || !activeWorkflowName}
              >
                Resume
              </button>
              <button
                onClick={suspendTask}
                className={cn(
                  "flex-1 p-2 rounded-lg flex items-center justify-center text-sm font-medium transition",
                  isWorkflowSaved && activeWorkflowName
                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                )}
                title="Suspend Task"
                disabled={!isWorkflowSaved || !activeWorkflowName}
              >
                Suspend
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Workflow Tabs Header */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* New Workflow Button */}
            <button
              onClick={createNewWorkflow}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition",
                "bg-green-500 hover:bg-green-600 text-white",
                "shadow-sm hover:shadow"
              )}
              title="Create New Workflow"
            >
              <span className="text-xl">+</span>
            </button>

            {/* Navigation Arrows */}
            <button
              onClick={() => scrollWorkflows('left')}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 flex items-center justify-center transition"
              title="Scroll Left"
            >
              &lt;
            </button>

            {/* Workflow Tabs */}
            <div
              ref={workflowCardsScrollContainerRef}
              className="flex flex-1 items-center gap-2 overflow-x-auto no-scrollbar"
            >
              {workflows.map((workflow) => (
                <button
                  key={workflow.workflow_name}
                  onClick={() => loadWorkflow(workflow)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap flex-shrink-0",
                    workflow.workflow_name === activeWorkflowName
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                  )}
                >
                  {workflow.workflow_name}
                </button>
              ))}
              {workflows.length === 0 && (
                <span className="text-sm text-slate-400 dark:text-slate-500 italic">
                  No workflows yet. Click + to create one.
                </span>
              )}
            </div>

            <button
              onClick={() => scrollWorkflows('right')}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 flex items-center justify-center transition"
              title="Scroll Right"
            >
              &gt;
            </button>

            {/* Right Panel Toggle Buttons */}
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setRightPanelTab(rightPanelTab === 'versions' ? null : 'versions')}
                className={cn(
                  "p-2 rounded-lg transition flex items-center gap-1.5",
                  rightPanelTab === 'versions'
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                )}
                title="Version History"
              >
                <History className="h-4 w-4" />
                <span className="text-xs font-medium hidden lg:inline">Versions</span>
              </button>
              <button
                onClick={() => setRightPanelTab(rightPanelTab === 'runs' ? null : 'runs')}
                className={cn(
                  "p-2 rounded-lg transition flex items-center gap-1.5",
                  rightPanelTab === 'runs'
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                )}
                title="Execution History"
              >
                <PlayCircle className="h-4 w-4" />
                <span className="text-xs font-medium hidden lg:inline">Runs</span>
              </button>
              <button
                onClick={() => setRightPanelTab(rightPanelTab === 'deployments' ? null : 'deployments')}
                className={cn(
                  "p-2 rounded-lg transition flex items-center gap-1.5",
                  rightPanelTab === 'deployments'
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                )}
                title="Deployment History"
              >
                <FileCheck className="h-4 w-4" />
                <span className="text-xs font-medium hidden lg:inline">Deploys</span>
              </button>
              <button
                onClick={() => setShowDeployModal(true)}
                disabled={!isWorkflowSaved || !activeWorkflowName}
                className={cn(
                  "px-3 py-2 rounded-lg transition flex items-center gap-2 font-medium text-sm",
                  isWorkflowSaved && activeWorkflowName
                    ? "bg-green-500 text-white hover:bg-green-600 shadow-sm"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                )}
                title={isWorkflowSaved && activeWorkflowName ? "Deploy Workflow" : "Save workflow first to deploy"}
              >
                <Rocket className="h-4 w-4" />
                <span>Deploy</span>
              </button>
            </div>
          </div>
        </div>

        {/* Unified Project Context (Deployment / History / Grants / Errors / Recos) - hideable */}
        <ProjectContextPanel
          projectId={activeWorkflowId}
          projectName={activeWorkflowName}
          variant="workflow"
          defaultExpanded={false}
          hideWhenEmpty={!activeWorkflowName}
          versionsSlot={activeWorkflowId ? (
            <VersionHistory
              workflowId={activeWorkflowId}
              workflowName={activeWorkflowName}
              onVersionChange={() => fetchWorkflowsRef.current?.()}
              className="border-0 rounded-none"
            />
          ) : undefined}
          deploymentSlot={activeWorkflowId ? (
            <DeploymentHistory
              workflowId={activeWorkflowId}
              workflowName={activeWorkflowName}
              className="border-0 rounded-none"
            />
          ) : undefined}
          historySlot={activeWorkflowId ? (
            <div className="p-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Execution History</div>
              <ExecutionHistory
                workflowId={activeWorkflowId}
                workflowName={activeWorkflowName}
                className="border-0 rounded-none"
              />
            </div>
          ) : undefined}
        />

        {/* Main Content with Optional Right Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Workflow Builder Canvas */}
          <div className={cn("flex-1 relative transition-all", rightPanelTab && "mr-0")}>
            <WorkflowBuilder
              initialNodes={activeNodes}
              initialEdges={activeEdges}
              accessToken={accessToken}
              initialIdCounter={globalNodeIdCounter}
              onSetIdCounter={onSetIdCounterFromBuilder}
              setIsWorkflowSaved={setIsWorkflowSaved}
              setParentNodes={(nodes: Node[]) => setActiveNodes(nodes as ReactFlowNode[])}
              setParentEdges={(edges: Edge[]) => setActiveEdges(edges as ReactFlowEdge[])}
            />
          </div>

          {/* Right Panel - Version History, Execution History, or Deployment History */}
          {rightPanelTab && activeWorkflowId && (
            <div className="w-96 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  {rightPanelTab === 'versions' ? (
                    <>
                      <History className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm text-slate-700 dark:text-slate-200">Version History</span>
                    </>
                  ) : rightPanelTab === 'runs' ? (
                    <>
                      <PlayCircle className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm text-slate-700 dark:text-slate-200">Execution History</span>
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm text-slate-700 dark:text-slate-200">Deployment History</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setRightPanelTab(null)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-auto">
                {rightPanelTab === 'versions' ? (
                  <VersionHistory
                    workflowId={activeWorkflowId}
                    workflowName={activeWorkflowName}
                    onVersionChange={() => {
                      // Refresh workflows after version change
                      fetchWorkflowsRef.current?.();
                    }}
                    className="border-0 rounded-none"
                  />
                ) : rightPanelTab === 'runs' ? (
                  <ExecutionHistory
                    workflowId={activeWorkflowId}
                    workflowName={activeWorkflowName}
                    className="border-0 rounded-none"
                  />
                ) : (
                  <DeploymentHistory
                    workflowId={activeWorkflowId}
                    workflowName={activeWorkflowName}
                    className="border-0 rounded-none"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deploy Modal */}
      {activeWorkflowId && (
        <DeploymentScheduler
          workflowId={activeWorkflowId}
          workflowName={activeWorkflowName}
          steps={(workflows.find(w => w.workflow_name === activeWorkflowName)?.steps || []) as any}
          isOpen={showDeployModal}
          onClose={() => setShowDeployModal(false)}
          onDeploymentCreated={(eventId, status) => {
            toast.success(`Deployment ${status === 'PENDING_APPROVAL' ? 'submitted for approval' : status === 'ACTIVE' ? 'executed' : 'scheduled'}!`);
            // Refresh deployment history after creating a new deployment
            if (rightPanelTab === 'deployments') {
              setRightPanelTab(null);
              setTimeout(() => setRightPanelTab('deployments'), 100);
            }
          }}
        />
      )}
    </div>
  );
};

// Wrapper component with toggle between new ETL and legacy workflow builder
const WorkflowPageWithToggle: React.FC = () => {
  const [useNewETL, setUseNewETL] = useState(true); // Default to new ETL builder

  

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-hidden">
        <ETLPipelineBuilder />
      </div>
    </div>
  );
};

export default WorkflowPageWithToggle;
