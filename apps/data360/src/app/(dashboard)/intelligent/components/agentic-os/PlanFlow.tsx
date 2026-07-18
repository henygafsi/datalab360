'use client';

/**
 * Agentic OS — a generated plan as a CLICKABLE flow, never numbered prose.
 * Each node is mapped to a lifecycle step: clicking it activates that step
 * and prefills the discussion with the node's detail — the plan executes by
 * walking it, one validated step at a time.
 */
import { useMemo } from 'react';
import ReactFlow, { Background, type Edge, type Node, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { useSetAtom } from 'jotai';
import { STAGE_META, type LifecycleStage, type ProposedPlan } from './types';
import { activeStageAtom } from './store';

const STAGE_TONE: Record<string, string> = {
  sources: '#3b82f6',
  models: '#8b5cf6',
  ingestion: '#06b6d4',
  workflow: '#f59e0b',
  dashboards: '#10b981',
  questions: '#ec4899',
  dependencies: '#6b7280',
};

export default function PlanFlow({ plan }: { plan: ProposedPlan }) {
  const setActiveStage = useSetAtom(activeStageAtom);

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = plan.steps.map((s, i) => ({
      id: String(i),
      position: { x: (i % 3) * 210, y: Math.floor(i / 3) * 110 },
      data: {
        label: (
          <div style={{ fontSize: 10, textAlign: 'left', maxWidth: 180 }}>
            <div style={{ fontWeight: 700, fontSize: 11 }}>
              {i + 1}. {s.title}
            </div>
            <div style={{ color: '#6b7280', marginTop: 2 }}>{s.detail.slice(0, 90)}</div>
            <div style={{ color: STAGE_TONE[s.stage] ?? '#6b7280', fontWeight: 600, marginTop: 2 }}>
              → {STAGE_META[s.stage]?.label ?? s.stage}
            </div>
          </div>
        ),
      },
      style: {
        padding: '8px 10px',
        borderRadius: 10,
        border: `1.5px solid ${STAGE_TONE[s.stage] ?? '#d1d5db'}`,
        background: '#ffffff',
        cursor: 'pointer',
      },
    }));
    const edges: Edge[] = plan.steps.slice(1).map((_, i) => ({
      id: `e${i}`,
      source: String(i),
      target: String(i + 1),
      style: { stroke: '#d1d5db' },
    }));
    return { nodes, edges };
  }, [plan]);

  return (
    <div className="h-64 w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={(_, n) => {
            const step = plan.steps[Number(n.id)];
            if (!step) return;
            setActiveStage((step.stage in STAGE_META ? step.stage : 'sources') as LifecycleStage);
            window.dispatchEvent(
              new CustomEvent('agentic-os:prefill', { detail: { text: step.detail } }),
            );
          }}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
        >
          <Background gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
