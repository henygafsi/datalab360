'use client';

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  Clock, Download, Search, CheckCircle, XCircle,
  AlertTriangle, Play, Pause, RefreshCw, Loader2
} from 'lucide-react';
import { Button } from 'rizzui';
import * as workflowApi from '@/app/services/api/workflowApi';
import type {
  TaskStatusResponse,
  DiscoverTasksResponse,
  TaskGraph,
} from '@/app/services/api/workflowApi';
import { getApiErrorMessage } from '@/lib/api-client';

interface TasksPanelProps {
  workflowId: string | null;
  onImported?: () => void;
  className?: string;
}

const stateBadge = (state: string) => {
  const s = state?.toLowerCase() ?? '';
  if (s === 'succeeded') return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400"><CheckCircle className="h-3 w-3" /> Succeeded</span>;
  if (s === 'failed') return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400"><XCircle className="h-3 w-3" /> Failed</span>;
  if (s === 'started') return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400"><Play className="h-3 w-3" /> Started</span>;
  if (s === 'suspended') return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"><Pause className="h-3 w-3" /> Suspended</span>;
  return <span className="text-xs text-slate-500 dark:text-slate-400">{state || 'Unknown'}</span>;
};

const TasksPanel: React.FC<TasksPanelProps> = ({ workflowId, onImported, className }) => {
  // Task status for current workflow
  const [taskStatus, setTaskStatus] = useState<TaskStatusResponse | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);

  // Discovery modal
  const [showDiscover, setShowDiscover] = useState(false);
  const [discoverData, setDiscoverData] = useState<DiscoverTasksResponse | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [dbFilter, setDbFilter] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const fetchTaskStatus = useCallback(async () => {
    if (!workflowId) return;
    setTaskLoading(true);
    try {
      const data = await workflowApi.getTaskStatus(workflowId, { days: 7 });
      setTaskStatus(data);
    } catch {
      // Task may not exist yet, which is fine
      setTaskStatus(null);
    } finally {
      setTaskLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchTaskStatus();
  }, [fetchTaskStatus]);

  const handleDiscover = async () => {
    setShowDiscover(true);
    setDiscoverLoading(true);
    try {
      const data = await workflowApi.discoverTasks(
        dbFilter ? { database: dbFilter } : undefined,
      );
      setDiscoverData(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to discover tasks');
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleImport = async (graph: TaskGraph) => {
    const rootFqn = graph.tasks?.[0]?.fqn;
    if (!rootFqn) return;
    setImporting(rootFqn);
    try {
      const result = await workflowApi.importTaskGraph(rootFqn);
      toast.success(`Imported "${result.project_name}" with ${result.steps_created} steps`);
      setShowDiscover(false);
      onImported?.();
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to import task graph');
    } finally {
      setImporting(null);
    }
  };

  const handleSuspend = async () => {
    if (!workflowId) return;
    try {
      await workflowApi.suspendTask(workflowId);
      toast.success('Task suspended');
      fetchTaskStatus();
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to suspend task');
    }
  };

  const handleResume = async () => {
    if (!workflowId) return;
    try {
      await workflowApi.resumeTask(workflowId);
      toast.success('Task resumed');
      fetchTaskStatus();
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to resume task');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Task Status for Current Workflow */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Snowflake Task</h4>
          <button
            onClick={fetchTaskStatus}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title="Refresh"
            aria-label="Refresh task status"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-slate-400', taskLoading && 'animate-spin')} />
          </button>
        </div>

        {taskLoading && !taskStatus && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}

        {!taskLoading && !taskStatus && (
          <div className="text-center py-4">
            <Clock className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No Snowflake task found for this workflow.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Deploy with a schedule to create one.
            </p>
          </div>
        )}

        {taskStatus && (
          <div className="space-y-3">
            {/* Task Info Card */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {taskStatus.task_name}
                </span>
                {stateBadge(taskStatus.task_info?.state as string ?? '')}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSuspend}
                  className="text-xs"
                >
                  <Pause className="h-3 w-3 mr-1" /> Suspend
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResume}
                  className="text-xs"
                >
                  <Play className="h-3 w-3 mr-1" /> Resume
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="text-lg font-bold text-slate-900 dark:text-white">{taskStatus.stats.total}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{taskStatus.stats.succeeded}</div>
                <div className="text-xs text-green-600 dark:text-green-400">OK</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="text-lg font-bold text-red-600 dark:text-red-400">{taskStatus.stats.failed}</div>
                <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
              </div>
            </div>

            {/* Recent Runs */}
            {taskStatus.runs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Recent Runs</div>
                <div className="space-y-1 max-h-48 overflow-auto">
                  {taskStatus.runs.slice(0, 10).map((run, i) => (
                    <div
                      key={`${run.SCHEDULED_TIME}-${i}`}
                      className="flex items-center justify-between px-2 py-1.5 rounded bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        {stateBadge(run.STATE)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {run.DURATION_SECONDS != null ? `${run.DURATION_SECONDS}s` : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Import Snowflake Tasks */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Import Tasks</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Discover existing Snowflake tasks and import them as workflows.
        </p>

        {!showDiscover ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDiscover}
            className="w-full"
          >
            <Search className="h-3.5 w-3.5 mr-1.5" />
            Discover Snowflake Tasks
          </Button>
        ) : (
          <div className="space-y-3">
            {/* Database filter */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Database (optional)"
                value={dbFilter}
                onChange={(e) => setDbFilter(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <Button size="sm" variant="outline" onClick={handleDiscover} disabled={discoverLoading}>
                {discoverLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {discoverLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}

            {!discoverLoading && discoverData && (
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Found {discoverData.total} tasks ({discoverData.root_tasks} root)
                </div>
                {discoverData.graphs.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-3">No task graphs found.</p>
                )}
                <div className="space-y-2 max-h-64 overflow-auto">
                  {discoverData.graphs.map((graph) => (
                    <div
                      key={graph.root_task}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-900 dark:text-white">
                          {graph.root_task}
                        </span>
                        {stateBadge(graph.state)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                        <span>{graph.task_count} task{graph.task_count !== 1 ? 's' : ''}</span>
                        {graph.schedule && <span>{graph.schedule}</span>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleImport(graph)}
                        disabled={importing === graph.tasks?.[0]?.fqn}
                        className="w-full text-xs"
                      >
                        {importing === graph.tasks?.[0]?.fqn ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Download className="h-3 w-3 mr-1" />
                        )}
                        Import as Workflow
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowDiscover(false)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
            >
              Close discovery
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksPanel;
