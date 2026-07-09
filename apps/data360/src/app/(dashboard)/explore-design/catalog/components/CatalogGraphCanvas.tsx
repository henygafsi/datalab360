'use client';

/**
 * Catalog center canvas — the whole account as floating nodes + fine
 * functional relation lines (redesign 2026-07: replaces the "no mindmap"
 * grid-only rule for the Catalog tab center).
 *
 * Data: GET /catalog/graph (real ACCOUNT_USAGE + events — no mocks).
 * Nodes: database › schema (typed SOURCE/PRODUCT/PROJECT with owner,
 * created, KPIs) › product / project (owner, created, environments).
 * Edges, all thin bezier "fine lines" by design: contains (dotted slate),
 * lineage (animated indigo — cross-used sources), deploys_into (amber),
 * anchored_in (violet).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
  ReactFlowProvider,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { Boxes, Database, FolderKanban, Package, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCatalogGraph,
  type CatalogGraphNode,
  type CatalogGraphResponse,
} from '@/app/services/catalog/graph';

// ── styling by node kind / schema type ──────────────────────────────────────

const TYPE_STYLE: Record<string, { ring: string; chip: string; label: string }> = {
  SOURCE: { ring: 'ring-sky-300/70', chip: 'bg-sky-50 text-sky-700', label: 'Source' },
  PRODUCT: { ring: 'ring-violet-300/70', chip: 'bg-violet-50 text-violet-700', label: 'Product' },
  PROJECT: { ring: 'ring-amber-300/70', chip: 'bg-amber-50 text-amber-700', label: 'Project' },
  UNCLASSIFIED: { ring: 'ring-slate-200', chip: 'bg-slate-100 text-slate-500', label: 'Unclassified' },
};

function fmtBytes(b?: number): string {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

// ── custom floating node ────────────────────────────────────────────────────

function GraphNode({ data }: NodeProps<{ node: CatalogGraphNode }>) {
  const n = data.node;
  const t = TYPE_STYLE[n.schema_type ?? ''] ?? TYPE_STYLE.UNCLASSIFIED;
  const isDb = n.kind === 'database';
  const Icon = isDb ? Database : n.kind === 'product' ? Package : n.kind === 'project' ? FolderKanban : Boxes;
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/95 px-3 py-2 shadow-sm backdrop-blur transition-shadow hover:shadow-md',
        'dark:bg-slate-900/95 dark:border-slate-700',
        isDb ? 'border-slate-300 ring-2 ring-slate-200/60' : `border-slate-200 ring-2 ${t.ring}`,
        n.kind === 'product' && 'ring-violet-300/70',
        n.kind === 'project' && 'ring-amber-300/70',
      )}
      style={{ minWidth: isDb ? 150 : 190 }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-slate-300 !border-0" />
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', isDb ? 'text-slate-500' : 'text-slate-400')} />
        <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{n.label}</span>
        {n.kind === 'schema' && (
          <span className={cn('ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium', t.chip)}>
            {t.label}
          </span>
        )}
        {n.kind !== 'schema' && !isDb && (
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {n.kind}
          </span>
        )}
      </div>
      {n.kind === 'schema' && (
        <div className="mt-1 space-y-0.5 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
          <div className="truncate">
            {n.kpis?.tables ?? 0} tables · {Number(n.kpis?.rows ?? 0).toLocaleString()} rows · {fmtBytes(n.kpis?.bytes)}
          </div>
          <div className="truncate">
            {n.owner ?? '—'} · created {fmtDate(n.created)}
          </div>
        </div>
      )}
      {n.kind === 'project' && (
        <div className="mt-1 space-y-0.5 text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
          <div className="truncate">{n.objects ?? 0} deployed objects · {(n.environments ?? []).join(', ') || 'dev'}</div>
          <div className="truncate">{n.owner ?? '—'} · created {fmtDate(n.created)}</div>
        </div>
      )}
      {n.kind === 'product' && (
        <div className="mt-1 truncate text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">
          {n.status ?? 'DRAFT'} · {n.anchor_fqn ?? ''}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-slate-300 !border-0" />
    </div>
  );
}

const NODE_TYPES = { catalogNode: GraphNode };

// ── fine-line edge styling per relation kind ────────────────────────────────

function edgeStyle(kind: string, weight: number): Partial<Edge> {
  switch (kind) {
    case 'lineage':
      return {
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: Math.min(1 + Math.log2(weight + 1) * 0.5, 2.5), opacity: 0.75 },
        label: weight > 1 ? `${weight}` : undefined,
        labelStyle: { fontSize: 9, fill: '#6366f1' },
      };
    case 'deploys_into':
      return { style: { stroke: '#f59e0b', strokeWidth: 1.2, opacity: 0.8 } };
    case 'anchored_in':
      return { style: { stroke: '#8b5cf6', strokeWidth: 1.2, opacity: 0.8 } };
    default: // contains
      return { style: { stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 3', opacity: 0.7 } };
  }
}

// ── dagre layout (LR, hierarchy db → schema → product/project) ─────────────

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 130 });
  nodes.forEach((n) => g.setNode(n.id, { width: 210, height: 72 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - 105, y: p.y - 36 } };
  });
}

// ── canvas ──────────────────────────────────────────────────────────────────

export interface CatalogGraphCanvasProps {
  onSelectNode?: (node: CatalogGraphNode) => void;
  className?: string;
}

function CanvasInner({ onSelectNode, className }: CatalogGraphCanvasProps) {
  const [graph, setGraph] = useState<CatalogGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGraph(await getCatalogGraph());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load catalog graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const ns: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: 'catalogNode',
      data: { node: n },
      position: { x: 0, y: 0 },
    }));
    const es: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'default',
      ...edgeStyle(e.kind, e.weight),
    }));
    return { nodes: layout(ns, es), edges: es };
  }, [graph]);

  if (error) {
    return (
      <div className={cn('flex h-[520px] items-center justify-center rounded-xl border border-dashed', className)}>
        <div className="text-center text-sm text-slate-500">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-2 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-[560px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, n) => onSelectNode?.((n.data as any).node as CatalogGraphNode)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
      >
        <Background gap={22} size={1} color="#e2e8f0" />
        <MiniMap pannable zoomable className="!h-24 !w-36" />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
            {loading ? (
              <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Loading graph…</span>
            ) : (
              <>
                <span>{graph?.summary.databases ?? 0} databases</span>
                <span className="text-sky-600">{graph?.summary.schemas?.SOURCE ?? 0} sources</span>
                <span className="text-violet-600">{(graph?.summary.schemas?.PRODUCT ?? 0) + (graph?.summary.products ?? 0)} products</span>
                <span className="text-amber-600">{(graph?.summary.schemas?.PROJECT ?? 0) + (graph?.summary.projects ?? 0)} projects</span>
                <span className="text-indigo-500">{graph?.summary.lineage_edges ?? 0} lineage links</span>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function CatalogGraphCanvas(props: CatalogGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
