'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from 'rizzui';
import {
  GitBranch, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useEventStore, DesignEvent, EventType, EventStatus } from '../stores/event-store';

// ── Types ──────────────────────────────────────────────────────────────────────

type NodeKind = 'schema' | 'table' | 'column' | 'fk' | 'policy' | 'ingestion';

interface DagNode {
  id: string;
  label: string;
  kind: NodeKind;
  status: EventStatus;
  dependencies: string[];
  isCycle: boolean;
}

interface DagViewerProps {
  className?: string;
  projectId?: string | null;
}

// ── Only DDL events belong in the DAG ───────────────────────────────────────

function getKind(type: EventType): NodeKind | null {
  if (type === 'SCHEMA_CREATED') return 'schema';
  if (
    type === 'TABLE_CREATED' || type === 'TABLE_RENAMED' ||
    type === 'DYNAMIC_TABLE_CREATED' || type === 'HYBRID_TABLE_CREATED' ||
    type === 'EVENT_TABLE_CREATED'
  ) return 'table';
  if (
    type === 'ADD_COLUMN' || type === 'REMOVE_COLUMN' ||
    type === 'COLUMN_RENAMED' || type === 'COLUMN_TYPE_CHANGED' ||
    type === 'PRIMARY_KEY_SET' || type === 'PRIMARY_KEY_REMOVED'
  ) return 'column';
  if (
    type === 'FOREIGN_KEY_ADDED' || type === 'FOREIGN_KEY_REMOVED' ||
    type === 'RELATION_CREATED' || type === 'RELATION_REMOVED'
  ) return 'fk';
  if (
    type === 'MASKING_POLICY_APPLIED' || type === 'MASKING_POLICY_REMOVED' ||
    type === 'RLS_POLICY_APPLIED' || type === 'RLS_POLICY_REMOVED' ||
    type === 'AGGREGATION_POLICY_APPLIED' || type === 'AGGREGATION_POLICY_REMOVED' ||
    type === 'TAG_APPLIED' || type === 'TAG_REMOVED'
  ) return 'policy';
  if (type === 'INGESTION_MODE_SET' || type === 'SCD_CONFIGURED') return 'ingestion';
  return null;
}

// ── Build DAG ──────────────────────────────────────────────────────────────────
//
// Hierarchy:  CREATE SCHEMA  →  CREATE TABLE  →  columns / FKs / policies
//
// Virtual schema + table nodes are auto-created from event targets.
// Schemas are deduped. Tables are only created for real table names (not empty).

function buildGraph(events: DesignEvent[]): { dagNodes: DagNode[]; hasCycles: boolean } {
  const relevant = events.filter((e) => getKind(e.type) !== null);
  if (relevant.length === 0) return { dagNodes: [], hasCycles: false };

  const dagNodes: DagNode[] = [];

  // Collect unique schemas (by schema name) and tables (by full key)
  const schemaSet = new Map<string, string>(); // "db.schema" → schema name
  const tableSet = new Map<string, { db: string; sch: string; tbl: string }>(); // "db.schema.table" → info

  function registerTable(db: string, sch: string, tbl: string) {
    if (!tbl) return;
    if (sch) {
      const sKey = `${db}.${sch}`;
      if (!schemaSet.has(sKey)) schemaSet.set(sKey, sch);
    }
    const tKey = `${db}.${sch}.${tbl}`;
    // Guard: don't register a "table" that is actually just the schema name
    if (tbl === sch) return;
    if (!tableSet.has(tKey)) tableSet.set(tKey, { db, sch, tbl });
  }

  for (const ev of relevant) {
    const db = ev.target?.database || '';
    const sch = ev.target?.schema || '';
    const tbl = ev.target?.table || '';
    registerTable(db, sch, tbl);
    // FK referenced tables
    if (ev.payload?.referencedTable?.table) {
      const ref = ev.payload.referencedTable;
      registerTable(ref.database || db, ref.schema || sch, ref.table);
    }
  }

  // Layer 0: Virtual schema nodes
  const vSchemaIds = new Map<string, string>();
  Array.from(schemaSet.entries()).forEach(([key, schName]) => {
    const vId = `vschema__${key}`;
    vSchemaIds.set(key, vId);
    dagNodes.push({
      id: vId,
      label: `CREATE SCHEMA ${schName}`,
      kind: 'schema',
      status: 'validated',
      dependencies: [],
      isCycle: false,
    });
  });

  // Layer 1: Virtual table nodes → depend on their schema
  const vTableIds = new Map<string, string>();
  Array.from(tableSet.entries()).forEach(([key, info]) => {
    const vId = `vtable__${key}`;
    vTableIds.set(key, vId);
    const schKey = `${info.db}.${info.sch}`;
    const deps: string[] = [];
    const schVId = vSchemaIds.get(schKey);
    if (schVId) deps.push(schVId);
    dagNodes.push({
      id: vId,
      label: `CREATE TABLE ${info.tbl}`,
      kind: 'table',
      status: 'validated',
      dependencies: deps,
      isCycle: false,
    });
  });

  // Layer 2+: Actual DDL event nodes
  for (const ev of relevant) {
    const kind = getKind(ev.type)!;
    if (kind === 'table' || kind === 'schema') continue; // already virtual

    const db = ev.target?.database || '';
    const sch = ev.target?.schema || '';
    const tbl = ev.target?.table || '';
    const tKey = `${db}.${sch}.${tbl}`;

    const deps: string[] = [];
    const parentVId = vTableIds.get(tKey);
    if (parentVId) deps.push(parentVId);

    // FK: also depend on referenced table
    if (kind === 'fk') {
      const refObj = ev.payload?.referencedTable;
      const refTbl = refObj?.table || '';
      if (refTbl) {
        const refKey = `${refObj?.database || db}.${refObj?.schema || sch}.${refTbl}`;
        const refVId = vTableIds.get(refKey);
        if (refVId && refVId !== parentVId) deps.push(refVId);
      }
    }

    dagNodes.push({
      id: ev.id,
      label: getLabel(ev),
      kind,
      status: ev.status,
      dependencies: deps,
      isCycle: false,
    });
  }

  // Cycle detection (Kahn's)
  const nodeMap = new Map<string, DagNode>();
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of dagNodes) { nodeMap.set(n.id, n); inDeg.set(n.id, 0); adj.set(n.id, []); }
  for (const n of dagNodes) {
    for (const d of n.dependencies) {
      if (adj.has(d)) { adj.get(d)!.push(n.id); inDeg.set(n.id, (inDeg.get(n.id) || 0) + 1); }
    }
  }
  const q: string[] = [];
  Array.from(inDeg.entries()).forEach(([id, d]) => { if (d === 0) q.push(id); });
  const vis = new Set<string>();
  while (q.length > 0) {
    const c = q.shift()!;
    vis.add(c);
    for (const nb of (adj.get(c) || [])) {
      const nd = (inDeg.get(nb) || 1) - 1;
      inDeg.set(nb, nd);
      if (nd === 0) q.push(nb);
    }
  }
  let hasCycles = false;
  for (const n of dagNodes) {
    if (!vis.has(n.id)) { n.isCycle = true; hasCycles = true; }
  }

  return { dagNodes, hasCycles };
}

// ── Labels — include table context so you know what belongs where ───────────

function getLabel(ev: DesignEvent): string {
  const { type, target, payload } = ev;
  const tbl = target?.table || '?';
  const col = payload?.columnName || payload?.name || target?.column || '';
  switch (type) {
    case 'ADD_COLUMN': return `${tbl}.ADD ${col}`;
    case 'REMOVE_COLUMN': return `${tbl}.DROP ${col}`;
    case 'COLUMN_RENAMED': return `${tbl}: ${payload?.oldName || '?'} → ${payload?.newName || '?'}`;
    case 'COLUMN_TYPE_CHANGED': return `${tbl}.${col} ALTER TYPE`;
    case 'PRIMARY_KEY_SET': return `${tbl} SET PK`;
    case 'PRIMARY_KEY_REMOVED': return `${tbl} DROP PK`;
    case 'FOREIGN_KEY_ADDED': {
      const ref = payload?.referencedTable;
      return `${tbl} FK → ${ref?.table || '?'}`;
    }
    case 'FOREIGN_KEY_REMOVED': return `${tbl} DROP FK`;
    case 'RELATION_CREATED': return `${tbl} REL → ${payload?.targetTable?.table || '?'}`;
    case 'RELATION_REMOVED': return `${tbl} DROP REL`;
    case 'MASKING_POLICY_APPLIED': return `MASK ${col || payload?.columns?.[0] || ''} on ${tbl}`;
    case 'MASKING_POLICY_REMOVED': return `UNMASK on ${tbl}`;
    case 'RLS_POLICY_APPLIED': return `RLS on ${tbl}`;
    case 'RLS_POLICY_REMOVED': return `DROP RLS on ${tbl}`;
    case 'AGGREGATION_POLICY_APPLIED': return `AGG ${payload?.aggregationType || ''} on ${tbl}`;
    case 'TAG_APPLIED': return `TAG on ${tbl}`;
    case 'INGESTION_MODE_SET': return `${tbl} INGEST ${payload?.mode || ''}`;
    case 'SCD_CONFIGURED': return `${tbl} SCD ${payload?.scdType || ''}`;
    default: return `${tbl} ${type.replace(/_/g, ' ')}`;
  }
}

// ── Node Colors ────────────────────────────────────────────────────────────

const KIND_STYLES: Record<NodeKind, { bg: string; border: string; text: string }> = {
  schema:    { bg: '#EDE9FE', border: '#8B5CF6', text: '#5B21B6' },
  table:     { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },
  column:    { bg: '#E0F2FE', border: '#0EA5E9', text: '#0369A1' },
  fk:        { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  policy:    { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
  ingestion: { bg: '#CCFBF1', border: '#14B8A6', text: '#0F766E' },
};

const STATUS_DOT: Record<EventStatus, string> = {
  pending:   '#F59E0B',
  validated: '#10B981',
  failed:    '#EF4444',
  applied:   '#3B82F6',
};

// ── Custom Node ────────────────────────────────────────────────────────────

function DagNodeComponent({ data }: NodeProps) {
  const style = KIND_STYLES[data.kind as NodeKind] || KIND_STYLES.table;
  const dotColor = STATUS_DOT[data.status as EventStatus] || '#94A3B8';
  const isVirtual = data.isVirtual;
  const isCycle = data.isCycle;
  const highlighted = data.highlighted as boolean | undefined;
  const dimmed = data.dimmed as boolean | undefined;

  return (
    <div
      style={{
        background: style.bg,
        border: `2px ${isCycle ? 'dashed' : 'solid'} ${isCycle ? '#EF4444' : style.border}`,
        borderRadius: isVirtual ? 12 : 8,
        padding: isVirtual ? '10px 18px' : '7px 12px',
        minWidth: isVirtual ? 160 : 120,
        maxWidth: 240,
        fontSize: isVirtual ? 12 : 10,
        fontWeight: isVirtual ? 700 : 500,
        color: dimmed ? '#B0B0B0' : style.text,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        boxShadow: highlighted
          ? `0 0 16px 4px ${style.border}66`
          : isVirtual ? '0 3px 10px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'grab',
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 0.2s, box-shadow 0.2s',
        transform: highlighted ? 'scale(1.05)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: style.border, width: 8, height: 8 }} />
      <div className="flex items-center gap-1.5">
        <span
          className="flex-shrink-0 rounded-full"
          style={{ background: isCycle ? '#EF4444' : dotColor, width: isVirtual ? 8 : 6, height: isVirtual ? 8 : 6 }}
        />
        <span className="truncate leading-tight">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: style.border, width: 8, height: 8 }} />
    </div>
  );
}

const nodeTypes = { dagNode: DagNodeComponent };

// ── Layout — grid with max N per row ───────────────────────────────────────

const MAX_PER_ROW = 5;
const X_GAP = 220;
const Y_GAP = 100;
const SUB_ROW_GAP = 65;

function buildLayout(dagNodes: DagNode[]): { initialNodes: Node[]; initialEdges: Edge[] } {
  if (dagNodes.length === 0) return { initialNodes: [], initialEdges: [] };

  const nodeMap = new Map<string, DagNode>();
  for (const n of dagNodes) nodeMap.set(n.id, n);

  // Compute depth
  const layerOf = new Map<string, number>();
  function depth(id: string, stack: Set<string>): number {
    if (layerOf.has(id)) return layerOf.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const node = nodeMap.get(id);
    if (!node || node.dependencies.length === 0) { layerOf.set(id, 0); return 0; }
    let mx = -1;
    for (const dep of node.dependencies) {
      if (nodeMap.has(dep)) mx = Math.max(mx, depth(dep, new Set(stack)));
    }
    const d = mx + 1;
    layerOf.set(id, d);
    return d;
  }
  for (const n of dagNodes) depth(n.id, new Set());

  // Group by layer
  const layers = new Map<number, DagNode[]>();
  for (const n of dagNodes) {
    const l = layerOf.get(n.id) || 0;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(n);
  }

  const initialNodes: Node[] = [];
  let currentY = 0;

  Array.from(layers.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([_layer, nodesInLayer]) => {
      const subRows: DagNode[][] = [];
      for (let i = 0; i < nodesInLayer.length; i += MAX_PER_ROW) {
        subRows.push(nodesInLayer.slice(i, i + MAX_PER_ROW));
      }
      for (const subRow of subRows) {
        const totalW = subRow.length * X_GAP;
        const startX = -totalW / 2 + X_GAP / 2;
        subRow.forEach((node, idx) => {
          const isVirtual = node.id.startsWith('vtable__') || node.id.startsWith('vschema__');
          initialNodes.push({
            id: node.id,
            type: 'dagNode',
            position: { x: startX + idx * X_GAP, y: currentY },
            draggable: true,
            data: {
              label: node.label,
              kind: node.kind,
              status: node.status,
              isCycle: node.isCycle,
              isVirtual,
            },
          });
        });
        currentY += SUB_ROW_GAP;
      }
      currentY += Y_GAP - SUB_ROW_GAP;
    });

  // Edges
  const initialEdges: Edge[] = [];
  for (const node of dagNodes) {
    for (const depId of node.dependencies) {
      if (!nodeMap.has(depId)) continue;
      const depNode = nodeMap.get(depId)!;
      const isFkCross = node.kind === 'fk' && depNode.kind === 'table' &&
        node.dependencies.length > 1 && depId === node.dependencies[1];
      const s = KIND_STYLES[node.kind] || KIND_STYLES.table;
      initialEdges.push({
        id: `e_${depId}_${node.id}`,
        source: depId,
        target: node.id,
        type: 'smoothstep',
        animated: node.status === 'pending',
        style: {
          stroke: isFkCross ? '#F59E0B' : s.border,
          strokeWidth: isFkCross ? 2 : 1.5,
          strokeDasharray: isFkCross ? '5 3' : undefined,
        },
        markerEnd: { type: 'arrowclosed' as any, color: isFkCross ? '#F59E0B' : s.border },
      });
    }
  }

  return { initialNodes, initialEdges };
}

// ── Component ──────────────────────────────────────────────────────────────────

const DagViewer: React.FC<DagViewerProps> = ({ className, projectId }) => {
  const { events } = useEventStore(projectId);
  const [isExpanded, setIsExpanded] = useState(true);

  const { dagNodes, hasCycles } = useMemo(() => buildGraph(events), [events]);
  const layout = useMemo(() => buildLayout(dagNodes), [dagNodes]);

  // useNodesState / useEdgesState enable dragging
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.initialEdges);

  // Track which edge is selected (highlight connected nodes)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Re-sync when layout changes (new events added)
  const layoutKey = useMemo(() => dagNodes.map((n) => n.id).join(','), [dagNodes]);
  const [prevKey, setPrevKey] = useState(layoutKey);
  if (layoutKey !== prevKey) {
    setPrevKey(layoutKey);
    setNodes(layout.initialNodes);
    setEdges(layout.initialEdges);
    setSelectedEdgeId(null);
  }

  // On edge click: highlight source + target nodes, brighten edge, dim the rest
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const clickedId = edge.id;
    const isDeselect = clickedId === selectedEdgeId;
    const newSelectedId = isDeselect ? null : clickedId;
    setSelectedEdgeId(newSelectedId);

    if (isDeselect || !newSelectedId) {
      // Reset all to default
      setNodes((nds) => nds.map((n) => ({
        ...n,
        data: { ...n.data, highlighted: false, dimmed: false },
      })));
      setEdges((eds) => eds.map((e) => ({
        ...e,
        style: { ...e.style, opacity: 1, strokeWidth: e.style?.strokeDasharray ? 2 : 1.5 },
      })));
      return;
    }

    const connectedNodeIds = new Set([edge.source, edge.target]);

    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: {
        ...n.data,
        highlighted: connectedNodeIds.has(n.id),
        dimmed: !connectedNodeIds.has(n.id),
      },
    })));

    setEdges((eds) => eds.map((e) => {
      const isSelected = e.id === newSelectedId;
      return {
        ...e,
        style: {
          ...e.style,
          opacity: isSelected ? 1 : 0.2,
          strokeWidth: isSelected ? 4 : (e.style?.strokeDasharray ? 2 : 1.5),
        },
      };
    }));
  }, [selectedEdgeId, setNodes, setEdges]);

  // Click on empty canvas: deselect
  const onPaneClick = useCallback(() => {
    if (!selectedEdgeId) return;
    setSelectedEdgeId(null);
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...n.data, highlighted: false, dimmed: false },
    })));
    setEdges((eds) => eds.map((e) => ({
      ...e,
      style: { ...e.style, opacity: 1, strokeWidth: e.style?.strokeDasharray ? 2 : 1.5 },
    })));
  }, [selectedEdgeId, setNodes, setEdges]);

  const stats = useMemo(() => {
    const schemas = dagNodes.filter((n) => n.kind === 'schema').length;
    const tables = dagNodes.filter((n) => n.kind === 'table').length;
    const fks = dagNodes.filter((n) => n.kind === 'fk').length;
    return { total: dagNodes.length, schemas, tables, fks };
  }, [dagNodes]);

  if (dagNodes.length === 0) {
    return (
      <div className={cn('p-8 text-center text-slate-500', className)}>
        <GitBranch className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">No events to visualize</p>
        <p className="text-xs mt-1">Add tables and configure models to see the dependency graph</p>
      </div>
    );
  }

  const graphHeight = Math.max(500, dagNodes.length * 20);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-indigo-500" />
          DAG — Dependency Graph
          <Badge size="sm" className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30">
            {stats.schemas} schemas · {stats.tables} tables · {stats.fks} FKs
          </Badge>
          {hasCycles && (
            <Badge size="sm" className="bg-red-100 text-red-600 animate-pulse">Cycle</Badge>
          )}
        </span>
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />
        }
      </button>

      {isExpanded && (
        <div>
          {hasCycles && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b dark:border-slate-700 flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <strong>Circular dependency detected.</strong>
            </div>
          )}

          <div style={{ height: graphHeight }} className="bg-slate-50/50 dark:bg-slate-900">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: 'smoothstep' }}
              minZoom={0.15}
              maxZoom={3}
              nodesDraggable
            >
              <Background color="#e2e8f0" gap={24} />
              <Controls position="top-right" />
              <MiniMap
                nodeColor={(node) => KIND_STYLES[node.data?.kind as NodeKind]?.border || '#94A3B8'}
                style={{ height: 80, width: 120 }}
              />
            </ReactFlow>
          </div>

          <div className="px-4 py-2 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-[10px] text-slate-500">
            <span className="font-medium">Schema → Tables → FKs / Columns / Policies · Drag nodes · Click edge to highlight</span>
            <div className="flex items-center gap-3">
              {Object.entries(KIND_STYLES).map(([kind, s]) => (
                <span key={kind} className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: s.bg, border: `1px solid ${s.border}` }} />
                  {kind}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#F59E0B' }} />
                FK ref
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DagViewer;
