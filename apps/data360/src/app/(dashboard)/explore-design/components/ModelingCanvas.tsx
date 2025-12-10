'use client';

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionMode,
  MarkerType,
  Panel,
  BackgroundVariant,
  NodeChange,
  EdgeChange,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Modal, Tooltip } from 'rizzui';
import {
  ZoomIn, ZoomOut, Maximize2, Download, Upload, Undo2, Redo2,
  Grid3X3, Layers, Eye, EyeOff, Lock, Unlock, Plus, Minus,
  LayoutGrid, Save, RefreshCw, Settings, Filter, Search,
  ArrowLeftRight, Database, Table2, GitBranch, Workflow
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import TableNode, { TableNodeData, TableNodeColumn } from './TableNode';
import PolicyAssignmentPanel from './PolicyAssignmentPanel';
import AddColumnModal, { ComputedColumn } from './AddColumnModal';
import { useEventStore, createRelationEvent, createTableRenameEvent } from '../stores/event-store';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';

// Custom node types
const nodeTypes = {
  tableNode: TableNode,
};

// Edge styles for different relation types
const edgeStyles: Record<string, React.CSSProperties> = {
  'one_to_one': { stroke: '#3b82f6', strokeWidth: 2 },
  'one_to_many': { stroke: '#10b981', strokeWidth: 2 },
  'many_to_one': { stroke: '#8b5cf6', strokeWidth: 2 },
  'many_to_many': { stroke: '#f59e0b', strokeWidth: 2 },
};

// Props
interface ModelingCanvasProps {
  tables: TableItem[];
  tableColumns: Map<string, ColumnInfo[]>;
  onTableSelect?: (table: TableItem) => void;
  onRelationCreate?: (source: string, target: string, sourceCol: string, targetCol: string) => void;
  className?: string;
}

// Auto-layout helper
const autoLayout = (nodes: Node[]): Node[] => {
  const PADDING = 50;
  const NODE_WIDTH = 250;
  const NODE_HEIGHT = 200;
  const COLS = Math.ceil(Math.sqrt(nodes.length));

  return nodes.map((node, idx) => ({
    ...node,
    position: {
      x: PADDING + (idx % COLS) * (NODE_WIDTH + PADDING),
      y: PADDING + Math.floor(idx / COLS) * (NODE_HEIGHT + PADDING),
    },
  }));
};

// Inner component with React Flow hooks
const ModelingCanvasInner: React.FC<ModelingCanvasProps> = ({
  tables,
  tableColumns,
  onTableSelect,
  onRelationCreate,
  className,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut, getNodes, getEdges } = useReactFlow();
  const { addEvent, undoEvent, redoEvent, canUndo, canRedo, events } = useEventStore();

  // Convert tables to nodes
  const initialNodes: Node<TableNodeData>[] = useMemo(() => {
    const nodes = tables.map((table, idx) => {
      const cols = tableColumns.get(table.id) || [];
      return {
        id: table.id,
        type: 'tableNode',
        position: { x: 0, y: 0 },
        data: {
          id: table.id,
          database: table.database,
          schema: table.schema,
          table: table.table,
          columns: cols.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            isPrimaryKey: c.isPrimaryKey,
            isNullable: c.isNullable,
            isSensitive: c.isSensitive,
          })),
          status: table.status,
          hasChanges: events.some((e) =>
            e.target.database === table.database &&
            e.target.schema === table.schema &&
            e.target.table === table.table &&
            e.status === 'pending'
          ),
          onRename: (newName: string) => {
            addEvent(createTableRenameEvent(
              { database: table.database, schema: table.schema, table: table.table },
              table.table,
              newName
            ));
            toast.success(`Table renamed to ${newName}`);
          },
          onColumnClick: (col: TableNodeColumn) => {
            // Handle column click - could open column detail modal
          },
          onContextMenu: (e: React.MouseEvent, action: string) => {
            handleNodeContextAction(table.id, action);
          },
        },
      };
    });
    return autoLayout(nodes);
  }, [tables, tableColumns, events, addEvent]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes when initialNodes change
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // State
  const [showMinimap, setShowMinimap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [relationMode, setRelationMode] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNode: string;
    sourceColumn: string;
  } | null>(null);

  // Policy and column modals state
  const [showPolicyPanel, setShowPolicyPanel] = useState(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [selectedTableForPanel, setSelectedTableForPanel] = useState<TableItem | null>(null);
  const [selectedTableColumns, setSelectedTableColumns] = useState<ColumnInfo[]>([]);

  // Connection handler
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceTable = tables.find((t) => t.id === params.source);
      const targetTable = tables.find((t) => t.id === params.target);
      if (!sourceTable || !targetTable) return;

      // Get columns for both tables
      const sourceColumns = tableColumns.get(sourceTable.id) || [];
      const targetColumns = tableColumns.get(targetTable.id) || [];

      // Prompt for column selection
      const sourceColOptions = sourceColumns.map(c => c.name).join(', ');
      const targetColOptions = targetColumns.filter(c => c.isPrimaryKey).map(c => c.name);
      const targetPKs = targetColOptions.length > 0 ? targetColOptions.join(', ') : targetColumns.slice(0, 3).map(c => c.name).join(', ');

      const sourceCol = prompt(
        `Select source column from ${sourceTable.table}:\nAvailable: ${sourceColOptions}\n\nEnter column name:`,
        sourceColumns.find(c => c.name.toLowerCase().includes('id'))?.name || sourceColumns[0]?.name || 'id'
      );
      if (!sourceCol) return;

      const targetCol = prompt(
        `Select target column from ${targetTable.table}:\nPrimary keys: ${targetPKs || 'none'}\nAll columns: ${targetColumns.map(c => c.name).join(', ')}\n\nEnter column name:`,
        targetColOptions[0] || targetColumns[0]?.name || 'id'
      );
      if (!targetCol) return;

      // Create relation event
      addEvent(createRelationEvent(
        { database: sourceTable.database, schema: sourceTable.schema, table: sourceTable.table },
        sourceCol,
        { database: targetTable.database, schema: targetTable.schema, table: targetTable.table },
        targetCol,
        'many_to_one',
        true
      ));

      // Add edge with label showing column mapping
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: edgeStyles['many_to_one'],
            label: `${sourceCol} → ${targetCol}`,
            labelStyle: { fontSize: 10, fontWeight: 500 },
            labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
          },
          eds
        )
      );

      onRelationCreate?.(params.source, params.target, sourceCol, targetCol);
      toast.success(`FK created: ${sourceTable.table}.${sourceCol} → ${targetTable.table}.${targetCol}`);
    },
    [tables, tableColumns, addEvent, setEdges, onRelationCreate]
  );

  // Helper to open policy panel for a table
  const openPolicyPanel = useCallback((table: TableItem) => {
    setSelectedTableForPanel(table);
    setSelectedTableColumns(tableColumns.get(table.id) || []);
    setShowPolicyPanel(true);
  }, [tableColumns]);

  // Helper to open add column modal for a table
  const openAddColumnModal = useCallback((table: TableItem) => {
    setSelectedTableForPanel(table);
    setSelectedTableColumns(tableColumns.get(table.id) || []);
    setShowAddColumnModal(true);
  }, [tableColumns]);

  // Context menu actions
  const handleNodeContextAction = useCallback((nodeId: string, action: string) => {
    const table = tables.find((t) => t.id === nodeId);
    if (!table) return;

    const columns = tableColumns.get(table.id) || [];

    switch (action) {
      case 'add_column':
        openAddColumnModal(table);
        break;
      case 'policies':
      case 'masking':
      case 'rls':
      case 'tags':
      case 'aggregation':
        openPolicyPanel(table);
        break;
      case 'pk_config':
        // Show column selection for primary key
        const pkColumns = columns.filter(c => !c.isPrimaryKey);
        if (pkColumns.length === 0) {
          toast.error('No columns available for primary key');
          return;
        }
        const pkColumn = prompt(
          `Select column for Primary Key:\n${pkColumns.map((c, i) => `${i + 1}. ${c.name} (${c.dataType})`).join('\n')}\n\nEnter column name:`,
          pkColumns[0]?.name
        );
        if (pkColumn && pkColumns.some(c => c.name === pkColumn)) {
          addEvent({
            type: 'PRIMARY_KEY_SET',
            target: { database: table.database, schema: table.schema, table: table.table },
            payload: { columns: [pkColumn] },
          });
          toast.success(`Primary key set: ${pkColumn}`);
        }
        break;
      case 'fk_config':
        // Start FK linking mode
        setRelationMode(true);
        setPendingConnection({ sourceNode: nodeId, sourceColumn: '' });
        toast.success('Click target table to create foreign key link', { icon: '🔗' });
        break;
      case 'relation':
        setRelationMode(true);
        setPendingConnection({ sourceNode: nodeId, sourceColumn: 'id' });
        toast('Click another table to create a relation');
        break;
      case 'exclude':
        // Remove node
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        toast.success('Table excluded from model');
        break;
      case 'duplicate':
        // Duplicate node
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          const newNode = {
            ...node,
            id: `${node.id}_copy`,
            position: {
              x: node.position.x + 50,
              y: node.position.y + 50,
            },
            data: {
              ...node.data,
              table: `${node.data.table}_copy`,
            },
          };
          setNodes((nds) => [...nds, newNode]);
        }
        break;
    }
  }, [tables, nodes, setNodes, openPolicyPanel, openAddColumnModal, tableColumns, addEvent]);

  // Node click handler
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<TableNodeData>) => {
      if (relationMode && pendingConnection) {
        // Create relation
        onConnect({
          source: pendingConnection.sourceNode,
          target: node.id,
          sourceHandle: null,
          targetHandle: null,
        });
        setRelationMode(false);
        setPendingConnection(null);
      } else {
        const table = tables.find((t) => t.id === node.id);
        if (table) {
          onTableSelect?.(table);
        }
      }
    },
    [tables, onTableSelect, relationMode, pendingConnection, onConnect]
  );

  // Export canvas
  const handleExport = useCallback(() => {
    const data = {
      nodes: getNodes(),
      edges: getEdges(),
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-model.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Model exported');
  }, [getNodes, getEdges]);

  // Auto-layout
  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => autoLayout(nds));
    setTimeout(() => fitView({ padding: 0.2 }), 100);
    toast.success('Layout applied');
  }, [setNodes, fitView]);

  return (
    <div ref={reactFlowWrapper} className={cn('w-full h-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={isLocked ? undefined : onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        className="bg-slate-50 dark:bg-slate-900"
      >
        {/* Controls Panel */}
        <Panel position="top-left" className="flex gap-2">
          <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border dark:border-slate-700">
            <Tooltip content="Zoom In">
              <Button
                variant="text"
                size="sm"
                onClick={() => zoomIn()}
                className="p-2"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Zoom Out">
              <Button
                variant="text"
                size="sm"
                onClick={() => zoomOut()}
                className="p-2"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Fit View">
              <Button
                variant="text"
                size="sm"
                onClick={() => fitView({ padding: 0.2 })}
                className="p-2"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 mx-1" />
            <Tooltip content="Auto Layout">
              <Button
                variant="text"
                size="sm"
                onClick={handleAutoLayout}
                className="p-2"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </Panel>

        {/* Tools Panel */}
        <Panel position="top-right" className="flex gap-2">
          <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border dark:border-slate-700">
            <Tooltip content="Undo">
              <Button
                variant="text"
                size="sm"
                onClick={() => undoEvent()}
                disabled={!canUndo}
                className="p-2"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Redo">
              <Button
                variant="text"
                size="sm"
                onClick={() => redoEvent()}
                disabled={!canRedo}
                className="p-2"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 mx-1" />
            <Tooltip content={isLocked ? 'Unlock Canvas' : 'Lock Canvas'}>
              <Button
                variant="text"
                size="sm"
                onClick={() => setIsLocked(!isLocked)}
                className={cn('p-2', isLocked && 'text-red-500')}
              >
                {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </Button>
            </Tooltip>
            <Tooltip content={showGrid ? 'Hide Grid' : 'Show Grid'}>
              <Button
                variant="text"
                size="sm"
                onClick={() => setShowGrid(!showGrid)}
                className="p-2"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content={showMinimap ? 'Hide Minimap' : 'Show Minimap'}>
              <Button
                variant="text"
                size="sm"
                onClick={() => setShowMinimap(!showMinimap)}
                className="p-2"
              >
                {showMinimap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </Tooltip>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 mx-1" />
            <Tooltip content="Export Model">
              <Button
                variant="text"
                size="sm"
                onClick={handleExport}
                className="p-2"
              >
                <Download className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </Panel>

        {/* Relation Mode Indicator */}
        {relationMode && (
          <Panel position="bottom-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-full shadow-lg">
              <GitBranch className="h-4 w-4" />
              <span className="text-sm font-medium">Click a target table to create relation</span>
              <Button
                variant="text"
                size="sm"
                onClick={() => {
                  setRelationMode(false);
                  setPendingConnection(null);
                }}
                className="text-white hover:bg-blue-700 p-1"
              >
                Cancel
              </Button>
            </div>
          </Panel>
        )}

        {/* Stats Panel */}
        <Panel position="bottom-left">
          <div className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border dark:border-slate-700 text-sm">
            <div className="flex items-center gap-1 text-slate-500">
              <Table2 className="h-4 w-4" />
              <span>{nodes.length} tables</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <ArrowLeftRight className="h-4 w-4" />
              <span>{edges.length} relations</span>
            </div>
          </div>
        </Panel>

        {/* Background and helpers */}
        {showGrid && (
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#94a3b8" />
        )}
        <Controls showInteractive={false} />
        {showMinimap && (
          <MiniMap
            nodeColor={(node) => {
              switch (node.data?.status) {
                case 'configured':
                  return '#10b981';
                case 'error':
                  return '#ef4444';
                default:
                  return '#f59e0b';
              }
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            className="!bg-white dark:!bg-slate-800"
          />
        )}
      </ReactFlow>

      {/* Policy Assignment Slide-out Panel */}
      {showPolicyPanel && selectedTableForPanel && (
        <div className="absolute right-0 top-0 h-full w-96 bg-white dark:bg-slate-900 border-l dark:border-slate-700 shadow-xl z-50 flex flex-col">
          <PolicyAssignmentPanel
            table={selectedTableForPanel}
            columns={selectedTableColumns}
            onPolicyApplied={() => {
              toast.success('Policy applied successfully');
            }}
            onClose={() => {
              setShowPolicyPanel(false);
              setSelectedTableForPanel(null);
            }}
          />
        </div>
      )}

      {/* Add Column Modal */}
      {selectedTableForPanel && (
        <AddColumnModal
          isOpen={showAddColumnModal}
          onClose={() => {
            setShowAddColumnModal(false);
            setSelectedTableForPanel(null);
          }}
          table={selectedTableForPanel}
          columns={selectedTableColumns}
          onColumnAdd={(column: ComputedColumn) => {
            // Column will be added via event store during deployment
            toast.success(`Computed column "${column.name}" queued for deployment`);
          }}
        />
      )}
    </div>
  );
};

// Main component with provider
const ModelingCanvas: React.FC<ModelingCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <ModelingCanvasInner {...props} />
    </ReactFlowProvider>
  );
};

export default ModelingCanvas;
