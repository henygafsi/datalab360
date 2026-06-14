'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader } from 'rizzui';
import {
  Database, ChevronRight, ChevronDown, Table2, Layers,
  Search, PanelLeftClose, PanelLeft, AlertTriangle, RefreshCw,
  Tag as TagIcon, Home, Loader2, Check, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDatabases, getSchemas, getTables } from '@/app/services/mapping';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  NodeKpis, scoreBucket, latencyBucket, latencyLabel,
  fetchNodeKpis, dryRunRefreshNodeKpis,
} from '@/app/services/catalog/nodeKpis';
import {
  SOURCE_TAG_OPTIONS, readAllTags, writeTag, tagKey,
} from '@/app/services/catalog/sourceTags';

interface SourceTreeProps {
  onSelectTable: (database: string, schema: string, table: string) => void;
  selectedTable?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface TreeNode {
  type: 'database' | 'schema' | 'table';
  name: string;
  database?: string;
  schema?: string;
  children?: TreeNode[];
  loaded?: boolean;
  loading?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Goal-axis palette (module scope — stable).
// ---------------------------------------------------------------------------
const KPI_BUCKET_CLS: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  none: 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400',
};

function fmtScore(v: number | null): string {
  return v == null ? '—' : String(Math.round(v));
}

// ---------------------------------------------------------------------------
// Inline per-object goal-axis KPIs (DQ · GOV · COST · PERF). Module scope.
// ---------------------------------------------------------------------------
function InlineKpis({
  kpis, loading, refreshing, onDryRun,
}: {
  kpis?: NodeKpis;
  loading: boolean;
  refreshing: boolean;
  onDryRun: () => void;
}) {
  return (
    <div className="ml-12 mt-0.5 mb-1 flex items-center gap-1 flex-wrap">
      {loading ? (
        <span className="flex items-center gap-1 text-[9px] text-slate-400">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> scoring…
        </span>
      ) : !kpis || !kpis.hasScores ? (
        <span className="text-[9px] text-slate-400 italic">no scores</span>
      ) : (
        <>
          <KpiPill axis="DQ" value={fmtScore(kpis.dq)} bucket={scoreBucket(kpis.dq)} />
          <KpiPill axis="GOV" value={fmtScore(kpis.gov)} bucket={scoreBucket(kpis.gov)} />
          <KpiPill axis="COST" value={fmtScore(kpis.cost)} bucket={scoreBucket(kpis.cost)} />
          <KpiPill
            axis="PERF*"
            value={latencyLabel(kpis.perfMs ?? null)}
            bucket={latencyBucket(kpis.perfMs ?? null)}
            title="PERF = avg query latency (derived from finops inputs, not a 0–100 score)"
          />
        </>
      )}
      <button
        type="button"
        onClick={onDryRun}
        disabled={refreshing}
        className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
        title="Dry-run (sample) + refresh scores"
      >
        {refreshing
          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
          : <RefreshCw className="h-2.5 w-2.5" />}
        dry-run
      </button>
    </div>
  );
}

function KpiPill({
  axis, value, bucket, title,
}: { axis: string; value: string; bucket: string; title?: string; }) {
  return (
    <span
      className={cn('inline-flex flex-col items-center leading-none px-1 py-0.5 rounded', KPI_BUCKET_CLS[bucket])}
      title={title}
    >
      <span className="text-[7px] font-semibold tracking-wide opacity-70">{axis}</span>
      <span className="text-[10px] font-bold">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Editable (local-only) source-type tag chip for DB / schema rows.
// ---------------------------------------------------------------------------
function TagChipButton({ tag, onClick }: { tag: string | null; onClick: () => void; }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium ml-auto',
        tag
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
          : 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-400 italic',
      )}
      title={tag ? `Source type: ${tag} (local)` : 'Classify (local)'}
    >
      <TagIcon className="h-2.5 w-2.5" />
      {tag ?? 'tag'}
    </button>
  );
}

interface TagEditorState { fqn: string; database: string; schema?: string; current: string | null; }

function TagEditorPopover({
  state, onApply, onClose,
}: {
  state: TagEditorState;
  onApply: (fqn: string, tag: string | null) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');
  return (
    <div className="absolute inset-x-2 top-12 z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 truncate">
          <TagIcon className="h-3 w-3 text-indigo-500 shrink-0" />
          {state.schema ? `${state.database}.${state.schema}` : state.database}
        </p>
        <button type="button" onClick={onClose} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
          <X className="h-3 w-3 text-slate-400" />
        </button>
      </div>
      <p className="text-[9px] text-amber-600 dark:text-amber-400 mb-2">Saved locally — no backend write yet.</p>
      <div className="flex flex-wrap gap-1">
        {SOURCE_TAG_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onApply(state.fqn, opt)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-medium',
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
          placeholder="Custom…"
          className="flex-1 px-2 py-1 text-[10px] rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          type="button"
          disabled={!custom.trim()}
          onClick={() => onApply(state.fqn, custom)}
          className="px-2 py-1 rounded text-[10px] font-medium bg-indigo-600 text-white disabled:opacity-40"
        >Set</button>
      </div>
      {state.current && (
        <button type="button" onClick={() => onApply(state.fqn, null)} className="mt-1.5 text-[9px] text-rose-600 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}

export default function SourceTree({ onSelectTable, selectedTable, collapsed, onToggleCollapse }: SourceTreeProps) {
  const [databases, setDatabases] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  // Editable source-type tags (local-only) + inline object KPIs.
  const [tags, setTags] = useState<Record<string, string>>(() => readAllTags());
  const [tagEditor, setTagEditor] = useState<TagEditorState | null>(null);
  const [kpisByFqn, setKpisByFqn] = useState<Record<string, NodeKpis>>({});
  const [loadingFqns, setLoadingFqns] = useState<Set<string>>(() => new Set());
  const [refreshingFqns, setRefreshingFqns] = useState<Set<string>>(() => new Set());

  const loadDatabases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dbs = await getDatabases();
      setDatabases(dbs.map((name) => ({ type: 'database' as const, name, children: [], loaded: false })));
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDatabases(); }, [loadDatabases]);

  // "Back to overview" — collapse everything to the root DB list.
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  // Editable tag handlers (optimistic-local).
  const editTag = useCallback((database: string, schema?: string) => {
    const fqn = tagKey(database, schema);
    setTagEditor({ fqn, database, schema, current: readAllTags()[fqn] ?? null });
  }, []);
  const applyTag = useCallback((fqn: string, tag: string | null) => {
    setTags(writeTag(fqn, tag));
    setTagEditor(null);
  }, []);

  // Lazy-load object KPIs for the tables of a freshly-expanded schema.
  const loadSchemaKpis = useCallback((tableNodes: TreeNode[]) => {
    const targets = tableNodes.filter((t) => t.database && t.schema);
    if (targets.length === 0) return;
    setLoadingFqns((prev) => {
      const next = new Set(prev);
      targets.forEach((t) => next.add(`${t.database}.${t.schema}.${t.name}`));
      return next;
    });
    targets.forEach(async (t) => {
      const fqn = `${t.database}.${t.schema}.${t.name}`;
      try {
        const k = await fetchNodeKpis(t.database as string, t.schema as string, t.name);
        setKpisByFqn((prev) => ({ ...prev, [fqn]: k }));
      } catch {
        // soft-fail — leave node in "no scores" state.
      } finally {
        setLoadingFqns((prev) => {
          const next = new Set(prev);
          next.delete(fqn);
          return next;
        });
      }
    });
  }, []);

  const handleDryRun = useCallback(async (database: string, schema: string, table: string) => {
    const fqn = `${database}.${schema}.${table}`;
    setRefreshingFqns((prev) => new Set(prev).add(fqn));
    try {
      const k = await dryRunRefreshNodeKpis(database, schema, table);
      setKpisByFqn((prev) => ({ ...prev, [fqn]: k }));
    } catch {
      // keep prior state
    } finally {
      setRefreshingFqns((prev) => {
        const next = new Set(prev);
        next.delete(fqn);
        return next;
      });
    }
  }, []);

  const toggleExpand = useCallback(async (key: string, node: TreeNode) => {
    const next = new Set(expanded);
    if (next.has(key)) {
      next.delete(key);
      setExpanded(next);
      return;
    }
    next.add(key);
    setExpanded(next);

    if (node.type === 'database' && !node.loaded) {
      setDatabases((prev) =>
        prev.map((db) => (db.name === node.name ? { ...db, loading: true } : db))
      );
      try {
        const schemas = await getSchemas(node.name);
        setDatabases((prev) =>
          prev.map((db) =>
            db.name === node.name
              ? {
                  ...db, loading: false, loaded: true, error: undefined,
                  children: schemas.map((s) => ({
                    type: 'schema' as const, name: s, database: node.name,
                    children: [], loaded: false,
                  })),
                }
              : db
          )
        );
      } catch (err) {
        const msg = getApiErrorMessage(err);
        setDatabases((prev) =>
          prev.map((db) => (db.name === node.name ? { ...db, loading: false, error: msg } : db))
        );
      }
    }

    if (node.type === 'schema' && !node.loaded && node.database) {
      const dbName = node.database;
      setDatabases((prev) =>
        prev.map((db) =>
          db.name === dbName
            ? { ...db, children: db.children?.map((s) => (s.name === node.name ? { ...s, loading: true } : s)) }
            : db
        )
      );
      try {
        const tables = await getTables(dbName, node.name);
        const tableNodes: TreeNode[] = tables.map((t) => ({
          type: 'table' as const, name: t, database: dbName, schema: node.name,
        }));
        setDatabases((prev) =>
          prev.map((db) =>
            db.name === dbName
              ? {
                  ...db,
                  children: db.children?.map((s) =>
                    s.name === node.name
                      ? { ...s, loading: false, loaded: true, error: undefined, children: tableNodes }
                      : s
                  ),
                }
              : db
          )
        );
        loadSchemaKpis(tableNodes);
      } catch (err) {
        const msg = getApiErrorMessage(err);
        setDatabases((prev) =>
          prev.map((db) =>
            db.name === dbName
              ? { ...db, children: db.children?.map((s) => (s.name === node.name ? { ...s, loading: false, error: msg } : s)) }
              : db
          )
        );
      }
    }
  }, [expanded, loadSchemaKpis]);

  if (collapsed) {
    return (
      <div className="w-12 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col items-center pt-3">
        <button onClick={onToggleCollapse} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Expand sources">
          <PanelLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="mt-4 space-y-2">
          {databases.slice(0, 8).map((db) => (
            <div key={db.name} className="w-7 h-7 rounded bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center" title={db.name}>
              <Database className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const filterTree = (nodes: TreeNode[], q: string): TreeNode[] => {
    if (!q) return nodes;
    return nodes.reduce<TreeNode[]>((acc, node) => {
      if (node.name.toLowerCase().includes(q)) {
        acc.push(node);
      } else if (node.children) {
        const filtered = filterTree(node.children, q);
        if (filtered.length > 0) acc.push({ ...node, children: filtered });
      }
      return acc;
    }, []);
  };

  const visible = filterTree(databases, search.toLowerCase());
  const anyExpanded = expanded.size > 0;

  return (
    <div className="relative w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col h-full">
      {tagEditor && (
        <TagEditorPopover state={tagEditor} onApply={applyTag} onClose={() => setTagEditor(null)} />
      )}
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button onClick={onToggleCollapse} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="Collapse">
          <PanelLeftClose className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Breadcrumb / zoom-out — back to the DB overview at any depth. */}
      <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-1">
        <button
          type="button"
          onClick={collapseAll}
          disabled={!anyExpanded}
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-medium',
            anyExpanded ? 'text-blue-600 hover:text-blue-700 dark:text-blue-400' : 'text-slate-400',
          )}
          title="Back to overview"
        >
          <Home className="h-3 w-3" /> Overview
        </button>
        {anyExpanded && <span className="text-[10px] text-slate-400 ml-auto">{expanded.size} expanded</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size="sm" />
          </div>
        ) : error ? (
          <div role="alert" className="m-1 rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <p className="text-[11px] text-rose-700 dark:text-rose-400">{error}</p>
            </div>
            <button
              onClick={loadDatabases}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:underline dark:text-rose-300"
            >
              <RefreshCw className="h-3 w-3" />Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No sources found</p>
        ) : (
          visible.map((db) => {
            const dbKey = db.name;
            const isDbExpanded = expanded.has(dbKey);
            return (
              <div key={dbKey}>
                <div className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <button
                    onClick={() => toggleExpand(dbKey, db)}
                    aria-expanded={isDbExpanded}
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                  >
                    {isDbExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{db.name}</span>
                    {db.loading && <Loader size="sm" className="h-3 w-3" />}
                    {db.error && <AlertTriangle className="h-3 w-3 text-rose-500" />}
                  </button>
                  <TagChipButton tag={tags[tagKey(db.name)] ?? null} onClick={() => editTag(db.name)} />
                </div>

                {isDbExpanded && db.error && (
                  <p role="alert" className="ml-6 px-2 py-1 text-[10px] text-rose-600 dark:text-rose-400">{db.error}</p>
                )}

                {isDbExpanded && db.children?.map((schemaNode) => {
                  const schemaKey = `${db.name}.${schemaNode.name}`;
                  const isSchemaExpanded = expanded.has(schemaKey);
                  return (
                    <div key={schemaKey} className="ml-4">
                      <div className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <button
                          onClick={() => toggleExpand(schemaKey, schemaNode)}
                          aria-expanded={isSchemaExpanded}
                          className="flex items-center gap-1.5 flex-1 min-w-0"
                        >
                          {isSchemaExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                          <Layers className="h-3 w-3 text-purple-500 shrink-0" />
                          <span className="truncate">{schemaNode.name}</span>
                          {schemaNode.loading && <Loader size="sm" className="h-3 w-3" />}
                          {schemaNode.error && <AlertTriangle className="h-3 w-3 text-rose-500" />}
                        </button>
                        <TagChipButton
                          tag={tags[tagKey(db.name, schemaNode.name)] ?? null}
                          onClick={() => editTag(db.name, schemaNode.name)}
                        />
                      </div>

                      {isSchemaExpanded && schemaNode.error && (
                        <p role="alert" className="ml-6 px-2 py-1 text-[10px] text-rose-600 dark:text-rose-400">{schemaNode.error}</p>
                      )}

                      {isSchemaExpanded && !schemaNode.error && schemaNode.loaded && schemaNode.children?.length === 0 && (
                        <p className="ml-8 px-2 py-1 text-[10px] text-gray-400">No tables</p>
                      )}

                      {isSchemaExpanded && schemaNode.children?.map((tableNode) => {
                        const tableFqn = `${db.name}.${schemaNode.name}.${tableNode.name}`;
                        const isSelected = selectedTable === tableFqn;
                        return (
                          <div key={tableFqn}>
                            <button
                              onClick={() => onSelectTable(db.name, schemaNode.name, tableNode.name)}
                              className={cn(
                                'w-full flex items-center gap-1.5 px-2 py-1 ml-4 rounded-md text-xs transition-colors',
                                isSelected
                                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                              )}
                            >
                              <Table2 className="h-3 w-3 text-emerald-500 shrink-0" />
                              <span className="truncate">{tableNode.name}</span>
                            </button>
                            <InlineKpis
                              kpis={kpisByFqn[tableFqn]}
                              loading={loadingFqns.has(tableFqn)}
                              refreshing={refreshingFqns.has(tableFqn)}
                              onDryRun={() => handleDryRun(db.name, schemaNode.name, tableNode.name)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
