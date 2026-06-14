'use client';

/**
 * SourceHub — the default-visible source-understanding hub.
 *
 * Fetches the REAL connected-source inventory from `getCatalogSources()`
 * (`GET /catalog/sources`) and presents ONE unified source dataset through a
 * view switch: cards (default) · table · tree · map/topology.
 *
 *  - cards / table / map render the source entities themselves (source-level
 *    selection → onSelectSource({ kind: 'source' })).
 *  - tree reuses the existing <SourceTree /> drill-down (database → schema →
 *    table) whose top level *is* the connected sources, so it stays coherent
 *    with the other views; it selects at table granularity
 *    (→ onSelectSource({ kind: 'table' })).
 *
 * NOTE on reuse: <SourceTree /> is imported and reused for the tree view.
 * <SourcesOverview /> is deliberately NOT slotted into the switch — it is a flat
 * list of *tables* (a different granularity with no source-level top), which
 * would break the "one unified source dataset" contract. The source-level table
 * view below is a distinct render (different fetch, different columns), not a
 * duplicate of SourcesOverview.
 *
 * BRAND RULE: this component never emits "Kimi" / "Snowflake" / "Cortex" in any
 * user-facing text. Native-warehouse / vendor source types are neutralised to
 * "Data warehouse" (see connectorMetaFor + FORBIDDEN_TOKENS).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Badge, Button, Loader } from 'rizzui';
import {
  Database, Layers, RefreshCw, AlertTriangle, Search,
  LayoutGrid, List, Network, FolderTree, ChevronRight, Plug, Boxes, Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCatalogSources, type CatalogSourcesResponse } from '@/app/services/catalog';
import { getApiErrorMessage } from '@/lib/api-client';
import SourceTree from '@/app/(dashboard)/sources/components/SourceTree';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SourceViewMode = 'cards' | 'table' | 'tree' | 'map';

/** A single connected-source entity from `GET /catalog/sources`. */
export type CatalogSource = CatalogSourcesResponse['sources'][number];

/**
 * Discriminated selection payload. Source-level views (cards/table/map) emit a
 * whole source; the tree view drills to a table and emits its coordinates.
 */
export type SourceSelection =
  | { kind: 'source'; source: CatalogSource }
  | { kind: 'table'; database: string; schema: string; table: string; fqn: string };

export interface SourceHubProps {
  /** Host callback to open a detail panel for the clicked source / table. */
  onSelectSource?: (selection: SourceSelection) => void;
  /** Initial view mode (defaults to 'cards'). */
  defaultView?: SourceViewMode;
  /** Optional wrapper className. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Connector registry — first-class external connectors + brand-neutral natives.
// Case-insensitive; tolerant of whatever token shape the backend emits.
// ---------------------------------------------------------------------------

interface ConnectorMeta {
  /** User-facing, brand-neutral label. */
  label: string;
  /** Whether this is an external (non-native-warehouse) connector. */
  external: boolean;
  /** Tailwind badge classes. */
  badge: string;
  /** Accent hex for the topology node. */
  hex: string;
}

// Never surface these vendor tokens (CLAUDE.md brand rule) — neutralise to native.
const FORBIDDEN_TOKENS = ['snowflake', 'cortex', 'kimi'];

const NATIVE_META: ConnectorMeta = {
  label: 'Data warehouse',
  external: false,
  badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  hex: '#6366f1',
};

const STAGE_META: ConnectorMeta = {
  label: 'Ingestion stage',
  external: false,
  badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  hex: '#64748b',
};

const CONNECTORS: Record<string, ConnectorMeta> = {
  postgres:   { label: 'PostgreSQL',   external: true, badge: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',           hex: '#0ea5e9' },
  postgresql: { label: 'PostgreSQL',   external: true, badge: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',           hex: '#0ea5e9' },
  oracle:     { label: 'Oracle',       external: true, badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',        hex: '#e11d48' },
  databricks: { label: 'Databricks',   external: true, badge: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', hex: '#f97316' },
  iceberg:    { label: 'Apache Iceberg', external: true, badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',      hex: '#06b6d4' },
  mysql:      { label: 'MySQL',        external: true, badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',    hex: '#d97706' },
  sqlserver:  { label: 'SQL Server',   external: true, badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',            hex: '#dc2626' },
  mssql:      { label: 'SQL Server',   external: true, badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',            hex: '#dc2626' },
  bigquery:   { label: 'BigQuery',     external: true, badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',        hex: '#2563eb' },
  redshift:   { label: 'Redshift',     external: true, badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', hex: '#7c3aed' },
  s3:         { label: 'Amazon S3',    external: true, badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', hex: '#059669' },
  aws:        { label: 'Amazon S3',    external: true, badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', hex: '#059669' },
  azure:      { label: 'Azure Blob Storage', external: true, badge: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',      hex: '#0284c7' },
  gcs:        { label: 'Google Cloud Storage', external: true, badge: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300', hex: '#0d9488' },
  kafka:      { label: 'Kafka',        external: true, badge: 'bg-stone-50 text-stone-700 dark:bg-stone-900/30 dark:text-stone-300',    hex: '#57534e' },
  stage:      STAGE_META,
};

function titleCase(s: string): string {
  return s
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') || s;
}

/** Resolve a brand-safe connector descriptor for any raw `type` token. */
function connectorMetaFor(rawType: string | undefined | null): ConnectorMeta {
  const t = (rawType ?? '').trim().toLowerCase();
  if (!t) return NATIVE_META;
  // Brand rule: vendor tokens never reach the UI — present as neutral native.
  if (FORBIDDEN_TOKENS.some((f) => t.includes(f))) return NATIVE_META;
  if (CONNECTORS[t]) return CONNECTORS[t];
  for (const key of Object.keys(CONNECTORS)) {
    if (t.includes(key)) return CONNECTORS[key];
  }
  if (t === 'native' || t === 'warehouse' || t === 'internal' || t === 'table' || t === 'view') {
    return NATIVE_META;
  }
  // Unknown but non-forbidden source type — show it, title-cased, as external.
  return {
    label: titleCase(t),
    external: true,
    badge: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    hex: '#6366f1',
  };
}

/** Honest count formatter: 0 stays 0, only missing values become "—" (R3). */
function fmtCount(n: number | undefined | null): string {
  return n === undefined || n === null ? '—' : n.toLocaleString();
}

// ---------------------------------------------------------------------------
// View switch metadata
// ---------------------------------------------------------------------------

const VIEW_OPTIONS: { id: SourceViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'cards', label: 'Cards', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'table', label: 'Table', icon: <List className="h-4 w-4" /> },
  { id: 'tree', label: 'Tree', icon: <FolderTree className="h-4 w-4" /> },
  { id: 'map', label: 'Map', icon: <Network className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SourceHub({ onSelectSource, defaultView = 'cards', className }: SourceHubProps) {
  const [data, setData] = useState<CatalogSourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SourceViewMode>(defaultView);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCatalogSources();
      setData(res);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sources = data?.sources ?? [];

  // by_type facets (full dataset), highest count first.
  const facets = useMemo(
    () => Object.entries(data?.by_type ?? {}).sort((a, b) => b[1] - a[1]),
    [data],
  );

  // Filtered source set drives every source-level view (cards/table/map).
  const filtered = useMemo(() => {
    let result = sources;
    if (typeFilter) result = result.filter((s) => (s.type ?? '') === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.database ?? '').toLowerCase().includes(q) ||
        connectorMetaFor(s.type).label.toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => a.name.localeCompare(b.name));
  }, [sources, typeFilter, search]);

  const externalCount = useMemo(
    () => sources.filter((s) => connectorMetaFor(s.type).external).length,
    [sources],
  );

  const selectSource = useCallback(
    (source: CatalogSource) => onSelectSource?.({ kind: 'source', source }),
    [onSelectSource],
  );

  const selectTable = useCallback(
    (database: string, schema: string, table: string) =>
      onSelectSource?.({ kind: 'table', database, schema, table, fqn: `${database}.${schema}.${table}` }),
    [onSelectSource],
  );

  // -------------------------------------------------------------------------
  // Topology (map view) — root → connector-type → source. Derived strictly from
  // the real source list grouped by connector type (NOT fabricated lineage).
  // -------------------------------------------------------------------------
  const flow = useMemo(() => {
    const NODE_BASE: React.CSSProperties = { borderRadius: 8, padding: '6px 10px', fontSize: 11, width: 150 };
    if (filtered.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const ROW = 58;
    const groups = new Map<string, CatalogSource[]>();
    filtered.forEach((s) => {
      const key = (s.type ?? '').trim() || 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    });

    const typeNodes: Node[] = [];
    const sourceNodes: Node[] = [];
    const edges: Edge[] = [];
    let row = 0;
    let idx = 0;

    groups.forEach((list, type) => {
      const meta = connectorMetaFor(type);
      const ys: number[] = [];
      list.forEach((s) => {
        const y = row * ROW;
        row += 1;
        ys.push(y);
        const id = `src-${idx++}`;
        sourceNodes.push({
          id,
          position: { x: 640, y },
          data: { label: s.database ? `${s.name}  ·  ${s.database}` : s.name, source: s },
          style: { ...NODE_BASE, background: '#ffffff', color: '#1e293b', border: `1px solid ${meta.hex}` },
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
        });
        edges.push({
          id: `e-${type}-${id}`,
          source: `type-${type}`,
          target: id,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: meta.hex },
        });
      });
      const ty = ys.reduce((a, b) => a + b, 0) / ys.length;
      typeNodes.push({
        id: `type-${type}`,
        position: { x: 330, y: ty },
        data: { label: `${meta.label}  ·  ${list.length}` },
        style: { ...NODE_BASE, background: meta.hex, color: '#ffffff', fontWeight: 600, border: 'none' },
        targetPosition: Position.Left,
        sourcePosition: Position.Right,
      });
      edges.push({
        id: `e-root-${type}`,
        source: 'root',
        target: `type-${type}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#94a3b8' },
      });
    });

    const rootNode: Node = {
      id: 'root',
      position: { x: 0, y: Math.max(0, ((row - 1) * ROW) / 2) },
      data: { label: `Connected sources  ·  ${filtered.length}` },
      style: { ...NODE_BASE, background: '#0f172a', color: '#ffffff', fontWeight: 600, border: 'none', width: 160 },
      sourcePosition: Position.Right,
    };

    return { nodes: [rootNode, ...typeNodes, ...sourceNodes], edges };
  }, [filtered]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const source = (node.data as { source?: CatalogSource })?.source;
      if (source) selectSource(source);
    },
    [selectSource],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Source Hub</h2>
          {!loading && !error && data && (
            <Badge size="sm" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-[10px]">
              {fmtCount(data.count)} connected
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sources…"
              aria-label="Search sources"
              className="w-44 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* View switch */}
          <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden" role="group" aria-label="View mode">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={view === opt.id}
                title={opt.label}
                onClick={() => setView(opt.id)}
                className={cn(
                  'p-2 transition-colors',
                  view === opt.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300'
                    : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
              >
                {opt.icon}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader size="sm" className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Failed to load connected sources</p>
            <p className="text-xs text-rose-700 dark:text-rose-400">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3 w-3" />Retry
          </Button>
        </div>
      )}

      {/* Stats row */}
      {!error && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Database className="h-4 w-4 text-indigo-500" />} label="Connected sources" value={data?.count} loading={loading} />
          <StatCard icon={<Layers className="h-4 w-4 text-purple-500" />} label="Connector types" value={loading ? undefined : facets.length} loading={loading} />
          <StatCard icon={<Plug className="h-4 w-4 text-orange-500" />} label="External connectors" value={loading ? undefined : externalCount} loading={loading} />
        </div>
      )}

      {/* Connector-type facets (by_type) — group filters. Hidden for the tree
          view, which manages its own search/drill-down. */}
      {!error && !loading && view !== 'tree' && facets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FacetChip
            active={typeFilter === null}
            label="All"
            count={data?.count ?? sources.length}
            onClick={() => setTypeFilter(null)}
          />
          {facets.map(([type, n]) => {
            const meta = connectorMetaFor(type);
            return (
              <FacetChip
                key={type}
                active={typeFilter === type}
                label={meta.label}
                count={n}
                onClick={() => setTypeFilter((cur) => (cur === type ? null : type))}
              />
            );
          })}
        </div>
      )}

      {/* Body */}
      {error ? null : view === 'tree' ? (
        <TreeView onSelectTable={selectTable} />
      ) : loading ? (
        <LoadingSkeleton view={view} />
      ) : filtered.length === 0 ? (
        <EmptyState hasAny={sources.length > 0} onClear={() => { setSearch(''); setTypeFilter(null); }} />
      ) : view === 'cards' ? (
        <CardsView sources={filtered} onSelect={selectSource} />
      ) : view === 'table' ? (
        <TableView sources={filtered} onSelect={selectSource} />
      ) : (
        <MapView nodes={flow.nodes} edges={flow.edges} onNodeClick={onNodeClick} />
      )}

      {/* Footer count for source-level views */}
      {!error && !loading && view !== 'tree' && sources.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {filtered.length} of {sources.length} source{sources.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number | undefined; loading: boolean }) {
  return (
    <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
      ) : (
        <p className={cn('text-2xl font-bold mt-1', !value ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white')}>
          {/* Honest "—" for missing; 0 renders as 0 (R3). */}
          {fmtCount(value)}
        </p>
      )}
    </div>
  );
}

function FacetChip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
        active
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
      )}
    >
      {label}
      <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-indigo-100 dark:bg-indigo-800/60' : 'bg-gray-100 dark:bg-gray-700')}>{count}</span>
    </button>
  );
}

function ConnectorIcon({ external, type, className }: { external: boolean; type: string | undefined; className?: string }) {
  const t = (type ?? '').toLowerCase();
  if (t.includes('stage')) return <Boxes className={className} />;
  if (external) return <Plug className={className} />;
  return <Database className={className} />;
}

function CardsView({ sources, onSelect }: { sources: CatalogSource[]; onSelect: (s: CatalogSource) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sources.map((s, i) => {
        const meta = connectorMetaFor(s.type);
        return (
          <button
            key={`${s.name}-${i}`}
            type="button"
            onClick={() => onSelect(s)}
            className="text-left p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${meta.hex}1a`, color: meta.hex }}>
                <ConnectorIcon external={meta.external} type={s.type} className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">{s.name}</span>
              <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <Badge size="sm" className={cn('text-[10px]', meta.badge)}>{meta.label}</Badge>
              {meta.external && (
                <Badge size="sm" className="text-[10px] bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">External</Badge>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <CardMetric label="Database" value={s.database ?? '—'} mono />
              <CardMetric label="Schemas" value={fmtCount(s.schema_count)} />
              <CardMetric label="Tables" value={fmtCount(s.table_count)} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CardMetric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-1.5 py-1">
      <p className="text-[9px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn('text-xs font-semibold text-gray-700 dark:text-gray-200 truncate', mono && 'font-mono')} title={value}>{value}</p>
    </div>
  );
}

function TableView({ sources, onSelect }: { sources: CatalogSource[]; onSelect: (s: CatalogSource) => void }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Source</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Connector</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Database</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Schemas</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Tables</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500" aria-label="Open details" />
          </tr>
        </thead>
        <tbody>
          {sources.map((s, i) => {
            const meta = connectorMetaFor(s.type);
            return (
              <tr
                key={`${s.name}-${i}`}
                role="button"
                tabIndex={0}
                aria-label={`Open ${s.name}`}
                onClick={() => onSelect(s)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s); } }}
                className="border-b border-gray-50 dark:border-gray-800 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ConnectorIcon external={meta.external} type={s.type} className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium text-gray-900 dark:text-white text-xs">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge size="sm" className={cn('text-[10px]', meta.badge)}>{meta.label}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-[11px] font-mono text-gray-600 dark:text-gray-300">{s.database ?? '—'}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-700 dark:text-gray-300 tabular-nums">{fmtCount(s.schema_count)}</td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-700 dark:text-gray-300 tabular-nums">{fmtCount(s.table_count)}</td>
                <td className="px-4 py-2.5 text-right"><ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-300" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TreeView({ onSelectTable }: { onSelectTable: (database: string, schema: string, table: string) => void }) {
  return (
    <div className="flex h-[560px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Reuse the existing drill-down tree (database → schema → table). */}
      <SourceTree onSelectTable={onSelectTable} />
      <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-6 text-center md:flex">
        <FolderTree className="h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Expand a source to drill into its schemas and tables.</p>
        <p className="text-xs text-gray-400">Selecting a table opens its detail panel.</p>
      </div>
    </div>
  );
}

function MapView({ nodes, edges, onNodeClick }: { nodes: Node[]; edges: Edge[]; onNodeClick: (e: React.MouseEvent, node: Node) => void }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-900" /> Platform</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Connector type</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-indigo-400" /> Source</span>
        <span className="ml-auto italic">Topology grouped by connector type — not query lineage.</span>
      </div>
      <div className="h-[480px] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodeClick={onNodeClick}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
        >
          <Background gap={16} color="#e2e8f0" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden md:!block" />
        </ReactFlow>
      </div>
    </div>
  );
}

function LoadingSkeleton({ view }: { view: SourceViewMode }) {
  if (view === 'table') {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50" />
        ))}
      </div>
    );
  }
  if (view === 'map') {
    return <div className="h-[480px] w-full animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      ))}
    </div>
  );
}

function EmptyState({ hasAny, onClear }: { hasAny: boolean; onClear: () => void }) {
  return (
    <div className="text-center py-16">
      <Database className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      {hasAny ? (
        <>
          <p className="text-sm text-gray-500">No sources match your filters</p>
          <Button size="sm" variant="text" onClick={onClear} className="mt-1 text-indigo-600">Clear filters</Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No connected sources yet</p>
          <p className="text-xs text-gray-400 mt-1">Connect a data source to populate the hub.</p>
        </>
      )}
    </div>
  );
}
