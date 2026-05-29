'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader } from 'rizzui';
import {
  Database, ChevronRight, ChevronDown, Table2, Layers,
  Search, PanelLeftClose, PanelLeft, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDatabases, getSchemas, getTables } from '@/app/services/mapping';
import { getApiErrorMessage } from '@/lib/api-client';

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

export default function SourceTree({ onSelectTable, selectedTable, collapsed, onToggleCollapse }: SourceTreeProps) {
  const [databases, setDatabases] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

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
        prev.map((db) =>
          db.name === node.name ? { ...db, loading: true } : db
        )
      );
      try {
        const schemas = await getSchemas(node.name);
        setDatabases((prev) =>
          prev.map((db) =>
            db.name === node.name
              ? {
                  ...db,
                  loading: false,
                  loaded: true,
                  error: undefined,
                  children: schemas.map((s) => ({
                    type: 'schema' as const,
                    name: s,
                    database: node.name,
                    children: [],
                    loaded: false,
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
            ? {
                ...db,
                children: db.children?.map((s) =>
                  s.name === node.name ? { ...s, loading: true } : s
                ),
              }
            : db
        )
      );
      try {
        const tables = await getTables(dbName, node.name);
        setDatabases((prev) =>
          prev.map((db) =>
            db.name === dbName
              ? {
                  ...db,
                  children: db.children?.map((s) =>
                    s.name === node.name
                      ? {
                          ...s,
                          loading: false,
                          loaded: true,
                          error: undefined,
                          children: tables.map((t) => ({
                            type: 'table' as const,
                            name: t,
                            database: dbName,
                            schema: node.name,
                          })),
                        }
                      : s
                  ),
                }
              : db
          )
        );
      } catch (err) {
        const msg = getApiErrorMessage(err);
        setDatabases((prev) =>
          prev.map((db) =>
            db.name === dbName
              ? {
                  ...db,
                  children: db.children?.map((s) =>
                    s.name === node.name ? { ...s, loading: false, error: msg } : s
                  ),
                }
              : db
          )
        );
      }
    }
  }, [expanded]);

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

  return (
    <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col h-full">
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
                <button
                  onClick={() => toggleExpand(dbKey, db)}
                  aria-expanded={isDbExpanded}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {isDbExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Database className="h-3.5 w-3.5 text-blue-500" />
                  <span className="truncate">{db.name}</span>
                  {db.loading && <Loader size="sm" className="ml-auto h-3 w-3" />}
                  {db.error && <AlertTriangle className="ml-auto h-3 w-3 text-rose-500" />}
                </button>

                {isDbExpanded && db.error && (
                  <p role="alert" className="ml-6 px-2 py-1 text-[10px] text-rose-600 dark:text-rose-400">{db.error}</p>
                )}

                {isDbExpanded && db.children?.map((schemaNode) => {
                  const schemaKey = `${db.name}.${schemaNode.name}`;
                  const isSchemaExpanded = expanded.has(schemaKey);
                  return (
                    <div key={schemaKey} className="ml-4">
                      <button
                        onClick={() => toggleExpand(schemaKey, schemaNode)}
                        aria-expanded={isSchemaExpanded}
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        {isSchemaExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <Layers className="h-3 w-3 text-purple-500" />
                        <span className="truncate">{schemaNode.name}</span>
                        {schemaNode.loading && <Loader size="sm" className="ml-auto h-3 w-3" />}
                        {schemaNode.error && <AlertTriangle className="ml-auto h-3 w-3 text-rose-500" />}
                      </button>

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
                          <button
                            key={tableFqn}
                            onClick={() => onSelectTable(db.name, schemaNode.name, tableNode.name)}
                            className={cn(
                              'w-full flex items-center gap-1.5 px-2 py-1 ml-4 rounded-md text-xs transition-colors',
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            )}
                          >
                            <Table2 className="h-3 w-3 text-emerald-500" />
                            <span className="truncate">{tableNode.name}</span>
                          </button>
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
