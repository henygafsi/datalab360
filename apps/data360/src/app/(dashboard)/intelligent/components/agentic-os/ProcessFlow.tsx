'use client';

/**
 * Agentic OS — process map (ReactFlow): the 7 lifecycle steps of the stored
 * process as a validated flow. Node tone = step state (done / active /
 * untouched), badge = number of stored discussion turns on that step.
 * Read-only visual validation — clicking a node activates the step.
 */
import { useMemo } from 'react';
import ReactFlow, { Background, type Edge, type Node, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { useAtom, useAtomValue } from 'jotai';
import { STAGE_META, STAGE_ORDER, type AgentMessage, type LifecycleStage } from './types';
import { activeStageAtom, touchedStagesAtom } from './store';

function nodeStyle(state: 'done' | 'active' | 'idle', selected: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    border: `1.5px solid ${selected ? '#2563eb' : state === 'done' ? '#10b981' : state === 'active' ? '#f59e0b' : '#d1d5db'}`,
    background: state === 'done' ? '#ecfdf5' : state === 'active' ? '#fffbeb' : '#ffffff',
    color: '#374151',
  };
}

export default function ProcessFlow({ messages }: { messages: AgentMessage[] }) {
  const [activeStage, setActiveStage] = useAtom(activeStageAtom);
  const touched = useAtomValue(touchedStagesAtom);

  const { nodes, edges } = useMemo(() => {
    const counts: Partial<Record<LifecycleStage, number>> = {};
    for (const m of messages) {
      if (m.kind !== 'guide') counts[m.stage] = (counts[m.stage] ?? 0) + 1;
    }
    const nodes: Node[] = STAGE_ORDER.map((s, i) => {
      const state = touched[s] === 'done' ? 'done' : touched[s] === 'active' ? 'active' : 'idle';
      const c = counts[s] ?? 0;
      return {
        id: s,
        position: { x: (i % 4) * 150, y: Math.floor(i / 4) * 70 },
        data: { label: `${STAGE_META[s].label}${c ? ` · ${c}` : ''}` },
        style: nodeStyle(state, activeStage === s),
      };
    });
    const edges: Edge[] = STAGE_ORDER.slice(1).map((s, i) => ({
      id: `e${i}`,
      source: STAGE_ORDER[i],
      target: s,
      animated: touched[s] === 'active',
      style: { stroke: '#d1d5db' },
    }));
    return { nodes, edges };
  }, [messages, touched, activeStage]);

  return (
    <div className="h-44 w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={(_, n) => setActiveStage(n.id as LifecycleStage)}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
          panOnDrag={false}
        >
          <Background gap={16} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
