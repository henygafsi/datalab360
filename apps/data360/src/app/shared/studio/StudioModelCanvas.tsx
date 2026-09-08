'use client';

/**
 * StudioModelCanvas — the data-model canvas of one application.
 *
 * Three modes, one renderer:
 *  - 'target'  — the TARGET model the application builds (default in the
 *    workspace): every node is a physical target table with its real
 *    columns, grain, state and producer process;
 *  - 'mapping' — sources on the left, targets on the right, one edge per
 *    source→target load with the mapped column count;
 *  - 'sources' — the understood source entities only (legacy view, still
 *    used by the standalone model page).
 *
 * Honesty rules:
 *  - a key icon means a DECLARED grain key; an identifier outside the
 *    grain renders as a candidate, never as a primary key;
 *  - volumes say what they describe (source rows vs target rows at the
 *    last run) — never a bare number;
 *  - a proposed grain or hypothesis edge renders as proposed (dashed),
 *    never silently promoted to fact.
 */

import { memo, useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { BarChart3, Clock, Fingerprint, Key, Table2, Tag } from 'lucide-react';
import {
  grainText,
  relEndpoints,
  type ModelGrain,
  type StudioChartSpec,
  type StudioDataSource,
  type ModelTable,
  type StudioModelView as ModelPayload,
  type StudioReportSpec,
  type StudioTarget,
} from '@/app/services/studio/studio-api';

/* ── shared column-role vocabulary ──────────────────────────────────── */

type ColRole = 'key' | 'candidate' | 'time' | 'watermark' | 'dedup' | 'measure' | 'dimension';

const ROLE_META: Record<ColRole, { icon: typeof Key; cls: string; label: string }> = {
  key: { icon: Key, cls: 'text-amber-500', label: 'grain key (declared)' },
  candidate: { icon: Fingerprint, cls: 'text-slate-400', label: 'identifier — candidate key' },
  time: { icon: Clock, cls: 'text-sky-500', label: 'time field' },
  watermark: { icon: Clock, cls: 'text-slate-400', label: 'watermark' },
  dedup: { icon: Fingerprint, cls: 'text-violet-400', label: 'dedup key' },
  measure: { icon: BarChart3, cls: 'text-emerald-500', label: 'measure' },
  dimension: { icon: Tag, cls: 'text-slate-400', label: 'dimension' },
};

export function grainKeysOf(g: ModelTable['grain'] | StudioTarget['grain']): string[] {
  if (g && typeof g === 'object' && Array.isArray((g as ModelGrain).key))
    return ((g as ModelGrain).key ?? []).map((k) => String(k).toUpperCase());
  return [];
}

/** Role of one real column, grain-aware — identifiers only become keys
 *  when the grain declares them. */
export function columnRole(
  c: { name: string; role?: string },
  grainKeys: string[],
): ColRole {
  const inGrain = grainKeys.includes(c.name.toUpperCase());
  if (inGrain) return 'key';
  const r = String(c.role ?? '').toLowerCase();
  if (r === 'identifier' || r === 'key') return 'candidate';
  if (r === 'time' || r === 'date') return 'time';
  if (r === 'measure') return 'measure';
  return 'dimension';
}

const fmtRows = (n?: number | null): string | null =>
  n == null
    ? null
    : Math.abs(n) >= 1e9
      ? `${(n / 1e9).toFixed(1)}B`
      : Math.abs(n) >= 1e6
        ? `${(n / 1e6).toFixed(1)}M`
        : Math.abs(n) >= 1e3
          ? `${(n / 1e3).toFixed(1)}k`
          : n.toLocaleString();

const STATE_CLS: Record<string, string> = {
  verified: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  running: 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  loaded: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  controlled: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  created: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  validated: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  proposed: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  degraded: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  configured: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

/* ── node data ──────────────────────────────────────────────────────── */

interface NodeColumn {
  name: string;
  type?: string;
  role: ColRole;
  nullable?: boolean;
  detail?: string;
}

export interface StudioTableNodeData {
  name: string;
  schemaTable: string;
  /** e.g. « 12 rows (source) », « 11 rows at last run » — always labeled. */
  rowsLabel?: string | null;
  description?: string | null;
  kind?: string | null;
  fieldsTotal?: number | null;
  grainStatus?: string | null;
  grainSentence?: string | null;
  state?: string;
  stateReason?: string;
  ingestion?: string | null;
  columns: NodeColumn[];
  moreColumns: number;
  footNote?: string | null;
}

function StudioTableNodeInner({ data, selected }: NodeProps<StudioTableNodeData>) {
  return (
    <div
      className={`w-[252px] rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900 ${
        selected ? 'border-accent-500 ring-2 ring-accent-500' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="rounded-t-xl border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/60">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Table2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-500" />
            <span
              className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100"
              title={data.description ?? data.name}
            >
              {data.name}
            </span>
          </span>
          {data.kind && (
            <span className="shrink-0 rounded-full border border-slate-200 px-1.5 py-px text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {data.kind}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-slate-400 dark:text-slate-500" title={data.schemaTable}>
          {data.schemaTable}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {data.state && (
            <span
              className={`rounded-full px-1.5 py-px text-xs ${STATE_CLS[data.state] ?? STATE_CLS.configured}`}
              title={data.stateReason}
            >
              {data.state}
            </span>
          )}
          {data.grainStatus && (
            <span
              className={`rounded-full px-1.5 py-px text-xs ${
                data.grainStatus === 'confirmed'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }`}
              title={data.grainSentence ?? undefined}
            >
              grain {data.grainStatus}
            </span>
          )}
          {data.ingestion && (
            <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {data.ingestion}
            </span>
          )}
          {data.rowsLabel && (
            <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {data.rowsLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="px-1.5 py-1">
        {data.columns.slice(0, 8).map((c) => {
          const meta = ROLE_META[c.role];
          const RoleIcon = meta.icon;
          return (
            <li
              key={c.name}
              className={`flex items-center justify-between gap-2 rounded px-1.5 py-[3px] text-[12px] ${
                c.role === 'key' ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''
              }`}
              title={`${c.name} · ${c.type ?? '—'}${c.nullable === false ? ' · not null' : ''} · ${meta.label}${c.detail ? ` · ${c.detail}` : ''}`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <RoleIcon aria-hidden className={`h-3 w-3 shrink-0 ${meta.cls}`} />
                <span className="truncate font-mono text-slate-700 dark:text-slate-300">{c.name}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">
                {(c.type ?? '').split('(')[0]}
              </span>
            </li>
          );
        })}
        {data.moreColumns > 0 && (
          <li className="px-1.5 py-[2px] text-xs text-slate-400 dark:text-slate-500">
            +{data.moreColumns} more — click the table
          </li>
        )}
        {data.columns.length === 0 && (
          <li className="px-1.5 py-[3px] text-[12px] text-slate-400 dark:text-slate-500">
            no columns known yet
          </li>
        )}
      </ul>

      {data.footNote && (
        <div className="rounded-b-xl border-t border-slate-100 px-2.5 py-1 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {data.footNote}
        </div>
      )}

      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-accent-500 dark:!border-slate-900" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 dark:!border-slate-900" />
    </div>
  );
}
const StudioTableNode = memo(StudioTableNodeInner);
const NODE_TYPES = { studioTable: StudioTableNode };

/* ── cardinality vocabulary ─────────────────────────────────────────── */

export function cardinalityGlyph(c?: unknown): string {
  const v = String(c ?? '').toLowerCase();
  if (v === 'many_to_one' || v === 'n:1') return 'N → 1';
  if (v === 'one_to_many' || v === '1:n') return '1 → N';
  if (v === 'one_to_one' || v === '1:1') return '1 — 1';
  if (v === 'many_to_many' || v === 'n:n') return 'N — N';
  return '⋈';
}

const RISK_STROKE: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
};

/* ── source-node assembly (legacy 'sources' mode) ───────────────────── */

function specCols(spec: StudioChartSpec): { measures: string[]; dimensions: string[] } {
  return {
    measures: (spec.measures ?? [])
      .map((m) => (m.column ? `${m.aggregator ?? 'SUM'}(${m.column})` : null))
      .filter((x): x is string => x != null),
    dimensions: (spec.dimensions ?? []).map((d) => (typeof d === 'string' ? d : d.column)),
  };
}

function usedColumns(t: ModelTable, report?: StudioReportSpec | null): NodeColumn[] {
  const out: NodeColumn[] = [];
  const seen = new Set<string>();
  const gk = grainKeysOf(t.grain);
  const push = (name: string | null | undefined, role: ColRole, detail?: string) => {
    if (!name) return;
    const k = name.toUpperCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name, role, detail });
  };
  for (const k of gk) push(k, 'key');
  if (t.grain && typeof t.grain === 'object')
    push((t.grain as { time_field?: string }).time_field, 'time');
  const ec = (t.event_contract ?? {}) as { watermark?: string | null; dedup_key?: string[] };
  push(ec.watermark ?? undefined, 'watermark');
  for (const k of ec.dedup_key ?? []) push(k, 'dedup');
  const fqn = t.fqn.toUpperCase();
  for (const spec of [...(report?.kpis ?? []), ...(report?.charts ?? [])]) {
    if (typeof spec !== 'object' || spec == null) continue;
    const ds = spec.dataset;
    if (!ds || `${ds.database}.${ds.schema}.${ds.table}`.toUpperCase() !== fqn) continue;
    const { measures, dimensions } = specCols(spec);
    for (const m of measures) push(m.replace(/^[A-Z_]+\(|\)$/g, ''), 'measure', m);
    for (const d of dimensions) push(d, 'dimension');
  }
  return out;
}

function sourceNodeData(
  t: ModelTable,
  report: StudioReportSpec | null,
  dsrc?: StudioDataSource,
): StudioTableNodeData {
  const [, schema = '', table = ''] = t.fqn.split('.');
  const g = t.grain && typeof t.grain === 'object' ? (t.grain as Record<string, unknown>) : null;
  const gk = grainKeysOf(t.grain);
  const real = Array.isArray((t as { columns?: unknown }).columns)
    ? ((t as { columns?: Array<{ name: string; type?: string; role?: string; nullable?: boolean }> })
        .columns ?? [])
    : [];
  const columns: NodeColumn[] =
    real.length > 0
      ? real.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          role: columnRole(c, gk),
        }))
      : usedColumns(t, report);
  const fieldsTotal = typeof t.fields === 'number' ? t.fields : (t.fields?.length ?? null);
  return {
    name: t.name,
    schemaTable: `${schema}.${table}`,
    rowsLabel: fmtRows(t.row_count_approx) ? `${fmtRows(t.row_count_approx)} rows (source)` : null,
    description: t.description,
    kind: 'source',
    fieldsTotal,
    grainStatus: (g?.status as string) ?? null,
    grainSentence: grainText(t.grain),
    state: dsrc?.state,
    stateReason: dsrc?.state_reason,
    ingestion: t.ingestion?.ingestion_type ?? null,
    columns,
    moreColumns: Math.max(0, columns.length - 8),
    footNote: fieldsTotal != null ? `${fieldsTotal} columns in the source table` : null,
  };
}

function targetNodeData(t: StudioTarget, rowsAtLastRun?: number | null): StudioTableNodeData {
  const parts = (t.target_fqn ?? '').split('.');
  const gk = grainKeysOf(t.grain);
  const columns: NodeColumn[] = (t.columns ?? []).map((c) => ({
    name: c.name,
    type: c.type,
    nullable: c.nullable,
    role: columnRole(c, gk),
    detail: c.expression
      ? `= ${c.expression}`
      : c.source?.column
        ? `from ${(c.source.fqn ?? '').split('.').slice(-1)[0]}.${c.source.column}`
        : undefined,
  }));
  const grain = t.grain;
  const grainStatus =
    grain && typeof grain === 'object' ? ((grain as ModelGrain).status ?? null) : grain ? 'stated' : null;
  return {
    name: t.name,
    schemaTable: parts.length >= 2 ? parts.slice(-2).join('.') : (t.target_fqn ?? '—'),
    rowsLabel:
      rowsAtLastRun != null
        ? `${fmtRows(rowsAtLastRun)} rows at last run`
        : t.state === 'proposed'
          ? 'not created yet'
          : null,
    kind: t.kind ?? null,
    fieldsTotal: t.columns?.length ?? null,
    grainStatus,
    grainSentence: typeof grain === 'string' ? grain : grainText(grain as ModelTable['grain']),
    state: t.state,
    ingestion: null,
    columns,
    moreColumns: Math.max(0, columns.length - 8),
    footNote: t.columns?.length ? `${t.columns.length} columns in the target` : null,
  };
}

/* ── the canvas ─────────────────────────────────────────────────────── */

export default function StudioModelCanvas({
  model,
  data,
  report,
  targets,
  rowsByTarget,
  mode = 'sources',
  height = 480,
  onSelectTable,
  selectedEntity,
}: {
  model: ModelPayload;
  /** /data contract sources by fqn — state chips when available. */
  data?: Map<string, StudioDataSource> | null;
  report?: StudioReportSpec | null;
  /** The target model (mode 'target' and 'mapping'). */
  targets?: StudioTarget[];
  /** target_id → rows in the target at the last run (labeled honestly). */
  rowsByTarget?: Map<string, number | null>;
  mode?: 'sources' | 'target' | 'mapping';
  height?: number;
  /** Node ids are `t:<target_id>` for targets, `s:<entity_id>` for sources
   *  in mixed views; the legacy sources mode keeps bare entity ids. */
  onSelectTable?: (nodeId: string) => void;
  selectedEntity?: string | null;
}) {
  const { nodes, edges } = useMemo((): { nodes: Node<StudioTableNodeData>[]; edges: Edge[] } => {
    const rep = report ?? model.report ?? null;
    const tables = model.tables ?? [];
    const tgts = targets ?? [];

    if (mode === 'target') {
      const perRow = 3;
      const nodes = tgts.map((t, i) => ({
        id: `t:${t.target_id}`,
        type: 'studioTable' as const,
        position: { x: 24 + (i % perRow) * 300, y: 24 + Math.floor(i / perRow) * 360 },
        selected: selectedEntity === `t:${t.target_id}`,
        data: targetNodeData(t, rowsByTarget?.get(t.target_id)),
      }));
      return { nodes, edges: [] };
    }

    if (mode === 'mapping') {
      const srcNodes = tables.map((t, i) => ({
        id: `s:${t.entity_id ?? `i${i}`}`,
        type: 'studioTable' as const,
        position: { x: 24, y: 24 + i * 360 },
        selected: selectedEntity === `s:${t.entity_id}`,
        data: sourceNodeData(t, rep, data?.get(t.fqn)),
      }));
      const tgtNodes = tgts.map((t, i) => ({
        id: `t:${t.target_id}`,
        type: 'studioTable' as const,
        position: { x: 640, y: 24 + i * 360 },
        selected: selectedEntity === `t:${t.target_id}`,
        data: targetNodeData(t, rowsByTarget?.get(t.target_id)),
      }));
      const byFqn = new Map(
        tables.map((t, i) => [t.fqn.toUpperCase(), `s:${t.entity_id ?? `i${i}`}`]),
      );
      const edges: Edge[] = [];
      for (const t of tgts) {
        const counts = new Map<string, number>();
        for (const c of t.columns ?? []) {
          const f = c.source?.fqn?.toUpperCase();
          if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
        }
        for (const [fqn, n] of counts) {
          const sid = byFqn.get(fqn);
          if (!sid) continue;
          edges.push({
            id: `map-${t.target_id}-${fqn}`,
            source: sid,
            target: `t:${t.target_id}`,
            type: 'smoothstep',
            label: `loads · ${n} col${n > 1 ? 's' : ''}`,
            labelStyle: { fontSize: 11, fill: 'currentColor' },
            labelBgPadding: [6, 3] as [number, number],
            labelBgBorderRadius: 4,
            style: { stroke: '#64748b', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
          });
        }
      }
      return { nodes: [...srcNodes, ...tgtNodes], edges };
    }

    /* legacy sources mode */
    const xs = new Set(tables.map((t) => t.position?.x ?? null));
    const degenerate = tables.length > 1 && xs.size === 1;
    const usedByIdx = tables.map((t) => usedColumns(t, rep));
    const isFactByIdx = tables.map(
      (t, i) =>
        usedByIdx[i].some((c) => c.role === 'measure') || (t.row_count_approx ?? 0) >= 1_000_000,
    );
    const factCount = isFactByIdx.filter(Boolean).length;
    const twoLanes =
      factCount > 0 && factCount < tables.length && factCount <= 3 && tables.length - factCount <= 3;
    let factRow = 0;
    let dimRow = 0;
    let gridIdx = 0;
    const nodes = tables.map((t, i) => {
      const p = t.position;
      const position =
        !degenerate && p?.x != null && p?.y != null
          ? { x: p.x, y: p.y }
          : twoLanes
            ? isFactByIdx[i]
              ? { x: 24, y: 24 + factRow++ * 340 }
              : { x: 480, y: 24 + dimRow++ * 340 }
            : { x: 24 + (gridIdx % 3) * 300, y: 24 + Math.floor(gridIdx++ / 3) * 360 };
      return {
        id: t.entity_id ?? `t${i}`,
        type: 'studioTable' as const,
        position,
        selected: selectedEntity === t.entity_id,
        data: sourceNodeData(t, rep, data?.get(t.fqn)),
      };
    });

    const edges: Edge[] = (model.relationships ?? [])
      .map((r, i): Edge | null => {
        const { from, to, keys } = relEndpoints(r);
        if (!from.id || !to.id) return null;
        const risk = String(r.duplication_risk ?? '').toLowerCase();
        const status = String(r.status ?? '').toLowerCase();
        const proposed = status === 'hypothesis' || status === 'proposed';
        return {
          id: `rel-${i}`,
          source: from.id,
          target: to.id,
          type: 'smoothstep',
          label: `${cardinalityGlyph(r.cardinality)}${keys ? ` · ${keys}` : ''}${proposed ? ' · proposed' : ''}`,
          labelStyle: { fontSize: 11, fill: 'currentColor' },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          style: {
            stroke: RISK_STROKE[risk] ?? '#94a3b8',
            strokeWidth: 1.5,
            ...(proposed ? { strokeDasharray: '6 4' } : {}),
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: RISK_STROKE[risk] ?? '#94a3b8' },
        };
      })
      .filter((e): e is Edge => e != null);

    return { nodes, edges };
  }, [model, data, report, targets, rowsByTarget, mode, selectedEntity]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
      style={{ height }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.25}
        onNodeClick={onSelectTable ? (_, n) => onSelectTable(n.id) : undefined}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/* ── the relations truth, in words (standalone model page only) ─────── */

const CARD_WORDS: Record<string, string> = {
  many_to_one: 'many → one',
  one_to_many: 'one → many',
  one_to_one: 'one — one',
  many_to_many: 'many — many',
};

export function StudioRelationsList({ model }: { model: ModelPayload }) {
  const rels = model.relationships ?? [];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Relations
      </p>
      {rels.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          No relation between these sources was proposed — the analysis found no shared join
          key, so the report reads each source independently.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {rels.map((r, i) => {
            const { from, to, keys, label } = relEndpoints(r);
            const risk = String(r.duplication_risk ?? '').toLowerCase();
            const ev = (r as { evidence?: { source?: string } }).evidence;
            const note = (r as { duplication_note?: string }).duplication_note;
            return (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {label ?? `${from.name ?? from.id} → ${to.name ?? to.id}`}
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {CARD_WORDS[String(r.cardinality ?? '')] ?? 'cardinality —'}
                </span>
                {risk && (
                  <span
                    className={`rounded-full px-1.5 py-px text-xs ${
                      risk === 'low'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : risk === 'high'
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                    }`}
                    title={note ?? undefined}
                  >
                    duplication {risk}
                  </span>
                )}
                {r.status && (
                  <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {String(r.status)}
                  </span>
                )}
                {(ev?.source ?? keys) && (
                  <span className="basis-full text-xs text-slate-400 dark:text-slate-500">
                    {ev?.source ?? keys}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
