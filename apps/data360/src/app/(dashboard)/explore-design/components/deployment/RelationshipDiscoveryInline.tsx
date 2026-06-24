'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  Network, Loader2, ChevronDown, ChevronRight, AlertTriangle,
  Sparkles, RefreshCw, Copy, Check,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import type { DiscoverRelationshipsResult, AiRelationship } from '@/app/services/api/types';

/**
 * Inline, docked AI Relationship Discovery panel for the deployment Review step.
 *
 * Power-user value: before applying DDL, see the foreign-key relationships the
 * AI infers between the tables in the target schema (column-name + value-overlap
 * heuristics) so you can catch a join key you forgot to model. Each suggestion
 * carries a confidence and a ready-to-paste `ALTER TABLE ... ADD CONSTRAINT ...
 * FOREIGN KEY` statement that you can copy into the per-event SQL editor above.
 *
 * Reuses the existing POST /explore-design/{project_id}/ai/discover-relationships
 * hook (services/explore-design/de-objects.discoverRelationships). On-demand (NOT
 * auto) because the scan spends AI credits — the user opts in. The scan reads the
 * project's REAL {database}.{schema}, so we pass it from the deploy context.
 *
 * Docked panel, NOT a popup. Honest states: idle prompt / loading / empty "—" /
 * inline backend error.
 */

function confidenceTone(c: number): string {
  if (c >= 0.8) return 'text-green-600 dark:text-green-400';
  if (c >= 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-500 dark:text-slate-400';
}

function confidenceBar(c: number): string {
  if (c >= 0.8) return 'bg-green-500';
  if (c >= 0.5) return 'bg-amber-500';
  return 'bg-slate-400';
}

/** Confidence may arrive as 0..1 (ratio) or 0..100 (percent) — normalise to %. */
function toPercent(c: number | null | undefined): number | null {
  if (c == null || Number.isNaN(c)) return null;
  const pct = c <= 1 ? c * 100 : c;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

interface RelationshipDiscoveryInlineProps {
  projectId: string;
  database: string;
  schemas: string[];
  /** Table names already on the plan — used to scope the scan when present. */
  scopedTables?: string[];
}

export default function RelationshipDiscoveryInline({
  projectId,
  database,
  schemas,
  scopedTables,
}: RelationshipDiscoveryInlineProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoverRelationshipsResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const usableSchemas = useMemo(
    () => (schemas && schemas.length > 0 ? schemas : ['PUBLIC']),
    [schemas],
  );
  const [schema, setSchema] = useState<string>(usableSchemas[0]);

  const relationships: AiRelationship[] = result?.relationships ?? [];

  const runDiscovery = useCallback(async () => {
    if (!projectId || !database || !schema) {
      setError('Project database / schema unavailable — cannot discover relationships.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = await import('@/app/services/explore-design/de-objects');
      const data = await api.discoverRelationships(projectId, {
        database,
        schema,
        // Scope to the tables on the plan when we have them; otherwise the
        // backend scans every table in the schema.
        tables: scopedTables && scopedTables.length > 0 ? scopedTables : undefined,
      });
      setResult(data);
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Relationship discovery unavailable';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, database, schema, scopedTables]);

  const handleCopy = useCallback(async (rel: AiRelationship, idx: number) => {
    const sql =
      rel.suggested_fk ||
      `ALTER TABLE ${database}.${schema}.${rel.source_table} ADD CONSTRAINT FK_${rel.source_table}_${rel.source_column} FOREIGN KEY (${rel.source_column}) REFERENCES ${database}.${schema}.${rel.target_table}(${rel.target_column});`;
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedIdx(idx);
      window.setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
      toast.success('FK statement copied — paste it into the SQL editor above');
    } catch {
      toast.error('Failed to copy SQL');
    }
  }, [database, schema]);

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
        <Network className="h-4 w-4 text-violet-500 shrink-0" />
        <span className="text-sm font-medium">AI Relationship Discovery</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          target {database}.{schema}
        </span>
        {result && (
          <Badge
            size="sm"
            className={cn(
              'ml-auto text-[10px]',
              relationships.length > 0
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            {relationships.length} found
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
                      setResult(null);
                      setError(null);
                    }}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11px] font-mono font-medium transition-colors',
                      s === schema
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
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
              onClick={runDiscovery}
              disabled={loading}
              className="gap-1.5 ml-auto bg-violet-600 hover:bg-violet-700 text-white"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : result ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {loading ? 'Scanning…' : result ? 'Re-scan' : 'Discover relationships'}
            </Button>
          </div>

          {/* Idle hint */}
          {!result && !loading && !error && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Infers foreign-key relationships between the tables in {database}.{schema}
              {scopedTables && scopedTables.length > 0
                ? ` (scoped to the ${scopedTables.length} table${scopedTables.length === 1 ? '' : 's'} on this plan)`
                : ''}
              . Each suggestion includes a ready-to-paste FK statement. Runs an AI analysis on demand.
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  Could not discover relationships
                </p>
              </div>
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 break-words">
                {error}
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                <span>{result.tables_analyzed ?? '—'} table(s) analysed</span>
                {result.cortex_credits > 0 && (
                  <span>
                    · AI cost: {result.cortex_credits} credit
                    {result.cortex_credits === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {relationships.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No new foreign-key relationships inferred on {database}.{schema}.
                </p>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y dark:divide-slate-700 overflow-hidden">
                  {relationships.map((rel, idx) => {
                    const pct = toPercent(rel.confidence);
                    return (
                      <div key={idx} className="px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-[12px] font-mono">
                          <span className="text-slate-700 dark:text-slate-200">
                            {rel.source_table}.{rel.source_column}
                          </span>
                          <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="text-slate-700 dark:text-slate-200">
                            {rel.target_table}.{rel.target_column}
                          </span>
                          {pct != null && (
                            <span className={cn('ml-auto text-[11px] font-semibold tabular-nums', confidenceTone(rel.confidence))}>
                              {pct}%
                            </span>
                          )}
                        </div>

                        {pct != null && (
                          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={cn('h-full rounded-full transition-all', confidenceBar(rel.confidence))}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {rel.discovery_method && (
                            <Badge size="sm" className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[10px]">
                              {rel.discovery_method}
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-[11px] ml-auto"
                            onClick={() => handleCopy(rel, idx)}
                          >
                            {copiedIdx === idx ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedIdx === idx ? 'Copied' : 'Copy FK SQL'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
