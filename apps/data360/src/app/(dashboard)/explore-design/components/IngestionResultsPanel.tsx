'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Play, CheckCircle2, XCircle, Clock, RefreshCw, Download,
  ChevronDown, ChevronRight, BarChart3, Database, AlertTriangle,
  ArrowRight, Timer, Layers, Filter, Calendar,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { listIngestionRuns } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface IngestionRun {
  id: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeleted: number;
  rowsFailed: number;
  nextSyncAt?: string;
  error?: string;
  warnings?: string[];
  ingestionMode: string;
  tableName: string;
}

interface IngestionResultsPanelProps {
  runs?: IngestionRun[];
  projectId?: string | null;
  currentRun?: IngestionRun | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onExportCsv?: () => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const statusConfig: Record<IngestionRun['status'], {
  icon: React.ComponentType<any>;
  label: string;
  color: string;
  bgColor: string;
}> = {
  running: {
    icon: RefreshCw,
    label: 'Running',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  success: {
    icon: CheckCircle2,
    label: 'Success',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    color: 'text-slate-500',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

const IngestionResultsPanel: React.FC<IngestionResultsPanelProps> = ({
  runs: externalRuns,
  projectId,
  currentRun,
  isLoading: externalLoading,
  onRefresh,
  onExportCsv,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<IngestionRun['status'] | 'all'>('all');
  const [apiRuns, setApiRuns] = useState<IngestionRun[]>([]);
  const [apiLoading, setApiLoading] = useState(false);

  const runs = externalRuns ?? apiRuns;
  const isLoading = externalLoading ?? apiLoading;

  const fetchRuns = useCallback(async () => {
    if (!projectId) return;
    setApiLoading(true);
    try {
      const result = await listIngestionRuns(projectId, { limit: 20 });
      const statusMap: Record<string, IngestionRun['status']> = {
        SUCCESS: 'success',
        FAILED: 'failed',
        IN_PROGRESS: 'running',
        PENDING: 'running',
        ROLLED_BACK: 'cancelled',
      };
      setApiRuns(
        result.runs.map((r) => ({
          id: r.run_id,
          status: statusMap[r.status] || 'running',
          startedAt: r.started_at,
          completedAt: r.completed_at,
          durationMs: r.duration_ms,
          rowsProcessed: r.rows_inserted + r.rows_updated + r.rows_deleted + r.rows_failed,
          rowsInserted: r.rows_inserted,
          rowsUpdated: r.rows_updated,
          rowsDeleted: r.rows_deleted,
          rowsFailed: r.rows_failed,
          error: r.error_message,
          ingestionMode: r.ingestion_mode,
          tableName: r.target_table,
        })),
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to load ingestion runs');
    } finally {
      setApiLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && !externalRuns) fetchRuns();
  }, [projectId, externalRuns, fetchRuns]);

  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return runs;
    return runs.filter((r) => r.status === statusFilter);
  }, [runs, statusFilter]);

  const totalStats = useMemo(() => {
    const successRuns = runs.filter((r) => r.status === 'success');
    return {
      totalRuns: runs.length,
      successRate: runs.length > 0 ? ((successRuns.length / runs.length) * 100).toFixed(0) : '0',
      totalRows: successRuns.reduce((sum, r) => sum + r.rowsProcessed, 0),
      avgDuration:
        successRuns.length > 0
          ? successRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / successRuns.length
          : 0,
    };
  }, [runs]);

  const handleExportCsv = useCallback(() => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    // Default CSV export
    const headers = ['ID', 'Status', 'Started', 'Duration', 'Rows Processed', 'Inserted', 'Updated', 'Deleted', 'Failed', 'Error'];
    const csvRows = runs.map((r) => [
      r.id,
      r.status,
      r.startedAt,
      r.durationMs ? formatDuration(r.durationMs) : '',
      r.rowsProcessed,
      r.rowsInserted,
      r.rowsUpdated,
      r.rowsDeleted,
      r.rowsFailed,
      r.error || '',
    ]);
    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ingestion_runs.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }, [runs, onExportCsv]);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-500" />
          Ingestion Results
          <Badge size="sm" className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {runs.length} runs
          </Badge>
          {currentRun?.status === 'running' && (
            <Badge size="sm" className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 animate-pulse">
              Running
            </Badge>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div>
          {/* Current Run Banner */}
          {currentRun?.status === 'running' && (
            <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-slate-700">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Ingestion in progress — {currentRun.tableName}
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                    {formatNumber(currentRun.rowsProcessed)} rows processed
                    {currentRun.durationMs && ` in ${formatDuration(currentRun.durationMs)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Progress bar */}
                  <div className="w-24 h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300 animate-pulse"
                      style={{ width: '60%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-px bg-slate-200 dark:bg-slate-700 border-b dark:border-slate-700">
            {[
              { label: 'Total Runs', value: totalStats.totalRuns.toString(), icon: Layers },
              { label: 'Success Rate', value: `${totalStats.successRate}%`, icon: CheckCircle2 },
              { label: 'Total Rows', value: formatNumber(totalStats.totalRows), icon: Database },
              { label: 'Avg Duration', value: totalStats.avgDuration ? formatDuration(totalStats.avgDuration) : '-', icon: Timer },
            ].map((stat) => (
              <div key={stat.label} className="bg-white dark:bg-slate-800 px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <stat.icon className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs px-2 py-1 border rounded dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              {(onRefresh || projectId) && (
                <Tooltip content="Refresh">
                  <button
                    onClick={onRefresh || fetchRuns}
                    className={cn('p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700', isLoading && 'animate-spin')}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </Tooltip>
              )}
              <Tooltip content="Export CSV">
                <button
                  onClick={handleExportCsv}
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Run List */}
          <div className="max-h-[400px] overflow-auto">
            {filteredRuns.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No ingestion runs yet</p>
                <p className="text-xs mt-1">Results will appear here after running ingestion</p>
              </div>
            ) : (
              filteredRuns.map((run) => {
                const sc = statusConfig[run.status];
                const StatusIcon = sc.icon;
                const isRunExpanded = expandedRunId === run.id;

                return (
                  <div key={run.id} className="border-b dark:border-slate-700 last:border-0">
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => setExpandedRunId(isRunExpanded ? null : run.id)}
                    >
                      <button className="p-0.5">
                        {isRunExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </button>

                      <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', sc.bgColor, sc.color)}>
                        <StatusIcon className={cn('h-3 w-3', run.status === 'running' && 'animate-spin')} />
                        <span>{sc.label}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{run.tableName}</p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(run.startedAt)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-medium">{formatNumber(run.rowsProcessed)}</p>
                        <p className="text-xs text-slate-400">
                          {run.durationMs ? formatDuration(run.durationMs) : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isRunExpanded && (
                      <div className="px-4 pb-3 ml-8">
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-3">
                          {/* Row breakdown */}
                          <div className="grid grid-cols-4 gap-3">
                            {[
                              { label: 'Inserted', value: run.rowsInserted, color: 'text-green-600' },
                              { label: 'Updated', value: run.rowsUpdated, color: 'text-blue-600' },
                              { label: 'Deleted', value: run.rowsDeleted, color: 'text-red-600' },
                              { label: 'Failed', value: run.rowsFailed, color: 'text-amber-600' },
                            ].map((item) => (
                              <div key={item.label} className="text-center">
                                <p className={cn('text-sm font-semibold', item.color)}>
                                  {formatNumber(item.value)}
                                </p>
                                <p className="text-[10px] text-slate-500">{item.label}</p>
                              </div>
                            ))}
                          </div>

                          {/* Next sync */}
                          {run.nextSyncAt && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Calendar className="h-3 w-3" />
                              <span>Next sync: {formatDateTime(run.nextSyncAt)}</span>
                            </div>
                          )}

                          {/* Warnings */}
                          {run.warnings && run.warnings.length > 0 && (
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-400">
                              <div className="flex items-center gap-1 mb-1 font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                {run.warnings.length} warning(s)
                              </div>
                              <ul className="list-disc list-inside space-y-0.5">
                                {run.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Error */}
                          {run.error && (
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400">
                              <strong>Error:</strong> {run.error}
                            </div>
                          )}

                          {/* Mode */}
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <ArrowRight className="h-3 w-3" />
                            <span>Mode: {run.ingestionMode.replace(/_/g, ' ')}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default IngestionResultsPanel;
