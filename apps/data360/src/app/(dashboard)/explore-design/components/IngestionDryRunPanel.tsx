'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Play, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  Table2, Clock, AlertTriangle, Beaker, ArrowDown, ArrowUp, Minus,
  Database, RefreshCw,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { dryRunIngestion } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { IngestionMode } from '@/app/services/api/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type RowAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'UNCHANGED';

interface SamplePreviewRow {
  action: RowAction;
  data: Record<string, string | number | boolean | null>;
}

interface IngestionDryRunResult {
  status: 'success' | 'failed';
  rowsProcessed: number;
  durationMs: number;
  nextSyncFrom?: string;
  sampleRows: SamplePreviewRow[];
  columns: string[];
  summary: {
    inserts: number;
    updates: number;
    deletes: number;
    unchanged: number;
  };
  errors: string[];
  warnings: string[];
}

interface IngestionDryRunPanelProps {
  tableName: string;
  ingestionMode: string;
  projectId?: string | null;
  sourceDatabase?: string;
  sourceSchema?: string;
  targetDatabase?: string;
  targetSchema?: string;
  onRunDryRun?: () => Promise<IngestionDryRunResult>;
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

const actionConfig: Record<RowAction, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<any>;
}> = {
  INSERT: { label: 'INSERT', color: 'text-green-600', bgColor: 'bg-green-100', icon: ArrowDown },
  UPDATE: { label: 'UPDATE', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: RefreshCw },
  DELETE: { label: 'DELETE', color: 'text-red-600', bgColor: 'bg-red-100', icon: Minus },
  UNCHANGED: { label: 'SAME', color: 'text-slate-500', bgColor: 'bg-slate-100', icon: Minus },
};

// ── Component ──────────────────────────────────────────────────────────────────

const IngestionDryRunPanel: React.FC<IngestionDryRunPanelProps> = ({
  tableName,
  ingestionMode,
  projectId,
  sourceDatabase,
  sourceSchema,
  targetDatabase,
  targetSchema,
  onRunDryRun,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<IngestionDryRunResult | null>(null);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setResult(null);
    setIsExpanded(true);
    try {
      let res: IngestionDryRunResult;
      if (onRunDryRun) {
        res = await onRunDryRun();
      } else if (projectId) {
        const apiResult = await dryRunIngestion(projectId, {
          source_database: sourceDatabase || '',
          source_schema: sourceSchema || '',
          source_table: tableName,
          target_database: targetDatabase || sourceDatabase || '',
          target_schema: targetSchema || sourceSchema || '',
          target_table: tableName,
          ingestion_mode: ingestionMode as IngestionMode,
          sample_size: 10,
        });
        res = {
          status: apiResult.status,
          rowsProcessed: apiResult.rows_processed,
          durationMs: apiResult.duration_ms,
          nextSyncFrom: apiResult.next_sync_from,
          sampleRows: apiResult.sample_rows.map((r) => ({
            action: r.action,
            data: r.data as Record<string, string | number | boolean | null>,
          })),
          columns: apiResult.columns,
          summary: apiResult.summary,
          errors: apiResult.errors,
          warnings: apiResult.warnings,
        };
      } else {
        throw new Error('No projectId or onRunDryRun provided');
      }
      setResult(res);
      if (res.status === 'success') {
        toast.success(`Dry-run preview: ${res.sampleRows.length} rows, ${res.summary.inserts} inserts, ${res.summary.updates} updates`);
      } else {
        toast.error('Ingestion dry-run failed');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Dry-run failed');
    } finally {
      setIsRunning(false);
    }
  }, [onRunDryRun, projectId, tableName, ingestionMode, sourceDatabase, sourceSchema, targetDatabase, targetSchema]);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <button
          className="flex items-center gap-2 font-medium text-sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Beaker className="h-4 w-4 text-teal-500" />
          Ingestion Dry-Run
          {result && (
            <Badge
              size="sm"
              className={cn(
                result.status === 'success'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-red-100 text-red-600',
              )}
            >
              {result.sampleRows.length} rows previewed
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
          disabled={isRunning}
          className="gap-1.5"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Previewing...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Preview 10 Rows
            </>
          )}
        </Button>
      </div>

      {isExpanded && (
        <div>
          {/* Running */}
          {isRunning && (
            <div className="px-4 py-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-3 text-teal-500 animate-spin" />
              <p className="text-sm font-medium">Generating preview...</p>
              <p className="text-xs text-slate-500 mt-1">
                Sampling 10 rows with {ingestionMode.replace(/_/g, ' ')} strategy
              </p>
            </div>
          )}

          {/* Result */}
          {result && !isRunning && (
            <div>
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-px bg-slate-200 dark:bg-slate-700 border-b dark:border-slate-700">
                {[
                  { label: 'Rows Processed', value: result.rowsProcessed.toLocaleString(), color: 'text-slate-700' },
                  { label: 'Inserts', value: result.summary.inserts.toLocaleString(), color: 'text-green-600' },
                  { label: 'Updates', value: result.summary.updates.toLocaleString(), color: 'text-blue-600' },
                  { label: 'Deletes', value: result.summary.deletes.toLocaleString(), color: 'text-red-600' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white dark:bg-slate-800 px-3 py-2 text-center">
                    <p className={cn('text-sm font-semibold', stat.color)}>{stat.value}</p>
                    <p className="text-[10px] text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Duration & Next Sync */}
              <div className="px-4 py-2 border-b dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Duration: {formatDuration(result.durationMs)}
                </span>
                {result.nextSyncFrom && (
                  <span className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Next sync from: {result.nextSyncFrom}
                  </span>
                )}
              </div>

              {/* Sample Preview Table */}
              {result.sampleRows.length > 0 && (
                <div className="overflow-auto max-h-[350px]">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-600 border-b dark:border-slate-700 w-20">
                          ACTION
                        </th>
                        {result.columns.map((col) => (
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
                      {result.sampleRows.map((row, rowIdx) => {
                        const ac = actionConfig[row.action];
                        const ActionIcon = ac.icon;

                        return (
                          <tr
                            key={rowIdx}
                            className={cn(
                              'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                              row.action === 'DELETE' && 'bg-red-50/50 dark:bg-red-900/10',
                            )}
                          >
                            <td className="px-3 py-1.5">
                              <Badge size="sm" className={cn(ac.bgColor, ac.color, 'text-[10px] font-bold')}>
                                <ActionIcon className="h-2.5 w-2.5 mr-0.5" />
                                {ac.label}
                              </Badge>
                            </td>
                            {result.columns.map((col) => (
                              <td
                                key={col}
                                className={cn(
                                  'px-3 py-1.5 whitespace-nowrap font-mono',
                                  row.action === 'DELETE' && 'line-through text-red-400',
                                  row.action === 'INSERT' && 'text-green-700 dark:text-green-400',
                                  row.action === 'UPDATE' && 'text-blue-700 dark:text-blue-400',
                                )}
                              >
                                {row.data[col] === null ? (
                                  <span className="text-slate-400 italic">NULL</span>
                                ) : (
                                  String(row.data[col])
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Errors/Warnings */}
              {result.errors.length > 0 && (
                <div className="p-4 border-t dark:border-slate-700">
                  {result.errors.map((err, i) => (
                    <div key={i} className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 mb-1 last:mb-0">
                      {err}
                    </div>
                  ))}
                </div>
              )}
              {result.warnings.length > 0 && (
                <div className="p-4 border-t dark:border-slate-700">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-600 mb-1 last:mb-0">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty */}
          {!result && !isRunning && (
            <div className="p-8 text-center text-slate-500">
              <Table2 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Preview 10 rows before running full ingestion</p>
              <p className="text-xs mt-1">Shows INSERT / UPDATE / DELETE actions per row</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IngestionDryRunPanel;
