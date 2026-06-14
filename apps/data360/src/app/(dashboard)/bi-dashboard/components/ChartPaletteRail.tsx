'use client';

/**
 * ChartPaletteRail — left-side dock of chart-type tiles.
 *
 * Replaces the legacy "Add Widget" modal popup with an always-visible left
 * rail. User clicks a tile → existing config modal opens for that widget
 * type → save creates the widget. The picker step itself never opens a modal.
 *
 * The rail is collapsible (toggles to a thin icon-only strip) so it can
 * coexist with the dashboard grid without eating too much canvas width.
 *
 * Draft state: each unsaved widget config is mirrored to localStorage
 * (key = `bi-draft:{projectId}`) and restored on mount. Cleared on save.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, LineChart, PieChart, ScatterChart as ScatterIcon,
  Table2, Type, TrendingUp, CircleDot, Gauge,
  Radar, TreePine, GitMerge, Layers, BarChart2, Activity,
  CandlestickChart, Circle, Grid3X3, ArrowDownUp,
  ChevronLeft, ChevronRight, Search, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from 'rizzui';
import { createWidget } from '@/app/services/api/biDashboardApi';
import type {
  DashboardWidget, BIDashboardChartConfig, WidgetType, DashboardChartType,
} from '@/app/services/api/types';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';

// Same tile catalogue the modal used — copy/paste to keep the two compatible.
interface WidgetTile {
  widgetType: WidgetType;
  chartType: DashboardChartType | null;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}
interface WidgetGroup {
  category: string;
  items: WidgetTile[];
}
const WIDGET_TYPES: WidgetGroup[] = [
  {
    category: 'Basic',
    items: [
      { widgetType: 'chart' as WidgetType, chartType: 'bar' as DashboardChartType, title: 'Bar', icon: BarChart3, color: 'from-green-400 to-emerald-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'line' as DashboardChartType, title: 'Line', icon: LineChart, color: 'from-purple-400 to-violet-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'area' as DashboardChartType, title: 'Area', icon: TrendingUp, color: 'from-sky-400 to-blue-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'pie' as DashboardChartType, title: 'Pie', icon: PieChart, color: 'from-amber-400 to-orange-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'donut' as DashboardChartType, title: 'Donut', icon: CircleDot, color: 'from-rose-400 to-pink-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'scatter' as DashboardChartType, title: 'Scatter', icon: ScatterIcon, color: 'from-blue-400 to-cyan-500' },
    ],
  },
  {
    category: 'Advanced',
    items: [
      { widgetType: 'chart' as WidgetType, chartType: 'stacked_bar' as DashboardChartType, title: 'Stacked Bar', icon: Layers, color: 'from-green-500 to-teal-600' },
      { widgetType: 'chart' as WidgetType, chartType: 'stacked_area' as DashboardChartType, title: 'Stacked Area', icon: Activity, color: 'from-sky-500 to-indigo-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'combo' as DashboardChartType, title: 'Combo', icon: BarChart2, color: 'from-violet-400 to-purple-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'radar' as DashboardChartType, title: 'Radar', icon: Radar, color: 'from-cyan-400 to-blue-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'treemap' as DashboardChartType, title: 'Treemap', icon: TreePine, color: 'from-lime-400 to-green-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'funnel' as DashboardChartType, title: 'Funnel', icon: GitMerge, color: 'from-orange-400 to-red-500' },
    ],
  },
  {
    category: 'Specialized',
    items: [
      { widgetType: 'chart' as WidgetType, chartType: 'heatmap' as DashboardChartType, title: 'Heatmap', icon: Grid3X3, color: 'from-red-400 to-orange-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'waterfall' as DashboardChartType, title: 'Waterfall', icon: ArrowDownUp, color: 'from-blue-400 to-indigo-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'histogram' as DashboardChartType, title: 'Histogram', icon: BarChart3, color: 'from-fuchsia-400 to-pink-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'gauge' as DashboardChartType, title: 'Gauge', icon: Gauge, color: 'from-emerald-400 to-green-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'bubble' as DashboardChartType, title: 'Bubble', icon: Circle, color: 'from-pink-400 to-rose-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'candlestick' as DashboardChartType, title: 'Candlestick', icon: CandlestickChart, color: 'from-yellow-400 to-amber-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'radial_bar' as DashboardChartType, title: 'Radial Bar', icon: CircleDot, color: 'from-teal-400 to-cyan-500' },
    ],
  },
  {
    category: 'Data & Content',
    items: [
      { widgetType: 'kpi_card' as WidgetType, chartType: null, title: 'KPI Card', icon: Gauge, color: 'from-indigo-400 to-purple-500' },
      { widgetType: 'table' as WidgetType, chartType: null, title: 'Data Table', icon: Table2, color: 'from-slate-400 to-gray-500' },
      { widgetType: 'text' as WidgetType, chartType: null, title: 'Text / Title', icon: Type, color: 'from-teal-400 to-emerald-500' },
    ],
  },
];

type ActiveModal = 'chart' | 'kpi' | 'table' | 'text' | null;

interface DraftPayload {
  widgetType: WidgetType;
  chartType: DashboardChartType | null;
  savedAt: number;
}

const DRAFT_KEY = (projectId: string) => `bi-draft:${projectId}`;

interface ChartPaletteRailProps {
  projectId: string;
  pageId: string;
  existingWidgets: DashboardWidget[];
  onWidgetAdded: (
    widget: DashboardWidget,
    prefetchedData?: Record<string, unknown>[],
  ) => void;
  /**
   * Start adding a chart / kpi_card / table — opens its config form docked in
   * the right panel (BiSmartRightBar's Configure section), never a popup.
   * Hosted by DashboardEditor, exactly like the edit flow.
   */
  onStartAdd: (
    widgetType: WidgetType,
    chartType: DashboardChartType | null,
  ) => void;
  /** Controlled collapse state — page persists it across reloads. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function nextPosition(widgets: DashboardWidget[]) {
  if (widgets.length === 0) return { x: 0, y: 0 };
  const maxY = Math.max(...widgets.map((w) => w.position_y + w.height));
  return { x: 0, y: maxY };
}

export default function ChartPaletteRail({
  projectId,
  pageId,
  existingWidgets,
  onWidgetAdded,
  onStartAdd,
  collapsed = false,
  onCollapsedChange,
}: ChartPaletteRailProps) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [search, setSearch] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [savedDraft, setSavedDraft] = useState<DraftPayload | null>(null);

  // ── Draft load on mount ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftPayload;
      // Only offer draft if < 7 days old to avoid surfacing stale ones.
      if (Date.now() - parsed.savedAt < 7 * 86_400_000) {
        setSavedDraft(parsed);
      } else {
        window.localStorage.removeItem(DRAFT_KEY(projectId));
      }
    } catch {
      /* ignore bad draft */
    }
  }, [projectId]);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_KEY(projectId));
    } catch {
      /* ignore */
    }
    setSavedDraft(null);
  }, [projectId]);

  const saveDraft = useCallback(
    (payload: Omit<DraftPayload, 'savedAt'>) => {
      try {
        window.localStorage.setItem(
          DRAFT_KEY(projectId),
          JSON.stringify({ ...payload, savedAt: Date.now() }),
        );
        setSavedDraft({ ...payload, savedAt: Date.now() });
      } catch {
        /* ignore */
      }
    },
    [projectId],
  );

  const handleItemSelect = (
    widgetType: WidgetType,
    chartType: DashboardChartType | null,
  ) => {
    if (widgetType === 'text') {
      // Text keeps its small inline modal + draft/resume flow (cleared on save
      // by createAndNotify).
      saveDraft({ widgetType, chartType });
      setActiveModal('text');
    } else {
      // Chart / KPI / Table configs open docked in the right panel
      // (BiSmartRightBar's Configure section) — no popup. The live form state
      // now lives in the panel (addDraft in DashboardEditor), so the
      // localStorage draft for these types is vestigial — clear any stale one
      // (and the redundant "Saved draft" banner) instead of writing a new one.
      clearDraft();
      onStartAdd(widgetType, chartType);
    }
  };

  const resumeDraft = () => {
    if (!savedDraft) return;
    handleItemSelect(savedDraft.widgetType, savedDraft.chartType);
  };

  const createAndNotify = useCallback(
    async (
      widgetType: WidgetType,
      chartType: DashboardChartType | null,
      title: string,
      chartConfig: BIDashboardChartConfig,
      prefetchedData?: Record<string, unknown>[],
      overrides?: { width?: number; height?: number; text_content?: string },
    ) => {
      const isKpi = widgetType === 'kpi_card';
      const isTable = widgetType === 'table';
      const width = overrides?.width ?? (isKpi ? 4 : isTable ? 12 : 12);
      const height = overrides?.height ?? (isKpi ? 2 : 4);
      const pos = nextPosition(existingWidgets);

      try {
        const response = await createWidget(projectId, {
          page_id: pageId,
          widget_type: widgetType,
          chart_type: chartType,
          title,
          chart_config: chartConfig,
          text_content: overrides?.text_content,
          position_x: pos.x,
          position_y: pos.y,
          width,
          height,
        });
        const newWidget: DashboardWidget = {
          widget_id: response.widget_id,
          page_id: pageId,
          widget_type: widgetType,
          chart_type: chartType,
          title,
          chart_config: chartConfig,
          text_content: overrides?.text_content,
          position_x: pos.x,
          position_y: pos.y,
          width,
          height,
        };
        onWidgetAdded(newWidget, prefetchedData);
        clearDraft();
        setActiveModal(null);
        toast.success(`${title} added`);
      } catch (err) {
        toast.error(getApiErrorMessage(err) || 'Failed to add widget');
      }
    },
    [projectId, pageId, existingWidgets, onWidgetAdded, clearDraft],
  );

  const handleTextSave = () => {
    if (!textTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    void createAndNotify(
      'text',
      null,
      textTitle.trim(),
      { database: '', schema: '', table: '', x: null, measures: [], filters: [], groupBy: [], limit: null },
      undefined,
      { text_content: textContent, height: 2 },
    );
    setTextTitle('');
    setTextContent('');
  };

  // Filter tiles by search query
  const filtered = WIDGET_TYPES.map((g) => ({
    ...g,
    items: g.items.filter((it) =>
      it.title.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((g) => g.items.length > 0);

  // ── Collapsed view (icon-only narrow strip) ───────────────────────────
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 flex-col items-center border-r border-slate-200 bg-white py-3 dark:border-slate-700 dark:bg-slate-900">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onCollapsedChange?.(false)}
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Expand chart palette"
        >
          <ChevronRight className="h-4 w-4" />
        </motion.button>
        <div className="my-2 h-px w-6 bg-slate-200 dark:bg-slate-700" />
        {WIDGET_TYPES.flatMap((g) => g.items.slice(0, 2)).map((it) => {
          const Icon = it.icon;
          return (
            <motion.button
              key={`${it.widgetType}-${it.chartType}-mini`}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleItemSelect(it.widgetType, it.chartType)}
              title={it.title}
              className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Icon className="h-4 w-4" />
            </motion.button>
          );
        })}
      </aside>
    );
  }

  return (
    <>
      <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/40">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Widgets
            </h3>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => onCollapsedChange?.(true)}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Collapse chart palette"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </motion.button>
        </div>

        {/* Search */}
        <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              size="sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find chart…"
              className="pl-8"
            />
          </div>
        </div>

        {/* Draft resume banner */}
        <AnimatePresence>
          {savedDraft && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-900/20"
            >
              <div className="px-3 py-2 text-[11px]">
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  Saved draft
                </p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                  Unsaved {savedDraft.widgetType.replace('_', ' ')} widget
                </p>
                <div className="mt-1.5 flex gap-1">
                  <button
                    onClick={resumeDraft}
                    className="rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm hover:from-amber-600 hover:to-orange-600"
                  >
                    Resume
                  </button>
                  <button
                    onClick={clearDraft}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100/60 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable tile grid */}
        <div className="custom-scrollbar flex-1 overflow-y-auto px-3 py-3">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">
              No charts match &ldquo;{search}&rdquo;
            </p>
          ) : (
            filtered.map((group) => (
              <div key={group.category} className="mb-4">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.category}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((it, idx) => {
                    const Icon = it.icon;
                    return (
                      <motion.button
                        key={`${it.widgetType}-${it.chartType}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.18,
                          delay: Math.min(idx * 0.02, 0.1),
                        }}
                        whileHover={{ y: -2, scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleItemSelect(it.widgetType, it.chartType)}
                        className="group flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-700"
                        title={it.title}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br transition-transform group-hover:scale-110',
                            it.color,
                          )}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="truncate text-[10px] font-medium text-slate-700 dark:text-slate-300">
                          {it.title}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chart / KPI / Table configs are hosted in the right panel
          (BiSmartRightBar) by DashboardEditor — no popup here. The text
          widget keeps its small inline modal for now. */}
      <AnimatePresence>
        {activeModal === 'text' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setActiveModal(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
                Add text widget
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Title
                  </label>
                  <Input
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="e.g. Section header"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Content <span className="font-normal text-slate-400">(Markdown)</span>
                  </label>
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    placeholder="**Bold**, _italic_, [link](https://…)"
                  />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setActiveModal(null);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleTextSave}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-md shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700"
                >
                  Add widget
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
