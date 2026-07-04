'use client';

/**
 * AiBuildSection — the docked "AI Build" flow, hosted in BiSmartRightBar.
 *
 * Replaces the modal AI step-flows (AiDashboardWizard / AutoCreateModal) for
 * the in-editor path: prompt → generate → the charts land DIRECTLY on the
 * grid (POST /bi-dashboard/nl-to-chart per ask, then the grid's existing
 * add-widget path), with a docked review list (Undo per widget / Undo all /
 * refine the prompt and generate more). Widgets are persisted as they are
 * created — Undo really deletes them (DELETE /widgets/{id} via the parent).
 *
 * Honest states: a 404/501 from nl-to-chart marks the whole section
 * unavailable (no fake results); per-ask failures are listed by name.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Loader2, Undo2, Wand2, Check, AlertTriangle,
} from 'lucide-react';
import { isUnavailable } from '@/lib/http-status';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { nlToChart, createWidget } from '@/app/services/api/biDashboardApi';
import type { DashboardWidget, DashboardChartType } from '@/app/services/api/types';
import { normalizeChartId, CHART_BY_ID } from './reporting-catalog-grounding';
import {
  nlConfigToChartConfig,
  nextWidgetPosition,
  splitPromptIntoAsks,
} from './nl-chart-utils';

interface CreatedEntry {
  widgetId: string;
  title: string;
  chartType: DashboardChartType;
  ask: string;
}

interface AiBuildSectionProps {
  projectId: string;
  pageId: string;
  /** Dashboard default db/schema — grounds the generated chart configs. */
  defaults: { database?: string | null; schema?: string | null };
  /** Current page widgets — used to stack new charts below the grid. */
  widgets: DashboardWidget[];
  /** The grid's existing add-widget chokepoint (same as palette / NL bar). */
  onWidgetAdded: (widget: DashboardWidget) => void;
  /** The grid's existing delete path — Undo really removes the widget. */
  onUndoWidget: (widgetId: string) => Promise<void>;
  /** Deep-linked prompt (?ai=build&prompt=…) — prefilled, and auto-run once. */
  initialPrompt?: string;
}

export default function AiBuildSection({
  projectId,
  pageId,
  defaults,
  widgets,
  onWidgetAdded,
  onUndoWidget,
  initialPrompt,
}: AiBuildSectionProps) {
  // Action-RBAC gate (System 2): every generated chart is a POST /widgets
  // (require_action 'bi_reporting','create'). Fail-open while loading.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;

  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [generating, setGenerating] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAsks, setFailedAsks] = useState<string[]>([]);
  const [created, setCreated] = useState<CreatedEntry[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoingAll, setUndoingAll] = useState(false);

  // Live refs so generate() (async loop) always stacks below the real grid.
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const generate = useCallback(async () => {
    const q = prompt.trim();
    if (!q || generating) return;
    setGenerating(true);
    setError(null);
    setFailedAsks([]);
    const asks = splitPromptIntoAsks(q);
    // Local Y cursor — the widgets prop is stale inside the loop.
    let y = nextWidgetPosition(widgetsRef.current).y;
    const failures: string[] = [];
    for (const ask of asks) {
      try {
        const res = await nlToChart(
          ask,
          defaults.database || undefined,
          defaults.schema || undefined,
        );
        const cfg = (res?.chart_config ?? null) as Record<string, unknown> | null;
        if (!cfg || Object.keys(cfg).length === 0) {
          failures.push(ask);
          continue;
        }
        const chartType = normalizeChartId(
          cfg.chartType ?? cfg.chart_type ?? cfg.type,
          'bar',
        ) as DashboardChartType;
        const chartConfig = nlConfigToChartConfig(cfg, defaults);
        const title = ask.length > 60 ? `${ask.slice(0, 57)}…` : ask;
        const response = await createWidget(projectId, {
          page_id: pageId,
          widget_type: 'chart',
          chart_type: chartType,
          title,
          chart_config: chartConfig,
          position_x: 0,
          position_y: y,
          width: 12,
          height: 4,
        });
        onWidgetAdded({
          widget_id: response.widget_id,
          page_id: pageId,
          widget_type: 'chart',
          chart_type: chartType,
          title,
          chart_config: chartConfig,
          position_x: 0,
          position_y: y,
          width: 12,
          height: 4,
        });
        setCreated((prev) => [
          ...prev,
          { widgetId: response.widget_id, title, chartType, ask },
        ]);
        y += 4;
      } catch (err) {
        if (isUnavailable(err)) {
          setUnavailable(true);
          setGenerating(false);
          return;
        }
        failures.push(ask);
        setError(getApiErrorMessage(err));
      }
    }
    setFailedAsks(failures);
    setGenerating(false);
  }, [prompt, generating, defaults, projectId, pageId, onWidgetAdded]);

  // Deep-link auto-run (?ai=build&prompt=…): fire at most once per mount,
  // once the page is resolved. The user already asked for generation upstream.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current || !initialPrompt || !pageId) return;
    autoRanRef.current = true;
    void generate();
  }, [initialPrompt, pageId, generate]);

  const undoOne = useCallback(
    async (entry: CreatedEntry) => {
      if (undoingId || undoingAll) return;
      setUndoingId(entry.widgetId);
      try {
        await onUndoWidget(entry.widgetId);
        setCreated((prev) => prev.filter((c) => c.widgetId !== entry.widgetId));
      } finally {
        setUndoingId(null);
      }
    },
    [undoingId, undoingAll, onUndoWidget],
  );

  const undoAll = useCallback(async () => {
    if (undoingAll || created.length === 0) return;
    setUndoingAll(true);
    try {
      for (const entry of created) {
        await onUndoWidget(entry.widgetId);
        setCreated((prev) => prev.filter((c) => c.widgetId !== entry.widgetId));
      }
    } finally {
      setUndoingAll(false);
    }
  }, [undoingAll, created, onUndoWidget]);

  if (unavailable) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-400 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-500">
        AI chart generation isn&apos;t available on this backend yet
        (POST /bi-dashboard/nl-to-chart). Use the Add section to build widgets manually.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Prompt */}
      <div>
        <label
          htmlFor="ai-build-prompt"
          className="mb-1.5 block text-[11px] font-medium text-gray-600 dark:text-gray-300"
        >
          Describe the charts you want — they land directly on the grid.
        </label>
        <textarea
          id="ai-build-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={generating}
          placeholder={'e.g. "Monthly revenue by region, plus average basket per store"'}
          className="w-full resize-none rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={!prompt.trim() || generating || !canCreate}
        title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
        aria-busy={generating}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:from-purple-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
        ) : created.length > 0 ? (
          <><Wand2 className="h-3.5 w-3.5" /> Refine — generate more</>
        ) : (
          <><Wand2 className="h-3.5 w-3.5" /> Generate on the grid</>
        )}
      </button>

      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}
      {failedAsks.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {failedAsks.length} ask{failedAsks.length === 1 ? '' : 's'} couldn&apos;t become a chart
          </p>
          <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700/80 dark:text-amber-300/80">
            {failedAsks.map((a) => <li key={a} className="truncate">{a}</li>)}
          </ul>
          <p className="mt-1 text-[10px] text-amber-600/80 dark:text-amber-400/80">
            Try naming the table and measure explicitly, then Refine.
          </p>
        </div>
      )}

      {/* Docked review — created this session, each really on the grid. */}
      {created.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Created this session ({created.length})
            </p>
            <button
              type="button"
              onClick={() => void undoAll()}
              disabled={undoingAll || !!undoingId}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {undoingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              Undo all
            </button>
          </div>
          <ul className="space-y-1.5">
            {created.map((c) => (
              <li
                key={c.widgetId}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 dark:border-gray-700"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium text-gray-800 dark:text-gray-200">
                      {c.title}
                    </span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                      {CHART_BY_ID.get(c.chartType)?.label || c.chartType}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void undoOne(c)}
                  disabled={!!undoingId || undoingAll}
                  aria-busy={undoingId === c.widgetId}
                  aria-label={`Undo ${c.title}`}
                  title="Undo — removes this widget from the dashboard"
                  className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
                >
                  {undoingId === c.widgetId
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Undo2 className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[10px] italic text-gray-400 dark:text-gray-500">
            Widgets are saved to the page as they&apos;re generated — accepted by default.
            Undo deletes them.
          </p>
        </div>
      )}

      {created.length === 0 && !generating && failedAsks.length === 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-purple-400" />
          Each comma-separated ask becomes one chart. Generated charts appear on the
          canvas immediately and are listed here for review.
        </p>
      )}
    </div>
  );
}
