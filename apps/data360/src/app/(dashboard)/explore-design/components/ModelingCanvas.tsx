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
  ArrowLeftRight, Database, Table2, GitBranch, Workflow, List,
  Minimize2, PanelLeft, PanelRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import TableNode, { TableNodeData, TableNodeColumn } from './TableNode';
import PolicyAssignmentPanel from './PolicyAssignmentPanel';
import AddColumnModal, { ComputedColumn } from './AddColumnModal';
import ColumnMappingModal from './ColumnMappingModal';
import MappingSummaryPanel from './MappingSummaryPanel';
import TableOptionsSidebar, { TableOptionAction } from './TableOptionsSidebar';
import { useEventStore, createColumnMappingEvent, createTableRenameEvent } from '../stores/event-store';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';

// Custom node types
const nodeTypes = {
  tableNode: TableNode,
};

// Edge styles for different relation types
const edgeStyles: Record<string, React.CSSProperties> = {
  // FK relationships (between DWH tables)
  'fk': { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '5,5' }, // Purple dashed for FK
  'one_to_one': { stroke: '#3b82f6', strokeWidth: 2 },
  'one_to_many': { stroke: '#10b981', strokeWidth: 2 },
  'many_to_one': { stroke: '#8b5cf6', strokeWidth: 2 },
  'many_to_many': { stroke: '#f59e0b', strokeWidth: 2 },
  // ETL mappings (Source → Target)
  'mapping': { stroke: '#3b82f6', strokeWidth: 2 }, // Blue solid for mappings
  'mapping_multi': { stroke: '#10b981', strokeWidth: 2 }, // Green for multi-column mappings
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

// Initial column mapping from loaded events
interface InitialColumnMapping {
  id: string;
  sourceTable: string;
  sourceSchema: string;
  sourceColumn: string;
  targetTable: string;
  targetSchema: string;
  targetColumn: string;
  transformation?: string;
}

// Props
interface ModelingCanvasProps {
  tables: TableItem[];
  tableColumns: Map<string, ColumnInfo[]>;
  onTableSelect?: (table: TableItem) => void;
  onTableExclude?: (tableId: string) => void;
  onRelationCreate?: (source: string, target: string, sourceCol: string, targetCol: string, transformation?: string | null) => void;
  className?: string;
  projectId?: string | null;
  defaultRelationships?: TableRelationship[];
  targetTableIds?: Set<string>; // IDs of target/DWH tables (default tables)
  initialMappings?: InitialColumnMapping[]; // Mappings loaded from events
  isReadOnly?: boolean;
  // Data engineering callbacks
  onDynamicTableCreate?: (table: TableItem) => void;
  onEventTableCreate?: (table: TableItem) => void;
  onHybridTableCreate?: (table: TableItem) => void;
  onStreamCreate?: (table: TableItem) => void;
  onAlertCreate?: (table: TableItem) => void;
  // Fullscreen & panel toggle props
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  showEventPanel?: boolean;
  onToggleEventPanel?: () => void;
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
  initialMappings = [],
  isReadOnly = false,
  onDynamicTableCreate,
  onEventTableCreate,
  onHybridTableCreate,
  onStreamCreate,
  onAlertCreate,
  isFullscreen = false,
  onToggleFullscreen,
  showSidebar,
  onToggleSidebar,
  showEventPanel,
  onToggleEventPanel,
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

  // Track dynamically created mappings (not from defaultRelationships) - declared early for useMemo dependency
  const [dynamicMappings, setDynamicMappings] = useState<Map<string, Set<string>>>(new Map());

  // Track mapped columns for each target table from defaultRelationships and dynamic mappings
  const targetMappedColumns = useMemo(() => {
    const mappings = new Map<string, Set<string>>();

    // Initialize empty sets for all target tables
    targetTableIds.forEach(tableId => {
      mappings.set(tableId, new Set<string>());
    });

    // Get the database from the first table
    const firstTable = tables[0];
    if (!firstTable) return mappings;

    const { database } = firstTable;

    // Add mappings from defaultRelationships
    defaultRelationships.forEach(rel => {
      const targetId = `${database}.${rel.parent_schema}.${rel.parent_table}`;
      if (mappings.has(targetId)) {
        mappings.get(targetId)!.add(rel.parent_column);
      }
    });

    // Add dynamic mappings created during session
    dynamicMappings.forEach((columns, tableId) => {
      if (!mappings.has(tableId)) {
        mappings.set(tableId, new Set<string>());
      }
      columns.forEach(col => mappings.get(tableId)!.add(col));
    });

    return mappings;
  }, [tables, targetTableIds, defaultRelationships, dynamicMappings]);

  // Convert tables to nodes - only depend on tables and tableColumns, not events
  // Mark tables as 'target' (DWH) or 'source' for visual distinction
  const initialNodes: Node<TableNodeData>[] = useMemo(() => {
    const nodes = tables.map((table) => {
      const cols = tableColumns.get(table.id) || [];
      const isTargetTable = targetTableIds.has(table.id);
      const mappedColumns = isTargetTable ? targetMappedColumns.get(table.id) : undefined;

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
          mappedColumns, // For target tables: columns that have been mapped
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
  }, [tables, tableColumns, targetTableIds, targetMappedColumns]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes when data changes (tables, columns, mappings)
  // Preserve positions while updating node data
  useEffect(() => {
    setNodes(currentNodes => {
      // Create a map of current positions
      const positionMap = new Map(currentNodes.map(n => [n.id, n.position]));

      // Update nodes with new data while preserving positions
      return initialNodes.map(node => ({
        ...node,
        // Preserve existing position if available, otherwise use new position
        position: positionMap.get(node.id) || node.position,
      }));
    });
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
        // Create label showing FK relationship (not ETL mapping)
        const fkLabel = rels.length === 1
          ? `FK: ${rels[0].child_column} → ${rels[0].parent_column}`
          : `FK: ${rels.map(r => `${r.child_column}→${r.parent_column}`).join(', ')}`;

        newEdges.push({
          id: `fk-${firstRel.constraint_name || key}`,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: false, // FK relationships are not animated (static)
          markerEnd: { type: MarkerType.ArrowClosed },
          style: edgeStyles['fk'], // Use FK style (purple dashed)
          label: fkLabel,
          labelStyle: { fontSize: 10, fill: '#8b5cf6', fontStyle: 'italic' },
          labelBgStyle: { fill: '#f5f3ff', fillOpacity: 0.9 },
          data: {
            edgeType: 'fk', // Foreign Key relationship (database constraint)
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

    console.log(`[ModelingCanvas] Created ${newEdges.length} FK edges:`, newEdges);

    // Preserve existing mapping edges and add/update FK edges
    setEdges(prev => {
      // Keep existing mapping edges (user-created ETL mappings)
      const mappingEdges = prev.filter(e => e.data?.edgeType === 'mapping');
      // Combine with new FK edges
      return [...newEdges, ...mappingEdges];
    });
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

  // Track all ETL column mappings for the summary panel (FK relationships are handled separately)
  const [columnMappingsList, setColumnMappingsList] = useState<Array<{
    id: string;
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    transformation?: string;
  }>>([]);

  // Mapping summary panel state
  const [showMappingSummary, setShowMappingSummary] = useState(false);

  // Table options sidebar state
  const [showTableOptions, setShowTableOptions] = useState(false);
  const [tableForOptions, setTableForOptions] = useState<TableItem | null>(null);

  // Track if edges have been created for this project
  const edgesCreatedForProjectRef = useRef<string | null>(null);
  const prevProjectIdRef = useRef(projectId);

  // Restore mappings from initialMappings when project loads or mappings change
  useEffect(() => {
    // Reset when project changes
    if (projectId !== prevProjectIdRef.current) {
      console.log('[ModelingCanvas] Project changed, resetting state');
      edgesCreatedForProjectRef.current = null;
      prevProjectIdRef.current = projectId;
      // Also clear current state for new project
      setColumnMappingsList([]);
      setDynamicMappings(new Map());
    }

    if (initialMappings.length === 0) {
      console.log('[ModelingCanvas] No initial mappings to restore');
      return;
    }

    // Wait for tables to be available before restoring mappings
    if (tables.length === 0) {
      console.log('[ModelingCanvas] Waiting for tables to load before restoring mappings');
      return;
    }

    // Check if we've already created edges for this project with these mappings
    const mappingKey = `${projectId}-${initialMappings.length}-${tables.length}`;
    if (edgesCreatedForProjectRef.current === mappingKey) {
      console.log('[ModelingCanvas] Edges already created for this project/mappings/tables combo, skipping');
      return;
    }

    console.log('[ModelingCanvas] Restoring mappings from events:', initialMappings.length, 'mappings,', tables.length, 'tables');

    // Mark as processed
    edgesCreatedForProjectRef.current = mappingKey;

    // Deduplicate mappings by unique key (sourceTable + sourceColumn + targetTable + targetColumn)
    const uniqueMappings = new Map<string, typeof initialMappings[0]>();
    initialMappings.forEach(m => {
      const key = `${m.sourceSchema}.${m.sourceTable}.${m.sourceColumn}->${m.targetSchema}.${m.targetTable}.${m.targetColumn}`;
      if (!uniqueMappings.has(key)) {
        uniqueMappings.set(key, m);
      }
    });
    const dedupedMappings = Array.from(uniqueMappings.values());

    console.log('[ModelingCanvas] Deduped mappings:', dedupedMappings.length, 'from', initialMappings.length);

    // Convert initial mappings to columnMappingsList format
    const restoredMappings = dedupedMappings.map(m => ({
      id: m.id,
      sourceTable: m.sourceTable,
      sourceColumn: m.sourceColumn,
      targetTable: m.targetTable,
      targetColumn: m.targetColumn,
      transformation: m.transformation,
    }));
    setColumnMappingsList(restoredMappings);

    // Log available tables for debugging
    console.log('[ModelingCanvas] Available tables:', tables.map(t => ({
      id: t.id,
      table: t.table,
      schema: t.schema,
    })));

    // Update dynamic mappings for unmapped indicator
    const newDynamicMappings = new Map<string, Set<string>>();
    dedupedMappings.forEach(m => {
      // Find target table by name to get its ID
      const targetTable = tables.find(t =>
        t.table === m.targetTable && t.schema === m.targetSchema
      );
      if (targetTable) {
        if (!newDynamicMappings.has(targetTable.id)) {
          newDynamicMappings.set(targetTable.id, new Set<string>());
        }
        newDynamicMappings.get(targetTable.id)!.add(m.targetColumn);
      }
    });
    setDynamicMappings(newDynamicMappings);

    // Create edges for the mappings
    const mappingEdges: Edge[] = [];

    // Group mappings by source table + target table + target column
    // This groups multiple source columns that map to the same target column
    const mappingsByKey = new Map<string, typeof dedupedMappings>();
    dedupedMappings.forEach(m => {
      // Key includes target column so multiple source columns → same target column are grouped
      const key = `${m.sourceSchema}.${m.sourceTable}->${m.targetSchema}.${m.targetTable}.${m.targetColumn}`;
      if (!mappingsByKey.has(key)) {
        mappingsByKey.set(key, []);
      }
      mappingsByKey.get(key)!.push(m);
    });

    console.log('[ModelingCanvas] Mapping groups:', Array.from(mappingsByKey.keys()));

    // Create an edge for each unique mapping (source table → target table.column)
    mappingsByKey.forEach((mappings, key) => {
      const firstMapping = mappings[0];

      // Try multiple matching strategies
      let sourceTable = tables.find(t =>
        t.table === firstMapping.sourceTable && t.schema === firstMapping.sourceSchema
      );
      let targetTable = tables.find(t =>
        t.table === firstMapping.targetTable && t.schema === firstMapping.targetSchema
      );

      // Fallback: match by table name only if schema match fails
      if (!sourceTable) {
        sourceTable = tables.find(t => t.table === firstMapping.sourceTable);
        console.log('[ModelingCanvas] Source table fallback match:', sourceTable?.id);
      }
      if (!targetTable) {
        targetTable = tables.find(t => t.table === firstMapping.targetTable);
        console.log('[ModelingCanvas] Target table fallback match:', targetTable?.id);
      }

      console.log('[ModelingCanvas] Creating edge for:', {
        key,
        sourceTable: sourceTable?.id,
        targetTable: targetTable?.id,
        lookingFor: {
          source: `${firstMapping.sourceSchema}.${firstMapping.sourceTable}`,
          target: `${firstMapping.targetSchema}.${firstMapping.targetTable}`,
        }
      });

      if (sourceTable && targetTable) {
        // Collect all source columns that map to this target column
        const sourceColumns = mappings.map(m => m.sourceColumn);
        const targetColumn = firstMapping.targetColumn;
        const mappingLabel = sourceColumns.length > 1
          ? `${sourceColumns.join(' + ')} → ${targetColumn}`
          : `${sourceColumns[0]} → ${targetColumn}`;

        mappingEdges.push({
          id: `mapping-${sourceTable.id}-${targetTable.id}-${targetColumn}`,
          source: sourceTable.id,
          target: targetTable.id,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: edgeStyles[sourceColumns.length > 1 ? 'mapping_multi' : 'mapping'],
          label: mappingLabel,
          labelStyle: { fontSize: 10, fontWeight: 500, fill: '#3b82f6' },
          labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.9 },
          data: {
            edgeType: 'mapping',
            sourceColumns,
            targetColumn,
          },
        });
      } else {
        console.warn('[ModelingCanvas] Could not find tables for mapping:', key, {
          sourceTableFound: !!sourceTable,
          targetTableFound: !!targetTable,
        });
      }
    });

    console.log('[ModelingCanvas] Created mapping edges:', mappingEdges.length, mappingEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
    })));

    // Add mapping edges (keeping FK edges from defaultRelationships)
    if (mappingEdges.length > 0) {
      setEdges(prev => {
        // Keep FK edges, add restored mapping edges
        const fkEdges = prev.filter(e => e.data?.edgeType === 'fk');
        const newEdges = [...fkEdges, ...mappingEdges];
        console.log('[ModelingCanvas] Setting edges:', newEdges.length, '(', fkEdges.length, 'FK +', mappingEdges.length, 'mapping)');
        return newEdges;
      });
    } else {
      console.warn('[ModelingCanvas] No mapping edges created!');
    }
  }, [initialMappings, tables, setEdges, projectId]);

  // NOTE: We no longer add FK relationships to columnMappingsList
  // FK relationships are database constraints, not ETL mappings
  // columnMappingsList only contains user-created ETL mappings

  // Connection handler - opens modal for column selection
  // ENFORCES: Source tables (user-added) → Target tables (DWH/default)
  const onConnect = useCallback(
    (params: Connection) => {
      console.log('[ModelingCanvas] onConnect called:', {
        source: params.source,
        target: params.target,
        targetTableIds: Array.from(targetTableIds),
      });

      if (!params.source || !params.target) return;

      const sourceTable = tables.find((t) => t.id === params.source);
      const targetTable = tables.find((t) => t.id === params.target);
      if (!sourceTable || !targetTable) {
        console.error('[ModelingCanvas] Could not find tables:', {
          sourceId: params.source,
          targetId: params.target,
          sourceFound: !!sourceTable,
          targetFound: !!targetTable,
        });
        return;
      }

      const sourceIsTarget = targetTableIds.has(params.source);
      const targetIsTarget = targetTableIds.has(params.target);

      console.log('[ModelingCanvas] Connection validation:', {
        sourceTable: sourceTable.table,
        targetTable: targetTable.table,
        sourceIsTarget,
        targetIsTarget,
      });

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
        console.log('[ModelingCanvas] Swapping direction - Source will be:', targetTable.table, 'Target will be:', sourceTable.table);
        setMappingSourceTable(targetTable);
        setMappingTargetTable(sourceTable);
        setPendingConnectionParams({
          ...params,
          source: params.target,
          target: params.source,
        });
      } else {
        // Correct direction: Source → DWH
        console.log('[ModelingCanvas] Correct direction - Source:', sourceTable.table, 'Target:', targetTable.table);
        setMappingSourceTable(sourceTable);
        setMappingTargetTable(targetTable);
        setPendingConnectionParams(params);
      }

      setShowColumnMappingModal(true);
    },
    [tables, targetTableIds]
  );

  // Handle column mapping from modal (ETL mapping, not FK relationship)
  const handleColumnMapping = useCallback(
    async (sourceColumns: string[], targetColumn: string, transformation?: string | null) => {
      console.log('[ModelingCanvas] handleColumnMapping called:', {
        sourceColumns,
        targetColumn,
        transformation,
        mappingSourceTable: mappingSourceTable?.table,
        mappingTargetTable: mappingTargetTable?.table,
        pendingConnectionParams,
      });

      if (!mappingSourceTable || !mappingTargetTable || !pendingConnectionParams) {
        console.error('[ModelingCanvas] handleColumnMapping - missing required data:', {
          hasMappingSourceTable: !!mappingSourceTable,
          hasMappingTargetTable: !!mappingTargetTable,
          hasPendingConnectionParams: !!pendingConnectionParams,
        });
        return;
      }

      // Create a single COLUMN_MAPPING event with all source columns and transformation
      // (replaces createMapping API call — mappings are now event-driven and deployed via DDL actions)
      addEventRef.current(createColumnMappingEvent(
        { database: mappingSourceTable.database, schema: mappingSourceTable.schema, table: mappingSourceTable.table },
        { database: mappingSourceTable.database, schema: mappingSourceTable.schema, table: mappingSourceTable.table, columns: sourceColumns },
        { database: mappingTargetTable.database, schema: mappingTargetTable.schema, table: mappingTargetTable.table, column: targetColumn },
        true, // created
        transformation // Pass transformation
      ));

      // Update dynamic mappings to track the mapped target column
      setDynamicMappings(prev => {
        const newMappings = new Map(prev);
        const targetTableId = mappingTargetTable.id;
        if (!newMappings.has(targetTableId)) {
          newMappings.set(targetTableId, new Set<string>());
        }
        newMappings.get(targetTableId)!.add(targetColumn);
        return newMappings;
      });

      // Add to column mappings list for summary panel (ETL mappings only)
      const newMappingEntries = sourceColumns.map(srcCol => ({
        id: `mapping-${Date.now()}-${srcCol}-${targetColumn}`,
        sourceTable: mappingSourceTable.table,
        sourceColumn: srcCol,
        targetTable: mappingTargetTable.table,
        targetColumn: targetColumn,
      }));
      setColumnMappingsList(prev => [...prev, ...newMappingEntries]);

      // Create edge label showing ETL mapping (with transformation if present)
      const transformLabel = transformation ? ` [${transformation}]` : '';
      const mappingLabel = sourceColumns.length > 1
        ? `${sourceColumns.join(' + ')}${transformLabel} → ${targetColumn}`
        : `${sourceColumns[0]}${transformLabel} → ${targetColumn}`;

      console.log('[ModelingCanvas] Creating mapping edge:', {
        source: pendingConnectionParams.source,
        target: pendingConnectionParams.target,
        label: mappingLabel,
      });

      // Add edge with label showing column mapping (ETL style - blue/green, animated)
      // Use mappingSourceTable and mappingTargetTable IDs directly for reliable edge creation
      const sourceId = mappingSourceTable.id;
      const targetId = mappingTargetTable.id;

      setEdges((eds) => {
        // Use consistent edge ID format (matches restored edges)
        const edgeId = `mapping-${sourceId}-${targetId}-${targetColumn}`;

        // Check if edge already exists (avoid duplicates)
        const existingEdge = eds.find(e => e.id === edgeId);
        if (existingEdge) {
          console.log('[ModelingCanvas] Edge already exists, updating:', edgeId);
          // Update existing edge with new source columns
          return eds.map(e => e.id === edgeId ? {
            ...e,
            label: mappingLabel,
            style: edgeStyles[sourceColumns.length > 1 ? 'mapping_multi' : 'mapping'],
            data: { ...e.data, sourceColumns, targetColumn },
          } : e);
        }

        const newEdge: Edge = {
          id: edgeId,
          source: sourceId,
          target: targetId,
          type: 'smoothstep',
          animated: true, // ETL mappings are animated (active data flow)
          markerEnd: { type: MarkerType.ArrowClosed },
          style: edgeStyles[sourceColumns.length > 1 ? 'mapping_multi' : 'mapping'],
          label: mappingLabel,
          labelStyle: { fontSize: 10, fontWeight: 500, fill: '#3b82f6' },
          labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.9 },
          data: {
            edgeType: 'mapping', // ETL column mapping
            sourceColumns,
            targetColumn,
            transformation,
          },
        };

        // Check if source and target nodes exist
        const sourceNodeExists = getNodes().some(n => n.id === sourceId);
        const targetNodeExists = getNodes().some(n => n.id === targetId);

        console.log('[ModelingCanvas] Adding mapping edge:', {
          newEdge,
          sourceId,
          targetId,
          sourceNodeExists,
          targetNodeExists,
          existingEdgesCount: eds.length,
        });

        if (!sourceNodeExists || !targetNodeExists) {
          console.error('[ModelingCanvas] ERROR: Source or target node not found!', {
            sourceId,
            targetId,
            availableNodes: getNodes().map(n => n.id),
          });
          return eds;
        }

        return addEdge(newEdge, eds);
      });

      onRelationCreate?.(
        sourceId,
        targetId,
        sourceColumns.join(','),
        targetColumn,
        transformation
      );

      const toastTransformLabel = transformation ? ` with ${transformation}` : '';
      toast.success(
        sourceColumns.length > 1
          ? `Mapping created: ${sourceColumns.length} columns → ${targetColumn}${toastTransformLabel}`
          : `Mapping created: ${sourceColumns[0]} → ${targetColumn}${toastTransformLabel}`
      );

      // Reset state
      setMappingSourceTable(null);
      setMappingTargetTable(null);
      setPendingConnectionParams(null);
    },
    [mappingSourceTable, mappingTargetTable, pendingConnectionParams, setEdges, onRelationCreate, projectId]
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

  // Open table options sidebar
  const openTableOptions = useCallback((table: TableItem) => {
    setTableForOptions(table);
    setSelectedTableColumns(tableColumns.get(table.id) || []);
    setShowTableOptions(true);
  }, [tableColumns]);

  // Close table options sidebar
  const closeTableOptions = useCallback(() => {
    setShowTableOptions(false);
    setTableForOptions(null);
  }, []);

  // Context menu actions
  const handleNodeContextAction = useCallback((nodeId: string, action: string) => {
    const table = tables.find((t) => t.id === nodeId);
    if (!table) return;

    const columns = tableColumns.get(table.id) || [];

    switch (action) {
      case 'open_options':
        // Open table options sidebar
        openTableOptions(table);
        break;
      case 'rename':
        {
          const newName = prompt('Enter new table name:', table.table);
          if (newName && newName !== table.table) {
            addEvent({
              type: 'TABLE_RENAMED',
              target: { database: table.database, schema: table.schema, table: table.table },
              payload: { newName },
            });
            toast.success(`Rename "${table.table}" → "${newName}" added to pending changes`);
          }
        }
        break;
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
      case 'dynamic_table':
        if (onDynamicTableCreate) onDynamicTableCreate(table);
        break;
      case 'event_table':
        if (onEventTableCreate) onEventTableCreate(table);
        break;
      case 'hybrid_table':
        if (onHybridTableCreate) onHybridTableCreate(table);
        break;
      case 'stream':
        if (onStreamCreate) onStreamCreate(table);
        break;
      case 'alert':
        if (onAlertCreate) onAlertCreate(table);
        break;
    }
  }, [tables, nodes, setNodes, openPolicyPanel, openAddColumnModal, openTableOptions, tableColumns, addEvent,
      onDynamicTableCreate, onEventTableCreate, onHybridTableCreate, onStreamCreate, onAlertCreate]);

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
        onNodesChange={(isLocked || isReadOnly) ? undefined : onNodesChange}
        onEdgesChange={(isLocked || isReadOnly) ? undefined : onEdgesChange}
        onConnect={isReadOnly ? undefined : onConnect}
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
            <Tooltip content={showMappingSummary ? 'Hide Mapping Summary' : 'Show Mapping Summary'}>
              <Button
                variant="text"
                size="sm"
                onClick={() => setShowMappingSummary(!showMappingSummary)}
                className={cn('p-2', showMappingSummary && 'text-blue-500 bg-blue-50 dark:bg-blue-900/30')}
              >
                <List className="h-4 w-4" />
                {columnMappingsList.length > 0 && (
                  <span className="ml-1 text-xs">{columnMappingsList.length}</span>
                )}
              </Button>
            </Tooltip>
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
            {onToggleFullscreen && (
              <>
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-600 mx-1" />
                <Tooltip content={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                  <Button
                    variant="text"
                    size="sm"
                    onClick={onToggleFullscreen}
                    className={cn("p-2", isFullscreen && "text-blue-500 bg-blue-50 dark:bg-blue-900/30")}
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </Tooltip>
              </>
            )}
            {!isFullscreen && onToggleSidebar && (
              <Tooltip content={showSidebar ? "Hide Tables" : "Show Tables"}>
                <Button
                  variant="text"
                  size="sm"
                  onClick={onToggleSidebar}
                  className={cn("p-2", !showSidebar && "text-blue-500")}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
            {!isFullscreen && onToggleEventPanel && (
              <Tooltip content={showEventPanel ? "Hide Events" : "Show Events"}>
                <Button
                  variant="text"
                  size="sm"
                  onClick={onToggleEventPanel}
                  className={cn("p-2", !showEventPanel && "text-blue-500")}
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
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
            isTemplateTable={events.some(
              e => e.type === 'TABLE_CREATED' &&
                   e.payload?.isTemplate &&
                   e.target.table === selectedTableForPanel.table &&
                   e.target.schema === selectedTableForPanel.schema &&
                   e.target.database === selectedTableForPanel.database
            )}
            projectId={projectId}
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
          // Only show user-created ETL mappings, not FK relationships
          // FK relationships are database constraints, not ETL mappings
          mappingSourceTable && mappingTargetTable
            ? columnMappingsList
                .filter(m =>
                  m.sourceTable === mappingSourceTable.table &&
                  m.targetTable === mappingTargetTable.table
                )
                .map(m => ({
                  id: m.id,
                  sourceColumns: [m.sourceColumn],
                  targetColumn: m.targetColumn,
                }))
            : []
        }
        onRemoveMapping={(mappingId) => {
          // Remove user-created mapping
          setColumnMappingsList(prev => prev.filter(m => m.id !== mappingId));
          toast.success('Mapping removed');
        }}
      />

      {/* Mapping Summary Slide-out Panel */}
      {showMappingSummary && (
        <div className="absolute right-0 top-0 h-full w-96 z-50 shadow-xl">
          <MappingSummaryPanel
            isOpen={showMappingSummary}
            onClose={() => setShowMappingSummary(false)}
            mappings={columnMappingsList}
            onRemoveMapping={(mappingId) => {
              // Remove the mapping from list
              const mapping = columnMappingsList.find(m => m.id === mappingId);
              setColumnMappingsList(prev => prev.filter(m => m.id !== mappingId));

              // Also update dynamic mappings (for unmapped indicator)
              if (mapping) {
                const targetTable = tables.find(t => t.table === mapping.targetTable);
                if (targetTable) {
                  setDynamicMappings(prev => {
                    const newMappings = new Map(prev);
                    const cols = newMappings.get(targetTable.id);
                    if (cols) {
                      cols.delete(mapping.targetColumn);
                    }
                    return newMappings;
                  });
                }
              }
              toast.success('Mapping removed');
            }}
          />
        </div>
      )}

      {/* Table Options Sidebar */}
      {showTableOptions && tableForOptions && (
        <div className="absolute right-0 top-0 h-full z-50 shadow-xl">
          <TableOptionsSidebar
            table={tableForOptions}
            columns={tableColumns.get(tableForOptions.id) || []}
            onClose={closeTableOptions}
            onAction={(action: TableOptionAction) => {
              // Handle action through existing handler
              handleNodeContextAction(tableForOptions.id, action);
              // Close sidebar after action (except for some actions)
              if (!['open_options'].includes(action)) {
                closeTableOptions();
              }
            }}
          />
        </div>
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
