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
import { Button, Badge, Input, Tooltip, Select, Checkbox } from 'rizzui';
import {
  ZoomIn, ZoomOut, Maximize2, Download, Upload, Undo2, Redo2,
  Grid3X3, Layers, Eye, EyeOff, Lock, Unlock, Plus, Minus,
  LayoutGrid, Save, RefreshCw, Settings, Filter, Search,
  ArrowLeftRight, Database, Table2, GitBranch, Workflow, List,
  Minimize2, PanelLeft, PanelRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import TableNode, { TableNodeData, TableNodeColumn } from './TableNode';
import PolicyAssignmentPanel, { PolicyCategory } from './PolicyAssignmentPanel';
import AddColumnModal, { ComputedColumn } from './AddColumnModal';
import ColumnMappingModal from './ColumnMappingModal';
import MappingSummaryPanel from './MappingSummaryPanel';
// TableOptionsSidebar (T1 — RETIRED as a separate panel): the modeling view no
// longer floats it; its actions now live in the unified ContextRightBar cockpit.
// The component file is retained (it backs other surfaces) but is not rendered here.
import { useEventStore, createColumnMappingEvent, createTableRenameEvent } from '../stores/event-store';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import { useCanPerform } from '@/hooks/useCanPerform';

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
  /** Id of the page-selected table — drives zoom-to-selected framing on the canvas. */
  selectedTableId?: string | null;
  onTableExclude?: (tableId: string) => void;
  /**
   * Opens the unified ContextRightBar cockpit on the Actions tab for a table.
   * Replaces the retired standalone TableOptionsSidebar: a node's "more"/context
   * action (`open_options`) routes here instead of floating a second panel.
   */
  onOpenContextBar?: (table: TableItem) => void;
  /**
   * Registers the canvas's live context-action dispatcher with the parent so the
   * unified ContextRightBar can route table actions (FK, relation, PK picker,
   * duplicate, DE-table modals, exclude…) through the SAME handleNodeContextAction
   * path the node menu used. Stable wrapper — always calls the latest handler.
   */
  onRegisterActionDispatch?: (dispatch: (tableId: string, action: string) => void) => void;
  onRelationCreate?: (source: string, target: string, sourceCol: string, targetCol: string, transformation?: string | null) => void;
  className?: string;
  projectId?: string | null;
  defaultRelationships?: TableRelationship[];
  targetTableIds?: Set<string>; // IDs of target/DWH tables (default tables)
  initialMappings?: InitialColumnMapping[]; // Mappings loaded from events
  isReadOnly?: boolean;
  onColumnsMapUpdate?: (updater: (prev: Map<string, ColumnInfo[]>) => Map<string, ColumnInfo[]>) => void;
  // Data engineering callbacks
  onDynamicTableCreate?: (table: TableItem) => void;
  onEventTableCreate?: (table: TableItem) => void;
  onHybridTableCreate?: (table: TableItem) => void;
  onStreamCreate?: (table: TableItem) => void;
  onAlertCreate?: (table: TableItem) => void;
  /**
   * Add a brand-new table to the model from the canvas "+" button.
   * 'manual' = define columns by hand (Power BI style); 'empty' = blank table
   * to be fed/populated from source mappings. Lands the node in the model first,
   * keeping the select -> add-to-modeling -> configure-ingestion flow intact.
   */
  onAddTable?: (mode: 'manual' | 'empty') => void;
  // Fullscreen & panel toggle props
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  showEventPanel?: boolean;
  onToggleEventPanel?: () => void;
}

// Smart hierarchical L→R auto-layout.
//
// Replaces the old sqrt-grid (which ignored edges) with a dependency-aware,
// left-to-right layered placement that honors EDGE DIRECTION: every edge means
// `source` feeds `target`, so sources land on the left and downstream targets
// flow rightward, layered by dependency depth. Direction is taken straight from
// `edge.source → edge.target` (the same node ids as `tables[].id`); both FK and
// mapping edges share that semantic, so we rank them uniformly — `data.edgeType`
// only drives styling, never layout.
//
// Ranking = longest-path layering via Kahn's algorithm (topological), so a node
// sits one column right of its deepest upstream dependency. Cycles (FK/mapping
// graphs can loop) are handled gracefully: any node never reaching indegree 0 is
// appended past the resolved ranks so it still gets a position and we never spin.
// Nodes with no edges go to a dedicated leftover lane below the layered graph.
//
// Hand-rolled on purpose — no dagre/elkjs dependency.
const autoLayout = (nodes: Node[], edges: Edge[] = []): Node[] => {
  const PADDING = 50;
  const NODE_WIDTH = 250;
  const NODE_HEIGHT = 200;
  const X_GAP = 120; // extra horizontal breathing room between ranks
  const RANK_DX = NODE_WIDTH + X_GAP;
  const ROW_DY = NODE_HEIGHT + PADDING;

  if (nodes.length === 0) return nodes;

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Build the directed adjacency from edges, deduping repeated directed pairs
  // (multi-column mappings / coexisting FK+mapping commonly produce duplicates;
  // double-counting indegree would break Kahn's queue). Self-loops are ignored.
  const adjacency = new Map<string, Set<string>>(); // source -> targets
  const indegree = new Map<string, number>();
  nodes.forEach((n) => {
    adjacency.set(n.id, new Set());
    indegree.set(n.id, 0);
  });

  const connected = new Set<string>();
  const seenPairs = new Set<string>();
  edges.forEach((e) => {
    const { source, target } = e;
    if (!source || !target || source === target) return;
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const pairKey = `${source}->${target}`;
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);
    adjacency.get(source)!.add(target);
    indegree.set(target, (indegree.get(target) || 0) + 1);
    connected.add(source);
    connected.add(target);
  });

  // Partition: layered (has ≥1 edge) vs leftover (isolated, no edges).
  const layeredIds = nodes.map((n) => n.id).filter((id) => connected.has(id));
  const leftoverIds = nodes.map((n) => n.id).filter((id) => !connected.has(id));

  // Longest-path layering over the connected sub-graph via Kahn's algorithm.
  // rank[node] = max(rank[upstream]) + 1, so x grows with dependency depth.
  const rank = new Map<string, number>();
  const localIndegree = new Map<string, number>();
  layeredIds.forEach((id) => localIndegree.set(id, indegree.get(id) || 0));

  // Seed the queue with all current sources (indegree 0). Each pop relaxes its
  // out-edges; a target enters the queue once all its in-edges are consumed.
  let queue = layeredIds.filter((id) => (localIndegree.get(id) || 0) === 0);
  queue.forEach((id) => rank.set(id, 0));

  let processed = 0;
  while (queue.length > 0) {
    const next: string[] = [];
    for (const id of queue) {
      processed++;
      const r = rank.get(id) || 0;
      adjacency.get(id)!.forEach((tgt) => {
        // Longest-path: target sits at least one rank right of this source.
        rank.set(tgt, Math.max(rank.get(tgt) ?? 0, r + 1));
        const remaining = (localIndegree.get(tgt) || 0) - 1;
        localIndegree.set(tgt, remaining);
        if (remaining === 0) next.push(tgt);
      });
    }
    queue = next;
  }

  // Cycle remainder: any connected node Kahn never drained is part of a cycle.
  // Give it a rank past everything resolved so it still gets a real position
  // (and never re-enters the loop). processed < layeredIds.length signals this.
  if (processed < layeredIds.length) {
    let maxRank = 0;
    rank.forEach((r) => { if (r > maxRank) maxRank = r; });
    let cycleRank = maxRank + 1;
    layeredIds.forEach((id) => {
      if (!rank.has(id)) rank.set(id, cycleRank++);
    });
  }

  // Group layered nodes by rank (column) and stack them vertically within it.
  const ranksMap = new Map<number, string[]>();
  layeredIds.forEach((id) => {
    const r = rank.get(id) ?? 0;
    if (!ranksMap.has(r)) ranksMap.set(r, []);
    ranksMap.get(r)!.push(id);
  });

  const positions = new Map<string, { x: number; y: number }>();
  // Tallest column drives where the leftover lane starts (so it never overlaps).
  let maxRowsInRank = 0;
  ranksMap.forEach((ids) => { if (ids.length > maxRowsInRank) maxRowsInRank = ids.length; });

  ranksMap.forEach((ids, r) => {
    // Vertically center each column's stack against the tallest column.
    const offset = ((maxRowsInRank - ids.length) * ROW_DY) / 2;
    ids.forEach((id, row) => {
      positions.set(id, {
        x: PADDING + r * RANK_DX,
        y: PADDING + offset + row * ROW_DY,
      });
    });
  });

  // Leftover lane: a compact grid beneath the layered graph for edgeless nodes.
  // Wrapped into a sqrt grid (not a single strip) so it stays compact when most
  // tables are isolated — notably at initial render, where no edges exist yet and
  // every node is a leftover (this preserves the old compact default view).
  const layeredBottom = PADDING + Math.max(maxRowsInRank, 1) * ROW_DY;
  const laneY = layeredBottom + (layeredIds.length > 0 ? ROW_DY : 0); // gap below the graph (none if no graph)
  const LEFT_COLS = Math.max(1, Math.ceil(Math.sqrt(leftoverIds.length)));
  leftoverIds.forEach((id, idx) => {
    positions.set(id, {
      x: PADDING + (idx % LEFT_COLS) * RANK_DX,
      y: laneY + Math.floor(idx / LEFT_COLS) * ROW_DY,
    });
  });

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) || { x: PADDING, y: PADDING },
  }));
};

// Inner component with React Flow hooks
const ModelingCanvasInner: React.FC<ModelingCanvasProps> = ({
  tables,
  tableColumns,
  onTableSelect,
  selectedTableId,
  onTableExclude,
  onOpenContextBar,
  onRegisterActionDispatch,
  onRelationCreate,
  className,
  projectId,
  defaultRelationships = [],
  targetTableIds = new Set(),
  initialMappings = [],
  isReadOnly = false,
  onColumnsMapUpdate,
  onDynamicTableCreate,
  onEventTableCreate,
  onHybridTableCreate,
  onStreamCreate,
  onAlertCreate,
  onAddTable,
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

  // System 2 Action-RBAC — gate every mutating context-menu / sidebar action.
  // Catalog's ContextRightBar gates each mutating button via useCanPerform; the
  // modeling canvas previously only checked `isReadOnly`, bypassing action-RBAC.
  // Match the catalog fail-open-while-loading behavior (allowed || loading); the
  // hook also fail-opens on a hard backend error so a hiccup never locks a user out.
  const writePerm = useCanPerform('explore_design', 'create', projectId);
  const approvePerm = useCanPerform('explore_design', 'approve', projectId);
  const canWrite = writePerm.allowed || writePerm.loading;
  const canApprove = approvePerm.allowed || approvePerm.loading;

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

  // FK badge source (P1): the foreign-key column is the CHILD-side column of each
  // relationship (`child_column` on `${db}.${child_schema}.${child_table}`); the
  // `parent_column` is the referenced PK side and already gets the Key badge — so
  // it is intentionally NOT badged as a FK. Derived purely from the static,
  // already-deployed `defaultRelationships` prop (events are deliberately kept out
  // of the node-build memo — see the eventsRef note above — so there is no FK
  // removal/sticky-state concern here). Keys: `${tableId}::${columnName}`.
  const fkColumnSet = useMemo(() => {
    const set = new Set<string>();
    const database = tables[0]?.database;
    if (!database) return set;
    defaultRelationships.forEach((rel) => {
      const childId = `${database}.${rel.child_schema}.${rel.child_table}`;
      set.add(`${childId}::${rel.child_column}`);
    });
    return set;
  }, [tables, defaultRelationships]);

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
            // P1: light the FK Link2 badge. Honor an explicit upstream flag if one
            // ever sets it, otherwise fall back to the derived defaultRelationships set.
            isForeignKey: c.isForeignKey ?? fkColumnSet.has(`${table.id}::${c.name}`),
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
  }, [tables, tableColumns, targetTableIds, targetMappedColumns, fkColumnSet]);

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

  // Governance badges (P1): populate node.data.config (RLS / tags) from the
  // event spine so TableNode's existing RLS/Tag badge block stops reading an
  // always-undefined config. Net state — APPLIED adds, REMOVED deletes (events
  // are chronological / append-only), so apply-then-remove correctly nets to off.
  // qualityScore/rowCount are left undefined on purpose: there is no per-table
  // score source in scope, and TableNode's `!= null` guards self-hide them as an
  // honest "—" rather than a fake 0. Runs after the node-reset effect above
  // (shares `initialNodes` in deps) and is guarded so it can never loop even if
  // `events` is a fresh array each render.
  useEffect(() => {
    // Per-table net governance state, keyed by `${db}.${schema}.${table}`.
    const rlsByTable = new Map<string, Set<string>>();
    const tagsByTable = new Map<string, Set<string>>();
    events.forEach((e) => {
      const t = e.target;
      if (!t?.database || !t?.schema || !t?.table) return;
      const tableId = `${t.database}.${t.schema}.${t.table}`;
      if (e.type === 'RLS_POLICY_APPLIED' || e.type === 'RLS_POLICY_REMOVED') {
        const name = e.payload?.policyName;
        if (!name) return;
        if (!rlsByTable.has(tableId)) rlsByTable.set(tableId, new Set<string>());
        const set = rlsByTable.get(tableId)!;
        if (e.type === 'RLS_POLICY_APPLIED') set.add(name); else set.delete(name);
      } else if (e.type === 'TAG_APPLIED' || e.type === 'TAG_REMOVED') {
        const name: string | undefined = e.payload?.tagName ?? e.payload?.tag;
        // SENSITIVE:-prefixed tags are the sensitive-column marker (event-store
        // reuses TAG events for it) — exclude so the tag badge isn't inflated.
        if (!name || name.startsWith('SENSITIVE:')) return;
        if (!tagsByTable.has(tableId)) tagsByTable.set(tableId, new Set<string>());
        const set = tagsByTable.get(tableId)!;
        if (e.type === 'TAG_APPLIED') set.add(name); else set.delete(name);
      }
    });

    setNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const rls = rlsByTable.get(n.id);
        const tags = tagsByTable.get(n.id);
        const hasRLS = !!rls && rls.size > 0;
        const tagList = tags && tags.size > 0 ? Array.from(tags) : undefined;
        const prevConfig = n.data.config;
        const sameRLS = (prevConfig?.hasRLS ?? false) === hasRLS;
        const prevTags = prevConfig?.tags;
        const sameTags =
          (prevTags?.length ?? 0) === (tagList?.length ?? 0) &&
          (prevTags ?? []).every((tg, i) => tg === tagList?.[i]);
        if (sameRLS && sameTags) return n;
        changed = true;
        return {
          ...n,
          data: {
            ...n.data,
            config: {
              ...prevConfig,
              hasRLS,
              tags: tagList,
              // qualityScore / rowCount intentionally left as-is (undefined) —
              // no per-table source; TableNode self-hides them as honest "—".
            },
          },
        };
      });
      // Loop-breaker: identical state => return prev (React no-op, no re-render).
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, initialNodes]);

  // Create edges from default relationships
  useEffect(() => {
    // console.log('[ModelingCanvas] defaultRelationships:', defaultRelationships);
    // console.log('[ModelingCanvas] tables:', tables.map(t => t.id));

    if (defaultRelationships.length === 0 || tables.length === 0) {
      // console.log('[ModelingCanvas] Skipping - no relationships or tables');
      return;
    }

    // Get the database from the first table
    const firstTable = tables[0];
    if (!firstTable) return;

    const { database } = firstTable;
    // console.log('[ModelingCanvas] Using database:', database);

    // Group relationships by child_table + parent_table to create single edges with multiple column mappings
    const relationshipGroups = new Map<string, TableRelationship[]>();

    defaultRelationships.forEach(rel => {
      const key = `${rel.child_table}->${rel.parent_table}`;
      if (!relationshipGroups.has(key)) {
        relationshipGroups.set(key, []);
      }
      relationshipGroups.get(key)!.push(rel);
    });

    // console.log('[ModelingCanvas] Relationship groups:', Array.from(relationshipGroups.keys()));

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

      // console.log(`[ModelingCanvas] Checking: ${sourceId} (exists: ${sourceExists}) -> ${targetId} (exists: ${targetExists})`);

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
        // console.log(`[ModelingCanvas] SKIPPED edge - table not found`);
      }
    });

    // console.log(`[ModelingCanvas] Created ${newEdges.length} FK edges:`, newEdges);

    // Preserve existing mapping edges and FK edges from events, add/update template FK edges
    setEdges(prev => {
      const mappingEdges = prev.filter(e => e.data?.edgeType === 'mapping');
      const eventFkEdges = prev.filter(e => e.data?.edgeType === 'fk' && e.id.startsWith('fk-evt-'));
      // Template FK edges + event FK edges (dedup by source→target)
      const templatePairs = new Set(newEdges.map(e => `${e.source}->${e.target}`));
      const nonDupEventFks = eventFkEdges.filter(e => !templatePairs.has(`${e.source}->${e.target}`));
      return [...newEdges, ...nonDupEventFks, ...mappingEdges];
    });
  }, [defaultRelationships, tables, setEdges]);

  // Build FK edges from FOREIGN_KEY_ADDED events (covers manual FK creation + post-deployment)
  // Event payload shape: { columns: string[], referencedTable: {database,schema,table}, referencedColumns: string[], sourceColumn, targetTable, targetColumn }
  useEffect(() => {
    const fkEvents = events.filter(e => e.type === 'FOREIGN_KEY_ADDED');
    if (fkEvents.length === 0 || tables.length === 0) return;

    const fkEdges: Edge[] = [];
    const seenPairs = new Set<string>();

    for (const fk of fkEvents) {
      // Source table from event.target
      const srcDb = fk.target?.database;
      const srcSchema = fk.target?.schema;
      const srcTable = fk.target?.table;
      // Source column (multiple paths for compat)
      const srcCol = fk.payload?.sourceColumn || fk.payload?.columns?.[0] || fk.target?.column;

      // Target table from payload.referencedTable or payload.targetTable
      const refTable = fk.payload?.referencedTable || fk.payload?.targetTable;
      const tgtDb = typeof refTable === 'object' ? refTable?.database : srcDb;
      const tgtSchema = typeof refTable === 'object' ? refTable?.schema : srcSchema;
      const tgtTable = typeof refTable === 'object' ? refTable?.table : (typeof refTable === 'string' ? refTable : null);
      // Target column
      const tgtCol = fk.payload?.targetColumn || fk.payload?.referencedColumns?.[0];

      if (!srcTable || !tgtTable) continue;

      // Match table nodes flexibly: exact ID > schema.table > table name only
      // This handles database mismatches (e.g., FK event says "draft_source" but canvas has "cp_data360")
      const findNode = (db: string | undefined, schema: string | undefined, table: string) => {
        const fullId = db && schema ? `${db}.${schema}.${table}` : null;
        const schemaTable = schema ? `${schema}.${table}` : null;
        return (
          (fullId && tables.find(t => t.id === fullId)) ||
          (schemaTable && tables.find(t => t.id.endsWith(`.${schema}.${table}`))) ||
          (schemaTable && tables.find(t => t.schema === schema && t.table === table)) ||
          tables.find(t => t.table === table)
        ) || null;
      };

      const sourceNode = findNode(srcDb, srcSchema, srcTable);
      const targetNode = findNode(tgtDb, tgtSchema, tgtTable);

      if (!sourceNode || !targetNode) {
        console.warn(`[ModelingCanvas] FK edge skipped — no match for src=${srcDb}.${srcSchema}.${srcTable} or tgt=${tgtDb}.${tgtSchema}.${tgtTable}`, {
          tablesOnCanvas: tables.map(t => t.id).slice(0, 10),
        });
        continue;
      }

      // Deduplicate by source→target pair
      const pairKey = `${sourceNode.id}->${targetNode.id}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const edgeId = `fk-evt-${fk.id}`;
      fkEdges.push({
        id: edgeId,
        source: sourceNode.id,
        target: targetNode.id,
        type: 'smoothstep',
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: edgeStyles['fk'],
        label: srcCol && tgtCol ? `FK: ${srcCol} → ${tgtCol}` : 'FK',
        labelStyle: { fontSize: 10, fill: '#8b5cf6', fontStyle: 'italic' },
        labelBgStyle: { fill: '#f5f3ff', fillOpacity: 0.9 },
        data: {
          edgeType: 'fk',
          relationType: 'many_to_one',
          columnMappings: srcCol && tgtCol
            ? [{ source_column: srcCol, target_column: tgtCol }]
            : [],
        },
      });
    }

    if (fkEdges.length > 0) {
      setEdges(prev => {
        // Avoid duplicating edges already on canvas (from defaultRelationships)
        const existingFkPairs = new Set(
          prev.filter(e => e.data?.edgeType === 'fk').map(e => `${e.source}->${e.target}`)
        );
        const existingIds = new Set(prev.map(e => e.id));
        const newEdges = fkEdges.filter(e =>
          !existingIds.has(e.id) && !existingFkPairs.has(`${e.source}->${e.target}`)
        );
        if (newEdges.length === 0) return prev;
        return [...prev, ...newEdges];
      });
    }
  }, [events, tables, setEdges]);

  // State
  const [showMinimap, setShowMinimap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  // Canvas "+ Add table" menu (manual / empty-fed-by-sources).
  const [showAddTableMenu, setShowAddTableMenu] = useState(false);
  const [relationMode, setRelationMode] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNode: string;
    sourceColumn: string;
  } | null>(null);

  // Policy and column modals state
  const [showPolicyPanel, setShowPolicyPanel] = useState(false);
  // Tab the policy panel opens on (deep-link). 'aggregation' routes here from the
  // distinct "Apply aggregation" option so it lands on its own real surface
  // (PolicyAssignmentPanel aggregation tab); the other labels keep the default tab.
  const [policyPanelCategory, setPolicyPanelCategory] = useState<PolicyCategory | undefined>(undefined);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [showAddSimpleColumnModal, setShowAddSimpleColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('VARCHAR');
  const [newColumnNullable, setNewColumnNullable] = useState(true);
  const [newColumnIsPK, setNewColumnIsPK] = useState(false);
  const [showColumnMappingModal, setShowColumnMappingModal] = useState(false);
  const [selectedTableForPanel, setSelectedTableForPanel] = useState<TableItem | null>(null);
  const [selectedTableColumns, setSelectedTableColumns] = useState<ColumnInfo[]>([]);

  // Column mapping state
  const [mappingSourceTable, setMappingSourceTable] = useState<TableItem | null>(null);
  const [mappingTargetTable, setMappingTargetTable] = useState<TableItem | null>(null);
  const [pendingConnectionParams, setPendingConnectionParams] = useState<Connection | null>(null);

  // FK picker modal state
  const [fkPickerState, setFkPickerState] = useState<{
    sourceTable: TableItem;
    targetTable: TableItem;
    sourceCols: ColumnInfo[];
    targetCols: ColumnInfo[];
    selectedSourceCol: string;
    selectedTargetCol: string;
    sourceId: string;
    targetId: string;
  } | null>(null);

  // Rename table modal state (replaces window.prompt() — structured, consistent with
  // the other in-canvas modals). Gating happens on the open path (the gated `rename`
  // switch case), so the confirm here only emits the event — same as add_new_column.
  const [renameState, setRenameState] = useState<{ table: TableItem; value: string } | null>(null);

  // Set-primary-key modal state (replaces window.prompt() column picker). Only non-PK
  // columns are offered; the empty-columns guard stays on the open path.
  const [pkState, setPkState] = useState<{ table: TableItem; columns: ColumnInfo[]; selected: string } | null>(null);

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
      // console.log('[ModelingCanvas] Project changed, resetting state');
      edgesCreatedForProjectRef.current = null;
      prevProjectIdRef.current = projectId;
      // Also clear current state for new project
      setColumnMappingsList([]);
      setDynamicMappings(new Map());
    }

    if (initialMappings.length === 0) {
      // console.log('[ModelingCanvas] No initial mappings to restore');
      return;
    }

    // Wait for tables to be available before restoring mappings
    if (tables.length === 0) {
      // console.log('[ModelingCanvas] Waiting for tables to load before restoring mappings');
      return;
    }

    // Check if we've already created edges for this project with these mappings
    const mappingKey = `${projectId}-${initialMappings.length}-${tables.length}`;
    if (edgesCreatedForProjectRef.current === mappingKey) {
      // console.log('[ModelingCanvas] Edges already created for this project/mappings/tables combo, skipping');
      return;
    }

    // console.log('[ModelingCanvas] Restoring mappings from events:', initialMappings.length, 'mappings,', tables.length, 'tables');

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

    // console.log('[ModelingCanvas] Deduped mappings:', dedupedMappings.length, 'from', initialMappings.length);

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
    // console.log('[ModelingCanvas] Available tables:', tables.map(t => ({
      // id: t.id,
      // table: t.table,
      // schema: t.schema,
    // })));

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

    // console.log('[ModelingCanvas] Mapping groups:', Array.from(mappingsByKey.keys()));

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
        // console.log('[ModelingCanvas] Source table fallback match:', sourceTable?.id);
      }
      if (!targetTable) {
        targetTable = tables.find(t => t.table === firstMapping.targetTable);
        // console.log('[ModelingCanvas] Target table fallback match:', targetTable?.id);
      }

      // console.log('[ModelingCanvas] Creating edge for:', {
        // key,
        // sourceTable: sourceTable?.id,
        // targetTable: targetTable?.id,
        // lookingFor: {
          // source: `${firstMapping.sourceSchema}.${firstMapping.sourceTable}`,
          // target: `${firstMapping.targetSchema}.${firstMapping.targetTable}`,
        // }
      // });

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

    // console.log('[ModelingCanvas] Created mapping edges:', mappingEdges.length, mappingEdges.map(e => ({
      // id: e.id,
      // source: e.source,
      // target: e.target,
      // label: e.label,
    // })));

    // Add mapping edges (keeping FK edges from defaultRelationships)
    if (mappingEdges.length > 0) {
      setEdges(prev => {
        // Keep FK edges, add restored mapping edges
        const fkEdges = prev.filter(e => e.data?.edgeType === 'fk');
        const newEdges = [...fkEdges, ...mappingEdges];
        // console.log('[ModelingCanvas] Setting edges:', newEdges.length, '(', fkEdges.length, 'FK +', mappingEdges.length, 'mapping)');
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
      // console.log('[ModelingCanvas] onConnect called:', {
        // source: params.source,
        // target: params.target,
        // targetTableIds: Array.from(targetTableIds),
      // });

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

      // console.log('[ModelingCanvas] Connection validation:', {
        // sourceTable: sourceTable.table,
        // targetTable: targetTable.table,
        // sourceIsTarget,
        // targetIsTarget,
      // });

      // DWH ↔ DWH: treat as FK relationship — open picker modal
      if (sourceIsTarget && targetIsTarget) {
        const sourceCols = tableColumns.get(params.source) || [];
        const targetCols = tableColumns.get(params.target) || [];
        if (sourceCols.length === 0 || targetCols.length === 0) {
          toast.error('Both tables must have columns to create a foreign key.');
          return;
        }
        const targetPk = targetCols.find(c => c.isPrimaryKey);
        // Auto-suggest: find matching column by naming convention
        const suggestedSource = sourceCols.find(c =>
          c.name.toLowerCase().includes(targetTable.table.toLowerCase().replace('dim_', '')) ||
          (targetPk && c.name.toLowerCase() === targetPk.name.toLowerCase())
        );
        setFkPickerState({
          sourceTable: sourceTable,
          targetTable: targetTable,
          sourceCols,
          targetCols,
          selectedSourceCol: suggestedSource?.name || sourceCols[0]?.name || '',
          selectedTargetCol: targetPk?.name || targetCols[0]?.name || '',
          sourceId: params.source,
          targetId: params.target,
        });
        return;
      }

      if (!sourceIsTarget && !targetIsTarget) {
        toast.error('Cannot connect two source tables. Connect to a target table (DWH).');
        return;
      }

      if (sourceIsTarget && !targetIsTarget) {
        // User connected backwards: DWH → Source, swap them
        toast('Swapped direction: Source → Target (DWH)', { icon: '🔄' });
        // console.log('[ModelingCanvas] Swapping direction - Source will be:', targetTable.table, 'Target will be:', sourceTable.table);
        setMappingSourceTable(targetTable);
        setMappingTargetTable(sourceTable);
        setPendingConnectionParams({
          ...params,
          source: params.target,
          target: params.source,
        });
      } else {
        // Correct direction: Source → DWH
        // console.log('[ModelingCanvas] Correct direction - Source:', sourceTable.table, 'Target:', targetTable.table);
        setMappingSourceTable(sourceTable);
        setMappingTargetTable(targetTable);
        setPendingConnectionParams(params);
      }

      setShowColumnMappingModal(true);
    },
    [tables, targetTableIds, tableColumns, projectId, setEdges]
  );

  // Handle column mapping from modal (ETL mapping, not FK relationship)
  const handleColumnMapping = useCallback(
    async (sourceColumns: string[], targetColumn: string, transformation?: string | null) => {
      // console.log('[ModelingCanvas] handleColumnMapping called:', {
        // sourceColumns,
        // targetColumn,
        // transformation,
        // mappingSourceTable: mappingSourceTable?.table,
        // mappingTargetTable: mappingTargetTable?.table,
        // pendingConnectionParams,
      // });

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

      // console.log('[ModelingCanvas] Creating mapping edge:', {
        // source: pendingConnectionParams.source,
        // target: pendingConnectionParams.target,
        // label: mappingLabel,
      // });

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
          // console.log('[ModelingCanvas] Edge already exists, updating:', edgeId);
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

        // console.log('[ModelingCanvas] Adding mapping edge:', {
          // newEdge,
          // sourceId,
          // targetId,
          // sourceNodeExists,
          // targetNodeExists,
          // existingEdgesCount: eds.length,
        // });

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
  const openPolicyPanel = useCallback((table: TableItem, category?: PolicyCategory) => {
    setSelectedTableForPanel(table);
    setSelectedTableColumns(tableColumns.get(table.id) || []);
    setPolicyPanelCategory(category);
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

    // Action-RBAC gate (System 2). Every mutating action is gated; `open_options`
    // only opens UI (the actions it routes back through are gated at dispatch).
    // Object-creating DE actions are `create`; only the destructive `exclude`
    // requires `approve`. `duplicate` is a copy (create), not destructive.
    const CREATE_ACTIONS = new Set([
      'rename', 'add_new_column', 'add_column', 'add_computed_column',
      'policies', 'masking', 'rls', 'tags', 'aggregation',
      'pk_config', 'fk_config', 'relation', 'duplicate',
      'dynamic_table', 'event_table', 'hybrid_table', 'stream', 'alert',
    ]);
    const APPROVE_ACTIONS = new Set(['exclude']);
    if (CREATE_ACTIONS.has(action) && !canWrite) {
      toast.error('You do not have permission to modify this model');
      return;
    }
    if (APPROVE_ACTIONS.has(action) && !canApprove) {
      toast.error('You do not have permission for this action');
      return;
    }

    switch (action) {
      case 'open_options':
        // Unified right bar (T1): the node "more"/context action no longer opens
        // a separate TableOptionsSidebar — it opens the ContextRightBar cockpit on
        // its Actions tab so there is exactly ONE right panel. Selecting the table
        // also frames it on the canvas via the existing onTableSelect path.
        onTableSelect?.(table);
        onOpenContextBar?.(table);
        break;
      case 'rename':
        // Open the structured rename modal (replaces window.prompt()). The event is
        // emitted on confirm; gating already happened at the top of this handler.
        setRenameState({ table, value: table.table });
        break;
      case 'add_new_column':
        setSelectedTableForPanel(table);
        setSelectedTableColumns(columns);
        setNewColumnName('');
        setNewColumnType('VARCHAR');
        setNewColumnNullable(true);
        setNewColumnIsPK(false);
        setShowAddSimpleColumnModal(true);
        break;
      case 'add_column':
        // Simple column add — reuse the add_new_column flow
        setSelectedTableForPanel(table);
        setSelectedTableColumns(columns);
        setNewColumnName('');
        setNewColumnType('VARCHAR');
        setNewColumnNullable(true);
        setNewColumnIsPK(false);
        setShowAddSimpleColumnModal(true);
        break;
      case 'add_computed_column':
        openAddColumnModal(table);
        break;
      case 'policies':
      case 'masking':
      case 'rls':
      case 'tags':
        // Default policy tab (collapsing/deep-linking these four is T3's call).
        openPolicyPanel(table);
        break;
      case 'aggregation':
        // Distinct surface: deep-link to the panel's real aggregation tab so the
        // option is no longer indistinguishable from the other policy labels.
        openPolicyPanel(table, 'aggregation');
        break;
      case 'pk_config': {
        // Open the structured primary-key picker (replaces window.prompt()). Only
        // non-PK columns are offered; the empty-columns guard stays on this open path.
        const pkColumns = columns.filter(c => !c.isPrimaryKey);
        if (pkColumns.length === 0) {
          toast.error('No columns available for primary key');
          return;
        }
        setPkState({ table, columns: pkColumns, selected: pkColumns[0]?.name || '' });
        break;
      }
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
        {
          // Emit a real, deployable TABLE_CREATED event for the copy (same shape
          // as CreateTableModal / DWH template tables) instead of cloning a local
          // node with an id that matches no real table. The copy lands as a
          // pending change (toast), undoable like any other event.
          const copyName = `${table.table}_COPY`;
          addEvent({
            type: 'TABLE_CREATED',
            projectId: projectId || undefined,
            target: { database: table.database, schema: table.schema, table: copyName },
            payload: {
              tableName: copyName,
              columns: columns.map((c) => ({
                name: c.name,
                dataType: c.dataType,
                nullable: c.isNullable,
                primaryKey: c.isPrimaryKey,
              })),
              primaryKeys: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
              duplicatedFrom: table.table,
            },
          });
          toast.success(`Duplicate "${copyName}" added to pending changes`);
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
  }, [tables, setNodes, openPolicyPanel, openAddColumnModal, openTableOptions, tableColumns, addEvent, projectId,
      canWrite, canApprove, onDynamicTableCreate, onEventTableCreate, onHybridTableCreate, onStreamCreate, onAlertCreate,
      onTableSelect, onOpenContextBar]);

  // Update ref for context action handler
  handleNodeContextActionRef.current = handleNodeContextAction;

  // Register a STABLE dispatcher with the parent so the unified ContextRightBar can
  // route table actions through the SAME handleNodeContextAction path the node menu
  // used. The wrapper closes over the live ref (always-fresh handler), so this
  // effect registers exactly once — no churn when the handler's deps change.
  useEffect(() => {
    onRegisterActionDispatch?.((tableId: string, action: string) => {
      handleNodeContextActionRef.current(tableId, action);
    });
  }, [onRegisterActionDispatch]);

  // Zoom-to-selected — frame the page-selected node when it changes. Driven off
  // the prop (which the page sets from the same click → onTableSelect path) so
  // centering happens exactly once per selection, never double-fired from
  // onNodeClick. fitView's left-biased padding keeps the framed node clear of the
  // 380px right cockpit; node-not-yet-present is a no-op (guarded by getNodes()).
  const lastFramedId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedTableId) { lastFramedId.current = null; return; }
    if (selectedTableId === lastFramedId.current) return;
    const exists = getNodes().some((n) => n.id === selectedTableId);
    if (!exists) return;
    lastFramedId.current = selectedTableId;
    // Slight delay lets a freshly-added node mount before we frame it.
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: selectedTableId }], padding: 0.5, duration: 400, maxZoom: 1.2 });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedTableId, getNodes, fitView]);

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

  // Auto-layout — pass the live edges so the hierarchical L→R ranking can honor
  // FK/mapping direction (this is the fully-populated path; the initial-render
  // useMemo runs with no edges yet and falls back to the leftover lane).
  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => autoLayout(nds, getEdges()));
    setTimeout(() => fitView({ padding: 0.2 }), 100);
    toast.success('Layout applied');
  }, [setNodes, getEdges, fitView]);

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
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.02}
        maxZoom={2}
        nodeExtent={[[-5000, -5000], [10000, 10000]]}
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

          {/* + Add table — drops a new table straight onto the canvas:
              define it by hand (Power BI style) or start empty to be fed by
              sources. Hidden in read-only / when the host doesn't wire it. */}
          {onAddTable && !isReadOnly && (
            <div className="relative">
              <Tooltip content="Add a table to the model">
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => setShowAddTableMenu((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800',
                    showAddTableMenu && 'text-blue-600 dark:text-blue-400',
                  )}
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-xs font-medium">Add table</span>
                </Button>
              </Tooltip>
              {showAddTableMenu && (
                <>
                  {/* click-away (transparent, non-blocking) */}
                  <div
                    className="fixed inset-0 z-[5]"
                    onClick={() => setShowAddTableMenu(false)}
                  />
                  <div className="absolute left-0 top-full z-10 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => { setShowAddTableMenu(false); onAddTable('manual'); }}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60"
                    >
                      <Table2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Define manually</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">Add columns by hand, like Power BI</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddTableMenu(false); onAddTable('empty'); }}
                      className="flex w-full items-start gap-2.5 border-t border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/60"
                    >
                      <Database className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Empty table</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">Start blank, feed it from sources</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
            initialCategory={policyPanelCategory}
            onPolicyApplied={() => {
              toast.success('Policy applied successfully');
            }}
            onClose={() => {
              setShowPolicyPanel(false);
              setSelectedTableForPanel(null);
              setPolicyPanelCategory(undefined);
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
          projectId={projectId}
          onColumnAdd={(column: ComputedColumn) => {
            // Update columns map locally so the table node shows the new column
            if (onColumnsMapUpdate && selectedTableForPanel) {
              const tableId = `${selectedTableForPanel.database}.${selectedTableForPanel.schema}.${selectedTableForPanel.table}`;
              onColumnsMapUpdate((prev) => {
                const existing = prev.get(tableId) || [];
                const newCol: ColumnInfo = {
                  name: column.name,
                  dataType: column.dataType,
                  isNullable: true,
                  isPrimaryKey: false,
                };
                const updated = new Map(prev);
                updated.set(tableId, [...existing, newCol]);
                return updated;
              });
            }
          }}
        />
      )}

      {/* Add Simple Column Modal */}
      {showAddSimpleColumnModal && (
      <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 w-[420px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            Add Column to {selectedTableForPanel?.table}
          </h3>
          <div className="space-y-4">
            <Input
              label="Column Name"
              placeholder="e.g. ORDER_ID"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value.toUpperCase())}
            />
            <Select
              label="Data Type"
              value={{ label: newColumnType, value: newColumnType }}
              options={[
                'VARCHAR', 'NUMBER', 'INTEGER', 'FLOAT', 'BOOLEAN',
                'DATE', 'TIMESTAMP', 'TIMESTAMP_NTZ', 'VARIANT', 'ARRAY', 'OBJECT',
              ].map(t => ({ label: t, value: t }))}
              onChange={(opt: any) => setNewColumnType(opt?.value || 'VARCHAR')}
            />
            <div className="flex items-center gap-4">
              <Checkbox
                label="Nullable"
                checked={newColumnNullable}
                onChange={() => setNewColumnNullable(!newColumnNullable)}
              />
              <Checkbox
                label="Primary Key"
                checked={newColumnIsPK}
                onChange={() => setNewColumnIsPK(!newColumnIsPK)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowAddSimpleColumnModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newColumnName.trim()}
              onClick={() => {
                if (!selectedTableForPanel || !newColumnName.trim()) return;
                const table = selectedTableForPanel;
                const tableId = `${table.database}.${table.schema}.${table.table}`;

                // Add event with projectId
                addEvent({
                  type: 'ADD_COLUMN',
                  projectId: projectId || undefined,
                  target: { database: table.database, schema: table.schema, table: table.table },
                  payload: {
                    columnName: newColumnName.trim(),
                    columnType: newColumnType,
                    dataType: newColumnType,
                    nullable: newColumnNullable,
                    isPrimaryKey: newColumnIsPK,
                  },
                });

                // Update columns map locally so the table node shows the new column
                if (onColumnsMapUpdate) {
                  onColumnsMapUpdate((prev) => {
                    const existing = prev.get(tableId) || [];
                    const newCol: ColumnInfo = {
                      name: newColumnName.trim(),
                      dataType: newColumnType,
                      isNullable: newColumnNullable,
                      isPrimaryKey: newColumnIsPK,
                    };
                    const updated = new Map(prev);
                    updated.set(tableId, [...existing, newCol]);
                    return updated;
                  });
                }

                toast.success(`Column "${newColumnName.trim()}" added to ${table.table}`);
                setShowAddSimpleColumnModal(false);

                // If PK was set, also add a PK event
                if (newColumnIsPK) {
                  addEvent({
                    type: 'PRIMARY_KEY_SET',
                    projectId: projectId || undefined,
                    target: { database: table.database, schema: table.schema, table: table.table },
                    payload: { columns: [newColumnName.trim()] },
                  });
                }
              }}
            >
              Add Column
            </Button>
          </div>
        </div>
      </div>
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

      {/* Table Options Sidebar (T1 — RETIRED).
          The standalone TableOptionsSidebar used to float here as a SECOND right
          panel that overlapped the ContextRightBar cockpit. It is gone: a node's
          "more"/context action now routes through `open_options` → the page's
          unified ContextRightBar (Actions tab). All of its actions live in that one
          bar's Actions section, dispatched through the same handleNodeContextAction
          path via `onRegisterActionDispatch`. */}

      {/* FK Column Picker Modal */}
      {fkPickerState && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 w-[420px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
          <div className="p-5">
            <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-amber-500" />
              Create Foreign Key
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {fkPickerState.sourceTable.table} → {fkPickerState.targetTable.table}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                  Source Column ({fkPickerState.sourceTable.table})
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                  value={fkPickerState.selectedSourceCol}
                  onChange={(e) => setFkPickerState(prev => prev ? { ...prev, selectedSourceCol: e.target.value } : null)}
                >
                  {fkPickerState.sourceCols.map(c => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.dataType}){c.isPrimaryKey ? ' 🔑' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <ArrowLeftRight className="h-4 w-4 text-slate-400" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                  Referenced Column ({fkPickerState.targetTable.table})
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                  value={fkPickerState.selectedTargetCol}
                  onChange={(e) => setFkPickerState(prev => prev ? { ...prev, selectedTargetCol: e.target.value } : null)}
                >
                  {fkPickerState.targetCols.map(c => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.dataType}){c.isPrimaryKey ? ' 🔑' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setFkPickerState(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => {
                  const st = fkPickerState;
                  const constraintName = `FK_${st.sourceTable.table}_${st.selectedSourceCol}`;
                  addEventRef.current({
                    type: 'FOREIGN_KEY_ADDED',
                    projectId: projectId || undefined,
                    target: { database: st.sourceTable.database, schema: st.sourceTable.schema, table: st.sourceTable.table },
                    payload: {
                      constraintName,
                      columns: [st.selectedSourceCol],
                      referencedTable: { database: st.targetTable.database, schema: st.targetTable.schema, table: st.targetTable.table },
                      referencedColumns: [st.selectedTargetCol],
                    },
                  });
                  setEdges(prev => [
                    ...prev,
                    {
                      id: `fk-${st.sourceId}-${st.targetId}-${st.selectedSourceCol}`,
                      source: st.sourceId,
                      target: st.targetId,
                      type: 'smoothstep',
                      animated: true,
                      style: { stroke: '#f59e0b' },
                      label: `${st.selectedSourceCol} → ${st.selectedTargetCol}`,
                      labelStyle: { fontSize: 10, fill: '#64748b' },
                      markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
                    },
                  ]);
                  toast.success(`FK: ${st.sourceTable.table}.${st.selectedSourceCol} → ${st.targetTable.table}.${st.selectedTargetCol}`);
                  setFkPickerState(null);
                }}
              >
                Create FK
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Table Modal (structured — replaces window.prompt()) */}
      {renameState && (() => {
        const { table } = renameState;
        const trimmed = renameState.value.trim();
        const canRename = !!trimmed && trimmed !== table.table;
        const confirmRename = () => {
          if (canRename) {
            addEvent({
              type: 'TABLE_RENAMED',
              target: { database: table.database, schema: table.schema, table: table.table },
              payload: { newName: trimmed },
            });
            toast.success(`Rename "${table.table}" → "${trimmed}" added to pending changes`);
          }
          setRenameState(null);
        };
        return (
          <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 w-[420px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
            <div className="p-5">
              <h3 className="text-lg font-semibold mb-4">
                Rename {table.table}
              </h3>
              <Input
                label="New table name"
                placeholder="e.g. FACT_ORDERS"
                value={renameState.value}
                onChange={(e) => setRenameState(prev => prev ? { ...prev, value: e.target.value } : null)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canRename) confirmRename(); }}
              />
              <div className="flex justify-end gap-2 mt-5">
                <Button variant="outline" size="sm" onClick={() => setRenameState(null)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!canRename} onClick={confirmRename}>
                  Rename
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Set Primary Key Modal (structured — replaces window.prompt()) */}
      {pkState && (
        // No-popup: docked floating card (no backdrop) so the canvas + the
        // highlighted target table stay visible while you pick the PK column.
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 w-[420px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900">
          <div className="p-5">
            <h3 className="text-lg font-semibold mb-1">
              Set primary key
            </h3>
            <p className="text-xs text-slate-500 mb-4">{pkState.table.table}</p>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                Column
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
                value={pkState.selected}
                onChange={(e) => setPkState(prev => prev ? { ...prev, selected: e.target.value } : null)}
              >
                {pkState.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.dataType})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setPkState(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!pkState.selected}
                onClick={() => {
                  const { table, selected } = pkState;
                  if (selected) {
                    addEvent({
                      type: 'PRIMARY_KEY_SET',
                      target: { database: table.database, schema: table.schema, table: table.table },
                      payload: { columns: [selected] },
                    });
                    toast.success(`Primary key set: ${selected}`);
                  }
                  setPkState(null);
                }}
              >
                Set primary key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main component with provider
const ModelingCanvas: React.FC<ModelingCanvasProps> = React.memo((props) => {
  return (
    <ReactFlowProvider>
      <ModelingCanvasInner {...props} />
    </ReactFlowProvider>
  );
});

ModelingCanvas.displayName = 'ModelingCanvas';

export default ModelingCanvas;
