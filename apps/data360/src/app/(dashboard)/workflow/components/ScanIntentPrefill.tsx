'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Node, Edge, MarkerType } from 'reactflow';
import {
  Sparkles, Database, Filter, Columns, Download, Loader2,
  ArrowRight, X, Wand2, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import {
  getObjectEnrichment,
  type ObjectEnrichmentRow,
} from '@/app/services/command-center';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';

/**
 * ScanIntentPrefill
 * ─────────────────
 * Rendered when the Account-Overview AI advisor deep-links into the Workflow
 * module via `?intent=create&from=scan`. Instead of dropping the user on an
 * empty canvas with empty select boxes, this card READS the scanned Snowflake
 * objects (`GET /command-center/object-enrichment`) + the matching cost/perf
 * recommendation (`GET /command-center/recommendations`) and pre-populates a
 * ready, named, fully-sourced AI-suggested workflow:
 *
 *   Ingest <TABLE>  →  Dedupe (quality)  →  Select columns (transform)  →  Write <TABLE>_CURATED
 *
 * The source block is filled with the real db/schema/table from the scan; the
 * transform block is seeded with real catalogue columns (best-effort) — nothing
 * is fabricated. One click ("Create this workflow") hands the built ReactFlow
 * nodes/edges to the parent, which persists + validates them.
 *
 * Fail-soft: if the scan endpoint is unavailable (403/edition/degraded) the card
 * collapses to a single honest line and the manual ProjectGatePanel below stands
 * untouched.
 *
 * Self-contained — uses `apiClient` + existing service getters only. Does NOT
 * edit the command-center service (owned elsewhere).
 */

// ── Public types ───────────────────────────────────────────────────────────
export interface ScanSuggestionMeta {
  /** Project name used verbatim by the parent's createWorkflow call. */
  name: string;
  description: string;
  /** db.schema.table of the chosen source — for the success toast / audit. */
  sourceFqn: string;
}

interface ScanIntentPrefillProps {
  /** One-click create. Receives ReactFlow nodes/edges in the dual-key shape the
   *  registered ETLNodeTypes + stepsToReactFlow reload path both expect. */
  onApply: (nodes: Node[], edges: Edge[], meta: ScanSuggestionMeta) => void | Promise<void>;
  /** "Build manually instead" — dismiss the card, keep the manual gate. */
  onDismiss: () => void;
  /** Parent is mid-create (createWorkflow in flight). */
  applying?: boolean;
}

// ── Internal model ─────────────────────────────────────────────────────────
interface SuggestedStep {
  type: string;                       // node type === action_type
  label: string;                      // step name (shown on the node + card)
  config: Record<string, unknown>;
  detail: string;                     // human-readable line shown in the card
  icon: React.ComponentType<{ className?: string }>;
}

interface LoosRecommendation {
  title: string;
  detail: string;
}

const num = (v: number | null | undefined): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const dash = (v: number | null | undefined): string =>
  typeof v === 'number' && isFinite(v) ? v.toLocaleString() : '—';
const usd = (v: number | null | undefined): string =>
  typeof v === 'number' && isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';

/** Rank scanned objects by usage (access_count), tie-broken by attributed compute. */
function pickTopObject(rows: ObjectEnrichmentRow[]): ObjectEnrichmentRow | null {
  const valid = rows.filter((r) => r.database_name && r.schema_name && r.table_name);
  if (valid.length === 0) return null;
  return [...valid].sort((a, b) => {
    const byAccess = num(b.access_count) - num(a.access_count);
    if (byAccess !== 0) return byAccess;
    return num(b.attributed_usd) - num(a.attributed_usd);
  })[0];
}

/** Best-effort match of a cost/perf recommendation to the chosen table. Defensive
 *  parser — the endpoint shape is not contracted, so we read loosely and bail to
 *  null on anything unexpected. */
function matchRecommendation(raw: unknown, table: string): LoosRecommendation | null {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.data)
      ? (raw as any).data
      : Array.isArray((raw as any)?.recommendations)
        ? (raw as any).recommendations
        : [];
  if (list.length === 0) return null;
  const t = table.toUpperCase();
  const textOf = (o: any) =>
    [o?.title, o?.name, o?.recommendation, o?.detail, o?.description, o?.object, o?.table, o?.target]
      .filter((x) => typeof x === 'string')
      .join(' ')
      .toUpperCase();
  const hit = list.find((o) => textOf(o).includes(t)) ?? list[0];
  if (!hit || typeof hit !== 'object') return null;
  const title =
    hit.title || hit.name || hit.recommendation || hit.category || 'Recommendation';
  const detail =
    hit.detail || hit.description || hit.impact || hit.estimated_savings || hit.savings || '';
  return { title: String(title), detail: detail ? String(detail) : '' };
}

const ETL_GREEN = '#10B981';

const ScanIntentPrefill: React.FC<ScanIntentPrefillProps> = ({ onApply, onDismiss, applying }) => {
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [topObject, setTopObject] = useState<ObjectEnrichmentRow | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<LoosRecommendation | null>(null);
  const [objectCount, setObjectCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 1) Scanned objects — the spine of the suggestion. Fail-soft.
      const enrichment = await getObjectEnrichment(90).catch(() => null);
      if (cancelled) return;
      if (!enrichment || enrichment.degraded || enrichment.data.length === 0) {
        setUnavailable(true);
        setLoading(false);
        return;
      }
      const top = pickTopObject(enrichment.data);
      if (!top) {
        setUnavailable(true);
        setLoading(false);
        return;
      }
      setObjectCount(enrichment.count || enrichment.data.length);
      setTopObject(top);

      // 2) Real catalogue columns for the chosen table (best-effort — seeds the
      //    transform step with genuine columns, never fabricated names).
      const cols = await getTableColumns(top.database_name, top.schema_name, top.table_name)
        .then((c) => c.map((x) => (x.name ?? x.COLUMN_NAME ?? '')).filter(Boolean) as string[])
        .catch(() => [] as string[]);
      if (cancelled) return;
      setColumns(cols);

      // 3) Matching cost/perf recommendation (optional context). Defensive.
      try {
        const { data } = await apiClient.get('/command-center/recommendations');
        if (!cancelled) setRecommendation(matchRecommendation(data, top.table_name));
      } catch {
        /* recommendations are best-effort context only */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the suggested step list from the chosen object + real columns.
  const steps = useMemo<SuggestedStep[]>(() => {
    if (!topObject) return [];
    const { database_name: db, schema_name: sc, table_name: tbl } = topObject;
    const projected = columns.slice(0, 8);
    const targetTable = `${tbl}_CURATED`;
    return [
      {
        type: 'source',
        label: `Ingest ${tbl}`,
        config: { database: db, schema: sc, table: tbl },
        detail: `${db}.${sc}.${tbl}`,
        icon: Database,
      },
      {
        type: 'distinct',
        label: 'Dedupe rows',
        config: {},
        detail: 'Quality — drop exact duplicate rows',
        icon: Filter,
      },
      {
        type: 'select',
        label: 'Select columns',
        config: projected.length > 0 ? { columns: projected } : {},
        detail:
          projected.length > 0
            ? `Transform — keep ${projected.length} column${projected.length === 1 ? '' : 's'} (${projected.slice(0, 3).join(', ')}${projected.length > 3 ? '…' : ''})`
            : 'Transform — choose the columns to keep',
        icon: Columns,
      },
      {
        type: 'destination',
        label: `Write ${targetTable}`,
        config: { database: db, schema: sc, table: targetTable, write_mode: 'overwrite' },
        detail: `${db}.${sc}.${targetTable} (overwrite)`,
        icon: Download,
      },
    ];
  }, [topObject, columns]);

  const suggestionName = topObject ? `Curate ${topObject.table_name}` : 'Curate scanned object';

  // Materialise ReactFlow nodes/edges in the dual-key convention the live node
  // components AND the reload path (stepsToReactFlow) both consume.
  const buildGraph = (): { nodes: Node[]; edges: Edge[] } => {
    const nodes: Node[] = steps.map((s, i) => ({
      id: `scan_${i}_${s.type}`,
      type: s.type,
      position: { x: i * 280, y: 120 },
      data: { ...s.config, label: s.label, name: s.label, aiGenerated: true, config: s.config },
    }));
    const edges: Edge[] = [];
    for (let i = 1; i < nodes.length; i++) {
      edges.push({
        id: `scan-e-${i}`,
        source: nodes[i - 1].id,
        target: nodes[i].id,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: ETL_GREEN },
        style: { strokeWidth: 2, stroke: ETL_GREEN },
      });
    }
    return { nodes, edges };
  };

  const handleCreate = () => {
    if (!topObject || applying) return;
    const { nodes, edges } = buildGraph();
    void onApply(nodes, edges, {
      name: suggestionName,
      description: `AI-suggested from scan: curate ${topObject.database_name}.${topObject.schema_name}.${topObject.table_name} (dedupe → select → write).`,
      sourceFqn: `${topObject.database_name}.${topObject.schema_name}.${topObject.table_name}`,
    });
  };

  // ── Unavailable (fail-soft) ────────────────────────────────────────────────
  if (unavailable) {
    return (
      <div className="mx-3 lg:mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The advisor scan couldn&apos;t be read on this account, so there&apos;s no
          AI-suggested workflow to prefill. Start from a source below.
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto rounded p-0.5 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 lg:mx-4 mt-3 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white shadow-sm dark:border-violet-900/50 dark:from-violet-950/30 dark:to-slate-900">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-violet-100 px-4 py-3 dark:border-violet-900/40">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              AI-suggested workflow
            </h3>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              From scan
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {loading
              ? 'Reading the scanned objects and drafting a ready pipeline…'
              : topObject
                ? <>Prefilled from your highest-usage scanned object{objectCount ? ` (of ${objectCount.toLocaleString()})` : ''} — review &amp; create in one click.</>
                : 'Drafting…'}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={applying}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
          aria-label="Dismiss AI suggestion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysing scanned objects…
          </div>
        ) : topObject ? (
          <>
            {/* Suggested name + source metrics */}
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                <Wand2 className="h-4 w-4 text-violet-500" />
                {suggestionName}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{dash(topObject.access_count)} accesses / 90d</span>
                <span>{usd(topObject.attributed_usd)} compute</span>
                <span>{dash(topObject.distinct_users)} users</span>
              </div>
            </div>

            {/* Step chain */}
            <ol className="space-y-1.5">
              {steps.map((s, i) => {
                const StepIcon = s.icon;
                return (
                  <li key={s.label} className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <StepIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                        {i + 1}. {s.label}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {s.detail}
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Recommendation context (best-effort) */}
            {recommendation && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-900/20">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  <Info className="h-3.5 w-3.5" />
                  Matched recommendation
                </div>
                <div className="mt-0.5 text-[11px] text-sky-800 dark:text-sky-200">
                  {recommendation.title}
                  {recommendation.detail ? ` — ${recommendation.detail}` : ''}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={applying}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {applying ? 'Creating…' : 'Create this workflow'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                disabled={applying}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Build manually instead
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
              You can edit every step after it&apos;s created — nothing runs until you review and execute.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ScanIntentPrefill;
