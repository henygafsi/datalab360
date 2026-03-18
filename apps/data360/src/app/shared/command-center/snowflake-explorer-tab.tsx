'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { Badge, Loader } from 'rizzui';
import {
  Database, Table2, Columns3, ChevronRight,
  ArrowLeft, FolderOpen, FileCode, Eye,
  Layers, Box,
} from 'lucide-react';
import apiClient from '@/lib/api-client';

type BrowseLevel = 'databases' | 'schemas' | 'objects';

interface DbInfo {
  name: string;
  schema_count?: number;
  created_on?: string;
  owner?: string;
  comment?: string;
}

interface SchemaInfo {
  name: string;
  table_count?: number;
  created_on?: string;
  owner?: string;
}

interface ObjectInfo {
  name: string;
  kind?: string;
  rows?: number;
  bytes?: number;
  created_on?: string;
  owner?: string;
  comment?: string;
  columns?: number;
  cluster_by?: string;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function SnowflakeExplorerTab() {
  const [level, setLevel] = useState<BrowseLevel>('databases');
  const [databases, setDatabases] = useState<DbInfo[]>([]);
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/connect/snowflake_lake/databases');
      const dbs = (res.data?.databases || res.data || []).map((d: any) => {
        if (typeof d === 'string') return { name: d };
        return { name: d.name || d.DATABASE_NAME || d, ...d };
      });
      setDatabases(dbs);
      setLevel('databases');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load databases');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchemas = useCallback(async (db: string) => {
    setLoading(true);
    setError(null);
    setSelectedDb(db);
    try {
      const res = await apiClient.get(`/connect/snowflake_lake/schemas/${encodeURIComponent(db)}`);
      const schs = (res.data?.schemas || res.data || []).map((s: any) => {
        if (typeof s === 'string') return { name: s };
        return { name: s.name || s.SCHEMA_NAME || s, ...s };
      });
      setSchemas(schs);
      setLevel('schemas');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load schemas');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchObjects = useCallback(async (db: string, schema: string) => {
    setLoading(true);
    setError(null);
    setSelectedSchema(schema);
    try {
      const res = await apiClient.get(`/connect/snowflake_lake/tables/${encodeURIComponent(db)}/${encodeURIComponent(schema)}`);
      const objs = (res.data?.tables || res.data || []).map((t: any) => {
        if (typeof t === 'string') return { name: t, kind: 'TABLE' };
        return {
          name: t.name || t.TABLE_NAME || t,
          kind: t.kind || t.TABLE_TYPE || 'TABLE',
          rows: t.rows || t.ROW_COUNT,
          bytes: t.bytes || t.BYTES,
          created_on: t.created_on || t.CREATED,
          owner: t.owner || t.OWNER,
          comment: t.comment || t.COMMENT,
          columns: t.columns,
          cluster_by: t.cluster_by || t.CLUSTERING_KEY,
        };
      });
      setObjects(objs);
      setLevel('objects');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load objects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  const handleBack = () => {
    if (level === 'objects') {
      setLevel('schemas');
      setSelectedSchema(null);
    } else if (level === 'schemas') {
      setLevel('databases');
      setSelectedDb(null);
    }
  };

  const breadcrumb = (
    <div className="flex items-center gap-2 text-sm mb-4">
      <button
        onClick={() => { setLevel('databases'); setSelectedDb(null); setSelectedSchema(null); }}
        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
      >
        Snowflake
      </button>
      {selectedDb && (
        <>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <button
            onClick={() => { setLevel('schemas'); setSelectedSchema(null); fetchSchemas(selectedDb); }}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {selectedDb}
          </button>
        </>
      )}
      {selectedSchema && (
        <>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <span className="text-gray-900 dark:text-white font-medium">{selectedSchema}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Snowflake Object Browser</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Browse databases, schemas, and tables across your Snowflake account.
          </p>
        </div>
        {level !== 'databases' && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        )}
      </div>

      {breadcrumb}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" />
        </div>
      ) : level === 'databases' ? (
        /* ── Databases Grid ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {databases.length === 0 ? (
            <p className="col-span-full text-center py-12 text-gray-400">No databases found</p>
          ) : (
            databases.map((db) => (
              <button
                key={db.name}
                onClick={() => fetchSchemas(db.name)}
                className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-left hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{db.name}</h4>
                    {db.owner && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Owner: {db.owner}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                </div>
                {db.comment && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{db.comment}</p>
                )}
              </button>
            ))
          )}
        </div>
      ) : level === 'schemas' ? (
        /* ── Schemas Grid ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {schemas.length === 0 ? (
            <p className="col-span-full text-center py-12 text-gray-400">No schemas found in {selectedDb}</p>
          ) : (
            schemas.map((sch) => (
              <button
                key={sch.name}
                onClick={() => selectedDb && fetchObjects(selectedDb, sch.name)}
                className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-left hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <FolderOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{sch.name}</h4>
                    {sch.owner && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Owner: {sch.owner}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-violet-500 transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        /* ── Objects Table ── */
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Objects</h3>
              <Badge size="sm" variant="flat" color="secondary">{objects.length}</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Rows</th>
                  <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Size</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Owner</th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Clustering</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {objects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      No objects found in {selectedDb}.{selectedSchema}
                    </td>
                  </tr>
                ) : (
                  objects.map((obj) => (
                    <tr key={obj.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {obj.kind === 'VIEW' ? (
                            <Eye className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                          ) : obj.kind === 'EXTERNAL TABLE' ? (
                            <Layers className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          ) : (
                            <Table2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="text-gray-900 dark:text-white font-medium truncate">{obj.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          size="sm"
                          variant="flat"
                          color={obj.kind === 'VIEW' ? 'info' : obj.kind === 'EXTERNAL TABLE' ? 'warning' : 'secondary'}
                        >
                          {obj.kind || 'TABLE'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {obj.rows != null ? obj.rows.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatBytes(obj.bytes)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                        {obj.owner || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                        {obj.cluster_by || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(SnowflakeExplorerTab);
