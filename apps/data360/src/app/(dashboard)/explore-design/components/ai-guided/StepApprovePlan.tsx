'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Table2, Columns3, Link2, Code2, RefreshCw, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import TableNode, { type TableNodeData } from '../TableNode';
import { assemblePlan, type DetectedModel } from './ai-guided-strategy';
import type { IngestionMode, PreDeployChecksResult } from '@/app/services/api/types';

interface StepApprovePlanProps {
  detectedModel: DetectedModel | null;
  ingestionModes: Record<string, IngestionMode>;
  preChecks: PreDeployChecksResult | null;
  /** superadmin / QA see the full DDL list inline. */
  fullDetail: boolean;
}

const nodeTypes = { tableNode: TableNode };

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
}
const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
    <Icon className="h-4 w-4 text-purple-500" />
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  </div>
);

const StepApprovePlan: React.FC<StepApprovePlanProps> = ({
  detectedModel,
  ingestionModes,
  preChecks,
  fullDetail,
}) => {
  const plan = useMemo(
    () => (detectedModel ? assemblePlan(detectedModel, ingestionModes) : null),
    [detectedModel, ingestionModes],
  );

  const { miniNodes, miniEdges } = useMemo(() => {
    if (!detectedModel) return { miniNodes: [] as Node<TableNodeData>[], miniEdges: [] as Edge[] };
    const nodes: Node<TableNodeData>[] = detectedModel.tables.map((t, i) => ({
      id: t.ref.table,
      type: 'tableNode',
      position: { x: (i % 3) * 240, y: Math.floor(i / 3) * 220 },
      draggable: false,
      data: {
        id: t.ref.table,
        database: t.ref.database,
        schema: t.ref.schema,
        table: t.ref.table,
        status: 'configured',
        compact: true,
        columns: t.columns
          .filter((c) => c.accepted)
          .map((c) => ({
            name: c.name,
            dataType: c.dataType,
            isPrimaryKey: c.isPrimaryKey,
            isSensitive: c.isPii,
          })),
      },
    }));
    const edges: Edge[] = detectedModel.relationships
      .filter((r) => r.accepted)
      .map((r) => ({
        id: r.id,
        source: r.sourceTable,
        target: r.targetTable,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#a855f7' },
      }));
    return { miniNodes: nodes, miniEdges: edges };
  }, [detectedModel]);

  if (!plan) {
    return (
      <div className="p-12 text-center text-sm text-slate-400">
        Nothing to approve yet.
      </div>
    );
  }

  const dominantMode =
    plan.ingestionTasks[0]?.mode.replace(/_/g, ' ') ?? 'full refresh';

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
          <CheckCircle2 className="h-4 w-4 text-purple-500" />
          Approve the plan
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Review the summary, then approve to continue to deployment.
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard icon={Table2} label="Tables" value={plan.tables.length} />
        <StatCard icon={Columns3} label="Columns" value={plan.columnCount} />
        <StatCard icon={Link2} label="Relationships" value={plan.relationships.length} />
        <StatCard icon={Code2} label="DDL statements" value={plan.ddlStatements.length} />
        <StatCard icon={RefreshCw} label="Ingestion mode" value={dominantMode} />
        <StatCard
          icon={preChecks?.all_passed ? CheckCircle2 : AlertTriangle}
          label="Pre-checks"
          value={preChecks ? (preChecks.all_passed ? 'Passed' : 'Issues') : 'Not run'}
        />
      </div>

      {/* Pre-check warning if not run / failed */}
      {(!preChecks || !preChecks.all_passed) && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {preChecks
            ? 'Pre-deploy checks reported issues — review them before deployment.'
            : 'Pre-deploy checks were not run. You can still approve, but deployment will re-check.'}
        </div>
      )}

      {/* Visual snapshot */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          Model snapshot
        </div>
        <div className="h-56 bg-slate-50 dark:bg-slate-900/50">
          <ReactFlowProvider>
            <ReactFlow
              nodes={miniNodes}
              edges={miniEdges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>

      {/* Per-table ingestion + DDL detail (superadmin / QA) */}
      {fullDetail && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
            Ingestion tasks
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {plan.ingestionTasks.map((t) => (
              <div
                key={t.table}
                className="flex items-center justify-between px-3 py-1.5 text-[11px]"
              >
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {t.table}
                </span>
                <span
                  className={cn(
                    'rounded bg-purple-100 px-1.5 py-0.5 font-semibold text-purple-700',
                    'dark:bg-purple-900/40 dark:text-purple-300',
                  )}
                >
                  {t.mode.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StepApprovePlan;
