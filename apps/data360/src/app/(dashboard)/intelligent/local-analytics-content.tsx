'use client';

import { useState, useCallback } from 'react';
import { Badge, Button, Loader } from 'rizzui';
import {
  PiDatabase,
  PiPlay,
  PiArrowsClockwise,
  PiWarningCircle,
  PiLightning,
  PiFile,
  PiHardDrives,
  PiClock,
} from 'react-icons/pi';
import {
  listDuckdbDatasets,
  queryStage,
  duckdbQuery,
} from '@/app/services/cortex';
import type { DuckdbDataset, DuckdbQueryResult } from '@/app/services/cortex';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import FullscreenPanel, { FullscreenExpandButton } from '@/components/ui/FullscreenPanel';
import { PagedDataTable } from '@/components/ui/TablePager';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function LocalAnalyticsContent() {
  // Query panel state
  const [queryMode, setQueryMode] = useState<'stage' | 'table'>('stage');
  const [stagePath, setStagePath] = useState('');
  const [tableFqn, setTableFqn] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryLimit, setQueryLimit] = useState(1000);
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryResult, setQueryResult] = useState<DuckdbQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [resultsFull, setResultsFull] = useState(false);

  // ── Datasets via useCacheAwareQuery ──
  const fetchDatasets = useCallback(async () => {
    const resp = await listDuckdbDatasets();
    return resp.datasets || [];
  }, []);
  const { data: datasets, loading, error: datasetsError, refetch: loadDatasets } = useCacheAwareQuery<DuckdbDataset[]>(
    fetchDatasets,
    { cacheKeys: [CACHE_KEYS.CORTEX], initialData: [] }
  );
  const error = datasetsError?.message ?? null;

  const handleRunQuery = async () => {
    setQueryRunning(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      let result: DuckdbQueryResult;
      if (queryMode === 'stage') {
        if (!stagePath.trim()) {
          setQueryError('Stage path is required');
          return;
        }
        result = await queryStage(stagePath.trim());
      } else {
        if (!tableFqn.trim() && !sqlQuery.trim()) {
          setQueryError('Table name or SQL query is required');
          return;
        }
        result = await duckdbQuery(
          tableFqn.trim(),
          sqlQuery.trim() || undefined,
          queryLimit
        );
      }
      if (result.error) {
        setQueryError(result.error);
      } else {
        setQueryResult(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Query failed';
      setQueryError(msg);
    } finally {
      setQueryRunning(false);
    }
  };

  const handleSelectDataset = (ds: DuckdbDataset) => {
    setQueryMode('stage');
    setStagePath(ds.stage);
  };

  const safeDatasets = datasets ?? [];
  const totalSize = safeDatasets.reduce((acc, d) => acc + (d.size_bytes || 0), 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <PiFile className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Datasets</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {loading ? '...' : safeDatasets.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <PiHardDrives className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Size</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {loading ? '...' : formatBytes(totalSize)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <PiLightning className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Engine</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">Local Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <PiClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Last Query</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {queryResult?.execution_time_ms != null ? `${queryResult.execution_time_ms}ms` : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Datasets Panel */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <PiDatabase className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Staged Datasets</h3>
              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                {safeDatasets.length}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={loadDatasets} disabled={loading}>
              <PiArrowsClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size="lg" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <PiWarningCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" size="sm" onClick={loadDatasets}>
                  Retry
                </Button>
              </div>
            ) : safeDatasets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <PiDatabase className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No staged datasets found</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Export data to a stage to enable zero-cost queries
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Stage</th>
                    <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">File</th>
                    <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Size</th>
                    <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {safeDatasets.map((ds, idx) => (
                    <tr
                      key={`${ds.stage}-${ds.file}-${idx}`}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                      onClick={() => handleSelectDataset(ds)}
                    >
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white font-medium">
                        {ds.stage}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                        {ds.file}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">
                        {formatBytes(ds.size_bytes)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400 text-xs">
                        {ds.last_modified || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Query Panel */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
            <PiLightning className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Query Panel</h3>
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs ml-auto">
              Zero Cost
            </Badge>
          </div>

          <div className="p-4 space-y-4">
            {/* Mode Selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setQueryMode('stage')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  queryMode === 'stage'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Query Stage
              </button>
              <button
                onClick={() => setQueryMode('table')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  queryMode === 'table'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Export & Query Table
              </button>
            </div>

            {queryMode === 'stage' ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Stage Path
                </label>
                <input
                  type="text"
                  value={stagePath}
                  onChange={(e) => setStagePath(e.target.value)}
                  placeholder="e.g. MY_DB.MY_SCHEMA.MY_STAGE"
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Table (FQN)
                  </label>
                  <input
                    type="text"
                    value={tableFqn}
                    onChange={(e) => setTableFqn(e.target.value)}
                    placeholder="e.g. MY_DB.MY_SCHEMA.MY_TABLE"
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    SQL Query (optional override)
                  </label>
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="SELECT * FROM MY_DB.MY_SCHEMA.MY_TABLE WHERE ..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Limit
                  </label>
                  <input
                    type="number"
                    value={queryLimit}
                    onChange={(e) => setQueryLimit(Math.min(Number(e.target.value) || 1000, 10000))}
                    min={1}
                    max={10000}
                    className="w-24 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleRunQuery}
              disabled={queryRunning}
            >
              {queryRunning ? (
                <Loader size="sm" />
              ) : (
                <PiPlay className="w-4 h-4" />
              )}
              {queryRunning ? 'Running...' : 'Run Query'}
            </Button>

            {queryError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <PiWarningCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{queryError}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Table — standardized grid (sticky header, 25/page) with a
          fullscreen deep-dive affordance */}
      {queryResult && queryResult.data && queryResult.data.length > 0 && (
        <FullscreenPanel
          title="Query Results"
          subtitle={`${queryResult.row_count} rows · ${queryResult.execution_time_ms}ms · Esc to close`}
          open={resultsFull}
          onOpenChange={setResultsFull}
        >
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Query Results</h3>
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                {queryResult.row_count} rows
              </Badge>
              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                {queryResult.execution_time_ms}ms
              </Badge>
              {queryResult.engine && (
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
                  {queryResult.engine}
                </Badge>
              )}
            </div>
            {!resultsFull && (
              <FullscreenExpandButton
                onClick={() => setResultsFull(true)}
                label="Expand query results to fullscreen"
              />
            )}
          </div>

          <div className="p-3">
            <PagedDataTable
              rows={(queryResult.data ?? []) as Array<Record<string, unknown>>}
              columns={queryResult.columns || undefined}
              maxHeightClass={resultsFull ? 'max-h-[calc(100vh-220px)]' : 'max-h-[420px]'}
            />
          </div>
        </div>
        </FullscreenPanel>
      )}

      {queryResult && queryResult.data && queryResult.data.length === 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <PiDatabase className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Query returned no results</p>
        </div>
      )}
    </div>
  );
}
