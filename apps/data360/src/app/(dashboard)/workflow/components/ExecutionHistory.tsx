'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Timer,
  Layers,
  RefreshCw,
  Calendar,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listRuns } from '@/app/services/api/workflowApi';
import type { WorkflowRun } from '@/app/services/api/types';

// Utility: format duration in seconds to human-readable string
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

type RunStatus = 'running' | 'completed' | 'failed';

// Helper to extract error message (ApiResponse.error, FastAPI detail, etc.)
const extractErrorMessage = (err: any): string => {
  if (!err) return 'Unknown error';
  const errObj = err.response?.data?.error;
  if (errObj && typeof errObj === 'object' && (errObj.message != null || errObj.error_code != null)) {
    return typeof errObj.message === 'string' ? errObj.message : String(errObj.error_code ?? errObj.message ?? 'Error');
  }
  const detail = err.response?.data?.detail;
  if (detail !== undefined && detail !== null) {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; ');
    if (typeof detail === 'object' && (detail.message ?? detail.msg)) return String(detail.message ?? detail.msg);
    if (typeof detail === 'object') return JSON.stringify(detail);
  }
  if (err.message && typeof err.message === 'string') return err.message;
  return 'An error occurred';
};

interface ExecutionHistoryProps {
  workflowId: string;
  workflowName: string;
  onRefresh?: () => void;
  className?: string;
}

const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  workflowId,
  workflowName,
  onRefresh,
  className,
}) => {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<RunStatus | ''>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchRuns = useCallback(async () => {
    if (!workflowId) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await listRuns(workflowId, {
        limit: 20,
        status: statusFilter || undefined,
      });
      setRuns(data.runs || []);
      setTotalRuns(data.count || 0);
    } catch (err: any) {
      console.error('Failed to fetch runs:', err);
      setError(extractErrorMessage(err) || 'Failed to load execution history');
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, statusFilter]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

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

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'scheduled':
        return <Calendar className="h-3 w-3" />;
      case 'manual':
        return <Zap className="h-3 w-3" />;
      default:
        return <PlayCircle className="h-3 w-3" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRunStats = () => {
    const completed = runs.filter((r) => r.status === 'completed').length;
    const failed = runs.filter((r) => r.status === 'failed').length;
    const running = runs.filter((r) => r.status === 'running').length;
    const avgDuration = runs
      .filter((r) => r.duration_seconds)
      .reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / (runs.filter((r) => r.duration_seconds).length || 1);

    return { completed, failed, running, avgDuration };
  };

  const stats = getRunStats();

  if (isLoading && runs.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-500">Loading execution history...</span>
      </div>
    );
  }

  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Execution History</h3>
          {totalRuns > 0 && (
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
              {totalRuns} runs
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats Summary */}
      {runs.length > 0 && (
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-xs text-slate-500">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-slate-500">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
            <div className="text-xs text-slate-500">Running</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
              {formatDuration(Math.round(stats.avgDuration))}
            </div>
            <div className="text-xs text-slate-500">Avg Duration</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm text-slate-500">Filter:</span>
        {(['', 'running', 'completed', 'failed'] as const).map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-2 py-1 text-xs rounded-lg transition-colors',
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
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <PlayCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No execution history yet</p>
            <p className="text-sm mt-1">Run the workflow to see execution logs</p>
          </div>
        ) : (
          runs.map((run) => {
            const isExpanded = expandedRuns.has(run.run_id);

            return (
              <div
                key={run.run_id}
                className={cn(
                  'p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                  run.status === 'running' && 'bg-blue-50/30 dark:bg-blue-900/10'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRunExpanded(run.run_id)}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>
                      {getStatusBadge(run.status as RunStatus)}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Run #{run.run_id.slice(-6)}
                      </span>
                    </div>
                    <div className="flex items-center flex-wrap gap-3 mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {run.triggered_by}
                      </span>
                      <span className="flex items-center gap-1">
                        {getTriggerIcon(run.trigger_type)}
                        {run.trigger_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(run.started_at)}
                      </span>
                      {run.duration_seconds && (
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {formatDuration(run.duration_seconds)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {run.steps_executed} steps
                        {run.steps_failed > 0 && (
                          <span className="text-red-500">({run.steps_failed} failed)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 ml-6 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Run ID:</span>
                        <code className="ml-1 font-mono text-slate-700 dark:text-slate-300 break-all">
                          {run.run_id}
                        </code>
                      </div>
                      <div>
                        <span className="text-slate-500">Version:</span>
                        <code className="ml-1 font-mono text-slate-700 dark:text-slate-300">
                          {run.version_id?.slice(0, 12) || 'N/A'}...
                        </code>
                      </div>
                      <div>
                        <span className="text-slate-500">Started:</span>
                        <span className="ml-1 text-slate-700 dark:text-slate-300">
                          {formatDate(run.started_at)}
                        </span>
                      </div>
                      {run.completed_at && (
                        <div>
                          <span className="text-slate-500">Completed:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {formatDate(run.completed_at)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Error Log */}
                    {run.error_log && (
                      <div className="mt-2">
                        <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mb-1">
                          <AlertTriangle className="h-3 w-3" />
                          Error Log
                        </div>
                        <pre className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300 overflow-x-auto max-h-32">
                          {typeof run.error_log === 'string' ? run.error_log : JSON.stringify(run.error_log, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Execution Details */}
                    {run.execution_details && (
                      <div className="mt-2">
                        <div className="text-xs text-slate-500 mb-1">Execution Details</div>
                        <pre className="p-2 bg-slate-100 dark:bg-slate-900 rounded text-xs text-slate-600 dark:text-slate-400 overflow-x-auto max-h-32">
                          {JSON.stringify(run.execution_details, null, 2)}
                        </pre>
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

export default ExecutionHistory;
