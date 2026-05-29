'use client';

import React, { useMemo, useState, useCallback } from 'react';
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
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, Code2,
  Eye, ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { preDeployChecks } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import TableNode, { type TableNodeData } from '../TableNode';
import { assemblePlan, type DetectedModel } from './ai-guided-strategy';
import type { PreDeployChecksResult, IngestionMode } from '@/app/services/api/types';

interface StepValidatePlanProps {
  projectId: string;
  detectedModel: DetectedModel | null;
  ingestionModes: Record<string, IngestionMode>;
  preChecks: PreDeployChecksResult | null;
  onPreChecksChange: (r: PreDeployChecksResult) => void;
  /** superadmin / QA get the full DDL block expanded by default. */
  fullDetail: boolean;
}

const nodeTypes = { tableNode: TableNode };

const statusStyle: Record<string, { icon: React.ElementType; color: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-emerald-600' },
  FAIL: { icon: XCircle, color: 'text-red-600' },
  WARN: { icon: AlertTriangle, color: 'text-amber-600' },
};

const StepValidatePlan: React.FC<StepValidatePlanProps> = ({
  projectId,
  detectedModel,
  ingestionModes,
  preChecks,
  onPreChecksChange,
  fullDetail,
}) => {
  const [running, setRunning] = useState(false);
  const [ddlOpen, setDdlOpen] = useState(fullDetail);

  const plan = useMemo(
    () => (detectedModel ? assemblePlan(detectedModel, ingestionModes) : null),
    [detectedModel, ingestionModes],
  );

  // ── Live read-only mini-canvas (no html-to-image / html2canvas in deps,
  //    so we render an actual ReactFlow snapshot the approver can eyeball). ──
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

  const runChecks = useCallback(async () => {
    setRunning(true);
    try {
      const res = await preDeployChecks(projectId, {});
      onPreChecksChange(res);
      if (res.all_passed) toast.success('All pre-deploy checks passed');
      else toast.error('Pre-deploy checks found issues');
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Pre-deploy checks failed');
    } finally {
      setRunning(false);
    }
  }, [projectId, onPreChecksChange]);

  if (!plan || !detectedModel) {
    return (
      <div className="p-12 text-center text-sm text-slate-400">
        No plan to validate yet.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-purple-500" />
          Validate the plan
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Run real pre-deploy checks, review the generated DDL, and capture a
          visual record of the model for the approval.
        </p>
      </div>

      {/* Pre-deploy checks */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Pre-deployment checks
          </span>
          <button
            onClick={runChecks}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            Run checks
          </button>
        </div>
        {preChecks ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {preChecks.checks.map((c) => {
              const cfg = statusStyle[c.status] ?? statusStyle.WARN;
              const Icon = cfg.icon;
              return (
                <div
                  key={c.check}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                    {c.check.replace(/_/g, ' ')}
                  </span>
                  <span className={cn('text-[10px] font-semibold', cfg.color)}>
                    {c.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-3 py-4 text-center text-[11px] text-slate-400">
            Run checks to validate the model before approval.
          </p>
        )}
      </div>

      {/* DDL preview */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setDdlOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
        >
          <span className="flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5 text-slate-500" />
            DDL preview ({plan.ddlStatements.length} statements)
          </span>
          {ddlOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>
        {ddlOpen && (
          <pre className="max-h-64 overflow-auto border-t border-slate-200 bg-slate-900 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-100 dark:border-slate-700">
            {plan.ddlStatements.join('\n\n')}
          </pre>
        )}
      </div>

      {/* Visual snapshot — live read-only mini-canvas */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Visual record — model snapshot
        </div>
        <div className="h-64 bg-slate-50 dark:bg-slate-900/50">
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
              panOnDrag
              zoomOnScroll={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        <p className="border-t border-slate-200 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-700">
          Live read-only canvas — attached to the approval record so a reviewer
          can eyeball the model shape.
        </p>
      </div>
    </div>
  );
};

export default StepValidatePlan;
