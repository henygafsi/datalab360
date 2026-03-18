'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, Button, Loader, Text, Tooltip } from 'rizzui';
import { RefreshCw, Play, Pause, RotateCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listPipes,
  refreshPipe,
  pausePipe,
  resumePipe,
  listStreams,
  listDynamicTables,
  listExternalTables,
  type PipeInfo,
  type StreamInfo,
  type DynamicTableInfo,
  type ExternalTableInfo,
} from './connectionServices';

type InfraTab = 'pipes' | 'streams' | 'dynamic-tables' | 'external-tables';

interface InfrastructureTabsProps {
  database?: string;
  schema?: string;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status?.toUpperCase() || '';
  if (normalized === 'RUNNING' || normalized === 'ACTIVE' || normalized === 'STARTED') {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 dark:border-green-700">{status}</Badge>;
  }
  if (normalized === 'PAUSED' || normalized === 'SUSPENDED' || normalized === 'STOPPED') {
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700">{status}</Badge>;
  }
  if (normalized === 'FAILED' || normalized === 'ERROR') {
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700">{status}</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600">{status || 'N/A'}</Badge>;
}

function HasDataBadge({ hasData }: { hasData: boolean }) {
  if (hasData) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 dark:border-green-700">Yes</Badge>;
  }
  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700">No</Badge>;
}

function AutoRefreshBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 dark:border-green-700">On</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-300 dark:border-gray-600">Off</Badge>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
      </div>
      <Text className="text-sm text-red-600 dark:text-red-400 max-w-md text-center">{message}</Text>
      <Button
        onClick={onRetry}
        variant="outline"
        className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        <RotateCw className="h-4 w-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <RefreshCw className="h-7 w-7 text-slate-400 dark:text-slate-500" />
      </div>
      <Text className="text-sm text-slate-500 dark:text-slate-400">No {label} found in the current context.</Text>
    </div>
  );
}

const tableWrapperClass = 'overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700';
const tableClass = 'w-full text-sm';
const theadClass = 'bg-slate-50 dark:bg-slate-800/80';
const thClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400';
const tdClass = 'px-4 py-3 text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800';
const trHoverClass = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';

// --- Pipes Tab ---

function PipesTab({ database, schema }: { database?: string; schema?: string }) {
  const [pipes, setPipes] = useState<PipeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchPipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPipes(database, schema);
      setPipes(result.pipes || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load pipes');
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  useEffect(() => {
    fetchPipes();
  }, [fetchPipes]);

  const handleAction = async (pipeName: string, action: 'refresh' | 'pause' | 'resume') => {
    setActionLoading((prev) => ({ ...prev, [`${pipeName}_${action}`]: true }));
    try {
      if (action === 'refresh') await refreshPipe(pipeName);
      else if (action === 'pause') await pausePipe(pipeName);
      else if (action === 'resume') await resumePipe(pipeName);
      toast.success(`Pipe ${pipeName} ${action}ed successfully`);
      await fetchPipes();
    } catch (err: any) {
      toast.error(err?.message || `Failed to ${action} pipe`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${pipeName}_${action}`]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={fetchPipes} />;
  if (pipes.length === 0) return <EmptyState label="pipes" />;

  return (
    <div className={tableWrapperClass}>
      <table className={tableClass}>
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Target Table</th>
            <th className={thClass}>Source Stage</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>Pending Files</th>
            <th className={thClass}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pipes.map((pipe) => (
            <tr key={pipe.name} className={trHoverClass}>
              <td className={`${tdClass} font-medium text-slate-900 dark:text-white`}>{pipe.name}</td>
              <td className={tdClass}>{pipe.target_table || '-'}</td>
              <td className={tdClass}>{pipe.source_stage || '-'}</td>
              <td className={tdClass}><StatusBadge status={pipe.status} /></td>
              <td className={tdClass}>
                <span className={`font-mono text-sm ${pipe.pending_files > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                  {pipe.pending_files ?? 0}
                </span>
              </td>
              <td className={tdClass}>
                <div className="flex items-center space-x-1">
                  <Tooltip content="Refresh pipe">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-300 dark:border-slate-600 p-1.5"
                      onClick={() => handleAction(pipe.name, 'refresh')}
                      disabled={!!actionLoading[`${pipe.name}_refresh`]}
                    >
                      <RotateCw className={`h-3.5 w-3.5 ${actionLoading[`${pipe.name}_refresh`] ? 'animate-spin' : ''}`} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Pause pipe">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400 p-1.5"
                      onClick={() => handleAction(pipe.name, 'pause')}
                      disabled={!!actionLoading[`${pipe.name}_pause`] || pipe.status?.toUpperCase() === 'PAUSED'}
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Resume pipe">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-300 text-green-600 dark:border-green-700 dark:text-green-400 p-1.5"
                      onClick={() => handleAction(pipe.name, 'resume')}
                      disabled={!!actionLoading[`${pipe.name}_resume`] || pipe.status?.toUpperCase() === 'RUNNING'}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Streams Tab ---

function StreamsTab({ database, schema }: { database?: string; schema?: string }) {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStreams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStreams(database, schema);
      setStreams(result.streams || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load streams');
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={fetchStreams} />;
  if (streams.length === 0) return <EmptyState label="streams" />;

  return (
    <div className={tableWrapperClass}>
      <table className={tableClass}>
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Source Object</th>
            <th className={thClass}>Type</th>
            <th className={thClass}>Has Data</th>
            <th className={thClass}>Mode</th>
            <th className={thClass}>Created</th>
          </tr>
        </thead>
        <tbody>
          {streams.map((stream) => (
            <tr key={stream.name} className={trHoverClass}>
              <td className={`${tdClass} font-medium text-slate-900 dark:text-white`}>{stream.name}</td>
              <td className={tdClass}>{stream.source_object || '-'}</td>
              <td className={tdClass}>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-300 dark:border-blue-700">
                  {stream.type || 'STANDARD'}
                </Badge>
              </td>
              <td className={tdClass}><HasDataBadge hasData={stream.has_data} /></td>
              <td className={tdClass}>{stream.mode || '-'}</td>
              <td className={tdClass}>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {stream.created ? new Date(stream.created).toLocaleDateString() : '-'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Dynamic Tables Tab ---

function DynamicTablesTab({ database, schema }: { database?: string; schema?: string }) {
  const [tables, setTables] = useState<DynamicTableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDynamicTables(database, schema);
      setTables(result.dynamic_tables || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dynamic tables');
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={fetchTables} />;
  if (tables.length === 0) return <EmptyState label="dynamic tables" />;

  return (
    <div className={tableWrapperClass}>
      <table className={tableClass}>
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Target Lag</th>
            <th className={thClass}>Warehouse</th>
            <th className={thClass}>Rows</th>
            <th className={thClass}>Last Refresh</th>
            <th className={thClass}>Status</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={table.name} className={trHoverClass}>
              <td className={`${tdClass} font-medium text-slate-900 dark:text-white`}>{table.name}</td>
              <td className={tdClass}>
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300">
                  {table.target_lag || '-'}
                </span>
              </td>
              <td className={tdClass}>{table.warehouse || '-'}</td>
              <td className={tdClass}>
                <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                  {typeof table.rows === 'number' ? table.rows.toLocaleString() : '-'}
                </span>
              </td>
              <td className={tdClass}>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {table.last_refresh ? new Date(table.last_refresh).toLocaleString() : '-'}
                </span>
              </td>
              <td className={tdClass}><StatusBadge status={table.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- External Tables Tab ---

function ExternalTablesTab({ database, schema }: { database?: string; schema?: string }) {
  const [tables, setTables] = useState<ExternalTableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listExternalTables(database, schema);
      setTables(result.external_tables || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load external tables');
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={fetchTables} />;
  if (tables.length === 0) return <EmptyState label="external tables" />;

  return (
    <div className={tableWrapperClass}>
      <table className={tableClass}>
        <thead className={theadClass}>
          <tr>
            <th className={thClass}>Name</th>
            <th className={thClass}>Location</th>
            <th className={thClass}>File Format</th>
            <th className={thClass}>Auto Refresh</th>
            <th className={thClass}>Rows</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={table.name} className={trHoverClass}>
              <td className={`${tdClass} font-medium text-slate-900 dark:text-white`}>{table.name}</td>
              <td className={tdClass}>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 max-w-xs truncate block">
                  {table.location || '-'}
                </span>
              </td>
              <td className={tdClass}>
                <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                  {table.file_format || '-'}
                </Badge>
              </td>
              <td className={tdClass}><AutoRefreshBadge enabled={table.auto_refresh} /></td>
              <td className={tdClass}>
                <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                  {typeof table.rows === 'number' ? table.rows.toLocaleString() : '-'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Exported individual tab content components ---

export { PipesTab, StreamsTab, DynamicTablesTab, ExternalTablesTab };

// --- Main Component ---

export default function InfrastructureTabs({ database, schema, initialTab }: InfrastructureTabsProps & { initialTab?: InfraTab }) {
  const [activeTab, setActiveTab] = useState<InfraTab>(initialTab || 'pipes');

  return (
    <div className="bg-white dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
      {activeTab === 'pipes' && <PipesTab database={database} schema={schema} />}
      {activeTab === 'streams' && <StreamsTab database={database} schema={schema} />}
      {activeTab === 'dynamic-tables' && <DynamicTablesTab database={database} schema={schema} />}
      {activeTab === 'external-tables' && <ExternalTablesTab database={database} schema={schema} />}
    </div>
  );
}
