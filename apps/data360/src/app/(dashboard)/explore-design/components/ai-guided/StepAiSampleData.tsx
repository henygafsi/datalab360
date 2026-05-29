'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Sparkles, AlertTriangle, Table2, Lock } from 'lucide-react';
import { tablePreview } from '@/app/services/api/exploreDesignApi';
import { buildSampleNarrativePrompt, type DetectedModel } from './ai-guided-strategy';
import FreeDiscoverySamplePanel, {
  type DiscoveryTable,
} from './FreeDiscoverySamplePanel';
import type { TableRef, TablePreview } from '@/app/services/api/types';

interface StepAiSampleDataProps {
  projectId: string;
  detectedModel: DetectedModel | null;
}

const tableKey = (t: TableRef) => `${t.database}.${t.schema}.${t.table}`;

/**
 * Deterministic narrative — stands in for the (not-yet-built) Cortex
 * "narrate sample" endpoint. Describes shape, grain and measures from the
 * AI categories already detected in step 2.
 */
function deterministicNarrative(
  table: DetectedModel['tables'][number],
): string {
  const pk = table.columns.find((c) => c.isPrimaryKey);
  const metrics = table.columns.filter((c) => c.category === 'METRIC');
  const dates = table.columns.filter((c) =>
    /DATE|TIMESTAMP|TIME/i.test(c.dataType),
  );
  const dims = table.columns.filter((c) => c.category === 'DIMENSION');
  const kind = metrics.length >= 2 ? 'fact' : dims.length > metrics.length ? 'dimension' : 'mixed';
  const parts: string[] = [];
  parts.push(
    `This looks like a ${kind} table${pk ? `, with ${pk.name} as the grain` : ''}.`,
  );
  if (metrics.length > 0) {
    parts.push(`Measures: ${metrics.map((m) => m.name).join(', ')}.`);
  }
  if (dates.length > 0) {
    parts.push(`Time columns: ${dates.map((d) => d.name).join(', ')}.`);
  }
  parts.push(`${table.rowCount.toLocaleString()} rows profiled.`);
  return parts.join(' ');
}

const StepAiSampleData: React.FC<StepAiSampleDataProps> = ({
  projectId,
  detectedModel,
}) => {
  const [previews, setPreviews] = useState<Record<string, TablePreview>>({});
  const [loading, setLoading] = useState(true);

  // Loads a small (10-row) preview purely to seed the "Prompt the AI would
  // receive" transparency panel. The user-facing sample is rendered by
  // FreeDiscoverySamplePanel, which does its own capped fetch.
  const loadPreviews = useCallback(async () => {
    if (!detectedModel) return;
    setLoading(true);
    const results = await Promise.allSettled(
      detectedModel.tables.map((t) =>
        tablePreview(projectId, t.ref.database, t.ref.schema, t.ref.table, {
          limit: 10,
        }),
      ),
    );
    const nextPreviews: Record<string, TablePreview> = {};
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        nextPreviews[tableKey(detectedModel.tables[i].ref)] = res.value;
      }
    });
    setPreviews(nextPreviews);
    setLoading(false);
  }, [projectId, detectedModel]);

  useEffect(() => {
    void loadPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Free-discovery wiring ──
  // A table that profiled a real, non-zero row count came from a connected
  // source → real sample path. All zero / heuristic-only → synthetic path.
  const sourceConnected = useMemo(
    () => (detectedModel?.tables ?? []).some((t) => t.rowCount > 0),
    [detectedModel],
  );
  const discoveryTables: DiscoveryTable[] = useMemo(
    () =>
      (detectedModel?.tables ?? []).map((t) => ({
        database: t.ref.database,
        schema: t.ref.schema,
        table: t.ref.table,
        expectedColumns: t.columns.map((c) => ({ name: c.name, type: c.dataType })),
      })),
    [detectedModel],
  );

  if (!detectedModel) {
    return (
      <div className="p-12 text-center text-sm text-slate-400">
        No detected model yet — complete the detection step first.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
          <Sparkles className="h-4 w-4 text-purple-500" />
          Sample data &amp; AI narrative
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          See what the data actually looks like, alongside what the AI thinks it is.
        </p>
      </div>

      {/*
        Free-discovery sample — real (connected source, capped at 1000 rows)
        or AI-synthetic (no source). Replaces ad-hoc sample rendering with the
        catalog-grounded panel that enforces the free-discovery cap.
      */}
      <FreeDiscoverySamplePanel
        projectId={projectId}
        tables={discoveryTables}
        sourceConnected={sourceConnected}
      />

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-sm text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
          Loading AI narrative…
        </div>
      )}

      {/* Backend gap — the live Cortex narrative endpoint */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
        <div className="flex items-center gap-2">
          <Lock className="h-3 w-3 text-violet-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
            Backend gap — UX target
          </p>
        </div>
        <dl className="mt-2 space-y-1 text-[11px]">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">
              POST /explore-design/&#123;projectId&#125;/ai/narrate-sample
            </dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">
              &#123; database, schema, table, columns[], sample_rows[] &#125;
            </dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Returns</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">
              &#123; narrative: string, anomalies: string[] &#125;
            </dd>
          </div>
        </dl>
        <p className="mt-2 rounded bg-violet-100 px-2 py-1 text-[10px] text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
          Until this lands, the narrative below is derived from the detected
          AI column categories + deterministic anomaly checks (no Cortex call).
        </p>
      </div>

      {/*
        AI narrative cards — the "what the AI thinks it is" reading. Sample
        rows themselves are now owned by FreeDiscoverySamplePanel above.
      */}
      {detectedModel.tables.map((table) => {
        const key = tableKey(table.ref);
        const narrative = deterministicNarrative(table);
        return (
          <div
            key={key}
            className="rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
              <Table2 className="h-3.5 w-3.5 text-slate-500" />
              {table.ref.table}
            </div>
            <div className="space-y-2 p-3">
              <div className="rounded-md bg-purple-50 p-2.5 dark:bg-purple-900/20">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                  <Sparkles className="h-3 w-3" />
                  AI reading
                </p>
                <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                  {narrative}
                </p>
              </div>
              {table.warnings.length > 0 && (
                <div className="space-y-1">
                  {table.warnings.map((w, i) => (
                    <p
                      key={i}
                      className={cn(
                        'flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700',
                        'dark:bg-amber-900/20 dark:text-amber-300',
                      )}
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* The prompt that WOULD be sent — kept for transparency / superadmin. */}
      <details className="rounded-lg border border-slate-200 text-[11px] dark:border-slate-700">
        <summary className="cursor-pointer px-3 py-2 font-medium text-slate-500">
          Prompt the AI would receive
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap border-t border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          {detectedModel.tables
            .map((t) =>
              buildSampleNarrativePrompt(
                t.ref,
                t.columns.map((c) => c.name),
                previews[tableKey(t.ref)]?.rows ?? [],
              ),
            )
            .join('\n\n────────\n\n')}
        </pre>
      </details>
    </div>
  );
};

export default StepAiSampleData;
