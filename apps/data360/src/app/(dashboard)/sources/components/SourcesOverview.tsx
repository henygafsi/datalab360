'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge, Button, Loader } from 'rizzui';
import {
  Database, Search, Table2, Layers, RefreshCw, ChevronRight,
  Grid3X3, List, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDatabases, getSchemas, getTables } from '@/app/services/mapping';
import { getApiErrorMessage } from '@/lib/api-client';
import MetricHelp, { type MetricHelpProps } from '@/components/ui/MetricHelp';

interface SourceTable {
  database: string;
  schema: string;
  name: string;
  fqn: string;
}

interface SourcesOverviewProps {
  onSelectTable: (database: string, schema: string, table: string) => void;
}

export default function SourcesOverview({ onSelectTable }: SourcesOverviewProps) {
  const [tables, setTables] = useState<SourceTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filterSchema, setFilterSchema] = useState<string>('');
  const [filterDb, setFilterDb] = useState<string>('');
  const [allDatabases, setAllDatabases] = useState<string[]>([]);
  const [allSchemas, setAllSchemas] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'schema' | 'database'>('name');

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPartialErrors([]);
    const warnings: string[] = [];
    try {
      const dbs = await getDatabases();
      setAllDatabases(dbs);
      const allTables: SourceTable[] = [];
      const schemaSet = new Set<string>();

      for (const db of dbs) {
        let schemas: string[];
        try {
          schemas = await getSchemas(db);
        } catch (err) {
          warnings.push(`${db}: ${getApiErrorMessage(err)}`);
          continue;
        }
        schemas.forEach((s) => schemaSet.add(s));
        for (const sch of schemas) {
          try {
            const tbls = await getTables(db, sch);
            tbls.forEach((t) => {
              allTables.push({
                database: db,
                schema: sch,
                name: t,
                fqn: `${db}.${sch}.${t}`,
              });
            });
          } catch (err) {
            warnings.push(`${db}.${sch}: ${getApiErrorMessage(err)}`);
          }
        }
      }

      setAllSchemas(Array.from(schemaSet));
      setTables(allTables);
      setPartialErrors(warnings);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const filtered = useMemo(() => {
    let result = tables;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.fqn.toLowerCase().includes(q)
      );
    }
    if (filterDb) result = result.filter((t) => t.database === filterDb);
    if (filterSchema) result = result.filter((t) => t.schema === filterSchema);
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'schema') return a.schema.localeCompare(b.schema);
      return a.database.localeCompare(b.database);
    });
    return result;
  }, [tables, search, filterDb, filterSchema, sortBy]);

  const stats = useMemo(() => ({
    databases: new Set(tables.map((t) => t.database)).size,
    schemas: new Set(tables.map((t) => `${t.database}.${t.schema}`)).size,
    tables: tables.length,
  }), [tables]);

  return (
    <div className="space-y-4">
      {/* Top-level error */}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Failed to load sources</p>
            <p className="text-xs text-rose-700 dark:text-rose-400">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadSources} className="gap-1.5">
            <RefreshCw className="h-3 w-3" />Retry
          </Button>
        </div>
      )}

      {/* Partial load warnings — surface skipped databases/schemas instead of silently dropping them */}
      {!error && partialErrors.length > 0 && (
        <details className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {partialErrors.length} source{partialErrors.length > 1 ? 's' : ''} could not be listed
          </summary>
          <ul className="mt-2 space-y-0.5">
            {partialErrors.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-700 dark:text-amber-400">• {w}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        {([
          {
            label: 'Databases', value: stats.databases, icon: <Database className="h-4 w-4 text-blue-500" />, color: 'blue',
            help: { title: 'Databases', definition: 'Distinct source databases discovered in the connected data warehouse catalog.', source: 'catalog scan' },
          },
          {
            label: 'Schemas', value: stats.schemas, icon: <Layers className="h-4 w-4 text-purple-500" />, color: 'purple',
            help: { title: 'Schemas', definition: 'Unique database-qualified schemas found across all discovered databases.', source: 'catalog scan' },
          },
          {
            label: 'Tables', value: stats.tables, icon: <Table2 className="h-4 w-4 text-emerald-500" />, color: 'emerald',
            help: { title: 'Tables discovered', definition: 'Total source tables enumerated across every database and schema in the catalog.', source: 'catalog scan' },
          },
        ] as { label: string; value: number; icon: React.ReactNode; color: string; help: MetricHelpProps }[]).map((s) => (
          <div key={s.label} className={cn('p-4 rounded-xl border bg-white dark:bg-gray-800', `border-${s.color}-100 dark:border-${s.color}-900/30`)}>
            <div className="flex items-center gap-2">
              {s.icon}
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{s.label}</span>
              <MetricHelp {...s.help} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {loading ? '—' : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={filterDb}
          onChange={(e) => { setFilterDb(e.target.value); setFilterSchema(''); }}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Databases</option>
          {allDatabases.map((db) => <option key={db} value={db}>{db}</option>)}
        </select>

        <select
          value={filterSchema}
          onChange={(e) => setFilterSchema(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Schemas</option>
          {allSchemas
            .filter((s) => !filterDb || tables.some((t) => t.database === filterDb && t.schema === s))
            .map((s) => <option key={s} value={s}>{s}</option>)
          }
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'schema' | 'database')}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="name">Sort by Name</option>
          <option value="schema">Sort by Schema</option>
          <option value="database">Sort by Database</option>
        </select>

        <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-2', viewMode === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800')}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={cn('p-2', viewMode === 'grid' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800')}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
        </div>

        <Button variant="outline" size="sm" onClick={loadSources} disabled={loading} className="gap-1.5">
          {loading ? <Loader size="sm" className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </Button>
      </div>

      {/* Table List/Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse h-14 rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : error ? null : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Table2 className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {tables.length === 0 ? 'No tables found' : 'No tables match your filters'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Table</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Schema</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Database</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500" aria-label="Open details" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.fqn}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${t.fqn}`}
                  onClick={() => onSelectTable(t.database, t.schema, t.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTable(t.database, t.schema, t.name);
                    }
                  }}
                  className="border-b border-gray-50 dark:border-gray-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-white text-xs">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge size="sm" className="bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px]">{t.schema}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge size="sm" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">{t.database}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <button
              key={t.fqn}
              onClick={() => onSelectTable(t.database, t.schema, t.name)}
              className="text-left p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <Table2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</span>
              </div>
              <p className="text-[10px] font-mono text-gray-400 truncate">{t.fqn}</p>
              <div className="flex gap-1.5 mt-2">
                <Badge size="sm" className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-[9px]">{t.database}</Badge>
                <Badge size="sm" className="bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 text-[9px]">{t.schema}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">{filtered.length} of {tables.length} tables</p>
    </div>
  );
}
