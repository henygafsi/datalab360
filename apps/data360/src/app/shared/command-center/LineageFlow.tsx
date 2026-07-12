'use client';

/**
 * LineageFlow — interactive object lineage (React Flow), fed by the REAL
 * /command-center/object-lineage endpoint: structural (OBJECT_DEPENDENCIES) +
 * query-derived (ACCESS_HISTORY) 1-hop graph keyed by FQN.
 *
 * Upstream sources/views (left) → the object (centre) → downstream consumers
 * (right). Honest empty state when an object has no captured lineage.
 *
 * Visual language shared with explore-design CatalogGraphCanvas: kind-colored
 * icon medallions, 3px left accent bar, uppercase pill badges (source = sky,
 * objet = violet, vue/consommateur = amber).
 */

import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTheme } from 'next-themes';
import { Box, Database, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getObjectLineage, type LineageNode } from '@/app/services/command-center';

// ── kind-colored visual system (same palette as CatalogGraphCanvas) ─────────

const KIND_STYLE: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    medallion: string;
    accent: string;
    badge: string;
    ring: string;
    glow: string;
    handle: string;
    mini: string;
  }
> = {
  source: {
    label: 'Source',
    icon: Database,
    medallion: 'from-sky-400 to-sky-600',
    accent: 'from-sky-400 to-sky-600',
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    ring: 'ring-sky-400/80',
    glow: 'hover:shadow-sky-200/50 dark:hover:shadow-sky-900/40',
    handle: '!bg-sky-400',
    mini: '#38bdf8',
  },
  object: {
    label: 'Objet',
    icon: Box,
    medallion: 'from-violet-400 to-violet-600',
    accent: 'from-violet-400 to-violet-600',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    ring: 'ring-violet-400/80',
    glow: 'hover:shadow-violet-200/50 dark:hover:shadow-violet-900/40',
    handle: '!bg-violet-400',
    mini: '#8b5cf6',
  },
  view: {
    label: 'Vue',
    icon: Eye,
    medallion: 'from-amber-400 to-amber-600',
    accent: 'from-amber-400 to-amber-600',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    ring: 'ring-amber-400/80',
    glow: 'hover:shadow-amber-200/50 dark:hover:shadow-amber-900/40',
    handle: '!bg-amber-400',
    mini: '#f59e0b',
  },
};

type LineageNodeData = { label: string; kind: string; hits?: number | null };

function LineageGraphNode({ data, selected }: NodeProps<LineageNodeData>) {
  const t = KIND_STYLE[data.kind] ?? KIND_STYLE.source;
  const Icon = t.icon;
  const isCentre = data.kind === 'object';
  return (
    <div
      className={cn(
        'group relative rounded-xl border border-slate-200/90 bg-white/95 py-1.5 pl-3 pr-2.5 shadow-sm backdrop-blur transition-all duration-150',
        'dark:border-slate-700/80 dark:bg-slate-900/95',
        'hover:shadow-md', t.glow,
        isCentre && 'shadow-md',
        selected && cn('scale-[1.03] ring-2', t.ring),
      )}
      style={{ width: 180 }}
    >
      {/* 3px kind-colored accent bar */}
      <span aria-hidden className={cn('absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-full bg-gradient-to-b', t.accent)} />
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
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm', t.medallion)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-800 dark:text-slate-100" title={data.label}>
          {data.label}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={cn('rounded-full px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide', t.badge)}>{t.label}</span>
        {data.hits ? (
          <span className="text-[9px] tabular-nums text-slate-400 dark:text-slate-500">{Number(data.hits).toLocaleString()} hits</span>
        ) : null}
      </div>
    </div>
  );
}

const NODE_TYPES = { lineageNode: LineageGraphNode };

function colX(depth: number) {
  return depth < 0 ? 0 : depth === 0 ? 300 : 600;
}

export default function LineageFlow({ object, db = 'RETAIL_DW', schema = 'SALES' }: { object: string; db?: string; schema?: string }) {
  const [graph, setGraph] = useState<{ nodes: LineageNode[]; edges: { source: string; target: string; kind: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessHistory, setAccessHistory] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    let active = true;
    setLoading(true);
    getObjectLineage({ database: db, schema, object, days: 30 })
      .then((r) => {
        if (!active) return;
        setGraph(r?.data ?? null);
        setAccessHistory(r?.meta?.access_history ?? true);
      })
      .catch(() => active && setGraph(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [object, db, schema]);

  const { nodes, edges } = useMemo(() => {
    const g = graph;
    if (!g) return { nodes: [] as Node[], edges: [] as Edge[] };
    const nodes: Node[] = g.nodes.map((n) => ({
      id: n.id,
      type: 'lineageNode',
      position: { x: colX(n.depth), y: (n.order ?? 0) * 84 + 10 },
      data: { label: n.label, kind: n.kind, hits: n.hits } satisfies LineageNodeData,
    }));
    const edges: Edge[] = g.edges.map((e, i) => {
      const isQuery = e.kind === 'query';
      const color = isQuery ? '#818cf8' : '#94a3b8';
      return {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        animated: isQuery,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        style: { stroke: color, strokeWidth: 1.2, strokeDasharray: isQuery ? '4 3' : undefined, opacity: 0.85 },
      };
    });
    return { nodes, edges };
  }, [graph]);

  const hasLineage = nodes.length > 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
        <Legend color="#38bdf8" label="Source / table" />
        <Legend color="#8b5cf6" label="Objet" />
        <Legend color="#f59e0b" label="Vue / consommateur" />
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="h-px w-4 bg-slate-400" /> structurel
          <span className="ml-2 h-px w-4 border-t border-dashed border-indigo-400" /> requêtes
        </span>
        {!accessHistory && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-600 dark:bg-amber-900/20">
            lignée structurelle uniquement (ACCESS_HISTORY indisponible)
          </span>
        )}
      </div>
      <div className="h-[360px] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">Calcul de la lignée…</div>
        ) : !hasLineage ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-xs text-gray-400">
            <span className="font-medium text-gray-500 dark:text-gray-300">{object}</span>
            Aucune lignée capturée (ni dépendance structurelle, ni accès requêté sur 30 j).
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color={isDark ? '#1e293b' : '#e2e8f0'} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!hidden md:!block !rounded-lg !border !border-slate-200 !bg-white/90 dark:!border-slate-700 dark:!bg-slate-900/90"
              maskColor={isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(241, 245, 249, 0.7)'}
              nodeColor={(node) => (KIND_STYLE[(node.data as LineageNodeData)?.kind] ?? KIND_STYLE.source).mini}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
