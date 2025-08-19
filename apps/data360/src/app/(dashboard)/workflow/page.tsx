'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSession } from 'next-auth/react';
import toast, { Toaster } from 'react-hot-toast';
import WorkflowBuilder from './Workflow';
import WorkflowCard from './WorkflowCard';

interface BackendWorkflow {
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
const SIDEBAR_WIDTH_PX = 256;

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
        await fetchWorkflows(token);
      } else {
        setError("No access token found. Please log in.");
        setLoading(false);
      }
    };
    fetchSessionAndWorkflows();
  }, []);

  const fetchWorkflows = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/get_workflows/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch workflows: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      if (Array.isArray(data.workflows)) {
        setWorkflows(data.workflows);
        if (data.workflows.length > 0 && !activeWorkflowName) {
          loadWorkflow(data.workflows[0]);
        }
      } else {
        setWorkflows([]);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred while fetching workflows.");
      toast.error(`Error: ${err.message || "Failed to load workflows"}`);
    } finally {
      setLoading(false);
    }
  }, [activeWorkflowName]);

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
    if (!accessToken) {
      toast.error("Authentication token missing.");
      return;
    }
    if (oldName === newName) {
      return;
    }
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/rename_workflow/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ old_workflow_name: oldName, new_workflow_name: newName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to rename workflow: ${JSON.stringify(errorData)}`);
      }
      toast.success(`Workflow '${oldName}' renamed to '${newName}' successfully!`);
      await fetchWorkflows(accessToken);
      if (activeWorkflowName === oldName) {
        setActiveWorkflowName(newName);
      }
    } catch (error: any) {
      console.error("Error renaming workflow:", error);
      toast.error(`Error renaming workflow: ${error.message}`);
    }
  }, [accessToken, fetchWorkflows, activeWorkflowName]);

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
    if (!accessToken) {
      toast.error("Authentication token missing. Please log in.");
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
    const finalSteps = topologicallySortedNodes.map(node => {
      const step: any = {
        step_order: nodeIdToStepOrderMap.get(node.id),
        payload: { ...node.data },
      };
      const incomingEdgesForStep = activeEdges.filter(edge => edge.target === node.id);
      let inputStep: string | undefined;
      if (incomingEdgesForStep.length > 0 && node.type !== 'join') {
        inputStep = nodeIdToStepOrderMap.get(incomingEdgesForStep[0].source)?.toString();
      }
      switch (node.type) {
        case 'src':
          step.action_type = 'src';
          if (Array.isArray(step.payload.columns)) {
            step.payload.columns = step.payload.columns.join(', ');
          }
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
        case 'destination':
          step.action_type = 'destination';
          step.payload.input_step = inputStep;
          if (typeof step.payload.columns === 'string') {
            step.payload.destination_columns_str = step.payload.columns.split(',').map((c: string) => c.trim());
          } else if (Array.isArray(step.payload.columns)) {
            step.payload.destination_columns_str = step.payload.columns;
          } else {
            step.payload.destination_columns_str = [];
          }
          delete step.payload.columns;
          break;
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
    });
    const workflowJson = {
      workflow_name: activeWorkflowName,
      steps: finalSteps,
    };
    console.log("Generated Workflow JSON:", JSON.stringify(workflowJson, null, 2));
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/create_workflow/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(workflowJson),
      });
      if (response.ok) {
        toast.success('Workflow saved successfully!');
        setIsWorkflowSaved(true);
        if (fetchWorkflows) {
          fetchWorkflows(accessToken);
        }
      } else {
        const errorData = await response.json();
        toast.error(`Failed to save workflow: ${JSON.stringify(errorData)}`);
        setIsWorkflowSaved(false);
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('An error occurred while saving the workflow.');
    }
  };

  const executeWorkflow = async () => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!accessToken) {
      toast.error("Authentication token missing. Please log in.");
      return;
    }
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/execute_workflow/?workflow_name=${encodeURIComponent(activeWorkflowName)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(`Workflow execution initiated: ${result}`);
      } else {
        const errorData = await response.json();
        toast.error(`Failed to execute workflow: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('An error occurred while executing the workflow.');
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
    if (!accessToken) {
      toast.error("Authentication token missing. Please log in.");
      return;
    }
    console.log(`Attempting to schedule workflow: '${activeWorkflowName}' with cron_schedule: '${cron_schedule_value}'`);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/schedule_workflow/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          workflow_name: activeWorkflowName,
          cron_schedule: cron_schedule_value,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(`Workflow '${activeWorkflowName}' scheduled successfully: ${result}`);
        setActiveSchedule(cron_schedule_value);
        setShowScheduleDropdown(false);
        if (fetchWorkflows) {
          fetchWorkflows(accessToken);
        }
      } else {
        const errorData = await response.json();
        toast.error(`Failed to schedule workflow: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Error scheduling workflow:', error);
      toast.error('An error occurred while scheduling the workflow.');
    }
  };

  const suspendTask = async () => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!accessToken) {
      toast.error("Authentication token missing. Please log in.");
      return;
    }
    console.log(`Attempting to suspend workflow: '${activeWorkflowName}'`);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/suspend_task/?task_name=${encodeURIComponent(activeWorkflowName)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(`Workflow '${activeWorkflowName}' suspended successfully: ${result}`);
        setActiveSchedule('');
        if (fetchWorkflows) {
          fetchWorkflows(accessToken);
        }
      } else {
        const errorData = await response.json();
        toast.error(`Failed to suspend workflow: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Error suspending workflow:', error);
      toast.error('An error occurred while suspending the workflow.');
    }
  };

  const resumeTask = async () => {
    if (!activeWorkflowName) {
      toast.error("Workflow name is missing. Please save the workflow first.");
      return;
    }
    if (!accessToken) {
      toast.error("Authentication token missing. Please log in.");
      return;
    }
    console.log(`Attempting to resume workflow: '${activeWorkflowName}'`);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/API_WORKFLOW/resume_task/?task_name=${encodeURIComponent(activeWorkflowName)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (response.ok) {
        const result = await response.json();
        toast.success(`Workflow '${activeWorkflowName}' resumed successfully: ${result}`);
        if (fetchWorkflows) {
          fetchWorkflows(accessToken);
        }
      } else {
        const errorData = await response.json();
        toast.error(`Failed to resume workflow: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Error resuming workflow:', error);
      toast.error('An error occurred while resuming the workflow.');
    }
  };

  const PaletteItem = ({
    label,
    type,
    shape,
    className,
    tooltip,
  }: {
    label: string;
    type: string;
    shape: React.ReactNode;
    className?: string;
    tooltip?: string;
  }) => (
    <div
      className={`flex items-center space-x-2 mb-3 p-2 rounded-lg cursor-move border shadow-sm bg-white hover:bg-gray-100 transition ${className}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/reactflow', type);
        e.dataTransfer.effectAllowed = 'move';
      }}
      title={tooltip || label}
    >
      <div className="w-10 h-10 flex items-center justify-center">{shape}</div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center items-center h-screen text-xl">Loading workflows...</div>;
  }
  if (error) {
    return <div className="flex justify-center items-center h-screen text-red-500 text-xl">Error: {error}</div>;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster />
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 p-4 border-r border-gray-300 flex flex-col justify-between overflow-y-auto z-20">
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4">🧩 ETL Blocks</h3>
<PaletteItem 
  label="Source" 
  type="src" 
  shape={
    <svg 
      width="48px" 
      height="48px" 
      viewBox="0 0 24 24" 
      role="img" 
      xmlns="http://www.w3.org/2000/svg" 
      aria-labelledby="databaseIconTitle" 
      stroke="#000000" 
      strokeWidth="1" 
      strokeLinecap="square" 
      strokeLinejoin="miter" 
      fill="none" 
      color="#000000"
      className="w-12 h-12"
    >
      <title id="databaseIconTitle">Database</title>
      <ellipse cx="12" cy="6" rx="8" ry="3"/>
      <path d="M4,6 C4,8.209139 7.581722,10 12,10 C16.418278,10 20,8.209139 20,6"/>
      <path d="M4,12 C4,14.209139 7.581722,16 12,16 C16.418278,16 20,14.209139 20,12"/>
      <path d="M4,18 C4,20.209139 7.581722,22 12,22 C16.418278,22 20,20.209139 20,18"/>
      <path d="M4 6L4 18"/>
      <path d="M20 6L20 18"/>
    </svg>
  } 
  tooltip="Input data source (e.g., DB)" 
/>
          <PaletteItem label="Join" type="join" shape={<span className="text-4xl">🔀</span>} tooltip="Join 2 sources" />
          <PaletteItem label="Aggregate KPI" type="aggregate_kpi" shape={<span className="text-4xl">📊</span>} tooltip="Aggregate key performance indicator" />
          <PaletteItem label="Sort" type="sort" shape={<span className="text-4xl">⬆️</span>} tooltip="Sort dataset" />
          <PaletteItem label="Destination" type="destination" shape={<svg width="48px" height="48px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21C15.3137 17.6863 18 14.7912 18 10.5C18 6.35786 15.3137 3 12 3C8.68629 3 6 6.35786 6 10.5C6 14.7912 8.68629 17.6863 12 21Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>} tooltip="Output target" />
          <PaletteItem label="Drop Nulls" type="drop_nulls" shape={<span className="text-4xl">🗑️</span>} />
          <PaletteItem label="Drop Duplicates" type="drop_duplicates" shape={<span className="text-4xl">✂️</span>} />
          <PaletteItem label="Normalize" type="normalize" shape={<span className="text-4xl">⚖️</span>} />
          <PaletteItem label="Export Excel" type="export_excel" shape={<svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>} tooltip="Export to Excel file" />
          <div className="mt-6">
            <label htmlFor="workflowName" className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
            <input
              type="text"
              id="workflowName"
              className="w-full border px-3 py-2 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              value={activeWorkflowName}
              onChange={(e) => {
                setActiveWorkflowName(e.target.value);
                setIsWorkflowSaved(false);
              }}
              placeholder="Enter workflow name"
              readOnly={!!activeWorkflowName && activeWorkflowName !== '' && workflows.some(w => w.workflow_name === activeWorkflowName)}
            />
          </div>
          <button onClick={saveWorkflow} className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
            disabled={!activeWorkflowName}
          >
            Save Workflow
          </button>
          <button
            onClick={executeWorkflow}
            className={`mt-3 w-full py-2 rounded-lg font-semibold transition ${
              isWorkflowSaved && activeWorkflowName
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!isWorkflowSaved || !activeWorkflowName}
          >
            Execute Workflow
          </button>
          <div className="mt-4 pt-3 pb-3 px-2 bg-gray-100 rounded-lg shadow-sm space-y-2">
            <div className="text-sm font-medium text-gray-700 text-center">
              Current Schedule: {activeSchedule ? cronScheduleOptions.find(opt => opt.value === activeSchedule)?.label : 'None'}
            </div>
            <div className="relative">
              <button
                onClick={() => setShowScheduleDropdown(!showScheduleDropdown)}
                className={`w-full flex items-center justify-between py-2 px-4 rounded-lg font-semibold transition ease-in-out duration-150 ${
                  isWorkflowSaved && activeWorkflowName
                    ? 'bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!isWorkflowSaved || !activeWorkflowName}
              >
                <span>Schedule <span className="font-normal text-sm opacity-80">(Once Saved)</span></span>
                {showScheduleDropdown ? '▼' : '▲'}
              </button>
              {showScheduleDropdown && (
                <div className="absolute bottom-full mb-1 w-full z-20 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden origin-bottom animate-[fadeIn_120ms_ease-out]">
                  <select
                    className="w-full p-3 bg-white text-gray-800 border-none focus:outline-none focus:ring-0 appearance-none"
                    value={activeSchedule}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value && isWorkflowSaved && activeWorkflowName) {
                        scheduleWorkflow(value);
                      }
                    }}
                  >
                    <option value="">Select Frequency to Schedule</option>
                    {cronScheduleOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-around gap-2 pt-1">
              <button
                onClick={resumeTask}
                className={`flex-1 p-2 rounded-lg flex items-center justify-center transition ease-in-out duration-150 text-xl
                  ${
                    isWorkflowSaved && activeWorkflowName
                      ? 'bg-green-400 text-white hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                title="Resume Task"
                disabled={!isWorkflowSaved || !activeWorkflowName}
              >
                ▶️
              </button>
              <button
                onClick={suspendTask}
                className={`flex-1 p-2 rounded-lg flex items-center justify-center transition ease-in-out duration-150 text-xl
                  ${
                    isWorkflowSaved && activeWorkflowName
                      ? 'bg-red-400 text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-50'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                title="Suspend Task"
                disabled={!isWorkflowSaved || !activeWorkflowName}
              >
                ⏸️
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Main content area (React Flow and Workflow Cards) */}
      <div className="flex-1 relative flex flex-col">
        {/* Workflow Cards Container - Adjusting margin-left to close the visual gap */}
        <div
          className="absolute top-4 z-30" // Removed px-4 from here, it's on the inner div
          style={{
            left: `${SIDEBAR_WIDTH_PX}px`, // Starts exactly at the right edge of the sidebar
            right: `0px`, // Ends exactly at the right edge of its parent (.flex-1 area)
            marginLeft: '-256px', // ADDED: Pulls the container slightly to the left to close the visual gap
          }}
        >
          <div className="flex items-center gap-3 bg-white border border-gray-300 py-3 px-4 rounded-lg shadow-md w-full"> {/* px-4 is here */}
            {/* NEW WORKFLOW BUTTON IS FIRST */}
            <button
              onClick={createNewWorkflow}
              className="w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 text-white text-xl flex items-center justify-center flex-shrink-0"
              title="Create New Workflow"
            >
              +
            </button>
            <button
              onClick={() => scrollWorkflows('left')}
              className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl flex items-center justify-center flex-shrink-0"
              title="Scroll Left"
            >
              &lt;
            </button>
            <div ref={workflowCardsScrollContainerRef} className="flex flex-1 items-center gap-3 overflow-x-auto no-scrollbar py-1">
              {workflows.map((workflow) => (
                <button
                  key={workflow.workflow_name}
                  onClick={() => loadWorkflow(workflow)}
                  className={`px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap flex-shrink-0 ${
                    workflow.workflow_name === activeWorkflowName
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                >
                  {workflow.workflow_name}
                </button>
              ))}
            </div>
            <button
              onClick={() => scrollWorkflows('right')}
              className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-xl flex items-center justify-center flex-shrink-0"
              title="Scroll Right"
            >
              &gt;
            </button>
          </div>
        </div>

        {/* Workflow Builder */}
        <div className="flex-1 relative pt-20">
          <WorkflowBuilder
            initialNodes={activeNodes}
            initialEdges={activeEdges}
            initialWorkflowName={activeWorkflowName}
            onWorkflowNameChange={setActiveWorkflowName}
            initialSelectedCronSchedule={activeSchedule}
            accessToken={accessToken}
            refreshWorkflows={fetchWorkflows}
            initialIdCounter={globalNodeIdCounter}
            onSetIdCounter={onSetIdCounterFromBuilder}
            setIsWorkflowSaved={setIsWorkflowSaved}
            setEdges={setActiveEdges}
          />
        </div>
      </div>
    </div>
  );
};

export default WorkflowHomePage;