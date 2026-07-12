'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Node, Edge, useNodesState, useEdgesState, Handle, Position,
  ReactFlowProvider, MiniMap, Controls, Background, BackgroundVariant,
  NodeProps, useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Database, Layers, Table2, Key, Shield, ChevronRight, Home,
  RefreshCw, Tag as TagIcon, Check, X, Loader2, Gauge,
  ArrowLeft, ArrowRight, GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// Canonical table shape — shared with the page state + VirtualizedTableList so
// the onSelectTable callback returns a value assignable to setSelectedTable.
import type { TableItem } from '../../mapping/components/VirtualizedTableList';
import {
  NodeKpis, scoreBucket, latencyBucket, latencyLabel,
  fetchNodeKpis, dryRunRefreshNodeKpis,
} from '@/app/services/catalog/nodeKpis';
import {
  SOURCE_TAG_OPTIONS, readAllTags, writeTag, tagKey,
} from '@/app/services/catalog/sourceTags';

// Minimal lineage inputs — REUSED from state the page already holds (FK
// relationships + column mappings). No new fetch: the map only composes.
export interface LineageRelationship {
  child_schema: string;
  child_table: string;
  parent_schema: string;
  parent_table: string;
}
export interface LineageMapping {
  sourceSchema: string;
  sourceTable: string;
  targetSchema: string;
  targetTable: string;
}

interface SourceMindMapProps {
  databases: string[];
  schemas: string[];
  tables: TableItem[];
  selectedDatabase: string;
  onSelectTable: (table: TableItem) => void;
  /** FK relationships already loaded by the page (child references parent). */
  relationships?: LineageRelationship[];
  /** Column mappings already loaded by the page (source feeds target). */
  mappings?: LineageMapping[];
}

// focusLevel state machine — overview → db → schema → object. Each focus pins
// the visible slice of the tree; the breadcrumb walks back out at any level.
type FocusLevel = 'overview' | 'db' | 'schema';
interface Focus {
  level: FocusLevel;
  database?: string;
  schema?: string;
}

// ---------------------------------------------------------------------------
// Shared bucket → palette (kept module-scope; no per-render recreation).
// ---------------------------------------------------------------------------
const BUCKET_CLS: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  none: 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400',
};

function fmtScore(v: number | null): string {
  return v == null ? '—' : String(Math.round(v));
}

// ---------------------------------------------------------------------------
// Node payload contracts (passed through node.data — never inline components).
// ---------------------------------------------------------------------------
interface DbNodeData {
  label: string;
  schemaCount: number;
  tableCount: number;
  tag: string | null;
  onEditTag: (database: string) => void;
  onDrill: (database: string) => void;
}
interface SchemaNodeData {
  label: string;
  database: string;
  tableCount: number;
  tag: string | null;
  onEditTag: (database: string, schema: string) => void;
  onDrill: (database: string, schema: string) => void;
}
interface TableNodeData {
  label: string;
  columnCount: number;
  hasPrimaryKey: boolean;
  sensitiveColumns: number;
  status: TableItem['status'];
  tableItem: TableItem;
  kpis?: NodeKpis;
  kpisLoading: boolean;
  refreshing: boolean;
  onSelect: (t: TableItem) => void;
  onDryRun: (t: TableItem) => void;
}

// ---------------------------------------------------------------------------
// Reusable presentational bits (module scope — stable identity).
// ---------------------------------------------------------------------------
function TagChip({ tag }: { tag: string | null }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium',
        tag
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
          : 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400 italic',
      )}
      title={tag ? `Source type: ${tag} (local)` : 'Click to classify (local)'}
    >
      <TagIcon className="h-2.5 w-2.5" />
      {tag ?? 'untagged'}
    </span>
  );
}

function AxisPill({ axis, value }: { axis: string; value: string; }) {
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span className="text-[7px] font-semibold tracking-wide text-slate-400">{axis}</span>
      <span className="text-[10px] font-bold">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Node renderers (module scope — registered once in `nodeTypes`).
// ---------------------------------------------------------------------------
function DatabaseNode({ data }: NodeProps<DbNodeData>) {
  return (
    <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900/40 min-w-[180px]">
      <Handle type="source" position={Position.Right} className="!bg-blue-300 !w-2.5 !h-2.5" />
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => data.onDrill(data.label)}
        title="Dive into this database"
      >
        <Database className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">{data.label}</p>
          <p className="text-[10px] opacity-80">{data.schemaCount} schemas · {data.tableCount} tables</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => data.onEditTag(data.label)}
        className="mt-2 block"
        title="Classify this database (local)"
      >
        <TagChip tag={data.tag} />
      </button>
    </div>
  );
}

function SchemaNode({ data }: NodeProps<SchemaNodeData>) {
  return (
    <div className="px-3.5 py-2.5 rounded-lg border-2 shadow-md min-w-[150px] bg-white dark:bg-slate-800 border-purple-200 dark:border-purple-800 hover:border-purple-400 hover:shadow-lg transition-all">
      <Handle type="target" position={Position.Left} className="!bg-purple-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-purple-400 !w-2 !h-2" />
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => data.onDrill(data.database, data.label)}
        title="Dive into this schema"
      >
        <Layers className="h-4 w-4 text-purple-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{data.label}</p>
          <p className="text-[10px] text-slate-500">{data.tableCount} tables</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => data.onEditTag(data.database, data.label)}
        className="mt-1.5 block"
        title="Classify this schema (local)"
      >
        <TagChip tag={data.tag} />
      </button>
    </div>
  );
}

function TableNode({ data }: NodeProps<TableNodeData>) {
  const k = data.kpis;
  const perfBucket = latencyBucket(k?.perfMs ?? null);
  return (
    <div
      className="px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all min-w-[180px] border-slate-200 dark:border-slate-700"
    >
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2 !h-2" />
      <button
        type="button"
        className="flex items-center gap-1.5 w-full text-left"
        onClick={() => data.onSelect(data.tableItem)}
        title="Open in right panel"
      >
        <Table2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate flex-1">{data.label}</span>
        <span className="text-[9px] text-slate-400 shrink-0">{data.columnCount} cols</span>
        {data.hasPrimaryKey && <Key className="h-2.5 w-2.5 text-amber-400 shrink-0" />}
        {data.sensitiveColumns > 0 && <Shield className="h-2.5 w-2.5 text-red-400 shrink-0" />}
      </button>

      {/* Inline goal-axis KPIs — DQ · GOV · COST · PERF (per-object). */}
      <div className="mt-2 flex items-center gap-1">
        {data.kpisLoading ? (
          <span className="flex items-center gap-1 text-[9px] text-slate-400">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> scoring…
          </span>
        ) : !k || !k.hasScores ? (
          <span className="text-[9px] text-slate-400 italic">no scores — run dry-run →</span>
        ) : (
          <>
            <span className={cn('px-1 py-0.5 rounded', BUCKET_CLS[scoreBucket(k.dq)])}>
              <AxisPill axis="DQ" value={fmtScore(k.dq)} />
            </span>
            <span className={cn('px-1 py-0.5 rounded', BUCKET_CLS[scoreBucket(k.gov)])}>
              <AxisPill axis="GOV" value={fmtScore(k.gov)} />
            </span>
            <span className={cn('px-1 py-0.5 rounded', BUCKET_CLS[scoreBucket(k.cost)])}>
              <AxisPill axis="COST" value={fmtScore(k.cost)} />
            </span>
            <span
              className={cn('px-1 py-0.5 rounded', BUCKET_CLS[perfBucket])}
              title="PERF = avg query latency (derived from finops inputs, not a 0–100 score)"
            >
              <AxisPill axis="PERF*" value={latencyLabel(k.perfMs ?? null)} />
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => data.onDryRun(data.tableItem)}
        disabled={data.refreshing}
        className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
        title="Dry-run (sample) + refresh scores"
      >
        {data.refreshing
          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
          : <RefreshCw className="h-2.5 w-2.5" />}
        dry-run → refresh
      </button>
    </div>
  );
}

const nodeTypes = {
  database: DatabaseNode,
  schema: SchemaNode,
  table: TableNode,
};

// ---------------------------------------------------------------------------
// Layout builder — focus-aware. Renders only the slice for the current focus
// level so "diving" actually narrows the canvas (overview shows DBs+schemas,
// db focus shows one DB's schemas, schema focus shows the schema's tables).
// ---------------------------------------------------------------------------
interface LayoutCtx {
  focus: Focus;
  tables: TableItem[];
  schemas: string[];
  databases: string[];
  /** DB the `schemas` prop belongs to — the fallback must never cross databases. */
  selectedDatabase: string;
  tags: Record<string, string>;
  kpisByFqn: Record<string, NodeKpis>;
  loadingFqns: Set<string>;
  refreshingFqns: Set<string>;
  onDrillDb: (db: string) => void;
  onDrillSchema: (db: string, schema: string) => void;
  onEditDbTag: (db: string) => void;
  onEditSchemaTag: (db: string, schema: string) => void;
  onSelectTable: (t: TableItem) => void;
  onDryRun: (t: TableItem) => void;
}

function buildLayout(ctx: LayoutCtx): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const { focus, tables, schemas, databases, selectedDatabase, tags } = ctx;

  // Resolve which DBs to render at the root of this focus.
  const dbsToShow =
    focus.level === 'overview'
      ? (databases.length ? databases.slice(0, 4) : [...new Set(tables.map((t) => t.database))].slice(0, 4))
      : [focus.database as string];

  let globalY = 0;

  dbsToShow.forEach((db) => {
    const dbId = `db-${db}`;
    const dbTables = tables.filter((t) => t.database === db);
    let dbSchemas = [...new Set(dbTables.map((t) => t.schema))];
    // `schemas` describes ONLY `selectedDatabase`. Applying it to any other db
    // node grafted that db's schemas onto a foreign parent (e.g. DRAFT_SOURCE's
    // AZRZARAZRE shown under CP_DATA360) and, since no table matched, every one
    // rendered "0 tables". Fall back only for the database it describes.
    if (dbSchemas.length === 0 && schemas.length > 0 && db === selectedDatabase) {
      dbSchemas = [...schemas];
    }
    // When focused on a schema, only that schema is in scope.
    if (focus.level === 'schema' && focus.schema) {
      dbSchemas = dbSchemas.filter((s) => s === focus.schema);
    }

    const dbY = globalY;
    nodes.push({
      id: dbId,
      type: 'database',
      position: { x: 0, y: dbY },
      data: {
        label: db,
        schemaCount: dbSchemas.length,
        tableCount: dbTables.length,
        tag: tags[tagKey(db)] ?? null,
        onEditTag: ctx.onEditDbTag,
        onDrill: ctx.onDrillDb,
      } satisfies DbNodeData,
    });

    dbSchemas.forEach((schema, schIdx) => {
      const schemaId = `schema-${db}-${schema}`;
      const schemaTables = dbTables.filter((t) => t.schema === schema);
      const schemaY = dbY + schIdx * 200;

      nodes.push({
        id: schemaId,
        type: 'schema',
        position: { x: 280, y: schemaY },
        data: {
          label: schema,
          database: db,
          tableCount: schemaTables.length,
          tag: tags[tagKey(db, schema)] ?? null,
          onEditTag: ctx.onEditSchemaTag,
          onDrill: ctx.onDrillSchema,
        } satisfies SchemaNodeData,
      });
      edges.push({
        id: `e-${dbId}-${schemaId}`, source: dbId, target: schemaId,
        type: 'smoothstep', style: { stroke: '#a78bfa', strokeWidth: 2 },
      });

      // Tables only render at schema focus (diving in reveals object KPIs).
      if (focus.level === 'schema') {
        schemaTables.forEach((tbl, tblIdx) => {
          const tableId = `table-${tbl.id}`;
          const fqn = `${tbl.database}.${tbl.schema}.${tbl.table}`;
          const cols = Math.max(1, Math.min(3, Math.ceil(schemaTables.length / 4)));
          const col = tblIdx % cols;
          const row = Math.floor(tblIdx / cols);
          nodes.push({
            id: tableId,
            type: 'table',
            position: { x: 560 + col * 210, y: schemaY - 30 + row * 96 },
            data: {
              label: tbl.table,
              columnCount: tbl.columnCount,
              hasPrimaryKey: tbl.hasPrimaryKey,
              sensitiveColumns: tbl.sensitiveColumns || 0,
              status: tbl.status,
              tableItem: tbl,
              kpis: ctx.kpisByFqn[fqn],
              kpisLoading: ctx.loadingFqns.has(fqn),
              refreshing: ctx.refreshingFqns.has(fqn),
              onSelect: ctx.onSelectTable,
              onDryRun: ctx.onDryRun,
            } satisfies TableNodeData,
          });
          edges.push({
            id: `e-${schemaId}-${tableId}`, source: schemaId, target: tableId,
            type: 'smoothstep', style: { stroke: '#94a3b8', strokeWidth: 1 },
          });
          const maxRows = Math.ceil(schemaTables.length / cols);
          globalY = Math.max(globalY, schemaY + maxRows * 96 + 40);
        });
      }
      globalY = Math.max(globalY, schemaY + 120);
    });
    globalY += 80;
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Tag editor popover (module scope; controlled by parent state).
// ---------------------------------------------------------------------------
interface TagEditorState { fqn: string; database: string; schema?: string; current: string | null; }

function TagEditor({
  state, onApply, onClose,
}: {
  state: TagEditorState;
  onApply: (fqn: string, tag: string | null) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
          <TagIcon className="h-3.5 w-3.5 text-indigo-500" />
          Classify {state.schema ? `${state.database}.${state.schema}` : state.database}
        </p>
        <button type="button" onClick={onClose} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
          <X className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>
      <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">
        Saved locally — no backend write endpoint yet.
      </p>
      <div className="flex flex-wrap gap-1">
        {SOURCE_TAG_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onApply(state.fqn, opt)}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              state.current === opt
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40',
            )}
          >
            {state.current === opt && <Check className="inline h-2.5 w-2.5 mr-0.5" />}
            {opt}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom tag…"
          className="flex-1 px-2 py-1 text-[10px] rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          type="button"
          disabled={!custom.trim()}
          onClick={() => onApply(state.fqn, custom)}
          className="px-2 py-1 rounded text-[10px] font-medium bg-indigo-600 text-white disabled:opacity-40"
        >
          Set
        </button>
      </div>
      {state.current && (
        <button
          type="button"
          onClick={() => onApply(state.fqn, null)}
          className="mt-2 text-[10px] text-rose-600 hover:underline"
        >
          Clear tag
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus KPI band — compact header INSIDE the center pane, shown while a DB or
// SCHEMA is focused. Composed 100% from data already in state (tables list,
// per-object scores fetched on schema dive, FK relationships, column mappings).
// Honest "—" when a value isn't known; "No lineage recorded" when none exists.
// ---------------------------------------------------------------------------
interface LineageSide {
  /** "SCHEMA.TABLE" (schema focus) or "SCHEMA → SCHEMA" (db focus) chips. */
  items: string[];
}

/**
 * Derive immediate lineage for the focused node from relationships + mappings
 * already in page state. Directions: mapping source → target; FK child
 * references parent (parent = upstream).
 */
function deriveLineage(
  focus: Focus,
  dbSchemas: string[],
  relationships: LineageRelationship[],
  mappings: LineageMapping[],
): { upstream: LineageSide; downstream: LineageSide } {
  const up = new Set<string>();
  const down = new Set<string>();

  if (focus.level === 'schema' && focus.schema) {
    const s = focus.schema;
    for (const m of mappings) {
      if (m.targetSchema === s && m.sourceSchema !== s && m.sourceTable) {
        up.add(`${m.sourceSchema}.${m.sourceTable}`);
      }
      if (m.sourceSchema === s && m.targetSchema !== s && m.targetTable) {
        down.add(`${m.targetSchema}.${m.targetTable}`);
      }
    }
    for (const r of relationships) {
      if (r.child_schema === s && r.parent_schema !== s && r.parent_table) {
        up.add(`${r.parent_schema}.${r.parent_table}`);
      }
      if (r.parent_schema === s && r.child_schema !== s && r.child_table) {
        down.add(`${r.child_schema}.${r.child_table}`);
      }
    }
  } else if (focus.level === 'db') {
    // DB focus: schema→schema flows touching this database's schemas. A flow
    // whose ends are BOTH in the db is internal — listed once (under "Feeds")
    // rather than duplicated on both sides.
    const inDb = new Set(dbSchemas);
    const addFlow = (src: string, tgt: string) => {
      if (src === tgt) return;
      const srcIn = inDb.has(src);
      const tgtIn = inDb.has(tgt);
      if (!srcIn && !tgtIn) return;
      const label = `${src} → ${tgt}`;
      if (srcIn) down.add(label);
      else up.add(label);
    };
    for (const m of mappings) addFlow(m.sourceSchema, m.targetSchema);
    for (const r of relationships) addFlow(r.parent_schema, r.child_schema);
  }
  return { upstream: { items: [...up] }, downstream: { items: [...down] } };
}

function KpiCell({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="px-3 py-1 min-w-[64px]" title={hint}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-bold leading-tight text-slate-800 dark:text-slate-100 font-mono">{value}</p>
    </div>
  );
}

function LineageChips({
  dir, items, onJumpSchema,
}: {
  dir: 'up' | 'down';
  items: string[];
  onJumpSchema?: (schema: string) => void;
}) {
  const Icon = dir === 'up' ? ArrowLeft : ArrowRight;
  const shown = items.slice(0, 4);
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
        <Icon className="h-2.5 w-2.5" /> {dir === 'up' ? 'Fed by' : 'Feeds'}
      </span>
      {shown.map((it) => {
        const schema = it.includes(' → ') ? null : it.split('.')[0];
        return (
          <button
            key={it}
            type="button"
            disabled={!schema || !onJumpSchema}
            onClick={() => schema && onJumpSchema?.(schema)}
            title={schema ? `Focus ${schema}` : it}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono truncate max-w-[160px]',
              'bg-slate-100 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
              schema && onJumpSchema && 'hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/40 dark:hover:text-blue-300',
            )}
          >
            {it}
          </button>
        );
      })}
      {items.length > 4 && (
        <span className="text-[9px] text-slate-400 shrink-0">+{items.length - 4}</span>
      )}
    </div>
  );
}

function FocusKpiBand({
  focus, tables, dbSchemas, kpisByFqn, loadingCount, relationships, mappings, onJumpSchema,
}: {
  focus: Focus;
  /** Tables in the focused scope (db or schema). */
  tables: TableItem[];
  /** Schemas of the focused database. */
  dbSchemas: string[];
  kpisByFqn: Record<string, NodeKpis>;
  loadingCount: number;
  relationships: LineageRelationship[];
  mappings: LineageMapping[];
  onJumpSchema: (schema: string) => void;
}) {
  const isSchema = focus.level === 'schema';
  const columns = tables.reduce((n, t) => n + (t.columnCount || 0), 0);
  // PII: only claim a number when at least one table actually carries the field.
  const piiKnown = tables.some((t) => typeof t.sensitiveColumns === 'number');
  const pii = tables.reduce((n, t) => n + (t.sensitiveColumns || 0), 0);
  // Quality: average of the per-object DQ scores already fetched on schema dive
  // — never fabricated. "n/N scored" keeps the denominator honest.
  const scored = tables
    .map((t) => kpisByFqn[`${t.database}.${t.schema}.${t.table}`])
    .filter((k): k is NodeKpis => !!k && k.hasScores && k.dq != null);
  const avgDq = scored.length
    ? Math.round(scored.reduce((n, k) => n + (k.dq as number), 0) / scored.length)
    : null;

  const { upstream, downstream } = deriveLineage(focus, dbSchemas, relationships, mappings);
  const hasLineage = upstream.items.length > 0 || downstream.items.length > 0;

  return (
    <div
      data-testid="focus-kpi-band"
      className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-4 py-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Focused object */}
        <span className="inline-flex items-center gap-1.5 pr-3 border-r border-slate-200 dark:border-slate-700">
          {isSchema
            ? <Layers className="h-4 w-4 text-purple-500 shrink-0" />
            : <Database className="h-4 w-4 text-blue-500 shrink-0" />}
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono truncate max-w-[240px]">
            {isSchema ? focus.schema : focus.database}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {isSchema ? 'schema' : 'database'}
          </span>
        </span>

        {/* KPIs — composed from already-loaded state, honest "—" when absent. */}
        {!isSchema && <KpiCell label="Schemas" value={dbSchemas.length} />}
        <KpiCell label="Tables" value={tables.length} />
        <KpiCell label="Columns" value={columns > 0 ? columns.toLocaleString() : '—'} />
        <KpiCell
          label="PII cols"
          value={piiKnown ? pii : '—'}
          hint={piiKnown ? 'Sensitive columns detected across this scope' : 'Not classified yet'}
        />
        <KpiCell
          label="Quality"
          value={
            loadingCount > 0 && scored.length === 0
              ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
              : avgDq != null ? `${avgDq}` : '—'
          }
          hint={
            scored.length
              ? `Average DQ score over ${scored.length}/${tables.length} scored table(s)`
              : 'No persisted scores yet — dive into the schema and run dry-run → refresh'
          }
        />

        {/* Immediate lineage — from relationships/mappings already in state. */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700 min-w-0 flex-1">
          <GitBranch className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          {hasLineage ? (
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              {upstream.items.length > 0 && (
                <LineageChips dir="up" items={upstream.items} onJumpSchema={onJumpSchema} />
              )}
              {downstream.items.length > 0 && (
                <LineageChips dir="down" items={downstream.items} onJumpSchema={onJumpSchema} />
              )}
            </div>
          ) : (
            <span className="text-[10px] italic text-slate-400">No lineage recorded</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb — the "back to overview" affordance at every focus level.
// ---------------------------------------------------------------------------
function Breadcrumb({
  focus, onOverview, onDb,
}: {
  focus: Focus;
  onOverview: () => void;
  onDb: (db: string) => void;
}) {
  return (
    <nav aria-label="Catalog focus" className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 backdrop-blur px-2 py-1 shadow-sm">
      <button
        type="button"
        onClick={onOverview}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
          focus.level === 'overview'
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-slate-500 hover:text-blue-600 dark:text-slate-400',
        )}
      >
        <Home className="h-3 w-3" /> Overview
      </button>
      {focus.database && (
        <>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <button
            type="button"
            onClick={() => onDb(focus.database as string)}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
              focus.level === 'db'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 hover:text-blue-600 dark:text-slate-400',
            )}
          >
            <Database className="h-3 w-3" /> {focus.database}
          </button>
        </>
      )}
      {focus.schema && (
        <>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
            <Layers className="h-3 w-3" /> {focus.schema}
          </span>
        </>
      )}
      {focus.level === 'schema' && (
        <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Gauge className="h-3 w-3" /> object KPIs
        </span>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Inner — owns focus, tags, per-object KPI fetching.
// ---------------------------------------------------------------------------
function SourceMindMapInner({
  databases, schemas, tables, selectedDatabase, onSelectTable,
  relationships = [], mappings = [],
}: SourceMindMapProps) {
  // Lazy-init: if the page already has a selected DB, start focused on it.
  const [focus, setFocus] = useState<Focus>(() =>
    selectedDatabase ? { level: 'db', database: selectedDatabase } : { level: 'overview' },
  );
  // Lazy-init tags from versioned localStorage once.
  const [tags, setTags] = useState<Record<string, string>>(() => readAllTags());
  const [tagEditor, setTagEditor] = useState<TagEditorState | null>(null);

  const [kpisByFqn, setKpisByFqn] = useState<Record<string, NodeKpis>>({});
  const [loadingFqns, setLoadingFqns] = useState<Set<string>>(() => new Set());
  const [refreshingFqns, setRefreshingFqns] = useState<Set<string>>(() => new Set());

  // --- focus transitions -------------------------------------------------
  const goOverview = useCallback(() => setFocus({ level: 'overview' }), []);
  const drillDb = useCallback((database: string) => setFocus({ level: 'db', database }), []);
  const drillSchema = useCallback(
    (database: string, schema: string) => setFocus({ level: 'schema', database, schema }),
    [],
  );
  // Lineage-chip jump: resolve the schema's database from the loaded tables
  // (mappings/relationships don't carry the db). Unknown schema → no-op.
  const jumpToSchema = useCallback((schema: string) => {
    const hit = tables.find((t) => t.schema === schema);
    if (hit) setFocus({ level: 'schema', database: hit.database, schema });
  }, [tables]);

  // Re-center on every focus change: clicking a db/schema node (or a breadcrumb)
  // re-fits the viewport to the focused slice — this is the "click re-centers
  // the map on it" contract. rAF waits for the rebuilt nodes to land.
  const { fitView } = useReactFlow();
  const focusKey = `${focus.level}|${focus.database ?? ''}|${focus.schema ?? ''}`;
  useEffect(() => {
    const id = window.setTimeout(() => {
      fitView({ padding: 0.3, duration: 350 });
    }, 60);
    return () => window.clearTimeout(id);
  }, [focusKey, fitView]);

  // --- tag editing -------------------------------------------------------
  const editDbTag = useCallback((database: string) => {
    const fqn = tagKey(database);
    setTagEditor({ fqn, database, current: readAllTags()[fqn] ?? null });
  }, []);
  const editSchemaTag = useCallback((database: string, schema: string) => {
    const fqn = tagKey(database, schema);
    setTagEditor({ fqn, database, schema, current: readAllTags()[fqn] ?? null });
  }, []);
  const applyTag = useCallback((fqn: string, tag: string | null) => {
    setTags(writeTag(fqn, tag));
    setTagEditor(null);
  }, []);

  // --- per-object KPI fetch on schema dive --------------------------------
  // Primitive dep: only refetch when the focused (db, schema) changes.
  const focusDb = focus.database ?? '';
  const focusSchema = focus.level === 'schema' ? (focus.schema ?? '') : '';

  useEffect(() => {
    if (!focusSchema) return;
    const scopeTables = tables.filter(
      (t) => t.database === focusDb && t.schema === focusSchema,
    );
    if (scopeTables.length === 0) return;
    let cancelled = false;

    const fqns = scopeTables.map((t) => `${t.database}.${t.schema}.${t.table}`);
    setLoadingFqns((prev) => {
      const next = new Set(prev);
      fqns.forEach((f) => next.add(f));
      return next;
    });

    (async () => {
      await Promise.all(
        scopeTables.map(async (t) => {
          const fqn = `${t.database}.${t.schema}.${t.table}`;
          try {
            const k = await fetchNodeKpis(t.database, t.schema, t.table);
            if (!cancelled) setKpisByFqn((prev) => ({ ...prev, [fqn]: k }));
          } catch {
            // Soft-fail per node — leave it in the "no scores" state.
          } finally {
            if (!cancelled) {
              setLoadingFqns((prev) => {
                const next = new Set(prev);
                next.delete(fqn);
                return next;
              });
            }
          }
        }),
      );
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDb, focusSchema]);

  // --- dry-run → refresh one object --------------------------------------
  const handleDryRun = useCallback(async (t: TableItem) => {
    const fqn = `${t.database}.${t.schema}.${t.table}`;
    setRefreshingFqns((prev) => new Set(prev).add(fqn));
    try {
      const k = await dryRunRefreshNodeKpis(t.database, t.schema, t.table);
      setKpisByFqn((prev) => ({ ...prev, [fqn]: k }));
    } catch {
      // Surface nothing destructive — node keeps its prior state.
    } finally {
      setRefreshingFqns((prev) => {
        const next = new Set(prev);
        next.delete(fqn);
        return next;
      });
    }
  }, []);

  // --- layout ------------------------------------------------------------
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildLayout({
      focus, tables, schemas, databases, selectedDatabase, tags,
      kpisByFqn, loadingFqns, refreshingFqns,
      onDrillDb: drillDb, onDrillSchema: drillSchema,
      onEditDbTag: editDbTag, onEditSchemaTag: editSchemaTag,
      onSelectTable, onDryRun: handleDryRun,
    }),
    [focus, tables, schemas, databases, selectedDatabase, tags, kpisByFqn, loadingFqns,
      refreshingFqns, drillDb, drillSchema, editDbTag, editSchemaTag,
      onSelectTable, handleDryRun],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // --- focus scope for the KPI band (same slice rules as buildLayout) -----
  const bandScope = useMemo(() => {
    if (focus.level === 'overview' || !focus.database) return null;
    const dbTables = tables.filter((t) => t.database === focus.database);
    let dbSchemas = [...new Set(dbTables.map((t) => t.schema))];
    if (dbSchemas.length === 0 && schemas.length > 0 && focus.database === selectedDatabase) {
      dbSchemas = [...schemas];
    }
    const scopeTables = focus.level === 'schema'
      ? dbTables.filter((t) => t.schema === focus.schema)
      : dbTables;
    return { scopeTables, dbSchemas };
  }, [focus, tables, schemas, selectedDatabase]);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Center KPI band — visible while a db/schema is focused; the Overview
          breadcrumb (one click) restores the full map and hides the band. */}
      {bandScope && (
        <FocusKpiBand
          focus={focus}
          tables={bandScope.scopeTables}
          dbSchemas={bandScope.dbSchemas}
          kpisByFqn={kpisByFqn}
          loadingCount={loadingFqns.size}
          relationships={relationships}
          mappings={mappings}
          onJumpSchema={jumpToSchema}
        />
      )}
      <div className="relative flex-1 min-h-0">
      <Breadcrumb focus={focus} onOverview={goOverview} onDb={drillDb} />
      {tagEditor && (
        <TagEditor state={tagEditor} onApply={applyTag} onClose={() => setTagEditor(null)} />
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.05}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls className="!bg-white/90 dark:!bg-slate-800/90 !border-slate-200 dark:!border-slate-700 !shadow-lg !rounded-lg" />
        <MiniMap
          nodeStrokeColor="#94a3b8"
          nodeColor={(n) =>
            n.type === 'database' ? '#3b82f6'
              : n.type === 'schema' ? '#a855f7'
                : '#10b981'
          }
          className="!bg-white/80 dark:!bg-slate-800/80 !border-slate-200 dark:!border-slate-700 !rounded-lg !shadow"
        />
      </ReactFlow>
      </div>
    </div>
  );
}

export default function SourceMindMap(props: SourceMindMapProps) {
  return (
    <ReactFlowProvider>
      <SourceMindMapInner {...props} />
    </ReactFlowProvider>
  );
}
