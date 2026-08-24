'use client';

/**
 * Agentic OS — generated data model as a REAL flow: table blocks with their
 * actual columns inside (fetched, not guessed), join edges labeled by key.
 * This is the "ready thing with preview" — validation happens on the card's
 * create button, not in prose.
 */
import { useMemo } from 'react';
import ReactFlow, { Background, type Edge, type Node, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import type { ProposedModel } from './types';

function short(fqn: string): string {
  return fqn.split('.').slice(-1)[0];
}

function TableBlock({ fqn, columns, isFact }: { fqn: string; columns: string[]; isFact: boolean }) {
  return (
    <div style={{ fontSize: 10, lineHeight: 1.35, textAlign: 'left', maxWidth: 170 }}>
      <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2 }}>
        {isFact ? '★ ' : ''}
        {short(fqn)}
      </div>
      {columns.slice(0, 8).map((c) => (
        <div key={c} style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c}
        </div>
      ))}
      {columns.length > 8 && <div style={{ color: '#9ca3af' }}>… +{columns.length - 8}</div>}
    </div>
  );
}

export default function ModelFlow({ model }: { model: ProposedModel }) {
  const { nodes, edges } = useMemo(() => {
    const all = [model.fact, ...model.dims];
    const nodes: Node[] = all.map((fqn, i) => {
      const isFact = fqn === model.fact;
      return {
        id: short(fqn),
        position: isFact
          ? { x: 220, y: 90 }
          : { x: (i - 1) % 2 === 0 ? 0 : 440, y: 20 + Math.floor((i - 1) / 2) * 150 },
        data: {
          label: (
            <TableBlock
              fqn={fqn}
              columns={model.columns[fqn] ?? model.columns[short(fqn)] ?? []}
              isFact={isFact}
            />
          ),
        },
        style: {
          padding: '8px 10px',
          borderRadius: 10,
          border: `1.5px solid ${isFact ? '#10b981' : '#93c5fd'}`,
          background: isFact ? '#ecfdf5' : '#ffffff',
        },
      };
    });
    const edges: Edge[] = model.joins.map((j, i) => ({
      id: `j${i}`,
      source: short(j.from),
      target: short(j.to),
      label: j.key,
      labelStyle: { fontSize: 9, fill: '#6b7280' },
      style: { stroke: '#93c5fd' },
    }));
    return { nodes, edges };
  }, [model]);

  return (
    <div className="h-72 w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          zoomOnScroll={false}
        >
          <Background gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
