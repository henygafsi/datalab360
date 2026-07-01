'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Database, Snowflake, HardDrive, Server, Loader2, Check, Eye,
  Lock, Beaker, ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { tablePreview } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { TableRef, TablePreview } from '@/app/services/api/types';

// ── Connector catalog (MVP: Snowflake needs no provisioning) ──
type ConnectorId = 'snowflake' | 's3' | 'postgres';
interface Connector {
  id: ConnectorId;
  label: string;
  icon: React.ElementType;
  ready: boolean;
}
const CONNECTORS: Connector[] = [
  { id: 'snowflake', label: 'Existing warehouse table', icon: Snowflake, ready: true },
  { id: 's3', label: 'Amazon S3', icon: HardDrive, ready: false },
  { id: 'postgres', label: 'PostgreSQL', icon: Server, ready: false },
];

interface StepConnectSourceProps {
  projectId: string;
  selectedTables: TableRef[];
  onTablesChange: (tables: TableRef[]) => void;
}

const tableKey = (t: TableRef) => `${t.database}.${t.schema}.${t.table}`;

const StepConnectSource: React.FC<StepConnectSourceProps> = ({
  projectId,
  selectedTables,
  onTablesChange,
}) => {
  const [connector, setConnector] = useState<ConnectorId>('snowflake');

  const [databases, setDatabases] = useState<string[]>([]);
  const [database, setDatabase] = useState<string>('');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);

  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);

  const [previews, setPreviews] = useState<Record<string, TablePreview>>({});
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Load databases on mount.
  useEffect(() => {
    let active = true;
    setLoadingDbs(true);
    getDatabases()
      .then((dbs) => active && setDatabases(dbs))
      .catch(() => active && toast.error('Failed to load databases'))
      .finally(() => active && setLoadingDbs(false));
    return () => {
      active = false;
    };
  }, []);

  // Cascading: database → schemas.
  useEffect(() => {
    if (!database) {
      setSchemas([]);
      return;
    }
    let active = true;
    setLoadingSchemas(true);
    setSchema('');
    setTables([]);
    getSchemas(database)
      .then((s) => active && setSchemas(s))
      .catch(() => active && toast.error('Failed to load schemas'))
      .finally(() => active && setLoadingSchemas(false));
    return () => {
      active = false;
    };
  }, [database]);

  // Cascading: schema → tables.
  useEffect(() => {
    if (!database || !schema) {
      setTables([]);
      return;
    }
    let active = true;
    setLoadingTables(true);
    getTables(database, schema)
      .then((t) => active && setTables(t))
      .catch(() => active && toast.error('Failed to load tables'))
      .finally(() => active && setLoadingTables(false));
    return () => {
      active = false;
    };
  }, [database, schema]);

  const toggleTable = useCallback(
    (tableName: string) => {
      const ref: TableRef = { database, schema, table: tableName };
      const key = tableKey(ref);
      const exists = selectedTables.some((t) => tableKey(t) === key);
      onTablesChange(
        exists
          ? selectedTables.filter((t) => tableKey(t) !== key)
          : [...selectedTables, ref],
      );
    },
    [database, schema, selectedTables, onTablesChange],
  );

  const handlePreview = useCallback(
    async (ref: TableRef) => {
      const key = tableKey(ref);
      setPreviewing(key);
      try {
        const res = await tablePreview(projectId, ref.database, ref.schema, ref.table, {
          limit: 3,
        });
        setPreviews((prev) => ({ ...prev, [key]: res }));
      } catch (err) {
        toast.error(getApiErrorMessage(err) || 'Preview failed');
      } finally {
        setPreviewing(null);
      }
    },
    [projectId],
  );

  return (
    <div className="space-y-5 p-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Connect a source
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Pick where your data lives. The model can span several tables.
        </p>
      </div>

      {/* Connector picker */}
      <div className="grid grid-cols-3 gap-2">
        {CONNECTORS.map((c) => {
          const Icon = c.icon;
          const active = connector === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setConnector(c.id)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors',
                active
                  ? 'border-purple-400 bg-purple-50 text-purple-700 dark:border-purple-600 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300',
              )}
            >
              <Icon className="h-5 w-5" />
              {c.label}
              {!c.ready && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <Lock className="h-2.5 w-2.5" /> provisioning
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Non-Snowflake: backend gap card + deep link */}
      {connector !== 'snowflake' && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
          <div className="flex items-center gap-2">
            <Lock className="h-3 w-3 text-violet-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              Provisioning happens elsewhere
            </p>
          </div>
          <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-300">
            New {connector === 's3' ? 'S3' : 'PostgreSQL'} connections are created in the
            Data Source Connection module, then surface here as Snowflake-backed tables.
          </p>
          <a
            href="/data-source-connection"
            className="mt-2 inline-flex items-center gap-1 rounded bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-200"
          >
            <Beaker className="h-3 w-3" />
            Open Data Source Connection
            <ChevronRight className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Snowflake cascading pickers */}
      {connector === 'snowflake' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Database
              </span>
              <select
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                disabled={loadingDbs}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">{loadingDbs ? 'Loading…' : 'Select database'}</option>
                {databases.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Schema
              </span>
              <select
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                disabled={!database || loadingSchemas}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">
                  {loadingSchemas ? 'Loading…' : 'Select schema'}
                </option>
                {schemas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Table multi-select */}
          {database && schema && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <Database className="h-3.5 w-3.5" />
                Tables {loadingTables && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <div className="max-h-56 overflow-y-auto">
                {!loadingTables && tables.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-slate-400">
                    No tables in this schema.
                  </p>
                )}
                {tables.map((t) => {
                  const ref: TableRef = { database, schema, table: t };
                  const key = tableKey(ref);
                  const selected = selectedTables.some((s) => tableKey(s) === key);
                  const preview = previews[key];
                  return (
                    <div key={t} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <div className="flex items-center justify-between px-3 py-2">
                        <label className="flex flex-1 items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTable(t)}
                            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span className={cn(selected && 'font-medium text-purple-700 dark:text-purple-300')}>
                            {t}
                          </span>
                        </label>
                        <button
                          onClick={() => handlePreview(ref)}
                          disabled={previewing === key}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {previewing === key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          Preview
                        </button>
                      </div>
                      {preview && (
                        <div className="overflow-x-auto px-3 pb-2">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-slate-400">
                                {preview.columns.slice(0, 6).map((c) => (
                                  <th key={c} className="px-1 py-0.5 text-left font-medium">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.rows.slice(0, 3).map((row, i) => (
                                <tr key={i} className="text-slate-600 dark:text-slate-300">
                                  {preview.columns.slice(0, 6).map((c) => (
                                    <td key={c} className="truncate px-1 py-0.5">
                                      {String(row[c] ?? '—')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selection summary */}
      {selectedTables.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          <Check className="h-3.5 w-3.5" />
          {selectedTables.length} table{selectedTables.length > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
};

export default StepConnectSource;
