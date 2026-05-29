'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  Beaker, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Clock, Database, FileCode, ChevronDown, ChevronRight, Copy,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { DryRunEventResult, FullDryRunResult, FullDryRunIngestionResult, FullDryRunIngestionInput } from '@/app/services/api/types';

export default function StepDryRun() {
  const { projectId, events, config, results, setResults } = useDeploymentContext();
  const [isRunning, setIsRunning] = useState(false);
  const [fullResult, setFullResult] = useState<FullDryRunResult | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedIngestions, setExpandedIngestions] = useState<Set<number>>(new Set());

  // Build ingestion inputs from COLUMN_MAPPING events
  const ingestionInputs = useMemo((): FullDryRunIngestionInput[] => {
    const tableMap = new Map<string, FullDryRunIngestionInput>();

    events.filter(e => e.type === 'COLUMN_MAPPING_CREATED').forEach(e => {
      const src = e.payload?.source;
      const tgt = e.payload?.target;
      if (!src?.table || !tgt?.table) return;
      const key = `${src.schema}.${src.table}→${tgt.schema}.${tgt.table}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, {
          source_database: src.database || '',
          source_schema: src.schema || '',
          source_table: src.table,
          target_database: tgt.database || '',
          target_schema: tgt.schema || '',
          target_table: tgt.table || '',
          ingestion_mode: 'full_refresh',
          sample_size: 5,
          mappings: [],
        });
      }
      tableMap.get(key)!.mappings!.push({
        source_columns: src.columns || [src.column || ''],
        target_column: tgt.column || '',
      });
    });

    // Apply mode overrides
    for (const [key, entry] of tableMap) {
      if (config.ingestionModeOverrides[key]) {
        entry.ingestion_mode = config.ingestionModeOverrides[key];
      }
    }
    events.filter(e => e.type === 'INGESTION_MODE_SET').forEach(e => {
      for (const [, entry] of tableMap) {
        if (entry.target_table === e.target?.table || entry.source_table === e.target?.table) {
          entry.ingestion_mode = e.payload?.mode || e.payload?.ingestionMode || entry.ingestion_mode;
        }
      }
    });

    return Array.from(tableMap.values());
  }, [events, config.ingestionModeOverrides]);

  const handleDryRun = useCallback(async () => {
    setIsRunning(true);
    setFullResult(null);
    try {
      const result = await exploreDesignApi.fullDryRun(projectId, {
        warehouse: config.scheduleWarehouse || 'COMPUTE_WH',
        sample_rows: 10,
        ingestions: ingestionInputs.length > 0 ? ingestionInputs : undefined,
      });
      setFullResult(result);
      setResults(prev => ({ ...prev, dryRunCompleted: true }));
      const ddl = result.deployment;
      if (ddl.failed === 0) {
        toast.success(`Dry run passed — ${ddl.passed} DDL + ${result.total_ingestions} ingestion(s)`);
      } else {
        toast.error(`Dry run: ${ddl.failed} DDL action(s) failed`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Full dry run failed');
    } finally {
      setIsRunning(false);
    }
  }, [projectId, config.scheduleWarehouse, ingestionInputs, setResults]);

  const toggleEvent = (id: string) => setExpandedEvents(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleIngestion = (idx: number) => setExpandedIngestions(prev => {
    const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next;
  });

  const ddl = fullResult?.deployment;
  const ingestions = fullResult?.ingestions || [];

  return (
    <div className="p-6 space-y-6">
      <div className="text-center py-6">
        <Beaker className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <h3 className="text-lg font-semibold mb-1">Full Dry Run</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          DDL deployment on a temporary clone + ingestion preview — no changes to production.
        </p>
      </div>

      {!fullResult && (
        <div className="flex justify-center">
          <Button size="lg" onClick={handleDryRun} disabled={isRunning} className="gap-2">
            {isRunning ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Running Full Dry Run...</>
            ) : (
              <><Beaker className="h-5 w-5" /> Start Full Dry Run</>
            )}
          </Button>
        </div>
      )}

      {/* ── DDL Results ── */}
      {ddl && (
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
          <div className={cn(
            'px-4 py-3 flex items-center justify-between',
            ddl.failed === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20',
          )}>
            <span className="font-medium text-sm flex items-center gap-2">
              {ddl.failed === 0 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
              DDL {ddl.failed === 0 ? 'Passed' : 'Failed'}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600">Passed: {ddl.passed}</span>
              {ddl.failed > 0 && <span className="text-red-600">Failed: {ddl.failed}</span>}
              <span className="text-slate-500">Total: {ddl.total_events}</span>
              {ddl.duration_ms != null && (
                <span className="text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {(ddl.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>

          {ddl.clone_schema && (
            <div className="px-4 py-2 text-xs text-slate-500 border-b dark:border-slate-700 flex items-center gap-2">
              <Database className="h-3 w-3" />
              Clone: <span className="font-mono">{ddl.clone_schema}</span>
              {ddl.schema_existed === false && <Badge size="sm" className="bg-blue-100 text-blue-600 text-[10px]">created empty</Badge>}
              {ddl.schema_existed === true && <Badge size="sm" className="bg-slate-100 text-slate-600 text-[10px]">cloned</Badge>}
              <span className="text-slate-400">(auto-dropped)</span>
            </div>
          )}

          {ddl.results.length > 0 && (
            <div className="divide-y dark:divide-slate-700">
              {ddl.results.map((evt: DryRunEventResult) => (
                <div key={evt.event_id}>
                  <button
                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    onClick={() => toggleEvent(evt.event_id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {evt.status === 'SUCCESS' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      {expandedEvents.has(evt.event_id) ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{evt.event_id}</span>
                    </div>
                    <Badge size="sm" className={cn('text-[10px]', evt.status === 'SUCCESS' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600')}>{evt.status}</Badge>
                  </button>
                  {expandedEvents.has(evt.event_id) && (
                    <div className="px-4 pb-3 space-y-2">
                      <div>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">DDL SQL</span>
                        <pre className="mt-1 p-2 bg-slate-900 rounded text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre">{evt.ddl_sql}</pre>
                      </div>
                      {evt.rewritten_sql && evt.rewritten_sql !== evt.ddl_sql && (
                        <div>
                          <span className="text-[10px] font-medium text-blue-400 uppercase tracking-wider flex items-center gap-1"><FileCode className="h-3 w-3" /> Rewritten (on clone)</span>
                          <pre className="mt-1 p-2 bg-slate-800 rounded text-xs font-mono text-blue-300 overflow-x-auto whitespace-pre">{evt.rewritten_sql}</pre>
                        </div>
                      )}
                      {evt.error && (
                        <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{evt.error}</span>
                        </div>
                      )}
                      {evt.sample_rows && evt.sample_rows.length > 0 && (
                        <div>
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sample ({evt.sample_rows.length})</span>
                          <div className="mt-1 overflow-x-auto rounded border dark:border-slate-700">
                            <table className="text-xs w-full">
                              <thead><tr className="bg-slate-100 dark:bg-slate-800">
                                {Object.keys(evt.sample_rows[0]).map(col => <th key={col} className="px-2 py-1 text-left font-medium whitespace-nowrap">{col}</th>)}
                              </tr></thead>
                              <tbody>{evt.sample_rows.map((row, ri) => (
                                <tr key={ri} className="border-t dark:border-slate-700">
                                  {Object.values(row).map((val, ci) => <td key={ci} className="px-2 py-1 font-mono whitespace-nowrap">{val == null ? <span className="text-slate-400 italic">NULL</span> : String(val)}</td>)}
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Ingestion Previews ── */}
      {ingestions.length > 0 && (
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-teal-50 dark:bg-teal-900/20 flex items-center justify-between">
            <span className="font-medium text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-teal-500" />
              Ingestion Preview
            </span>
            <Badge size="sm" className="bg-teal-100 text-teal-600">{ingestions.length} table(s)</Badge>
          </div>
          <div className="divide-y dark:divide-slate-700">
            {ingestions.map((ing: FullDryRunIngestionResult, idx: number) => {
              const isExpanded = expandedIngestions.has(idx);
              const dataCols = ing.columns.filter(c => c !== '_ACTION');
              const hasRealData = ing.rows.some(row => dataCols.some(col => row[col] != null));
              return (
                <div key={idx}>
                  <button className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left" onClick={() => toggleIngestion(idx)}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                      <span className="text-xs font-mono text-slate-500 truncate">{ing.source}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">{ing.target}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge size="sm" className="bg-slate-100 text-slate-600 text-[10px]">{ing.ingestion_mode}</Badge>
                      <Badge size="sm" className="bg-blue-100 text-blue-600 text-[10px]">{ing.sample_size} rows</Badge>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      {ing.sql_preview && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1"><FileCode className="h-3 w-3" /> SQL — {ing.ingestion_mode}</span>
                            <button className="text-xs text-slate-400 hover:text-white" onClick={async () => { try { await navigator.clipboard.writeText(ing.sql_preview); toast.success('Copied'); } catch { toast.error('Failed'); } }}>
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                          <pre className="p-2.5 bg-slate-900 rounded text-xs font-mono text-green-400 overflow-x-auto whitespace-pre leading-relaxed">{ing.sql_preview}</pre>
                        </div>
                      )}
                      {hasRealData && (
                        <div className="overflow-x-auto rounded border dark:border-slate-700">
                          <table className="text-xs w-full">
                            <thead><tr className="bg-slate-100 dark:bg-slate-800">
                              <th className="px-2 py-1 text-left font-medium w-16">ACTION</th>
                              {dataCols.map(col => <th key={col} className="px-2 py-1 text-left font-medium whitespace-nowrap">{col}</th>)}
                            </tr></thead>
                            <tbody>{ing.rows.map((row, ri) => (
                              <tr key={ri} className="border-t dark:border-slate-700">
                                <td className="px-2 py-1">
                                  <Badge size="sm" className={cn('text-[10px]', row._ACTION === 'INSERT' ? 'bg-green-100 text-green-600' : row._ACTION === 'UPDATE' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600')}>{String(row._ACTION || 'INSERT')}</Badge>
                                </td>
                                {dataCols.map(col => <td key={col} className="px-2 py-1 font-mono whitespace-nowrap">{row[col] == null ? <span className="text-slate-400 italic">NULL</span> : String(row[col])}</td>)}
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                      {!hasRealData && ing.sql_preview && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-600 flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" /> Tables not yet deployed — SQL preview shows the planned query
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fullResult && ddl && ddl.failed > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleDryRun} disabled={isRunning} className="gap-1.5">
            <Beaker className="h-4 w-4" /> Retry Full Dry Run
          </Button>
        </div>
      )}
    </div>
  );
}
