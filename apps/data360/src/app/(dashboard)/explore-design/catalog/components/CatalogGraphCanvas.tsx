'use client';

/**
 * Catalog center canvas — the whole account as floating nodes + fine
 * functional relation lines (redesign 2026-07: replaces the "no mindmap"
 * grid-only rule for the Catalog tab center).
 *
 * Data: GET /catalog/graph (real ACCOUNT_USAGE + events — no mocks).
 * Nodes: database (compact pill) › schema (typed SOURCE/PRODUCT/PROJECT
 * cards with icon medallion, accent bar, KPI stat cells) › product /
 * project (owner, created, environments).
 * Edges, all thin "fine lines" by design, each with a small closed arrow:
 * contains (fine dashed slate), lineage (animated indigo — cross-used
 * sources), deploys_into (amber), anchored_in (violet).
 *
 * Visual language shared with shared/command-center/LineageFlow.tsx:
 * kind-colored gradient medallion + 3px left accent bar + uppercase pill.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
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
import { useTheme } from 'next-themes';
import { Boxes, Database, FolderKanban, Package, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCatalogGraph,
  type CatalogGraphNode,
  type CatalogGraphResponse,
} from '@/app/services/catalog/graph';

// ── kind-colored visual system (medallion / accent / badge / ring) ──────────

interface KindStyle {
  label: string;
  /** gradient stops for the icon medallion + left accent bar */
  medallion: string;
  accent: string;
  /** tiny uppercase pill */
  badge: string;
  /** selected ring color */
  ring: string;
  /** colored hover shadow */
  glow: string;
  /** connection handle dot */
  handle: string;
  /** summary chip dot */
  dot: string;
  /** minimap hex */
  mini: string;
}

const KIND_STYLE: Record<string, KindStyle> = {
  SOURCE: {
    label: 'Source',
    medallion: 'from-sky-400 to-sky-600',
    accent: 'from-sky-400 to-sky-600',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    ring: 'ring-sky-400/80',
    glow: 'hover:shadow-sky-200/50 dark:hover:shadow-sky-900/40',
    handle: '!bg-sky-400',
    dot: 'bg-sky-500',
    mini: '#38bdf8',
  },
  PRODUCT: {
    label: 'Product',
    medallion: 'from-violet-400 to-violet-600',
    accent: 'from-violet-400 to-violet-600',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    ring: 'ring-violet-400/80',
    glow: 'hover:shadow-violet-200/50 dark:hover:shadow-violet-900/40',
    handle: '!bg-violet-400',
    dot: 'bg-violet-500',
    mini: '#8b5cf6',
  },
  PROJECT: {
    label: 'Project',
    medallion: 'from-amber-400 to-amber-600',
    accent: 'from-amber-400 to-amber-600',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    ring: 'ring-amber-400/80',
    glow: 'hover:shadow-amber-200/50 dark:hover:shadow-amber-900/40',
    handle: '!bg-amber-400',
    dot: 'bg-amber-500',
    mini: '#f59e0b',
  },
  UNCLASSIFIED: {
    label: 'Unclassified',
    medallion: 'from-slate-400 to-slate-500',
    accent: 'from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500',
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    ring: 'ring-slate-300 dark:ring-slate-500',
    glow: 'hover:shadow-slate-200/60 dark:hover:shadow-slate-950/50',
    handle: '!bg-slate-400',
    dot: 'bg-slate-400',
    mini: '#94a3b8',
  },
  DATABASE: {
    label: 'Database',
    medallion: 'from-slate-500 to-slate-700',
    accent: 'from-slate-400 to-slate-600',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    ring: 'ring-slate-400/80',
    glow: 'hover:shadow-slate-300/50 dark:hover:shadow-slate-950/50',
    handle: '!bg-slate-400',
    dot: 'bg-slate-500',
    mini: '#64748b',
  },
};

function styleFor(n: Partial<CatalogGraphNode>): KindStyle {
  if (n.kind === 'database') return KIND_STYLE.DATABASE;
  if (n.kind === 'product') return KIND_STYLE.PRODUCT;
  if (n.kind === 'project') return KIND_STYLE.PROJECT;
  return KIND_STYLE[n.schema_type ?? ''] ?? KIND_STYLE.UNCLASSIFIED;
}

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

/** Tiny KPI stat cell — hairline-separated triplet under schema titles. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 flex-1 px-2 first:pl-0 last:pr-0">
      <div className="truncate text-[10.5px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{value}</div>
      <div className="truncate text-[8.5px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
    </div>
  );
}

function GraphNode({ data, selected }: NodeProps<{ node: CatalogGraphNode }>) {
  const n = data.node;
  const t = styleFor(n);
  const isDb = n.kind === 'database';
  const Icon = isDb ? Database : n.kind === 'product' ? Package : n.kind === 'project' ? FolderKanban : Boxes;

  const handles = (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className={cn('!h-1.5 !w-1.5 !border-0 opacity-0 transition-opacity group-hover:opacity-60', t.handle)}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn('!h-1.5 !w-1.5 !border-0 opacity-0 transition-opacity group-hover:opacity-60', t.handle)}
      />
    </>
  );

  // Databases: compact pill so the hierarchy reads at a glance.
  if (isDb) {
    return (
      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/95 py-1 pl-1 pr-3 shadow-sm backdrop-blur transition-all duration-150',
          'dark:border-slate-600/80 dark:bg-slate-800/95',
          'hover:shadow-md', t.glow,
          selected && cn('scale-[1.04] ring-2', t.ring),
        )}
        style={{ minWidth: 140 }}
      >
        {handles}
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm', t.medallion)}>
          <Database className="h-3.5 w-3.5 text-white" />
        </span>
        <span className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{n.label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-slate-200/90 bg-white/95 py-2 pl-3.5 pr-3 shadow-sm backdrop-blur transition-all duration-150',
        'dark:border-slate-700/80 dark:bg-slate-900/95',
        'hover:shadow-lg', t.glow,
        selected && cn('scale-[1.03] ring-2', t.ring),
      )}
      style={{ minWidth: 200, maxWidth: 244 }}
    >
      {/* 3px kind-colored accent bar */}
      <span aria-hidden className={cn('absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-gradient-to-b', t.accent)} />
      {handles}
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm', t.medallion)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{n.label}</span>
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wide', t.badge)}>
          {n.kind === 'schema' ? t.label : n.kind}
        </span>
      </div>
      {n.kind === 'schema' && (
        <>
          <div className="mt-1.5 flex items-stretch divide-x divide-slate-200/80 dark:divide-slate-700/70">
            <Stat value={String(n.kpis?.tables ?? 0)} label="tables" />
            <Stat value={Number(n.kpis?.rows ?? 0).toLocaleString()} label="rows" />
            <Stat value={fmtBytes(n.kpis?.bytes)} label="size" />
          </div>
          <div className="mt-1 truncate text-[9.5px] text-slate-400 dark:text-slate-500">
            {n.owner ?? '—'} · created {fmtDate(n.created)}
          </div>
        </>
      )}
      {n.kind === 'project' && (
        <div className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
          <div className="truncate">{n.objects ?? 0} deployed objects · {(n.environments ?? []).join(', ') || 'dev'}</div>
          <div className="truncate text-[9.5px] text-slate-400 dark:text-slate-500">{n.owner ?? '—'} · created {fmtDate(n.created)}</div>
        </div>
      )}
      {n.kind === 'product' && (
        <div className="mt-1 truncate text-[10px] leading-4 text-slate-500 dark:text-slate-400">
          {n.status ?? 'DRAFT'} · {n.anchor_fqn ?? ''}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { catalogNode: GraphNode };

// ── fine-line edge styling per relation kind ────────────────────────────────

function edgeStyle(kind: string, weight: number, isDark: boolean): Partial<Edge> {
  const arrow = (color: string, size = 14) => ({ type: MarkerType.ArrowClosed, color, width: size, height: size });
  switch (kind) {
    case 'lineage':
      return {
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: Math.min(1 + Math.log2(weight + 1) * 0.5, 2.5), opacity: 0.75 },
        markerEnd: arrow('#6366f1'),
        label: weight > 1 ? `${weight}` : undefined,
        labelStyle: { fontSize: 9, fontWeight: 600, fill: isDark ? '#a5b4fc' : '#4f46e5' },
        labelBgStyle: { fill: isDark ? '#1e1b4b' : '#eef2ff', stroke: isDark ? '#312e81' : '#c7d2fe', strokeWidth: 1 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 7,
      };
    case 'deploys_into':
      return { style: { stroke: '#f59e0b', strokeWidth: 1.2, opacity: 0.8 }, markerEnd: arrow('#f59e0b') };
    case 'anchored_in':
      return { style: { stroke: '#8b5cf6', strokeWidth: 1.2, opacity: 0.8 }, markerEnd: arrow('#8b5cf6') };
    default: { // contains — fine dashed slate
      const slate = isDark ? '#475569' : '#cbd5e1';
      return { style: { stroke: slate, strokeWidth: 1, strokeDasharray: '4 3', opacity: 0.7 }, markerEnd: arrow(slate, 10) };
    }
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

/** Summary chip — kind-colored dot before each count. */
function SummaryChip({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
      {children}
    </span>
  );
}

function CanvasInner({ onSelectNode, className }: CatalogGraphCanvasProps) {
  const [graph, setGraph] = useState<CatalogGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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
      ...edgeStyle(e.kind, e.weight, isDark),
    }));
    return { nodes: layout(ns, es), edges: es };
  }, [graph, isDark]);

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
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color={isDark ? '#1e293b' : '#e2e8f0'} />
        <MiniMap
          pannable
          zoomable
          className="!h-24 !w-36 !rounded-lg !border !border-slate-200 !bg-white/90 dark:!border-slate-700 dark:!bg-slate-900/90"
          maskColor={isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(241, 245, 249, 0.7)'}
          nodeColor={(node) => styleFor(((node.data as any)?.node ?? {}) as Partial<CatalogGraphNode>).mini}
        />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
            {loading ? (
              <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Loading graph…</span>
            ) : (
              <>
                <SummaryChip dot={KIND_STYLE.DATABASE.dot}>{graph?.summary.databases ?? 0} databases</SummaryChip>
                <SummaryChip dot={KIND_STYLE.SOURCE.dot}>{graph?.summary.schemas?.SOURCE ?? 0} sources</SummaryChip>
                <SummaryChip dot={KIND_STYLE.PRODUCT.dot}>{(graph?.summary.schemas?.PRODUCT ?? 0) + (graph?.summary.products ?? 0)} products</SummaryChip>
                <SummaryChip dot={KIND_STYLE.PROJECT.dot}>{(graph?.summary.schemas?.PROJECT ?? 0) + (graph?.summary.projects ?? 0)} projects</SummaryChip>
                <SummaryChip dot="bg-indigo-500">{graph?.summary.lineage_edges ?? 0} lineage links</SummaryChip>
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
