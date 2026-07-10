'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Node, Edge, useNodesState, useEdgesState, Handle, Position,
  ReactFlowProvider, MiniMap, Controls, Background, BackgroundVariant,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Database, Layers, Table2, Key, Shield, ChevronRight, Home,
  RefreshCw, Tag as TagIcon, Check, X, Loader2, Gauge,
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

interface SourceMindMapProps {
  databases: string[];
  schemas: string[];
  tables: TableItem[];
  selectedDatabase: string;
  onSelectTable: (table: TableItem) => void;
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

  return (
    <div className="relative h-full w-full">
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
  );
}

export default function SourceMindMap(props: SourceMindMapProps) {
  return (
    <ReactFlowProvider>
      <SourceMindMapInner {...props} />
    </ReactFlowProvider>
  );
}
