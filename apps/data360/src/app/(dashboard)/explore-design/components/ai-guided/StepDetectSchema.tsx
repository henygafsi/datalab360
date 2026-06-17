'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import {
  Loader2, Key, ShieldAlert, Sparkles, Link2, AlertTriangle, Table2,
  Check, X, WifiOff, Coins, DatabaseZap,
} from 'lucide-react';
import {
  orchestrateDetection,
  type DetectedModel,
  type DetectedColumn,
  type DetectedTable,
} from './ai-guided-strategy';
import { useAiCostEstimate } from '@/hooks/useAiCostEstimate';
import type { TableRef } from '@/app/services/api/types';
import { safeLocale } from '@/lib/format-number';

interface StepDetectSchemaProps {
  projectId: string;
  selectedTables: TableRef[];
  detectedModel: DetectedModel | null;
  onModelChange: (model: DetectedModel) => void;
}

// AI semantic-category chip styling.
const CATEGORY_STYLE: Record<string, string> = {
  PII: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  METRIC: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  DIMENSION: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  KEY: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  AUDIT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  TECHNICAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  UNKNOWN: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const tableKey = (t: TableRef) => `${t.database}.${t.schema}.${t.table}`;

/** A grey placeholder card shown for a table whose detection is still running. */
const SkeletonCard: React.FC<{ table: TableRef }> = ({ table }) => (
  <div className="rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-500" />
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        {table.table}
      </span>
      <span className="text-[11px] text-slate-400">detecting…</span>
    </div>
    <div className="space-y-2 p-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
          style={{ width: `${85 - i * 15}%` }}
        />
      ))}
    </div>
  </div>
);

const StepDetectSchema: React.FC<StepDetectSchemaProps> = ({
  projectId,
  selectedTables,
  detectedModel,
  onModelChange,
}) => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tables resolved so far during a live detection run (skeleton-fill). */
  const [resolvedTables, setResolvedTables] = useState<DetectedTable[]>([]);
  /** True when the most recent run satisfied at least one call from cache. */
  const [fromCache, setFromCache] = useState(false);
  /** Guards against the initial-mount effect firing twice in StrictMode. */
  const startedRef = useRef(false);

  // ── Cost estimate — N classify calls, one per table ──
  const avgColumns = useMemo(() => {
    if (detectedModel && detectedModel.tables.length > 0) {
      const total = detectedModel.tables.reduce((s, t) => s + t.columns.length, 0);
      return Math.round(total / detectedModel.tables.length);
    }
    return 12; // pre-detection guess
  }, [detectedModel]);
  const perCallCost = useAiCostEstimate('ai_classify_columns', { columns: avgColumns });
  const callCount = selectedTables.length + (selectedTables.length > 1 ? 1 : 0);
  const totalCredits = Math.round(perCallCost.credits * callCount * 10) / 10;

  // ── Run detection ──
  const runDetection = useCallback(
    async (bustCache: boolean) => {
      setRunning(true);
      setError(null);
      setFromCache(false);
      setResolvedTables([]);
      try {
        const model = await orchestrateDetection(projectId, selectedTables, {
          bustCache,
          onTableResolved: (table) => {
            setResolvedTables((prev) => [...prev, table]);
          },
        });
        onModelChange(model);
        if (model.usedHeuristic) {
          toast(
            'AI offline — using heuristic detection. Review the proposals carefully.',
            { icon: '⚠️' },
          );
        }
        // `model.fromCache` is set by orchestrateDetection when at least one
        // AI call was served from the client cache instead of hitting Cortex.
        setFromCache(model.fromCache);
      } catch {
        setError('Detection failed. Check the source connection and retry.');
      } finally {
        setRunning(false);
      }
    },
    [projectId, selectedTables, onModelChange],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!detectedModel && selectedTables.length > 0) {
      void runDetection(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Editable proposal mutators ──
  const updateColumn = useCallback(
    (tableIdx: number, colIdx: number, patch: Partial<DetectedColumn>) => {
      if (!detectedModel) return;
      const tables = detectedModel.tables.map((t, ti) =>
        ti !== tableIdx
          ? t
          : {
              ...t,
              columns: t.columns.map((c, ci) =>
                ci !== colIdx ? c : { ...c, ...patch },
              ),
            },
      );
      onModelChange({ ...detectedModel, tables });
    },
    [detectedModel, onModelChange],
  );

  const updateRelationship = useCallback(
    (relIdx: number, accepted: boolean) => {
      if (!detectedModel) return;
      const relationships = detectedModel.relationships.map((r, ri) =>
        ri !== relIdx ? r : { ...r, accepted },
      );
      onModelChange({ ...detectedModel, relationships });
    },
    [detectedModel, onModelChange],
  );

  // ── Header: cost + cache chips, shared by every render branch ──
  const headerChips = (
    <div className="flex flex-wrap items-center gap-1.5">
      {fromCache && (
        <span
          title="These detections were served instantly from a recent cache. Retry to re-run against Cortex."
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        >
          <DatabaseZap className="h-2.5 w-2.5" />
          (cached)
        </span>
      )}
      <span
        title={`This step fires ~${callCount} AI call${callCount > 1 ? 's' : ''} (one classification per table${selectedTables.length > 1 ? ' + one relationship scan' : ''}). Credit figure is an estimate.`}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      >
        <Coins className="h-2.5 w-2.5" />
        ≈ {callCount} AI call{callCount > 1 ? 's' : ''}
        {totalCredits > 0 && <span className="opacity-70">· ~{totalCredits} cr</span>}
      </span>
    </div>
  );

  // ── Streaming skeleton state ──
  if (running) {
    const done = resolvedTables.length;
    const total = selectedTables.length;
    return (
      <div className="space-y-4 p-6">
        {/* a11y live-region — announces each table as it resolves */}
        <div role="status" aria-live="polite" className="sr-only">
          Detected {done} of {total} tables.
        </div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4 animate-pulse text-purple-500" />
              Detecting schema &amp; types
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Profiling tables and classifying columns —{' '}
              <span className="font-medium text-purple-600 dark:text-purple-400">
                {done} of {total}
              </span>{' '}
              done.
            </p>
          </div>
          {headerChips}
        </div>
        {selectedTables.map((ref, i) => {
          const resolved = resolvedTables[i];
          return resolved ? (
            <TableCard
              key={tableKey(ref)}
              table={resolved}
              tableIdx={i}
              readOnly
              onColumn={updateColumn}
            />
          ) : (
            <SkeletonCard key={tableKey(ref)} table={ref} />
          );
        })}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-sm">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="text-slate-600 dark:text-slate-300">{error}</p>
        <button
          onClick={() => void runDetection(true)}
          className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
        >
          Retry detection
        </button>
      </div>
    );
  }

  if (!detectedModel) {
    return (
      <div className="p-12 text-center text-sm text-slate-400">
        No tables to detect. Go back and pick a source.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Detected schema &amp; types
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Each row is a proposal — flip a primary key, drop a column, or
            reject a foreign key. Accepted detections become your model.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {headerChips}
          <button
            onClick={() => void runDetection(true)}
            className="text-[11px] font-medium text-purple-600 hover:underline dark:text-purple-400"
          >
            Re-run detection
          </button>
        </div>
      </div>

      {detectedModel.usedHeuristic && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            AI classification was offline — some proposals below are{' '}
            <span className="font-semibold">heuristic name-based guesses</span>{' '}
            (tagged <span className="font-mono">heuristic</span>). Review them
            carefully before approving.
          </span>
        </div>
      )}

      {/* Per-table column cards */}
      {detectedModel.tables.map((table, tableIdx) => (
        <TableCard
          key={tableKey(table.ref)}
          table={table}
          tableIdx={tableIdx}
          onColumn={updateColumn}
        />
      ))}

      {/* Detected relationships */}
      {detectedModel.relationships.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
            <Link2 className="h-3.5 w-3.5 text-slate-500" />
            Detected relationships
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {detectedModel.relationships.map((rel, relIdx) => (
              <div
                key={rel.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-xs',
                  !rel.accepted && 'opacity-40',
                )}
              >
                <button
                  onClick={() => updateRelationship(relIdx, !rel.accepted)}
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded',
                    rel.accepted
                      ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40'
                      : 'bg-slate-200 text-slate-400 dark:bg-slate-700',
                  )}
                >
                  {rel.accepted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </button>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {rel.sourceTable}.{rel.sourceColumn} → {rel.targetTable}.
                  {rel.targetColumn}
                </span>
                {rel.source === 'heuristic' && (
                  <span
                    title="Inferred from a name match (e.g. order_id → orders.id), not an AI confidence score."
                    className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  >
                    heuristic
                  </span>
                )}
                {/* confidence bar */}
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full bg-purple-500"
                      style={{ width: `${Math.round(rel.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[10px] text-slate-400">
                    {Math.round(rel.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Per-table card — extracted so it renders identically in skeleton-fill mode
// (readOnly) and in the final editable view.
// ────────────────────────────────────────────────────────────────────────────

interface TableCardProps {
  table: DetectedTable;
  tableIdx: number;
  readOnly?: boolean;
  onColumn: (tableIdx: number, colIdx: number, patch: Partial<DetectedColumn>) => void;
}

const TableCard: React.FC<TableCardProps> = ({
  table,
  tableIdx,
  readOnly = false,
  onColumn,
}) => (
  <div className="rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      <Table2 className="h-3.5 w-3.5 text-slate-500" />
      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
        {table.ref.table}
      </span>
      <span className="text-[11px] text-slate-400">
        {safeLocale(table.rowCount)} rows · {table.columns.length} cols
      </span>
      {table.usedHeuristic && (
        <span
          title="Cortex was unreachable — these columns were classified by name heuristics."
          className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        >
          <WifiOff className="h-2.5 w-2.5" />
          heuristic
        </span>
      )}
    </div>

    {table.warnings.length > 0 && (
      <div className="space-y-1 border-b border-amber-100 bg-amber-50 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-900/20">
        {table.warnings.map((w, i) => (
          <p
            key={i}
            className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {w}
          </p>
        ))}
      </div>
    )}

    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {table.columns.map((col, colIdx) => (
        <div
          key={col.name}
          className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-2 text-xs',
            !col.accepted && 'opacity-40',
          )}
        >
          {/* accept / reject toggle */}
          <button
            onClick={() => onColumn(tableIdx, colIdx, { accepted: !col.accepted })}
            disabled={readOnly}
            title={col.accepted ? 'Exclude column' : 'Include column'}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded disabled:opacity-60',
              col.accepted
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40'
                : 'bg-slate-200 text-slate-400 dark:bg-slate-700',
            )}
          >
            {col.accepted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          </button>

          <span className="min-w-[120px] font-medium text-slate-800 dark:text-slate-200">
            {col.name}
          </span>

          {/* editable type */}
          <input
            value={col.dataType}
            readOnly={readOnly}
            onChange={(e) => onColumn(tableIdx, colIdx, { dataType: e.target.value })}
            className="w-28 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] read-only:opacity-60 dark:border-slate-700 dark:bg-slate-900"
          />

          {/* semantic chip */}
          {col.category && (
            <span
              title={
                col.source === 'heuristic'
                  ? 'Heuristic name-based guess — not an AI classification.'
                  : `AI classified · ${Math.round(col.confidence * 100)}% confidence`
              }
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                CATEGORY_STYLE[col.category] ?? CATEGORY_STYLE.UNKNOWN,
              )}
            >
              {col.category}
              {col.source === 'heuristic' ? (
                <span className="opacity-60">~</span>
              ) : (
                col.confidence > 0 && (
                  <span className="opacity-60">{Math.round(col.confidence * 100)}%</span>
                )
              )}
            </span>
          )}

          {/* PK toggle chip */}
          <button
            onClick={() => onColumn(tableIdx, colIdx, { isPrimaryKey: !col.isPrimaryKey })}
            disabled={readOnly}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-60',
              col.isPrimaryKey
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800',
            )}
          >
            <Key className="h-2.5 w-2.5" />
            {col.isPrimaryKey ? 'PRIMARY KEY' : 'Set PK'}
          </button>

          {/* PII warning */}
          {col.isPii && (
            <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              <ShieldAlert className="h-2.5 w-2.5" />
              PII
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
);

export default StepDetectSchema;
