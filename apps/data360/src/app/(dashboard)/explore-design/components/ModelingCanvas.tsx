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
import ColumnMappingModal from './ColumnMappingModal';
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

// Table relationship from backend
interface TableRelationship {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_column: string;
  parent_schema: string;
  parent_table: string;
  parent_column: string;
}

// Props
interface ModelingCanvasProps {
  tables: TableItem[];
  tableColumns: Map<string, ColumnInfo[]>;
  onTableSelect?: (table: TableItem) => void;
  onTableExclude?: (tableId: string) => void;
  onRelationCreate?: (source: string, target: string, sourceCol: string, targetCol: string) => void;
  className?: string;
  projectId?: string | null;
  defaultRelationships?: TableRelationship[];
  targetTableIds?: Set<string>; // IDs of target/DWH tables (default tables)
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
  onTableExclude,
  onRelationCreate,
  className,
  projectId,
  defaultRelationships = [],
  targetTableIds = new Set(),
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut, getNodes, getEdges } = useReactFlow();
  const { addEvent, undoEvent, redoEvent, canUndo, canRedo, events } = useEventStore(projectId);

  // Use ref for addEvent to avoid dependency issues in useMemo
  const addEventRef = useRef(addEvent);
  addEventRef.current = addEvent;

  // Use ref for events to avoid infinite loop in useMemo
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Use ref for context action handler (defined later in component)
  const handleNodeContextActionRef = useRef<(nodeId: string, action: string) => void>(() => {});

  // Convert tables to nodes - only depend on tables and tableColumns, not events
  // Mark tables as 'target' (DWH) or 'source' for visual distinction
  const initialNodes: Node<TableNodeData>[] = useMemo(() => {
    const nodes = tables.map((table, idx) => {
      const cols = tableColumns.get(table.id) || [];
      const isTargetTable = targetTableIds.has(table.id);

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
          hasChanges: false, // Will be updated dynamically via ref if needed
          isTargetTable, // Flag to indicate DWH/target table
          onRename: (newName: string) => {
            addEventRef.current(createTableRenameEvent(
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
            handleNodeContextActionRef.current(table.id, action);
          },
        },
      };
    });
    return autoLayout(nodes);
  }, [tables, tableColumns, targetTableIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes only when tables or tableColumns change (not on every event change)
  useEffect(() => {
    setNodes(initialNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes]);

  // Create edges from default relationships
  useEffect(() => {
    console.log('[ModelingCanvas] defaultRelationships:', defaultRelationships);
    console.log('[ModelingCanvas] tables:', tables.map(t => t.id));

    if (defaultRelationships.length === 0 || tables.length === 0) {
      console.log('[ModelingCanvas] Skipping - no relationships or tables');
      return;
    }

    // Get the database from the first table
    const firstTable = tables[0];
    if (!firstTable) return;

    const { database } = firstTable;
    console.log('[ModelingCanvas] Using database:', database);

    // Group relationships by child_table + parent_table to create single edges with multiple column mappings
    const relationshipGroups = new Map<string, TableRelationship[]>();

    defaultRelationships.forEach(rel => {
      const key = `${rel.child_table}->${rel.parent_table}`;
      if (!relationshipGroups.has(key)) {
        relationshipGroups.set(key, []);
      }
      relationshipGroups.get(key)!.push(rel);
    });

    console.log('[ModelingCanvas] Relationship groups:', Array.from(relationshipGroups.keys()));

    // Create edges from grouped relationships
    const newEdges: Edge[] = [];

    relationshipGroups.forEach((rels, key) => {
      const firstRel = rels[0];
      // Use child_schema and parent_schema from the relationship data
      const sourceId = `${database}.${firstRel.child_schema}.${firstRel.child_table}`;
      const targetId = `${database}.${firstRel.parent_schema}.${firstRel.parent_table}`;

      // Only create edge if both tables exist in our nodes
      const sourceExists = tables.some(t => t.id === sourceId);
      const targetExists = tables.some(t => t.id === targetId);

      console.log(`[ModelingCanvas] Checking: ${sourceId} (exists: ${sourceExists}) -> ${targetId} (exists: ${targetExists})`);

      if (sourceExists && targetExists) {
        // Create label showing all column mappings
        const mappingLabel = rels.length === 1
          ? `${rels[0].child_column} → ${rels[0].parent_column}`
          : rels.map(r => `${r.child_column}→${r.parent_column}`).join(', ');

        newEdges.push({
          id: `rel-${firstRel.constraint_name || key}`,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: edgeStyles['many_to_one'],
          label: mappingLabel,
          labelStyle: { fontSize: 10, fill: '#64748b' },
          labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
          data: {
            relationType: 'many_to_one',
            columnMappings: rels.map(r => ({
              source_column: r.child_column,
              target_column: r.parent_column,
            })),
            constraintName: firstRel.constraint_name,
          },
        });
      } else {
        console.log(`[ModelingCanvas] SKIPPED edge - table not found`);
      }
    });

    console.log(`[ModelingCanvas] Created ${newEdges.length} edges:`, newEdges);

    if (newEdges.length > 0) {
      setEdges(newEdges);
    }
  }, [defaultRelationships, tables, setEdges]);

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
  const [showColumnMappingModal, setShowColumnMappingModal] = useState(false);
  const [selectedTableForPanel, setSelectedTableForPanel] = useState<TableItem | null>(null);
  const [selectedTableColumns, setSelectedTableColumns] = useState<ColumnInfo[]>([]);

  // Column mapping state
  const [mappingSourceTable, setMappingSourceTable] = useState<TableItem | null>(null);
  const [mappingTargetTable, setMappingTargetTable] = useState<TableItem | null>(null);
  const [pendingConnectionParams, setPendingConnectionParams] = useState<Connection | null>(null);

  // Connection handler - opens modal for column selection
  // ENFORCES: Source tables (user-added) → Target tables (DWH/default)
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceTable = tables.find((t) => t.id === params.source);
      const targetTable = tables.find((t) => t.id === params.target);
      if (!sourceTable || !targetTable) return;

      const sourceIsTarget = targetTableIds.has(params.source);
      const targetIsTarget = targetTableIds.has(params.target);

      // Validate: Source must be a source table (not DWH), Target must be a target table (DWH)
      if (sourceIsTarget && targetIsTarget) {
        toast.error('Cannot connect two target tables (DWH). Connect from a source table.');
        return;
      }

      if (!sourceIsTarget && !targetIsTarget) {
        toast.error('Cannot connect two source tables. Connect to a target table (DWH).');
        return;
      }

      if (sourceIsTarget && !targetIsTarget) {
        // User connected backwards: DWH → Source, swap them
        toast('Swapped direction: Source → Target (DWH)', { icon: '🔄' });
        setMappingSourceTable(targetTable);
        setMappingTargetTable(sourceTable);
        setPendingConnectionParams({
          ...params,
          source: params.target,
          target: params.source,
        });
      } else {
        // Correct direction: Source → DWH
        setMappingSourceTable(sourceTable);
        setMappingTargetTable(targetTable);
        setPendingConnectionParams(params);
      }

      setShowColumnMappingModal(true);
    },
    [tables, targetTableIds]
  );

  // Handle column mapping from modal
  const handleColumnMapping = useCallback(
    (sourceColumns: string[], targetColumn: string) => {
      if (!mappingSourceTable || !mappingTargetTable || !pendingConnectionParams) return;

      // Create relation event for each source column mapping
      sourceColumns.forEach((sourceCol) => {
        addEventRef.current(createRelationEvent(
          { database: mappingSourceTable.database, schema: mappingSourceTable.schema, table: mappingSourceTable.table },
          sourceCol,
          { database: mappingTargetTable.database, schema: mappingTargetTable.schema, table: mappingTargetTable.table },
          targetColumn,
          sourceColumns.length > 1 ? 'many_to_one' : 'one_to_one',
          true
        ));
      });

      // Create edge label showing mapping
      const mappingLabel = sourceColumns.length > 1
        ? `[${sourceColumns.join(', ')}] → ${targetColumn}`
        : `${sourceColumns[0]} → ${targetColumn}`;

      // Add edge with label showing column mapping
      setEdges((eds) =>
        addEdge(
          {
            ...pendingConnectionParams,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: edgeStyles[sourceColumns.length > 1 ? 'many_to_one' : 'one_to_one'],
            label: mappingLabel,
            labelStyle: { fontSize: 10, fontWeight: 500 },
            labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
          },
          eds
        )
      );

      onRelationCreate?.(
        pendingConnectionParams.source!,
        pendingConnectionParams.target!,
        sourceColumns.join(','),
        targetColumn
      );

      toast.success(
        sourceColumns.length > 1
          ? `Mapping created: ${sourceColumns.length} columns → ${targetColumn}`
          : `Mapping created: ${sourceColumns[0]} → ${targetColumn}`
      );

      // Reset state
      setMappingSourceTable(null);
      setMappingTargetTable(null);
      setPendingConnectionParams(null);
    },
    [mappingSourceTable, mappingTargetTable, pendingConnectionParams, setEdges, onRelationCreate]
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
        // Remove node and call parent callback
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        if (onTableExclude) {
          onTableExclude(nodeId);
        } else {
          toast.success('Table excluded from model');
        }
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

  // Update ref for context action handler
  handleNodeContextActionRef.current = handleNodeContextAction;

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

      {/* Column Mapping Modal */}
      <ColumnMappingModal
        isOpen={showColumnMappingModal}
        onClose={() => {
          setShowColumnMappingModal(false);
          setMappingSourceTable(null);
          setMappingTargetTable(null);
          setPendingConnectionParams(null);
        }}
        sourceTable={mappingSourceTable}
        targetTable={mappingTargetTable}
        sourceColumns={(mappingSourceTable ? tableColumns.get(mappingSourceTable.id) || [] : []).map(c => ({
          name: c.name,
          dataType: c.dataType,
          isPrimaryKey: c.isPrimaryKey,
          isNullable: c.isNullable,
        }))}
        targetColumns={(mappingTargetTable ? tableColumns.get(mappingTargetTable.id) || [] : []).map(c => ({
          name: c.name,
          dataType: c.dataType,
          isPrimaryKey: c.isPrimaryKey,
          isNullable: c.isNullable,
        }))}
        onCreateMapping={handleColumnMapping}
        existingMappings={
          // Get existing mappings from defaultRelationships for these two tables
          mappingSourceTable && mappingTargetTable
            ? defaultRelationships
                .filter(rel =>
                  rel.child_table === mappingSourceTable.table &&
                  rel.parent_table === mappingTargetTable.table
                )
                .map(rel => ({
                  id: `existing-${rel.constraint_name}`,
                  sourceColumns: [rel.child_column],
                  targetColumn: rel.parent_column,
                }))
            : []
        }
        onRemoveMapping={(mappingId) => {
          // For now, just log - removing FK constraints would need backend support
          console.log('Remove mapping requested:', mappingId);
          toast.error('Removing existing FK constraints requires database changes');
        }}
      />
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
