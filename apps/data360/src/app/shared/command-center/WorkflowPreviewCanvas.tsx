'use client';

import React, { useState, useMemo, useCallback } from 'react';
import ReactFlow, {
  Background, Controls, type Node, type Edge, ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Badge } from 'rizzui';
import { X } from 'lucide-react';
import cn from '@core/utils/class-names';
import { etlNodeTypes } from '@/app/(dashboard)/workflow/components/ETLNodeTypes';
import { getBlockByType } from '@/app/(dashboard)/workflow/components/etl-blocks';

interface WorkflowPreviewCanvasProps {
  steps: any[];
}

/** Convert backend steps to ReactFlow nodes + edges (read-only) */
function stepsToReadOnly(steps: any[]): { nodes: Node[]; edges: Edge[] } {
  const orderToNodeId: Record<string, string> = {};

  const nodes: Node[] = steps.map((step, idx) => {
    const payload = step.payload || {};
    const isSource = step.action_type === 'source' || step.action_type?.endsWith('_source');
    const sourceCount = steps.filter((s, i) => i < idx && (s.action_type === 'source' || s.action_type?.endsWith('_source'))).length;
    const nonSourceCount = steps.filter(s => s.action_type === 'source' || s.action_type?.endsWith('_source')).length;
    const nonSourceIdx = idx - steps.filter((s, i) => i <= idx && (s.action_type === 'source' || s.action_type?.endsWith('_source'))).length + (isSource ? 0 : nonSourceCount);
    const defaultPos = isSource
      ? { x: 50, y: 50 + sourceCount * 250 }
      : { x: 100 + nonSourceIdx * 350, y: 150 };
    const position = (payload.position as { x: number; y: number }) || defaultPos;
    const nodeId = (payload.nodeId as string) || step.step_id;
    orderToNodeId[String(step.step_order)] = nodeId;

    const { inputs: _i, cte_alias: _c, position: _p, nodeId: _n,
            input_step: _is, left_step: _ls, right_step: _rs, ...config } = payload;

    return {
      id: nodeId,
      type: step.action_type,
      position,
      data: { ...config, name: step.step_name, step_order: step.step_order, config },
    };
  });

  const edges: Edge[] = [];
  steps.forEach((step) => {
    const payload = step.payload || {};
    const nodeId = (payload.nodeId as string) || step.step_id;
    const inputs = (payload.inputs as string[]) || [];
    if (inputs.length > 0) {
      inputs.forEach((inputId) => {
        edges.push({ id: `${inputId}-${nodeId}`, source: inputId, target: nodeId, animated: true });
      });
    } else {
      const refs = [
        { key: 'input_step', prefix: 'ord' },
        { key: 'left_step', prefix: 'ord-l' },
        { key: 'right_step', prefix: 'ord-r' },
      ];
      refs.forEach(({ key, prefix }) => {
        const stepRef = payload[key];
        if (stepRef != null && orderToNodeId[String(stepRef)]) {
          edges.push({ id: `${prefix}-${stepRef}-${nodeId}`, source: orderToNodeId[String(stepRef)], target: nodeId, animated: true });
        }
      });
    }
  });

  return { nodes, edges };
}

export default function WorkflowPreviewCanvas({ steps }: WorkflowPreviewCanvasProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const { nodes, edges } = useMemo(() => stepsToReadOnly(steps), [steps]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  const selectedConfig = useMemo(() => {
    if (!selectedNode) return [];
    const config = selectedNode.data?.config || selectedNode.data || {};
    const skipKeys = new Set(['name', 'step_order', 'config', 'position', 'nodeId', 'inputs', 'cte_alias', 'input_step', 'left_step', 'right_step']);
    return Object.entries(config).filter(([k, v]) => !skipKeys.has(k) && v != null && v !== '');
  }, [selectedNode]);

  const blockDef = selectedNode ? getBlockByType(selectedNode.type || '') : null;

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className={cn('flex-1 bg-gray-50 dark:bg-gray-900', selectedNode && 'border-r border-gray-200 dark:border-gray-700')}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={etlNodeTypes}
            onNodeClick={onNodeClick}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            panOnDrag
            zoomOnScroll
            minZoom={0.3}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* Config sidebar */}
      {selectedNode && (
        <div className="w-80 overflow-y-auto bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {blockDef?.icon && <blockDef.icon className="h-4 w-4 text-blue-500" />}
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedNode.data?.name || selectedNode.type}
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </div>
            <Badge size="sm" variant="flat" color="secondary" className="font-mono">
              {selectedNode.type}
            </Badge>
          </div>
          <div className="p-4">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Configuration</h4>
            {selectedConfig.length === 0 ? (
              <p className="text-xs text-gray-400">No configuration</p>
            ) : (
              <div className="space-y-2.5">
                {selectedConfig.map(([key, value]) => (
                  <div key={key}>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">
                      {key.replace(/_/g, ' ')}
                    </div>
                    {typeof value === 'object' && value !== null ? (
                      <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <div className="text-xs text-gray-800 dark:text-gray-200 font-mono bg-gray-50 dark:bg-gray-900 rounded px-2 py-1">
                        {String(value)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
