'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  OnConnect,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import toast, { Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

import { etlNodeTypes } from './ETLNodeTypes';
import { getBlockByType } from './etl-blocks';
import ETLConfigSidebar from './ETLConfigSidebar';

let id = 0;
const getId = () => `node_${id++}`;

interface WorkflowBuilderProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  setParentNodes: (nodes: Node[]) => void;
  setParentEdges: (edges: Edge[]) => void;
  initialIdCounter: number;
  onSetIdCounter?: (id: number) => void;
  setIsWorkflowSaved: (saved: boolean) => void;
  accessToken: string | null;
  className?: string;
}

const WorkflowBuilderInner: React.FC<WorkflowBuilderProps> = ({
  initialNodes,
  initialEdges,
  setParentNodes,
  setParentEdges,
  initialIdCounter,
  onSetIdCounter,
  setIsWorkflowSaved,
  accessToken,
  className,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showConfigSidebar, setShowConfigSidebar] = useState(false);
  const [availableInputColumns, setAvailableInputColumns] = useState<string[]>([]);
  const [leftInputColumns, setLeftInputColumns] = useState<string[]>([]);
  const [rightInputColumns, setRightInputColumns] = useState<string[]>([]);

  // Initialize ID counter
  useEffect(() => {
    id = initialIdCounter;
    if (onSetIdCounter) {
      onSetIdCounter(id);
    }
  }, [initialIdCounter, onSetIdCounter]);

  // Refs to avoid ping-pong updates
  const suppressNodePropagationRef = useRef(false);
  const suppressEdgePropagationRef = useRef(false);
  const prevInitialNodesRef = useRef<Node[] | null>(null);
  const prevInitialEdgesRef = useRef<Edge[] | null>(null);

  // Update nodes when parent-provided initialNodes reference changes
  useEffect(() => {
    if (prevInitialNodesRef.current !== initialNodes) {
      suppressNodePropagationRef.current = true;
      setNodes(initialNodes);
      prevInitialNodesRef.current = initialNodes;
      if (reactFlowInstance && initialNodes.length > 0) {
        const timeoutId = setTimeout(() => {
          reactFlowInstance.fitView({ padding: 0.2 });
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [initialNodes, setNodes, reactFlowInstance]);

  // Update edges when parent-provided initialEdges reference changes
  useEffect(() => {
    if (prevInitialEdgesRef.current !== initialEdges) {
      suppressEdgePropagationRef.current = true;
      setEdges(initialEdges);
      prevInitialEdgesRef.current = initialEdges;
    }
  }, [initialEdges, setEdges]);

  // Propagate nodes to parent
  useEffect(() => {
    if (suppressNodePropagationRef.current) {
      suppressNodePropagationRef.current = false;
      return;
    }
    if (setParentNodes) setParentNodes(nodes);
  }, [nodes, setParentNodes]);

  // Propagate edges to parent
  useEffect(() => {
    if (suppressEdgePropagationRef.current) {
      suppressEdgePropagationRef.current = false;
      return;
    }
    if (setParentEdges) setParentEdges(edges);
  }, [edges, setParentEdges]);

  // Connect handler with validation
  const onConnect: OnConnect = useCallback(
    (params: Edge | Connection) => {
      if (params.source && params.target) {
        const sourceNode = nodes.find(n => n.id === params.source);
        const targetNode = nodes.find(n => n.id === params.target);
        if (sourceNode && targetNode) {
          const sourceBlock = getBlockByType(sourceNode.type || '');
          const targetBlock = getBlockByType(targetNode.type || '');
          if (sourceBlock && !sourceBlock.hasOutput) {
            toast.error(`${sourceBlock.label} has no output`);
            return;
          }
          if (targetBlock && !targetBlock.hasInput) {
            toast.error(`${targetBlock.label} accepts no input`);
            return;
          }
          if (sourceBlock?.category === 'source' && targetBlock?.category === 'source') {
            toast.error('Cannot connect two source blocks');
            return;
          }
        }
      }
      setIsWorkflowSaved(false);
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, setIsWorkflowSaved, nodes]
  );

  // Get output columns of a node (for column propagation)
  const getAllOutputColumnsOfNode = useCallback((node: Node | undefined, currentNodes: Node[] = nodes, currentEdges: Edge[] = edges): string[] => {
    if (!node) return [];

    // Helper to ensure column is a string
    const toStringColumn = (col: any): string => {
      if (typeof col === 'string') return col;
      if (col && typeof col === 'object' && col.name) return col.name;
      return String(col);
    };

    switch (node.type) {
      case 'src':
        if (Array.isArray(node.data.columns)) {
          return node.data.columns.map(toStringColumn);
        }
        return typeof node.data.columns === 'string'
          ? node.data.columns.split(', ').map((col: string) => col.trim())
          : [];
      case 'join':
        const lc = Array.isArray(node.data.left_columns) ? node.data.left_columns.map(toStringColumn) : [];
        const rc = Array.isArray(node.data.right_columns) ? node.data.right_columns.map(toStringColumn) : [];
        return Array.from(new Set([...lc, ...rc]));
      case 'aggregate_kpi':
        const incomingEdgeToAgg = currentEdges.find(edge => edge.target === node.id);
        let inputColumnsBeforeAgg: string[] = [];
        if (incomingEdgeToAgg) {
          const sourceNodeBeforeAgg = currentNodes.find(n => n.id === incomingEdgeToAgg.source);
          inputColumnsBeforeAgg = getAllOutputColumnsOfNode(sourceNodeBeforeAgg, currentNodes, currentEdges);
        }
        const aggregatedColumns = Array.isArray(node.data.columns) ? node.data.columns.map(toStringColumn) : [];
        const kpiName = node.data.kpi_name ? [node.data.kpi_name] : [];
        const nonAggregatedColumns = inputColumnsBeforeAgg.filter(col => !aggregatedColumns.includes(col));
        return Array.from(new Set([...nonAggregatedColumns, ...kpiName].filter(Boolean)));
      case 'sort':
      case 'drop_nulls':
      case 'drop_duplicates':
        const incomingEdgeForPassthrough = currentEdges.find(edge => edge.target === node.id);
        if (incomingEdgeForPassthrough) {
          const sourceNodeForPassthrough = currentNodes.find(n => n.id === incomingEdgeForPassthrough.source);
          return getAllOutputColumnsOfNode(sourceNodeForPassthrough, currentNodes, currentEdges);
        }
        return [];
      case 'normalize':
        const incomingEdgeForNormalize = currentEdges.find(edge => edge.target === node.id);
        let inputColumnsForNormalize: string[] = [];
        if (incomingEdgeForNormalize) {
          const sourceNodeForNormalize = currentNodes.find(n => n.id === incomingEdgeForNormalize.source);
          inputColumnsForNormalize = getAllOutputColumnsOfNode(sourceNodeForNormalize, currentNodes, currentEdges);
        }
        const normalizedOutputColumn = node.data.normalize_type === 'zscore'
          ? node.data.zscore_column_normalized
          : node.data.minmax_column_normalized;
        const targetColumn = node.data.normalize_type === 'zscore' ? node.data.zscore_column : node.data.minmax_column;
        const columnsAfterNormalize = inputColumnsForNormalize.filter(col => col !== targetColumn);
        return Array.from(new Set([...columnsAfterNormalize, normalizedOutputColumn].filter(Boolean)));
      case 'destination':
        return [];
      default:
        return [];
    }
  }, [nodes, edges]);

  // Get columns from previous step
  const getOutputColumnsOfPreviousStep = useCallback((targetNodeId: string) => {
    const incomingEdges = edges.filter(edge => edge.target === targetNodeId);
    if (incomingEdges.length === 0) return [];

    let combinedColumns: string[] = [];
    const targetNode = nodes.find(n => n.id === targetNodeId);

    if (targetNode?.type === 'join') {
      const leftEdge = incomingEdges.find(edge => edge.targetHandle === 'input1');
      const rightEdge = incomingEdges.find(edge => edge.targetHandle === 'input2');

      if (leftEdge) {
        const leftSourceNode = nodes.find(n => n.id === leftEdge.source);
        combinedColumns = [...combinedColumns, ...getAllOutputColumnsOfNode(leftSourceNode)];
      }
      if (rightEdge) {
        const rightSourceNode = nodes.find(n => n.id === rightEdge.source);
        combinedColumns = [...combinedColumns, ...getAllOutputColumnsOfNode(rightSourceNode)];
      }
      return Array.from(new Set(combinedColumns));
    } else {
      const sourceNode = nodes.find(n => n.id === incomingEdges[0].source);
      return getAllOutputColumnsOfNode(sourceNode);
    }
  }, [nodes, edges, getAllOutputColumnsOfNode]);

  // Handle node click - open config sidebar
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setShowConfigSidebar(true);

    // Get available columns for this node
    const columns = getOutputColumnsOfPreviousStep(node.id);
    setAvailableInputColumns(columns);

    // For join nodes, get left and right columns separately
    if (node.type === 'join') {
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      const leftEdge = incomingEdges.find(edge => edge.targetHandle === 'input1');
      const rightEdge = incomingEdges.find(edge => edge.targetHandle === 'input2');

      if (leftEdge) {
        const leftSourceNode = nodes.find(n => n.id === leftEdge.source);
        setLeftInputColumns(getAllOutputColumnsOfNode(leftSourceNode));
      } else {
        setLeftInputColumns([]);
      }

      if (rightEdge) {
        const rightSourceNode = nodes.find(n => n.id === rightEdge.source);
        setRightInputColumns(getAllOutputColumnsOfNode(rightSourceNode));
      } else {
        setRightInputColumns([]);
      }
    }
  }, [edges, nodes, getOutputColumnsOfPreviousStep, getAllOutputColumnsOfNode]);

  // Handle config save
  const handleConfigSave = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
    setIsWorkflowSaved(false);
    toast.success('Node configuration saved');
  }, [setNodes, setIsWorkflowSaved]);

  // Handle node delete
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    setShowConfigSidebar(false);
    setIsWorkflowSaved(false);
    toast.success('Node deleted');
  }, [setNodes, setEdges, setIsWorkflowSaved]);

  // Close config sidebar
  const handleCloseConfig = useCallback(() => {
    setShowConfigSidebar(false);
    setSelectedNode(null);
  }, []);

  // Drag over handler
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Drop handler
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');

      if (!type || !reactFlowInstance) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getId(),
        type: type,
        position,
        data: {},
      };

      setNodes((nds) => nds.concat(newNode));
      setIsWorkflowSaved(false);

      // Auto-select the new node
      setSelectedNode(newNode);
      setShowConfigSidebar(true);
      setAvailableInputColumns([]);
    },
    [reactFlowInstance, setNodes, setIsWorkflowSaved]
  );

  return (
    <div className={cn('flex h-full', className)}>
      {/* ReactFlow Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={etlNodeTypes}
          fitView
          onNodeClick={onNodeClick}
          className="bg-slate-50 dark:bg-slate-900"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-slate-100 dark:bg-slate-800" />
          <Controls className="!bg-white dark:!bg-slate-800 !border-slate-200 dark:!border-slate-700 !shadow-lg" />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case 'src': return '#3b82f6';
                case 'join': return '#f59e0b';
                case 'aggregate_kpi': return '#8b5cf6';
                case 'sort': return '#6366f1';
                case 'drop_nulls': return '#f97316';
                case 'drop_duplicates': return '#ec4899';
                case 'normalize': return '#06b6d4';
                case 'destination': return '#22c55e';
                case 'export_excel': return '#10b981';
                default: return '#64748b';
              }
            }}
            className="!bg-white dark:!bg-slate-800 !border-slate-200 dark:!border-slate-700"
          />
        </ReactFlow>
      </div>

      {/* Config Sidebar */}
      {showConfigSidebar && (
        <ETLConfigSidebar
          node={selectedNode}
          onClose={handleCloseConfig}
          onSave={handleConfigSave}
          onDelete={handleDeleteNode}
          availableColumns={availableInputColumns}
          accessToken={accessToken}
          leftInputColumns={leftInputColumns}
          rightInputColumns={rightInputColumns}
        />
      )}

      <Toaster position="bottom-right" />
    </div>
  );
};

// Main component with provider
const WorkflowBuilder: React.FC<WorkflowBuilderProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
};

export default WorkflowBuilder;
