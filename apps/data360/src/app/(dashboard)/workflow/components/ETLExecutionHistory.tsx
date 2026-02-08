'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Timer,
  Layers,
  RefreshCw,
  Code,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as etlService from '@/app/services/etl';
import type { PipelineRun, GeneratedSQL } from '@/app/services/etl/types';

// ============================================
// TYPES
// ============================================

interface ETLExecutionHistoryProps {
  pipelineId: string | null;
  pipelineName?: string;
  onRefresh?: () => void;
  className?: string;
  compact?: boolean;
}

type RunStatus = 'running' | 'completed' | 'failed';

// ============================================
// MAIN COMPONENT
// ============================================

const ETLExecutionHistory: React.FC<ETLExecutionHistoryProps> = ({
  pipelineId,
  pipelineName,
  onRefresh,
  className,
  compact = false,
}) => {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<RunStatus | ''>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedSql, setCopiedSql] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!pipelineId) {
      setRuns([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await etlService.getPipelineRuns(pipelineId, 50);
      let filteredRuns = response.runs || [];

      // Apply status filter client-side
      if (statusFilter) {
        filteredRuns = filteredRuns.filter((r) => r.status === statusFilter);
      }

      setRuns(filteredRuns);
    } catch (err: any) {
      console.error('Failed to fetch runs:', err);
      const errObj = err.response?.data?.error;
      let errMsg: string;
      if (errObj && typeof errObj === 'object' && typeof (errObj as any).message === 'string') {
        errMsg = (errObj as any).message;
      } else if (typeof err.response?.data?.detail === 'string') {
        errMsg = err.response.data.detail;
      } else {
        const d = err.response?.data?.detail;
        if (d != null && typeof d === 'object' && ((d as any).message != null || (d as any).msg != null)) {
          errMsg = String((d as any).message ?? (d as any).msg);
        } else if (d != null) {
          errMsg = typeof d === 'string' ? d : JSON.stringify(d);
        } else {
          errMsg = 'Failed to load execution history';
        }
      }
      setError(typeof errMsg === 'string' ? errMsg : 'Failed to load execution history');
    } finally {
      setIsLoading(false);
    }
  }, [pipelineId, statusFilter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Auto-refresh for running pipelines
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === 'running');
    if (!hasRunning) return;

    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRuns();
    setIsRefreshing(false);
    onRefresh?.();
  };

  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const copyToClipboard = async (sql: string, id: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedSql(id);
      setTimeout(() => setCopiedSql(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusIcon = (status: RunStatus) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: RunStatus) => {
    const styles: Record<RunStatus, string> = {
      running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', styles[status])}>
        {getStatusIcon(status)}
        {status}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRunStats = () => {
    const completed = runs.filter((r) => r.status === 'completed').length;
    const failed = runs.filter((r) => r.status === 'failed').length;
    const running = runs.filter((r) => r.status === 'running').length;
    const validDurations = runs.filter((r) => r.duration_seconds);
    const avgDuration = validDurations.length > 0
      ? validDurations.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / validDurations.length
      : 0;

    return { completed, failed, running, avgDuration };
  };

  const stats = getRunStats();

  // No pipeline selected
  if (!pipelineId) {
    return (
      <div className={cn('p-4', className)}>
        <p className="text-sm text-slate-500 text-center">
          Save a pipeline to view execution history
        </p>
      </div>
    );
  }

  // Loading
  if (isLoading && runs.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-500">Loading execution history...</span>
      </div>
    );
  }

  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-lg', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
            Execution History
          </span>
          {runs.length > 0 && (
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">
              {runs.length}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Stats Summary (non-compact mode) */}
      {!compact && runs.length > 0 && (
        <div className="grid grid-cols-4 gap-2 p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{stats.completed}</div>
            <div className="text-xs text-slate-500">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-slate-500">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{stats.running}</div>
            <div className="text-xs text-slate-500">Running</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-600 dark:text-slate-400">
              {etlService.formatDuration(Math.round(stats.avgDuration))}
            </div>
            <div className="text-xs text-slate-500">Avg Time</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-1 p-2 border-b border-slate-200 dark:border-slate-700">
        {(['', 'running', 'completed', 'failed'] as const).map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-2 py-1 text-xs rounded transition',
              statusFilter === status
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {status || 'All'}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Runs List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[400px] overflow-y-auto">
        {runs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <PlayCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No execution history</p>
            <p className="text-xs mt-1">Execute the pipeline to see runs here</p>
          </div>
        ) : (
          runs.map((run) => {
            const isExpanded = expandedRuns.has(run.run_id);

            return (
              <div
                key={run.run_id}
                className={cn(
                  'p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition',
                  run.status === 'running' && 'bg-blue-50/30 dark:bg-blue-900/10'
                )}
              >
                {/* Run Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRunExpanded(run.run_id)}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>
                      {getStatusBadge(run.status)}
                      <span className="text-xs font-mono text-slate-500">
                        #{run.run_id.slice(-8)}
                      </span>
                    </div>

                    <div className="flex items-center flex-wrap gap-3 mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(run.started_at)}
                      </span>
                      {run.duration_seconds !== undefined && run.duration_seconds !== null && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {etlService.formatDuration(run.duration_seconds)}
                        </span>
                      )}
                      {run.components_executed !== undefined && (
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {run.components_executed} components
                        </span>
                      )}
                      {run.rows_processed !== undefined && run.rows_processed !== null && (
                        <span className="text-green-600 dark:text-green-400">
                          {run.rows_processed.toLocaleString()} rows
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 ml-6 space-y-3">
                    {/* Run Details */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500">Run ID:</span>
                          <code className="ml-1 font-mono text-slate-700 dark:text-slate-300 text-[10px]">
                            {run.run_id}
                          </code>
                        </div>
                        {run.pipeline_id && (
                          <div>
                            <span className="text-slate-500">Pipeline:</span>
                            <span className="ml-1 text-slate-700 dark:text-slate-300">
                              {run.pipeline_id.slice(-8)}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500">Started:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {new Date(run.started_at).toLocaleString()}
                          </span>
                        </div>
                        {run.completed_at && (
                          <div>
                            <span className="text-slate-500">Completed:</span>
                            <span className="ml-1 text-slate-700 dark:text-slate-300">
                              {new Date(run.completed_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Error Message */}
                    {run.error_message && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mb-1">
                          <AlertTriangle className="h-3 w-3" />
                          Error
                        </div>
                        <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
                          {typeof run.error_message === 'string'
                            ? run.error_message
                            : run.error_message != null
                              ? JSON.stringify(run.error_message, null, 2)
                              : 'Unknown error'}
                        </pre>
                      </div>
                    )}

                    {/* Generated SQL */}
                    {run.generated_sql && run.generated_sql.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Code className="h-3 w-3" />
                          Generated SQL
                        </div>
                        {run.generated_sql.map((sql, idx) => (
                          <div
                            key={`${sql.component_id}-${idx}`}
                            className="p-3 bg-slate-900 rounded-lg relative group"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-slate-400 font-mono">
                                {sql.component_id}
                              </span>
                              <button
                                onClick={() => copyToClipboard(sql.sql, `${run.run_id}-${idx}`)}
                                className="p-1 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition"
                                title="Copy SQL"
                              >
                                {copiedSql === `${run.run_id}-${idx}` ? (
                                  <Check className="h-3 w-3 text-green-400" />
                                ) : (
                                  <Copy className="h-3 w-3 text-slate-400" />
                                )}
                              </button>
                            </div>
                            <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono overflow-x-auto">
                              {sql.sql}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ETLExecutionHistory;
