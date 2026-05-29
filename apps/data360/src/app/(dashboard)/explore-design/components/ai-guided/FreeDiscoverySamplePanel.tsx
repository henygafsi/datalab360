'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Table2,
  AlertTriangle,
  ShieldCheck,
  FlaskConical,
  Database,
} from 'lucide-react';
import { tablePreview, aiClassifyColumns } from '@/app/services/api/exploreDesignApi';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import { getApiErrorMessage } from '@/lib/api-client';
import { heuristicClassifyColumn } from './ai-guided-strategy';
import { FREE_DISCOVERY_ROW_CAP, clampToFreeDiscoveryCap } from './model-catalog-grounding';
import type {
  TablePreview,
  AiColumnClassification,
  AiColumnCategory,
} from '@/app/services/api/types';

/**
 * A table the panel must produce a sample for. `expectedColumns` is only
 * consulted on the not-connected (synthetic) path — when a real source is
 * connected the columns come from tablePreview.
 */
export interface DiscoveryTable {
  database: string;
  schema: string;
  table: string;
  /** Declared/expected schema — used to seed the LLM when no source exists. */
  expectedColumns?: Array<{ name: string; type?: string }>;
}

interface FreeDiscoverySamplePanelProps {
  projectId: string;
  tables: DiscoveryTable[];
  /**
   * Whether the selected tables came from a CONNECTED source.
   *
   * Derivation contract (see AiGuidedModelWizard wiring): a table is treated
   * as connected when its detection profile reported a real, non-zero
   * row count. `sourceConnected === true` → real free-discovery sample via
   * tablePreview. `false` → LLM-fabricated synthetic sample.
   */
  sourceConnected: boolean;
}

const tableFqn = (t: DiscoveryTable) => `${t.database}.${t.schema}.${t.table}`;

// Maximum rows we ask the LLM to fabricate in one call. The Cortex 15s
// budget cannot emit 1000 rows of JSON — we request a realistic batch and
// render whatever fits, always clamped to FREE_DISCOVERY_ROW_CAP.
const SYNTHETIC_BATCH_ROWS = 40;

// ───────────────────────────────────────────────────────────────────────
// Per-table sample state
// ───────────────────────────────────────────────────────────────────────

interface ColumnInfo {
  name: string;
  type: string;
  /** Detected semantic category, or null when unknown. */
  category: AiColumnCategory | null;
  /** 'ai' = Cortex classify, 'heuristic' = name-based fallback. */
  detectionSource: 'ai' | 'heuristic';
}

interface SampleResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  /** Rows before the client-side clamp — surfaced when the cap bites. */
  rawRowCount: number;
  capped: boolean;
  error: string | null;
}

// ───────────────────────────────────────────────────────────────────────
// Synthetic-JSON parsing — Cortex mistral-7b emits malformed JSON under the
// 15s budget. Strip fences, isolate the array, repair a truncated tail.
// ───────────────────────────────────────────────────────────────────────

function parseSyntheticRows(raw: string): Record<string, unknown>[] {
  if (!raw || !raw.trim()) return [];
  // Strip ```json fences.
  let text = raw.replace(/```(?:json)?/gi, '').trim();
  // Isolate the outermost array.
  const start = text.indexOf('[');
  if (start === -1) return [];
  text = text.slice(start);
  const end = text.lastIndexOf(']');
  let candidate = end > start ? text.slice(0, end + 1) : text;

  const tryParse = (s: string): Record<string, unknown>[] | null => {
    try {
      const parsed: unknown = JSON.parse(s);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter(
        (r): r is Record<string, unknown> =>
          typeof r === 'object' && r !== null && !Array.isArray(r),
      );
    } catch {
      return null;
    }
  };

  let rows = tryParse(candidate);
  if (rows) return rows;

  // Truncated tail — keep only complete objects: cut after the last "}".
  const lastObj = candidate.lastIndexOf('}');
  if (lastObj > start) {
    candidate = `${candidate.slice(0, lastObj + 1)}]`;
    rows = tryParse(candidate);
    if (rows) return rows;
  }
  return [];
}

function buildSyntheticPrompt(table: DiscoveryTable): string {
  const cols = (table.expectedColumns ?? []).length
    ? (table.expectedColumns ?? [])
        .map((c) => `${c.name}${c.type ? ` (${c.type})` : ''}`)
        .join(', ')
    : 'infer a reasonable set of 4-6 columns from the table name';
  return [
    `Generate ${SYNTHETIC_BATCH_ROWS} rows of realistic SYNTHETIC sample data`,
    `for a table named "${table.table}".`,
    `Columns: ${cols}.`,
    'Return ONLY a JSON array of objects, one object per row, keyed by column name.',
    'No prose, no markdown fences. Values must be plausible for each column type.',
  ].join(' ');
}

// ───────────────────────────────────────────────────────────────────────
// Badges — text-first, never colour-only (a11y).
// ───────────────────────────────────────────────────────────────────────

const RealBadge: React.FC = () => (
  <span
    role="status"
    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
  >
    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
    Free discovery · real sample · max {FREE_DISCOVERY_ROW_CAP} rows
  </span>
);

const SyntheticBadge: React.FC = () => (
  <span
    role="status"
    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
  >
    <FlaskConical className="h-3 w-3" aria-hidden="true" />
    Synthetic sample · AI-generated · not real data
  </span>
);

// ───────────────────────────────────────────────────────────────────────
// Row-count meter — aria-live so screen readers hear the cap state.
// ───────────────────────────────────────────────────────────────────────

const RowMeter: React.FC<{ shown: number; capped: boolean }> = ({
  shown,
  capped,
}) => {
  const pct = Math.min(100, (shown / FREE_DISCOVERY_ROW_CAP) * 100);
  return (
    <div className="space-y-1">
      <p
        aria-live="polite"
        className="text-[10px] font-medium text-slate-500 dark:text-slate-400"
      >
        {shown.toLocaleString()} / {FREE_DISCOVERY_ROW_CAP.toLocaleString()} rows
        {capped ? ' — cap reached' : ''}
      </p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn(
            'h-full rounded-full',
            capped ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {capped && (
        <p className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          Free-discovery limit reached — full-volume access requires a paid plan.
        </p>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────
// Sample table render
// ───────────────────────────────────────────────────────────────────────

const SampleTable: React.FC<{ result: SampleResult }> = ({ result }) => {
  const cols = result.columns.slice(0, 6);
  if (cols.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">No columns detected.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-slate-400">
            {cols.map((c) => (
              <th key={c.name} className="px-1.5 py-1 text-left font-medium">
                <span className="block text-slate-600 dark:text-slate-300">
                  {c.name}
                </span>
                <span className="block font-normal text-slate-400">
                  {c.type}
                  {c.category ? ` · ${c.category}` : ''}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 12).map((row, i) => (
            <tr
              key={i}
              className="border-t border-slate-100 text-slate-600 dark:border-slate-800 dark:text-slate-300"
            >
              {cols.map((c) => (
                <td key={c.name} className="max-w-[120px] truncate px-1.5 py-1">
                  {String(row[c.name] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 12 && (
        <p className="mt-1 text-[10px] text-slate-400">
          Showing 12 of {result.rows.length.toLocaleString()} sampled rows.
        </p>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────
// Panel
// ───────────────────────────────────────────────────────────────────────

const FreeDiscoverySamplePanel: React.FC<FreeDiscoverySamplePanelProps> = ({
  projectId,
  tables,
  sourceConnected,
}) => {
  const [results, setResults] = useState<Record<string, SampleResult>>({});
  const [loading, setLoading] = useState(true);

  // Stable key so the effect re-runs only when the table set actually changes.
  const tablesKey = useMemo(
    () => tables.map(tableFqn).join('|'),
    [tables],
  );

  // ── Connected source → real sample via tablePreview (capped). ──
  const loadReal = useCallback(
    async (t: DiscoveryTable): Promise<SampleResult> => {
      try {
        const preview: TablePreview = await tablePreview(
          projectId,
          t.database,
          t.schema,
          t.table,
          { limit: FREE_DISCOVERY_ROW_CAP },
        );
        const rawRows = Array.isArray(preview.rows) ? preview.rows : [];
        // True client-side enforcement — clamp even if the endpoint over-returns.
        const rows = rawRows.slice(0, FREE_DISCOVERY_ROW_CAP);

        // Detected column types: AI classification with heuristic fallback.
        // Per-column detectionSource is what drives the UI badge.
        let classifications: AiColumnClassification[] = [];
        try {
          const res = await aiClassifyColumns(projectId, {
            database: t.database,
            schema: t.schema,
            table: t.table,
          });
          classifications = res.classifications;
        } catch {
          // Cortex unreachable — every column falls back to the heuristic.
        }
        const catByCol = new Map(
          classifications.map((c) => [c.column.toUpperCase(), c.category]),
        );

        const columns: ColumnInfo[] = preview.columns.map((name) => {
          const sample = rows.find((r) => r[name] != null)?.[name];
          const inferredType =
            typeof sample === 'number'
              ? 'NUMBER'
              : typeof sample === 'boolean'
                ? 'BOOLEAN'
                : 'VARCHAR';
          const aiCat = catByCol.get(name.toUpperCase()) ?? null;
          if (aiCat) {
            return { name, type: inferredType, category: aiCat, detectionSource: 'ai' };
          }
          const h = heuristicClassifyColumn(name, inferredType);
          return {
            name,
            type: inferredType,
            category: h.category,
            detectionSource: 'heuristic' as const,
          };
        });

        return {
          columns,
          rows,
          rawRowCount: rawRows.length,
          capped: rawRows.length > FREE_DISCOVERY_ROW_CAP,
          error: null,
        };
      } catch (err) {
        return {
          columns: [],
          rows: [],
          rawRowCount: 0,
          capped: false,
          error: getApiErrorMessage(err) || 'Sample unavailable for this table.',
        };
      }
    },
    [projectId],
  );

  // ── No source → LLM-fabricated synthetic sample (capped). ──
  const loadSynthetic = useCallback(
    async (t: DiscoveryTable): Promise<SampleResult> => {
      try {
        const completion = await generateCompletion({
          prompt: buildSyntheticPrompt(t),
          model: 'mistral-7b',
        });
        const parsed = parseSyntheticRows(completion?.response ?? '');
        // True client-side enforcement — clamp even though the LLM cannot
        // realistically exceed the cap.
        const rows = parsed.slice(0, FREE_DISCOVERY_ROW_CAP);

        const declared = t.expectedColumns ?? [];
        const colNames =
          declared.length > 0
            ? declared.map((c) => c.name)
            : Object.keys(rows[0] ?? {});
        const columns: ColumnInfo[] = colNames.map((name) => {
          const declaredType = declared.find((c) => c.name === name)?.type;
          const sample = rows.find((r) => r[name] != null)?.[name];
          const type =
            declaredType ??
            (typeof sample === 'number'
              ? 'NUMBER'
              : typeof sample === 'boolean'
                ? 'BOOLEAN'
                : 'VARCHAR');
          const h = heuristicClassifyColumn(name, type);
          return { name, type, category: h.category, detectionSource: 'heuristic' as const };
        });

        if (rows.length === 0) {
          return {
            columns,
            rows,
            rawRowCount: 0,
            capped: false,
            error: 'The AI returned no usable synthetic rows — try regenerating.',
          };
        }
        return {
          columns,
          rows,
          rawRowCount: parsed.length,
          capped: parsed.length > FREE_DISCOVERY_ROW_CAP,
          error: null,
        };
      } catch (err) {
        return {
          columns: [],
          rows: [],
          rawRowCount: 0,
          capped: false,
          error:
            getApiErrorMessage(err) ||
            'Synthetic sample generation failed — the AI service is unreachable.',
        };
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResults({});
    (async () => {
      const settled = await Promise.allSettled(
        tables.map((t) => (sourceConnected ? loadReal(t) : loadSynthetic(t))),
      );
      if (cancelled) return;
      const next: Record<string, SampleResult> = {};
      settled.forEach((res, i) => {
        const key = tableFqn(tables[i]);
        next[key] =
          res.status === 'fulfilled'
            ? res.value
            : {
                columns: [],
                rows: [],
                rawRowCount: 0,
                capped: false,
                error: 'Sample could not be produced.',
              };
      });
      setResults(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // tablesKey captures the table set; sourceConnected flips the path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, sourceConnected, loadReal, loadSynthetic]);

  if (tables.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-slate-400">
        No tables selected — pick source tables first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode banner */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
          sourceConnected
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
            : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20',
        )}
      >
        <div className="flex items-center gap-2">
          {sourceConnected ? (
            <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          )}
          <p
            className={cn(
              'text-xs font-medium',
              sourceConnected
                ? 'text-emerald-800 dark:text-emerald-200'
                : 'text-amber-800 dark:text-amber-200',
            )}
          >
            {sourceConnected
              ? `Connected source — showing a real sample (free discovery, capped at ${FREE_DISCOVERY_ROW_CAP} rows).`
              : 'No source connected — the AI is fabricating a synthetic sample to explore the model shape.'}
          </p>
        </div>
        {sourceConnected ? <RealBadge /> : <SyntheticBadge />}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-purple-500" aria-hidden="true" />
          {sourceConnected
            ? 'Pulling real sample rows…'
            : 'Generating synthetic sample data…'}
        </div>
      )}

      {!loading &&
        tables.map((t) => {
          const key = tableFqn(t);
          const result = results[key];
          if (!result) return null;
          return (
            <div
              key={key}
              className="rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Table2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  {t.table}
                </span>
                {sourceConnected ? <RealBadge /> : <SyntheticBadge />}
              </div>
              <div className="space-y-3 p-3">
                {result.error ? (
                  <p className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {result.error}
                  </p>
                ) : (
                  <SampleTable result={result} />
                )}
                <RowMeter
                  shown={clampToFreeDiscoveryCap(result.rows.length)}
                  capped={result.capped}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
};

export default FreeDiscoverySamplePanel;
