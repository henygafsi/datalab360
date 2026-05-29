'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
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
  Sparkles,
  Coins,
  Beaker,
  Lock,
  Info,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import * as workflowApi from '@/app/services/api/workflowApi';
import type { WorkflowRun } from '@/app/services/api/types';
import { ConfirmDestructiveDialog } from '@/components/ui/confirm-dialog';

import RunActionsMenu from './RunActionsMenu';
import RunCompareDrawer from './RunCompareDrawer';

// Format duration in seconds to human-readable string
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// ============================================
// Cost estimation
// ============================================
//
// Per-run cost API does NOT exist yet. We approximate credits burned by
// summing `rows_affected * COST_PER_ROW` across step results. The factor is
// a placeholder agreed with platform; replace this helper with the real
// `/workflow/{id}/cost-summary` endpoint once it lands.
//
const COST_PER_ROW = 0.0001;

interface StepLike {
  step_id?: string;
  step_name?: string;
  action_type?: string;
  status?: string;
  rows_affected?: number;
  error?: unknown;
  attempt?: number;
}

function getStepsResults(run: WorkflowRun): StepLike[] {
  const details = run.execution_details as Record<string, unknown> | null | undefined;
  const raw = details?.['steps_results'];
  return Array.isArray(raw) ? (raw as StepLike[]) : [];
}

function estimateRunCost(run: WorkflowRun): number | null {
  const steps = getStepsResults(run);
  if (steps.length === 0) return null;
  const hasAny = steps.some((s) => typeof s.rows_affected === 'number');
  if (!hasAny) return null;
  const total = steps.reduce(
    (sum, s) => sum + (typeof s.rows_affected === 'number' ? s.rows_affected : 0),
    0,
  );
  return total * COST_PER_ROW;
}

function formatCredits(cost: number | null): string {
  if (cost === null) return '—';
  if (cost < 0.01) return '<0.01';
  if (cost < 10) return cost.toFixed(2);
  return Math.round(cost).toString();
}

// ============================================
// localStorage helpers (expected-failure flag)
// ============================================

const EXPECTED_FAILURE_KEY = 'data360.workflow.expectedFailures';
const HIDE_EXPECTED_KEY = 'data360.workflow.hideExpectedFailures';

function readExpectedFailures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(EXPECTED_FAILURE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeExpectedFailures(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      EXPECTED_FAILURE_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    /* quota / privacy mode — silently drop */
  }
}

function readHideExpected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(HIDE_EXPECTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHideExpected(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HIDE_EXPECTED_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

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
  pipelineName: _pipelineName,
  onRefresh,
  className,
  compact = false,
}) => {
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<RunStatus | ''>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({});
  const [analyzingRun, setAnalyzingRun] = useState<string | null>(null);

  // New state for enhanced UX
  const [expectedFailures, setExpectedFailures] = useState<Set<string>>(() => readExpectedFailures());
  const [hideExpected, setHideExpected] = useState<boolean>(() => readHideExpected());
  const [compareSourceId, setCompareSourceId] = useState<string | null>(null);
  const [compareDrawer, setCompareDrawer] = useState<{
    open: boolean;
    runA: WorkflowRun | null;
    runB: WorkflowRun | null;
  }>({ open: false, runA: null, runB: null });
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [killTarget, setKillTarget] = useState<WorkflowRun | null>(null);

  // Polling is paused once it runs continuously past MAX_POLL_AGE_MS for the
  // same set of running runs — guards against runs stuck in `running` forever.
  const [pollingPaused, setPollingPaused] = useState(false);
  const pollStartedAtRef = useRef<number | null>(null);
  const runningSetKeyRef = useRef<string>('');

  const fetchRunsFn = useCallback(
    () => workflowApi.listRuns(pipelineId!, { limit: 50, status: statusFilter || undefined }),
    [pipelineId, statusFilter]
  );

  const { data: runsData, loading: isLoading, error: fetchError, refetch } = useCacheAwareQuery(
    fetchRunsFn,
    { cacheKeys: [CACHE_KEYS.WORKFLOWS], enabled: !!pipelineId, initialData: null }
  );

  const allRuns = useMemo<WorkflowRun[]>(() => runsData?.runs ?? [], [runsData]);
  const error = fetchError?.message ?? null;

  // Apply hide-expected filter for display
  const runs = useMemo(
    () => (hideExpected ? allRuns.filter((r) => !expectedFailures.has(r.run_id)) : allRuns),
    [allRuns, hideExpected, expectedFailures],
  );

  const expectedHiddenCount = useMemo(
    () => allRuns.filter((r) => expectedFailures.has(r.run_id)).length,
    [allRuns, expectedFailures],
  );

  // Auto-refresh for running pipelines.
  //
  // Two guards beyond a plain interval:
  //  1. Max-poll-age — if a run is stuck in `running` forever, stop polling
  //     after MAX_POLL_AGE_MS so we don't drain the network indefinitely.
  //  2. Tab visibility — skip the network tick while the tab is hidden, and
  //     resume automatically once it becomes visible again.
  useEffect(() => {
    const MAX_POLL_AGE_MS = 600_000; // 10 minutes
    const runningRuns = allRuns.filter((r) => r.status === 'running');
    if (runningRuns.length === 0) {
      // Nothing running — reset poll tracking so a future run starts fresh.
      pollStartedAtRef.current = null;
      runningSetKeyRef.current = '';
      if (pollingPaused) setPollingPaused(false);
      return;
    }

    // Reset the age clock when the set of running runs changes.
    const runningKey = runningRuns.map((r) => r.run_id).sort().join(',');
    if (runningSetKeyRef.current !== runningKey) {
      runningSetKeyRef.current = runningKey;
      pollStartedAtRef.current = Date.now();
      if (pollingPaused) setPollingPaused(false);
    }
    if (pollStartedAtRef.current === null) {
      pollStartedAtRef.current = Date.now();
    }

    if (pollingPaused) return;

    const interval = setInterval(() => {
      if (
        pollStartedAtRef.current !== null &&
        Date.now() - pollStartedAtRef.current > MAX_POLL_AGE_MS
      ) {
        clearInterval(interval);
        setPollingPaused(true);
        return;
      }
      // Skip the network call when the tab is hidden — resume when visible.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refetch();
    }, 5000);

    const handleVisibility = () => {
      // Refresh immediately when the tab becomes visible again so the user
      // sees fresh data without waiting for the next 5s tick.
      if (
        document.visibilityState === 'visible' &&
        pollStartedAtRef.current !== null &&
        Date.now() - pollStartedAtRef.current <= MAX_POLL_AGE_MS
      ) {
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [allRuns, refetch, pollingPaused]);

  // Auto-trigger AI analysis on latest failed run (skip expected failures)
  useEffect(() => {
    if (allRuns.length === 0) return;
    const latestRun = allRuns[0];
    if (
      latestRun.status === 'failed' &&
      !aiAnalysis[latestRun.run_id] &&
      !expectedFailures.has(latestRun.run_id)
    ) {
      analyzeRun(latestRun.run_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRuns]);

  // ============================================
  // Cumulative weekly cost
  // ============================================
  const weeklyCost = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let total = 0;
    let runCount = 0;
    for (const r of allRuns) {
      const startedTs = r.started_at ? new Date(r.started_at).getTime() : NaN;
      if (Number.isNaN(startedTs) || startedTs < cutoff) continue;
      const cost = estimateRunCost(r);
      if (cost !== null) total += cost;
      runCount += 1;
    }
    return { total, runCount };
  }, [allRuns]);

  // 1s elapsed-time ticker — only mounted while a run is actually RUNNING.
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === 'running');
    if (!hasRunning) return;

    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [runs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
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

  const analyzeRun = async (runId: string) => {
    if (!pipelineId) return;
    setAnalyzingRun(runId);
    try {
      const response = await workflowApi.analyzeRun(pipelineId, runId);
      setAiAnalysis((prev) => ({ ...prev, [runId]: response.ai_analysis }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setAiAnalysis((prev) => ({ ...prev, [runId]: `Analysis failed: ${msg}` }));
    } finally {
      setAnalyzingRun(null);
    }
  };

  // ============================================
  // Re-run handlers
  // ============================================

  const handleRerunSame = useCallback(
    async (run: WorkflowRun) => {
      if (!pipelineId) return;
      setRerunningId(run.run_id);
      const t = toast.loading('Re-running workflow…');
      try {
        await workflowApi.executeWorkflow(pipelineId);
        toast.success('Re-run started', { id: t });
        // Give backend a beat then refresh
        window.setTimeout(() => {
          void refetch();
        }, 600);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Re-run failed: ${msg}`, { id: t });
      } finally {
        setRerunningId(null);
      }
    },
    [pipelineId, refetch],
  );

  const handleRerunOverrides = useCallback(
    (_run: WorkflowRun) => {
      // Override editor is out of scope for this pass — surface a clear placeholder.
      toast(
        'Override editor coming soon — opens a parameter picker before re-execution.',
        { icon: 'ℹ️' },
      );
    },
    [],
  );

  // ============================================
  // Compare handlers
  // ============================================

  const handleCompare = useCallback(
    (run: WorkflowRun) => {
      if (compareSourceId === run.run_id) {
        // Cancel selection
        setCompareSourceId(null);
        toast('Compare selection cleared', { icon: 'ℹ️' });
        return;
      }
      if (!compareSourceId) {
        setCompareSourceId(run.run_id);
        toast('Pick another run row to compare', { icon: 'ℹ️', duration: 4000 });
        return;
      }
      const source = allRuns.find((r) => r.run_id === compareSourceId) ?? null;
      setCompareDrawer({ open: true, runA: source, runB: run });
      setCompareSourceId(null);
    },
    [compareSourceId, allRuns],
  );

  // ============================================
  // Expected-failure handlers
  // ============================================

  const toggleExpectedFailure = useCallback((runId: string) => {
    setExpectedFailures((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
        toast('Removed expected-failure flag', { icon: 'ℹ️' });
      } else {
        next.add(runId);
        toast('Marked as expected failure', { icon: 'ℹ️' });
      }
      writeExpectedFailures(next);
      return next;
    });
  }, []);

  const handleToggleHideExpected = useCallback(() => {
    setHideExpected((v) => {
      const next = !v;
      writeHideExpected(next);
      return next;
    });
  }, []);

  // ============================================
  // Kill handlers
  // ============================================

  const handleKillConfirm = useCallback(
    async ({ reason: _reason }: { reason?: string }) => {
      // Backend endpoint does not exist yet — toast and close.
      toast(
        'Kill endpoint not yet available — see the Backend Gap card on the row.',
        { icon: 'ℹ️', duration: 5000 },
      );
      setKillTarget(null);
    },
    [],
  );

  const handleCopyRunId = useCallback(async (runId: string) => {
    try {
      await navigator.clipboard.writeText(runId);
      toast.success('Run ID copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }, []);

  // ============================================
  // Helpers (display)
  // ============================================

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
    const completed = allRuns.filter((r) => r.status === 'completed' || r.status === 'success').length;
    const failed = allRuns.filter((r) => r.status === 'failed').length;
    const running = allRuns.filter((r) => r.status === 'running').length;
    const validDurations = allRuns.filter((r) => r.duration_seconds);
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
          Save the workflow to view execution history
        </p>
      </div>
    );
  }

  // Loading
  if (isLoading && allRuns.length === 0) {
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
          {allRuns.length > 0 && (
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">
              {allRuns.length}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition disabled:opacity-50"
          title="Refresh"
          aria-label="Refresh execution history"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Weekly cumulative cost banner */}
      {allRuns.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-amber-50/60 px-3 py-2 text-xs dark:border-slate-700 dark:bg-amber-900/10">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <Coins className="h-3.5 w-3.5" />
            <span>
              This workflow used{' '}
              <span className="font-semibold">
                ~{formatCredits(weeklyCost.total)} credits
              </span>{' '}
              this week ({weeklyCost.runCount} runs)
            </span>
          </div>
          <span
            title="Estimated from steps_results[].rows_affected. Real /workflow/{id}/cost-summary endpoint pending."
            className="inline-flex items-center gap-1 text-amber-700/80 dark:text-amber-300/80"
          >
            <Info className="h-3 w-3" />
            estimate
          </span>
        </div>
      )}

      {/* Stats Summary (non-compact mode) */}
      {!compact && allRuns.length > 0 && (
        <div className="grid grid-cols-4 gap-2 p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{stats.completed}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{stats.running}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Running</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-600 dark:text-slate-400">
              {formatDuration(Math.round(stats.avgDuration))}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Avg Time</div>
          </div>
        </div>
      )}

      {/* Filters + hide-expected toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-2 dark:border-slate-700">
        <div className="flex items-center gap-1">
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

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-3 w-3 accent-blue-500"
            checked={hideExpected}
            onChange={handleToggleHideExpected}
            aria-label="Hide expected failures"
          />
          <ShieldCheck className="h-3 w-3" />
          Hide expected failures ({expectedHiddenCount})
        </label>
      </div>

      {/* Compare-mode banner */}
      {compareSourceId && (
        <div className="border-b border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
          Compare mode: pick another run to compare against{' '}
          <code className="font-mono">#{compareSourceId.slice(-8)}</code>.{' '}
          <button
            type="button"
            onClick={() => setCompareSourceId(null)}
            className="underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Polling-paused note (run stuck in `running` past the max poll age) */}
      {pollingPaused && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Run status polling paused — refresh manually.</span>
        </div>
      )}

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
            <p>
              {allRuns.length === 0 ? 'No execution history' : 'All runs are hidden'}
            </p>
            <p className="text-xs mt-1">
              {allRuns.length === 0
                ? 'Execute the pipeline to see runs here'
                : 'Toggle off "Hide expected failures" to see them.'}
            </p>
          </div>
        ) : (
          runs.map((run: WorkflowRun) => {
            const isExpanded = expandedRuns.has(run.run_id);
            const isExpected = expectedFailures.has(run.run_id);
            const isCompareSource = compareSourceId === run.run_id;
            const cost = estimateRunCost(run);
            const details = run.execution_details as Record<string, unknown> | null | undefined;
            const inputs = details?.['inputs'];
            const hasInputs = Array.isArray(inputs) && inputs.length > 0;

            return (
              <div
                key={run.run_id}
                className={cn(
                  'p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition',
                  run.status === 'running' && 'bg-blue-50/30 dark:bg-blue-900/10',
                  isExpected && 'opacity-70',
                  isCompareSource && 'ring-2 ring-blue-300 dark:ring-blue-700',
                )}
              >
                {/* Run Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <button
                        onClick={() => toggleRunExpanded(run.run_id)}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                        aria-label={isExpanded ? 'Collapse run details' : 'Expand run details'}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>
                      {getStatusBadge(run.status as RunStatus)}
                      {isExpected && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                          title="Marked as expected failure (alerts suppressed)"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Expected
                        </span>
                      )}
                      {run.status === 'failed' && !isExpected && (
                        <button
                          onClick={(e) => { e.stopPropagation(); analyzeRun(run.run_id); }}
                          className="ml-1 px-2 py-0.5 text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full hover:bg-purple-200 dark:hover:bg-purple-800/40 flex items-center gap-1"
                          disabled={analyzingRun === run.run_id}
                        >
                          {analyzingRun === run.run_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          AI Fix
                        </button>
                      )}
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
                          {formatDuration(run.duration_seconds)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {run.steps_executed}/{run.steps_total} steps
                        {run.steps_failed > 0 && (
                          <span className="text-red-500">({run.steps_failed} failed)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Right-aligned: cost chip + actions menu */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      title={
                        cost === null
                          ? 'Per-run cost API coming soon'
                          : 'Estimated credits — replace once /workflow/{id}/cost-summary lands'
                      }
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        cost === null
                          ? 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
                      )}
                    >
                      <Coins className="h-3 w-3" />
                      ~{formatCredits(cost)} cr
                    </span>

                    {rerunningId === run.run_id && (
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" aria-label="Re-running" />
                    )}

                    <RunActionsMenu
                      runId={run.run_id}
                      runStatus={run.status}
                      isExpectedFailure={isExpected}
                      hasInputs={hasInputs}
                      isCompareSourcePicked={isCompareSource}
                      onRerunSame={() => void handleRerunSame(run)}
                      onRerunOverrides={() => handleRerunOverrides(run)}
                      onCompare={() => handleCompare(run)}
                      onToggleExpected={() => toggleExpectedFailure(run.run_id)}
                      onKill={() => setKillTarget(run)}
                      onCopyId={() => void handleCopyRunId(run.run_id)}
                    />
                  </div>
                </div>

                {/* AI Analysis — always visible when available (not hidden inside expanded) */}
                {run.status === 'failed' && analyzingRun === run.run_id && !aiAnalysis[run.run_id] && (
                  <div className="mt-2 ml-6 flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg text-xs text-purple-600 dark:text-purple-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing with Cortex AI...
                  </div>
                )}
                {aiAnalysis[run.run_id] && (
                  <div className="mt-2 ml-6 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">AI Analysis & Fix Suggestions</span>
                    </div>
                    <div className="text-xs text-purple-800 dark:text-purple-200 whitespace-pre-wrap leading-relaxed">
                      {aiAnalysis[run.run_id]}
                    </div>
                  </div>
                )}

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
                        <div>
                          <span className="text-slate-500">Trigger:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {run.trigger_type}
                          </span>
                        </div>
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

                    {/* Error Log */}
                    {run.error_log && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            Error
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(
                              String(typeof run.error_log === 'string' ? run.error_log : JSON.stringify(run.error_log, null, 2))
                            )}
                            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            title="Copy error to clipboard"
                            aria-label="Copy error to clipboard"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
                          {String(typeof run.error_log === 'string' ? run.error_log : JSON.stringify(run.error_log, null, 2))}
                        </pre>
                      </div>
                    )}

                    {/* AI Analysis */}
                    {run.status === 'failed' && analyzingRun === run.run_id && !aiAnalysis[run.run_id] && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg text-xs text-purple-600 dark:text-purple-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing with AI...
                      </div>
                    )}
                    {aiAnalysis[run.run_id] && (
                      <div className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">AI Analysis & Fix Suggestions</span>
                        </div>
                        <div className="text-xs text-purple-800 dark:text-purple-200 whitespace-pre-wrap leading-relaxed">
                          {aiAnalysis[run.run_id]}
                        </div>
                      </div>
                    )}

                    {/* Step-by-Step Execution Results */}
                    {details?.['steps_results'] !== undefined && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Layers className="h-3 w-3" />
                            Step Results ({String(details?.['mode'] ?? 'legacy')} mode)
                          </div>
                        </div>
                        <div className="space-y-1">
                          {getStepsResults(run).map((step, idx) => (
                            <React.Fragment key={step.step_id || idx}>
                              <div className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs',
                                step.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20' :
                                step.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20' :
                                'bg-slate-50 dark:bg-slate-800/50'
                              )}>
                                <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                                  {idx + 1}
                                </span>
                                {step.status === 'completed' ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                ) : step.status === 'failed' ? (
                                  <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                )}
                                <span className="font-medium text-slate-700 dark:text-slate-300 truncate flex-1">
                                  {step.step_name || step.action_type || step.step_id}
                                </span>
                                {step.rows_affected !== undefined && (
                                  <span className="text-slate-500 dark:text-slate-400">{step.rows_affected} rows</span>
                                )}
                                {step.attempt && step.attempt > 1 && (
                                  <span className="text-amber-500 text-[10px]">retry x{step.attempt}</span>
                                )}
                              </div>
                              {step.error !== undefined && step.error !== null && (
                                <div className="mt-1 ml-7">
                                  <p className="text-xs text-red-600 dark:text-red-400 break-words">
                                    {String(step.error)}
                                  </p>
                                </div>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                        {/* Compiled SQL (CTE mode) */}
                        {typeof details?.['compiled_sql'] === 'string' && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Code className="h-3 w-3" /> Compiled SQL
                              </span>
                              <button
                                onClick={() => copyToClipboard(String(details?.['compiled_sql'] ?? ''), run.run_id)}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                                title="Copy SQL"
                                aria-label="Copy compiled SQL"
                              >
                                {copiedSql === run.run_id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-slate-400" />}
                              </button>
                            </div>
                            <pre className="p-2 bg-slate-900 rounded-lg text-[10px] text-green-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-[200px]">
                              {String(details?.['compiled_sql'] ?? '')}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Raw Details Fallback (when no steps_results) */}
                    {details && details['steps_results'] === undefined && (
                      <div className="p-3 bg-slate-900 rounded-lg">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono overflow-x-auto">
                          {JSON.stringify(details, null, 2)}
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

      {/* Kill confirm dialog + Backend Gap card */}
      {killTarget && (
        <ConfirmDestructiveDialog
          open={!!killTarget}
          onOpenChange={(o) => {
            if (!o) setKillTarget(null);
          }}
          title="Kill running execution?"
          tier="hard"
          resourceLabel="run"
          resourceName={killTarget.run_id}
          requireReason={false}
          irreversibleNote="Partial step results will be preserved when the backend endpoint lands."
          confirmLabel="Kill run"
          body={
            <div className="space-y-3">
              <p>
                You are about to abort run{' '}
                <code className="font-mono text-[11px]">#{killTarget.run_id.slice(-8)}</code>.
                In-flight steps will be marked as cancelled.
              </p>

              {/* Inline backend gap card */}
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-violet-500" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    Backend gap — UX target
                  </p>
                </div>
                <dl className="mt-2 space-y-1.5 text-[11px]">
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      POST /workflow/{'{id}'}/runs/{'{runId}'}/kill
                    </dd>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">{`{ reason?: string }`}</dd>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <dt className="font-semibold text-violet-700 dark:text-violet-300">Returns</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      {'{ killed_at, partial_results? }'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
                    <dd className="text-slate-700 dark:text-slate-300">
                      Superadmins need to stop runaway runs without restarting the worker.
                    </dd>
                  </div>
                </dl>
                <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
                  <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
                  <span className="text-[10px] text-violet-800 dark:text-violet-200">
                    Until this lands, confirming will toast a notice and refresh the runs list.
                  </span>
                </div>
              </div>
            </div>
          }
          onConfirm={handleKillConfirm}
        />
      )}

      {/* Compare drawer */}
      <RunCompareDrawer
        open={compareDrawer.open}
        runA={compareDrawer.runA}
        runB={compareDrawer.runB}
        onClose={() => setCompareDrawer({ open: false, runA: null, runB: null })}
      />
    </div>
  );
};

export default ETLExecutionHistory;
