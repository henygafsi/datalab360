'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Play, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  Database, Clock, Rocket, RotateCcw, Copy, Check,
  Table2, Beaker,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { dryRunDeployment } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SampleRow {
  [key: string]: string | number | boolean | null;
}

interface DryRunResultLocal {
  status: 'success' | 'failed';
  executionTimeMs: number;
  statementsExecuted: number;
  statementsFailed: number;
  errors: string[];
  sampleData: SampleRow[];
  sampleColumns: string[];
  cloneSchemaName: string;
}

interface DryRunPanelProps {
  projectId: string | null;
  warehouse?: string;
  sampleRows?: number;
  onPromoteToProd?: () => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ── Component ──────────────────────────────────────────────────────────────────

const DryRunPanel: React.FC<DryRunPanelProps> = ({
  projectId,
  warehouse,
  sampleRows = 10,
  onPromoteToProd,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DryRunResultLocal | null>(null);

  const handleRun = useCallback(async () => {
    if (!projectId) return;
    setIsRunning(true);
    setResult(null);
    setIsExpanded(true);
    try {
      const apiResult = await dryRunDeployment(projectId, { warehouse, sample_rows: sampleRows });

      // Collect errors from individual failed results
      const errors: string[] = [];
      for (const r of (apiResult.results || [])) {
        if (r.status === 'FAILED' && r.error) {
          errors.push(`${r.ddl_sql?.slice(0, 60) || r.event_id}: ${r.error}`);
        }
      }

      // Collect sample rows from the first successful result that has them
      let sampleData: SampleRow[] = [];
      let sampleColumns: string[] = [];
      for (const r of (apiResult.results || [])) {
        if (r.sample_rows && r.sample_rows.length > 0) {
          sampleData = r.sample_rows as SampleRow[];
          sampleColumns = Object.keys(r.sample_rows[0]);
          break;
        }
      }

      const res: DryRunResultLocal = {
        status: apiResult.failed === 0 ? 'success' : 'failed',
        executionTimeMs: apiResult.duration_ms ?? 0,
        statementsExecuted: apiResult.passed ?? 0,
        statementsFailed: apiResult.failed ?? 0,
        errors,
        sampleData,
        sampleColumns,
        cloneSchemaName: apiResult.clone_schema ?? '',
      };
      setResult(res);
      if (res.status === 'success') {
        toast.success(`Dry-run successful — ${res.statementsExecuted} statements in ${formatDuration(res.executionTimeMs)}`);
      } else {
        toast.error(`Dry-run failed — ${res.statementsFailed} statement(s) failed`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Dry-run failed unexpectedly');
      setResult({
        status: 'failed',
        executionTimeMs: 0,
        statementsExecuted: 0,
        statementsFailed: 1,
        errors: [getApiErrorMessage(err) || 'Unknown error'],
        sampleData: [],
        sampleColumns: [],
        cloneSchemaName: '',
      });
    } finally {
      setIsRunning(false);
    }
  }, [projectId, warehouse, sampleRows]);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <button
          className="flex items-center gap-2 font-medium text-sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Beaker className="h-4 w-4 text-cyan-500" />
          Dry-Run (Sandbox Execution)
          {result && (
            <Badge
              size="sm"
              className={cn(
                result.status === 'success'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-red-100 text-red-600',
              )}
            >
              {result.status === 'success' ? 'Passed' : 'Failed'}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRun}
          disabled={isRunning || !projectId}
          className="gap-1.5"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Dry-Run
            </>
          )}
        </Button>
      </div>

      {isExpanded && (
        <div>
          {/* Running State */}
          {isRunning && (
            <div className="px-4 py-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-3 text-cyan-500 animate-spin" />
              <p className="text-sm font-medium">Executing on cloned schema...</p>
              <p className="text-xs text-slate-500 mt-1">
                DDL statements are being applied to a sandbox clone
              </p>
            </div>
          )}

          {/* Result */}
          {result && !isRunning && (
            <div>
              {/* Status Bar */}
              <div
                className={cn(
                  'px-4 py-3 flex items-center gap-3 border-b dark:border-slate-700',
                  result.status === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-red-50 dark:bg-red-900/20',
                )}
              >
                {result.status === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div className="flex-1">
                  <p className={cn('text-sm font-medium', result.status === 'success' ? 'text-green-700' : 'text-red-700')}>
                    {result.status === 'success'
                      ? 'Dry-run completed successfully'
                      : `Dry-run failed — ${result.statementsFailed} error(s)`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {result.statementsExecuted} statements in {formatDuration(result.executionTimeMs)}
                    {result.cloneSchemaName && ` • Clone: ${result.cloneSchemaName}`}
                  </p>
                </div>
                {result.status === 'success' && onPromoteToProd && (
                  <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                    <Rocket className="h-3.5 w-3.5" />
                    Promote to Production
                  </Button>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-px bg-slate-200 dark:bg-slate-700 border-b dark:border-slate-700">
                {[
                  { label: 'Passed', value: result.statementsExecuted, color: 'text-green-600' },
                  { label: 'Failed', value: result.statementsFailed, color: result.statementsFailed > 0 ? 'text-red-600' : 'text-slate-500' },
                  { label: 'Duration', value: formatDuration(result.executionTimeMs), color: 'text-slate-700' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white dark:bg-slate-800 px-3 py-2 text-center">
                    <p className={cn('text-sm font-semibold', stat.color)}>{stat.value}</p>
                    <p className="text-[10px] text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {result.errors?.length > 0 && (
                <div className="p-4 border-b dark:border-slate-700">
                  <p className="text-xs font-medium text-red-600 mb-2">Errors:</p>
                  <div className="space-y-1">
                    {result.errors.map((err, i) => (
                      <div key={i} className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 font-mono">
                        {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Data (10-row preview) */}
              {result.sampleData.length > 0 && (
                <div className="p-4">
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                    <Table2 className="h-3.5 w-3.5" />
                    Sample Preview ({result.sampleData.length} rows)
                  </p>
                  <div className="border dark:border-slate-700 rounded-lg overflow-auto max-h-[250px]">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                        <tr>
                          {result.sampleColumns.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap border-b dark:border-slate-700"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-slate-700">
                        {result.sampleData.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            {result.sampleColumns.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-1.5 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300"
                              >
                                {row[col] === null ? (
                                  <span className="text-slate-400 italic">NULL</span>
                                ) : (
                                  String(row[col])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!result && !isRunning && (
            <div className="p-8 text-center text-slate-500">
              <Beaker className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Click "Run Dry-Run" to test DDL on a cloned schema</p>
              <p className="text-xs mt-1">No production data will be modified</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DryRunPanel;
