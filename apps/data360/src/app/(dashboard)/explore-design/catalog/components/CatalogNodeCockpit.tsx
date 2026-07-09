'use client';

/**
 * CatalogNodeCockpit — the level-aware right rail for the catalog canvas.
 *
 * One rail, three levels (the node kind decides, never a different component):
 *   • schema  → identity (type · zone · owner · created) + inventory KPIs
 *   • product → status + anchor
 *   • project → owner · created · environments · deployed objects
 *
 * Axis tabs mirror the CDO board (Overview · DQ · Governance · Cost · Perf ·
 * Modeling), and every call-to-action is an {@link InsightActionButton}: a
 * labelled, described, honestly-gated action — never a bare button. The
 * "Enrich type" actions write a real TAG_ASSIGNED event through
 * POST /catalog/schemas/{db}/{schema}/classify.
 */

import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Coins,
  Database,
  FolderKanban,
  Gauge,
  Package,
  ShieldCheck,
  Sparkles,
  Tags,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import {
  classifyCatalogSchema,
  type CatalogGraphNode,
  type SchemaType,
} from '@/app/services/catalog/graph';

type AxisId = 'overview' | 'dq' | 'gov' | 'cost' | 'perf' | 'modeling';

const AXES: Array<{ id: AxisId; label: string; icon: React.ElementType; blurb: string }> = [
  { id: 'overview', label: 'Overview', icon: Boxes, blurb: 'Identity, ownership and inventory of this node.' },
  { id: 'dq', label: 'Quality', icon: Sparkles, blurb: 'Completeness, freshness and rule breaches.' },
  { id: 'gov', label: 'Governance', icon: ShieldCheck, blurb: 'Masking, row-access and tag coverage.' },
  { id: 'cost', label: 'Cost', icon: Coins, blurb: 'Storage and compute attributable to this node.' },
  { id: 'perf', label: 'Performance', icon: Gauge, blurb: 'Query latency, queueing and spill.' },
  { id: 'modeling', label: 'Modeling', icon: Tags, blurb: 'Keys, relations and star-schema conformity.' },
];

const TYPES: SchemaType[] = ['SOURCE', 'PRODUCT', 'PROJECT', 'UNCLASSIFIED'];

function bytes(b?: number): string {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <dt className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[11px] font-medium text-slate-700 dark:text-slate-200">
        {value ?? '—'}
      </dd>
    </div>
  );
}

/** Axis body that has no dedicated feeder yet: honest, never a fake number. */
function AxisPending({ blurb }: { blurb: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
      {blurb} Select a table on the canvas to open its scored cockpit — schema-level
      rollups for this axis are not computed yet on this environment.
    </p>
  );
}

export interface CatalogNodeCockpitProps {
  node: CatalogGraphNode;
  onClose: () => void;
  onClassified?: () => void;
}

export default function CatalogNodeCockpit({ node, onClose, onClassified }: CatalogNodeCockpitProps) {
  const [axis, setAxis] = useState<AxisId>('overview');

  const Icon = node.kind === 'database' ? Database
    : node.kind === 'product' ? Package
    : node.kind === 'project' ? FolderKanban
    : Boxes;

  const isSchema = node.kind === 'schema';
  const [db, schema] = useMemo(() => {
    if (!isSchema) return [null, null] as const;
    const fqn = node.id.replace(/^schema:/, '');
    const dot = fqn.indexOf('.');
    return [fqn.slice(0, dot), fqn.slice(dot + 1)] as const;
  }, [isSchema, node.id]);

  return (
    <aside className="flex h-full min-h-[560px] w-80 shrink-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Identity header */}
      <header className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{node.label}</h2>
          <p className="truncate text-[11px] capitalize text-slate-500 dark:text-slate-400">
            {node.kind}
            {node.schema_type ? ` · ${node.schema_type.toLowerCase()}` : ''}
            {node.database ? ` · ${node.database}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cockpit"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Axis rail — same axes on every level (model/table based) */}
      <nav role="tablist" aria-label="Cockpit axes" className="flex gap-0.5 overflow-x-auto border-b border-slate-100 px-2 py-1 dark:border-slate-800">
        {AXES.map((a) => {
          const AIcon = a.icon;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={axis === a.id}
              title={a.blurb}
              onClick={() => setAxis(a.id)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                axis === a.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              <AIcon className="h-3 w-3" />
              {a.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {AXES.find((a) => a.id === axis)?.blurb}
        </p>

        {axis === 'overview' ? (
          <dl className="rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
            {isSchema && (
              <>
                <Fact label="Type" value={node.schema_type} />
                <Fact label="Zone" value={node.zone ?? '—'} />
                <Fact label="Classified by" value={node.classified_by} />
                <Fact label="Owner" value={node.owner} />
                <Fact label="Created" value={node.created?.slice(0, 10)} />
                <Fact label="Tables" value={node.kpis?.tables ?? 0} />
                <Fact label="Rows" value={(node.kpis?.rows ?? 0).toLocaleString()} />
                <Fact label="Size" value={bytes(node.kpis?.bytes)} />
              </>
            )}
            {node.kind === 'project' && (
              <>
                <Fact label="Owner" value={node.owner} />
                <Fact label="Created" value={node.created?.slice(0, 10)} />
                <Fact label="Type" value={node.project_type} />
                <Fact label="Environments" value={(node.environments ?? []).join(', ') || 'dev'} />
                <Fact label="Deployed objects" value={node.objects ?? 0} />
              </>
            )}
            {node.kind === 'product' && (
              <>
                <Fact label="Status" value={node.status ?? 'DRAFT'} />
                <Fact label="Anchor" value={node.anchor_fqn} />
              </>
            )}
            {node.kind === 'database' && <Fact label="Scope" value="Database container" />}
          </dl>
        ) : (
          <AxisPending blurb={AXES.find((a) => a.id === axis)!.blurb} />
        )}

        {/* Contextual actions — rich, described, honestly gated */}
        {isSchema && db && schema && (
          <section className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Enrich classification
            </h3>
            <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Persists the TYPE on this schema and records a governed{' '}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">TAG_ASSIGNED</code> event
              in the Data360 event store. Auto-detection stays as the fallback.
            </p>
            {TYPES.filter((t) => t !== node.schema_type).map((t) => (
              <InsightActionButton
                key={t}
                label={`Mark as ${t.toLowerCase()}`}
                icon={Tags}
                size="sm"
                variant="subtle"
                successToast={`${schema} classified as ${t.toLowerCase()}`}
                unavailableHint="Schema classification is not enabled on this backend."
                onAction={async () => {
                  await classifyCatalogSchema(db, schema, t, node.zone ?? null);
                  onClassified?.();
                }}
              />
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
