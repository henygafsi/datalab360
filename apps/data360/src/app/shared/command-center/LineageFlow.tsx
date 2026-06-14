'use client';

/**
 * LineageFlow — interactive object lineage (React Flow), fed by the REAL
 * /command-center/object-lineage endpoint: structural (OBJECT_DEPENDENCIES) +
 * query-derived (ACCESS_HISTORY) 1-hop graph keyed by FQN.
 *
 * Upstream sources/views (left) → the object (centre) → downstream consumers
 * (right). Honest empty state when an object has no captured lineage.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { getObjectLineage, type LineageNode } from '@/app/services/command-center';

const KIND_STYLE: Record<string, React.CSSProperties> = {
  source: { background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155' },
  object: { background: '#eef2ff', border: '2px solid #6366f1', color: '#3730a3', fontWeight: 600 },
  view: { background: '#e0f2fe', border: '1px solid #38bdf8', color: '#075985' },
};
const base: React.CSSProperties = { borderRadius: 8, padding: '6px 10px', fontSize: 11, width: 170 };

function colX(depth: number) {
  return depth < 0 ? 0 : depth === 0 ? 300 : 600;
}

export default function LineageFlow({ object, db = 'RETAIL_DW', schema = 'SALES' }: { object: string; db?: string; schema?: string }) {
  const [graph, setGraph] = useState<{ nodes: LineageNode[]; edges: { source: string; target: string; kind: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessHistory, setAccessHistory] = useState(true);

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
      position: { x: colX(n.depth), y: (n.order ?? 0) * 80 + 10 },
      data: { label: `${n.label}${n.hits ? `  ·  ${n.hits}` : ''}` },
      style: { ...base, ...(KIND_STYLE[n.kind] ?? KIND_STYLE.source) },
    }));
    const edges: Edge[] = g.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      animated: e.kind === 'query',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: e.kind === 'query' ? '#818cf8' : '#94a3b8', strokeDasharray: e.kind === 'query' ? '4 3' : undefined },
    }));
    return { nodes, edges };
  }, [graph]);

  const hasLineage = nodes.length > 1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
        <Legend color="#cbd5e1" label="Source / table" />
        <Legend color="#6366f1" label="Objet" />
        <Legend color="#38bdf8" label="Vue / consommateur" />
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
          <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable={false} nodesConnectable={false}>
            <Background gap={16} color="#e2e8f0" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" />
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
