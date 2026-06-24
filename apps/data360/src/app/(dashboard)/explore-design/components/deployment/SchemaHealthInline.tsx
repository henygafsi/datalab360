'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  Activity, Loader2, ChevronDown, ChevronRight, AlertTriangle,
  Sparkles, Lightbulb, RefreshCw,
} from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import type { SchemaHealthResult } from '@/app/services/api/types';

/**
 * Inline, docked AI Schema Health panel for the deployment Review step.
 *
 * Power-user value: before applying DDL to a target schema, see the schema's
 * health (completeness / naming / type-efficiency) plus concrete fixes, without
 * leaving the deploy wizard or opening a popup. On-demand (NOT auto) because the
 * scan spends Cortex credits — the user opts in.
 *
 * Reuses the existing POST /explore-design/{project_id}/ai/schema-health hook
 * (services/explore-design/de-objects.getSchemaHealth). The scan reads
 * {database}.{schema} via INFORMATION_SCHEMA, so we pass the project's REAL
 * db/schema from the deploy context (a wrong default would 200 with a score
 * against the wrong tables = fake data).
 *
 * Honest states: idle prompt / loading spinner / empty "—" / inline error.
 */

function scoreTone(score: number | null): string {
  if (score == null) return 'text-slate-400 dark:text-slate-500';
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function barTone(score: number | null): string {
  if (score == null) return 'bg-slate-300 dark:bg-slate-600';
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

const roundOrNull = (v: number | null | undefined): number | null =>
  v == null || Number.isNaN(v) ? null : Math.round(v);

function SubScoreBar({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className={cn('font-semibold tabular-nums', scoreTone(score))}>
          {score == null ? '—' : `${score}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn('h-full rounded-full transition-all', barTone(score))}
          style={{ width: `${score == null ? 0 : Math.max(2, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

interface SchemaHealthInlineProps {
  projectId: string;
  database: string;
  schemas: string[];
}

export default function SchemaHealthInline({
  projectId,
  database,
  schemas,
}: SchemaHealthInlineProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SchemaHealthResult | null>(null);

  const usableSchemas = useMemo(
    () => (schemas && schemas.length > 0 ? schemas : ['PUBLIC']),
    [schemas],
  );
  const [schema, setSchema] = useState<string>(usableSchemas[0]);

  const overall = roundOrNull(result?.overall_score ?? null);
  const completeness = roundOrNull(result?.sub_scores?.completeness?.score);
  const naming = roundOrNull(result?.sub_scores?.naming?.score);
  const types = roundOrNull(result?.sub_scores?.type_efficiency?.score);

  const namingViolations = result?.sub_scores?.naming?.violations ?? [];
  const typeSuggestions = result?.sub_scores?.type_efficiency?.suggestions ?? [];
  const recommendations = result?.recommendations ?? [];

  const runCheck = useCallback(async () => {
    if (!projectId || !database || !schema) {
      setError('Project database / schema unavailable — cannot scan schema health.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = await import('@/app/services/explore-design/de-objects');
      const data = await api.getSchemaHealth(projectId, { database, schema });
      setResult(data);
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Schema health check unavailable';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, database, schema]);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        )}
        <Activity className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-medium">AI Schema Health</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          target {database}.{schema}
        </span>
        {overall != null && (
          <Badge
            size="sm"
            className={cn(
              'ml-auto text-[10px]',
              overall >= 80
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : overall >= 60
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            )}
          >
            {overall}/100
          </Badge>
        )}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Schema selector + run control */}
          <div className="flex flex-wrap items-center gap-2">
            {usableSchemas.length > 1 && (
              <div className="flex items-center gap-1">
                {usableSchemas.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (s === schema) return;
                      setSchema(s);
                      // Drop the prior schema's result so the header score never
                      // mislabels a different target.
                      setResult(null);
                      setError(null);
                    }}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-mono font-medium transition-colors',
                      s === schema
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <Button
              size="sm"
              onClick={runCheck}
              disabled={loading}
              className="gap-1.5 ml-auto bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : result ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {loading ? 'Scanning…' : result ? 'Re-scan' : 'Run health check'}
            </Button>
          </div>

          {/* Cortex-cost note (honest, no vendor name in copy) */}
          {!result && !loading && !error && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Scans {database}.{schema} for completeness, naming and type-efficiency
              issues before you deploy. Runs an AI analysis on demand.
            </p>
          )}

          {/* Error (inline, honest backend message) */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  Could not run schema health check
                </p>
              </div>
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 break-words">
                {error}
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Overall + sub-scores */}
              <div className="flex items-center gap-5">
                <div className="flex flex-col items-center justify-center">
                  <span className={cn('text-2xl font-bold tabular-nums leading-none', scoreTone(overall))}>
                    {overall == null ? '—' : overall}
                  </span>
                  <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    overall
                  </span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <SubScoreBar label="Completeness" score={completeness} />
                  <SubScoreBar label="Naming" score={naming} />
                  <SubScoreBar label="Types" score={types} />
                </div>
              </div>

              {/* Naming violations */}
              {namingViolations.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Naming issues ({namingViolations.length})
                  </div>
                  <div className="max-h-40 overflow-auto divide-y dark:divide-slate-700">
                    {namingViolations.map((v, i) => (
                      <div key={i} className="px-3 py-1.5 text-[11px] flex items-start gap-2">
                        <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                          {v.table}{v.column ? `.${v.column}` : ''}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">{v.issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Type-efficiency suggestions */}
              {typeSuggestions.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Type-efficiency suggestions ({typeSuggestions.length})
                  </div>
                  <div className="max-h-40 overflow-auto divide-y dark:divide-slate-700">
                    {typeSuggestions.map((s, i) => (
                      <div key={i} className="px-3 py-1.5 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-500 dark:text-slate-400">
                            {s.table}{s.column ? `.${s.column}` : ''}
                          </span>
                          <span className="text-red-500">{s.current}</span>
                          <ChevronRight className="h-3 w-3 text-slate-400" />
                          <span className="text-green-600 dark:text-green-400">{s.suggested}</span>
                        </div>
                        {s.reason && (
                          <p className="text-slate-500 dark:text-slate-400 pl-0.5">{s.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="space-y-1.5">
                  {recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Nothing flagged — honest "clean" state */}
              {namingViolations.length === 0 &&
                typeSuggestions.length === 0 &&
                recommendations.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    No naming or type-efficiency issues flagged on {database}.{schema}.
                  </p>
                )}

              {result.cortex_credits > 0 && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  AI analysis cost: {result.cortex_credits} credit
                  {result.cortex_credits === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
