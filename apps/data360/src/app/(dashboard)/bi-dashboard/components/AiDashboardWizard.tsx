'use client';

/**
 * AI Dashboard Wizard — "describe a dashboard, get a dashboard".
 *
 * Three steps:
 *   1. Describe — free-text prompt + example chips.
 *   2. AI proposes — calls nlToChart() per implied chart, grounded with
 *      buildReportingPromptSection(). When nlToChart is unreachable it falls
 *      back to pickChartType() heuristics over a picked table's columns.
 *   3. Review & create — keep/drop widgets, then createDashboard +
 *      createWidget per accepted widget, and hand off to the editor.
 *
 * Every proposed chart is validated against reporting-catalog.json via
 * validateChartConfig() — the AI can only ever surface real chart types.
 */

import { useState, useMemo, useCallback } from 'react';
import { Modal, Button } from 'rizzui';
import {
  Sparkles, X, Loader2, Wand2, Check, Trash2,
  BarChart3, Lock, Beaker, ArrowRight, ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  nlToChart,
  createDashboard,
  createWidget,
} from '@/app/services/api/biDashboardApi';
import type { DashboardChartType, WidgetType } from '@/app/services/api/types';
import { useDataSourcePicker } from '../hooks/useDataSourcePicker';
import DynamicChart from './DynamicChart';
import {
  buildReportingPromptSection,
  pickChartType,
  validateChartConfig,
  normalizeChartId,
  looksLikeTimeColumn,
  CHART_BY_ID,
} from './reporting-catalog-grounding';

// ── Types ──────────────────────────────────────────────────────────

type Step = 'describe' | 'propose' | 'review';

interface ProposedWidget {
  /** Stable local key for the React list. */
  key: string;
  chartType: DashboardChartType;
  title: string;
  measures: string[];
  dimension: string | null;
  aggregator: string;
  /** Where the proposal came from — drives the source badge. */
  origin: 'ai' | 'heuristic';
  /** Short reason for the chart-type choice. */
  reason: string;
  /** Catalog validation result. */
  valid: boolean;
  /** Kept (true) or dropped (false) in step 3. */
  keep: boolean;
}

interface AiDashboardWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Hand the freshly created dashboard off to the editor. */
  onCreated: (projectId: string, name: string) => void;
}

const EXAMPLE_PROMPTS = [
  'Revenue by region for the last quarter, plus the month-over-month trend',
  'Customer segments breakdown and average spend per loyalty tier',
  'Marketing funnel from lead to closed deal with the channel mix',
  'Compare ad spend against conversions to find efficient campaigns',
];

// ── Mini preview config, per chart type ────────────────────────────
// A tiny synthetic dataset + config so each proposal card can render a real
// mini chart with DynamicChart without a backend round-trip.
function buildPreviewConfig(chartType: string): Record<string, unknown> {
  if (chartType === 'scatter' || chartType === 'bubble') {
    return {
      chartType,
      x: 'x',
      measures: [{ column: 'y' }, { column: 'z' }],
      prefetched: {
        data: [
          { x: 12, y: 30, z: 8 }, { x: 24, y: 18, z: 14 },
          { x: 35, y: 52, z: 6 }, { x: 48, y: 40, z: 20 },
        ],
      },
    };
  }
  if (chartType === 'gauge' || chartType === 'radial_bar') {
    return {
      chartType,
      x: 'category',
      measures: [{ column: 'value' }],
      prefetched: { data: [{ category: 'Value', value: 68 }] },
    };
  }
  return {
    chartType,
    x: 'category',
    measures: [{ column: 'value' }],
    prefetched: {
      data: [
        { category: 'A', value: 32 }, { category: 'B', value: 54 },
        { category: 'C', value: 41 }, { category: 'D', value: 67 },
      ],
    },
  };
}

// ── Step indicator ─────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  describe: 'Describe',
  propose: 'AI proposes',
  review: 'Review & create',
};
const STEP_ORDER: Step[] = ['describe', 'propose', 'review'];

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <ol className="flex items-center gap-2" aria-label="Wizard progress">
      {STEP_ORDER.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li
            key={s}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium',
              active && 'text-purple-600 dark:text-purple-300',
              done && 'text-slate-500 dark:text-slate-400',
              !active && !done && 'text-slate-300 dark:text-slate-600',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                active && 'bg-purple-600 text-white',
                done && 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                !active && !done && 'bg-slate-100 text-slate-400 dark:bg-slate-800',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {STEP_LABELS[s]}
            {i < STEP_ORDER.length - 1 && (
              <span className="mx-1 h-px w-4 bg-slate-200 dark:bg-slate-700" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Backend-gap note (violet, mirrors WizardPreflightPanel) ─────────

function BackendGapNote() {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-violet-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — fell back to local heuristics
        </p>
      </div>
      <dl className="mt-2 space-y-1.5 text-[11px]">
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">POST /bi-dashboard/nl-to-chart</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
          <dd className="text-slate-700 dark:text-slate-300">
            The AI chart endpoint was unreachable, so widgets were proposed by
            the catalog&apos;s deterministic pickChartType() over the selected table&apos;s columns.
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
        <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
        <span className="text-[10px] text-violet-800 dark:text-violet-200">
          Proposals are still grounded on the real 19-chart catalog — no invalid chart can be created.
        </span>
      </div>
    </div>
  );
}

// ── Proposal extraction helpers ────────────────────────────────────

/**
 * Pull a usable widget proposal out of an nlToChart chart_config blob.
 * The endpoint returns a loose Record, so every field is defensively read.
 */
function widgetFromChartConfig(
  raw: Record<string, unknown>,
  fallbackTitle: string,
  index: number,
): ProposedWidget {
  const chartType = normalizeChartId(
    raw.chartType ?? raw.chart_type ?? raw.type,
    'bar',
  ) as DashboardChartType;

  const measuresRaw = raw.measures ?? raw.suggestedMeasures ?? raw.y;
  const measures: string[] = Array.isArray(measuresRaw)
    ? measuresRaw
        .map((m) =>
          typeof m === 'string'
            ? m
            : typeof m === 'object' && m && 'column' in m
              ? String((m as { column: unknown }).column)
              : '',
        )
        .filter(Boolean)
    : typeof measuresRaw === 'string'
      ? [measuresRaw]
      : [];

  const dimRaw = raw.dimension ?? raw.x ?? raw.suggestedDimension ?? raw.groupBy;
  const dimension =
    typeof dimRaw === 'string'
      ? dimRaw
      : Array.isArray(dimRaw) && typeof dimRaw[0] === 'string'
        ? dimRaw[0]
        : null;

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title
      : fallbackTitle;

  const aggregator =
    typeof raw.aggregator === 'string' ? raw.aggregator.toUpperCase() : 'SUM';

  const v = validateChartConfig(chartType, {
    measures,
    dimensions: dimension ? [dimension] : [],
    aggregator,
  });

  return {
    key: `ai-${index}-${Date.now()}`,
    chartType,
    title,
    measures,
    dimension,
    aggregator,
    origin: 'ai',
    reason: CHART_BY_ID.get(chartType)?.best_for || 'Proposed by the AI assistant.',
    valid: v.ok,
    keep: v.ok,
  };
}

/** Split a prompt into the individual chart asks it implies. */
function splitPromptIntoAsks(prompt: string): string[] {
  const parts = prompt
    .split(/(?:,| and | plus |;|\bthen\b|\balso\b|\n)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 6);
  // Cap the number of AI calls — honest about the per-call cost.
  return (parts.length > 0 ? parts : [prompt]).slice(0, 6);
}

// ── Main component ─────────────────────────────────────────────────

export default function AiDashboardWizard({
  isOpen,
  onClose,
  onCreated,
}: AiDashboardWizardProps) {
  const [step, setStep] = useState<Step>('describe');
  const [prompt, setPrompt] = useState('');
  const [proposing, setProposing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [widgets, setWidgets] = useState<ProposedWidget[]>([]);

  const {
    source,
    dbOptions,
    schemaOptions,
    tableOptions,
    columns,
    setDatabase,
    setSchema,
    setTable,
  } = useDataSourcePicker();

  const promptSection = useMemo(() => buildReportingPromptSection(), []);

  const reset = useCallback(() => {
    setStep('describe');
    setPrompt('');
    setProposing(false);
    setCreating(false);
    setUsedFallback(false);
    setWidgets([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Heuristic fallback over the picked table's columns ────────────
  const fallbackProposals = useCallback(
    (asks: string[]): ProposedWidget[] => {
      const numeric = columns
        .filter((c) => {
          const t = (c.type || c.DATA_TYPE || '').toUpperCase();
          return /NUM|INT|FLOAT|DECIMAL|DOUBLE|REAL/.test(t);
        })
        .map((c) => c.name || c.COLUMN_NAME || '')
        .filter(Boolean) as string[];
      const categorical = columns
        .map((c) => c.name || c.COLUMN_NAME || '')
        .filter((n): n is string => !!n && !numeric.includes(n));

      const timeCol = categorical.find(looksLikeTimeColumn) || categorical[0] || null;

      return asks.map((ask, i) => {
        // Rotate through measures so multiple widgets differ.
        const measures = numeric.length > 0 ? [numeric[i % numeric.length]] : [];
        const dimension =
          /trend|over time|month|quarter|year/i.test(ask)
            ? timeCol
            : categorical[i % Math.max(categorical.length, 1)] || timeCol;
        const pick = pickChartType(measures, dimension ? [dimension] : []);
        const chartType = pick.chartId as DashboardChartType;
        const v = validateChartConfig(chartType, {
          measures,
          dimensions: dimension ? [dimension] : [],
          aggregator: 'SUM',
        });
        return {
          key: `fb-${i}-${Date.now()}`,
          chartType,
          title: ask.length > 48 ? `${ask.slice(0, 45)}…` : ask,
          measures,
          dimension,
          aggregator: 'SUM',
          origin: 'heuristic' as const,
          reason: pick.reason,
          valid: v.ok,
          keep: v.ok,
        };
      });
    },
    [columns],
  );

  // ── Step 2: ask the AI (or fall back) ─────────────────────────────
  const handlePropose = useCallback(async () => {
    if (!prompt.trim()) return;
    setProposing(true);
    setUsedFallback(false);
    setStep('propose');

    const asks = splitPromptIntoAsks(prompt.trim());
    const proposals: ProposedWidget[] = [];
    let anyAiFailure = false;

    for (let i = 0; i < asks.length; i++) {
      try {
        // Ground the question with the catalog so the model only emits
        // real chart ids.
        const grounded = `${asks[i]}\n\n${promptSection}`;
        const res = await nlToChart(
          grounded,
          source.database || undefined,
          source.schema || undefined,
        );
        const cfg = (res?.chart_config ?? {}) as Record<string, unknown>;
        if (cfg && Object.keys(cfg).length > 0) {
          proposals.push(widgetFromChartConfig(cfg, asks[i], i));
        } else {
          anyAiFailure = true;
        }
      } catch {
        anyAiFailure = true;
      }
    }

    // If the AI produced nothing usable, fall back to deterministic
    // heuristics over the picked table's columns.
    if (proposals.length === 0) {
      setUsedFallback(true);
      setWidgets(fallbackProposals(asks));
    } else {
      if (anyAiFailure) setUsedFallback(true);
      setWidgets(proposals);
    }
    setProposing(false);
    setStep('review');
  }, [prompt, promptSection, source.database, source.schema, fallbackProposals]);

  const toggleKeep = useCallback((key: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.key === key ? { ...w, keep: !w.keep } : w)),
    );
  }, []);

  const keptWidgets = widgets.filter((w) => w.keep && w.valid);

  // ── Step 3: create the dashboard ──────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (keptWidgets.length === 0) return;
    setCreating(true);
    try {
      const name = `[AI] ${prompt.trim().slice(0, 40)}${prompt.length > 40 ? '…' : ''}`;
      const dash = await createDashboard({
        project_name: name,
        description: `AI-generated dashboard from: "${prompt.trim()}"`,
        default_database: source.database || null,
        default_schema: source.schema || null,
        tags: ['ai-generated'],
      });

      const pageId = dash.default_page_id;
      let created = 0;
      for (let i = 0; i < keptWidgets.length; i++) {
        const w = keptWidgets[i];
        try {
          await createWidget(dash.project_id, {
            page_id: pageId,
            widget_type: 'chart' as WidgetType,
            chart_type: w.chartType,
            title: w.title,
            chart_config: {
              database: source.database || '',
              schema: source.schema || '',
              table: source.table || '',
              x: w.dimension,
              measures: w.measures.map((column) => ({
                column,
                aggregator: w.aggregator,
              })),
              filters: [],
              groupBy: w.dimension ? [w.dimension] : [],
              limit: null,
            },
            position_x: (i % 2) * 12,
            position_y: Math.floor(i / 2) * 4,
            width: 12,
            height: 4,
          });
          created += 1;
        } catch {
          // One widget failing should not abort the whole dashboard.
        }
      }

      toast.success(
        `Created "${name}" — ${created} of ${keptWidgets.length} widget${keptWidgets.length === 1 ? '' : 's'}.`,
      );
      onCreated(dash.project_id, name);
      handleClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [keptWidgets, prompt, source.database, source.schema, source.table, onCreated, handleClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} customSize="720px">
      <div className="p-6">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 p-2.5 shadow-md shadow-purple-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                AI Dashboard Wizard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Describe the dashboard you want — the AI proposes the charts.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close AI Dashboard Wizard"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="mb-5">
          <StepIndicator current={step} />
        </div>

        {/* ── Step 1: Describe ── */}
        {step === 'describe' && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="ai-dashboard-prompt"
                className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Describe the dashboard you want
              </label>
              <textarea
                id="ai-dashboard-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="e.g. Revenue by region for the last quarter, plus the month-over-month trend"
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Try an example
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-purple-700 dark:hover:bg-purple-900/30"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional data source — used to ground the AI and as the
                fallback column source. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="mb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Data source (optional — improves accuracy and enables offline fallback)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="Database"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={source.database}
                  onChange={(e) => setDatabase(e.target.value)}
                >
                  <option value="">Database…</option>
                  {dbOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  aria-label="Schema"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={source.schema}
                  onChange={(e) => setSchema(e.target.value)}
                  disabled={!source.database}
                >
                  <option value="">Schema…</option>
                  {schemaOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  aria-label="Table"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={source.table}
                  onChange={(e) => setTable(e.target.value)}
                  disabled={!source.schema}
                >
                  <option value="">Table…</option>
                  {tableOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="md" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="md"
                onClick={handlePropose}
                disabled={!prompt.trim()}
                className="gap-1.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:from-purple-700 hover:to-fuchsia-700"
              >
                <Wand2 className="h-4 w-4" /> Generate proposals
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2 & 3: Propose / Review ── */}
        {(step === 'propose' || step === 'review') && (
          <div className="space-y-4">
            {proposing ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="h-7 w-7 animate-spin text-purple-500" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  The AI is proposing charts for your dashboard…
                </p>
              </div>
            ) : widgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <BarChart3 className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No chart could be proposed from that description.
                </p>
                <p className="text-xs text-slate-400">
                  Try a more specific prompt, or pick a data source to enable the offline fallback.
                </p>
              </div>
            ) : (
              <>
                {usedFallback && <BackendGapNote />}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {keptWidgets.length} of {widgets.length} widget
                  {widgets.length === 1 ? '' : 's'} selected. Drop the ones you don&apos;t want.
                </p>

                <div className="grid max-h-[340px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {widgets.map((w) => {
                    const def = CHART_BY_ID.get(w.chartType);
                    return (
                      <div
                        key={w.key}
                        className={cn(
                          'flex flex-col rounded-lg border p-3 transition-colors',
                          !w.valid
                            ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10'
                            : w.keep
                              ? 'border-purple-200 bg-purple-50/40 dark:border-purple-800/50 dark:bg-purple-900/15'
                              : 'border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/50',
                        )}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {w.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                {def?.label || w.chartType}
                              </span>
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                  w.origin === 'ai'
                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                                )}
                              >
                                {w.origin === 'ai' ? 'AI' : 'Heuristic'}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleKeep(w.key)}
                            disabled={!w.valid}
                            aria-label={w.keep ? `Drop ${w.title}` : `Keep ${w.title}`}
                            className={cn(
                              'rounded-md p-1.5 transition-colors',
                              w.keep
                                ? 'text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30'
                                : 'text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30',
                              !w.valid && 'cursor-not-allowed opacity-40',
                            )}
                          >
                            {w.keep ? <Trash2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {/* Mini preview */}
                        <div className="mb-2 h-20 overflow-hidden rounded bg-white dark:bg-slate-900">
                          <DynamicChart config={buildPreviewConfig(w.chartType)} />
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {w.reason}
                        </p>
                        {!w.valid && (
                          <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                            Config does not satisfy this chart&apos;s catalog requirements — excluded.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setStep('describe')}
                    className="gap-1.5"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="md" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      size="md"
                      onClick={handleCreate}
                      disabled={keptWidgets.length === 0 || creating}
                      className="gap-1.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:from-purple-700 hover:to-fuchsia-700"
                    >
                      {creating ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Create dashboard ({keptWidgets.length})</>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
