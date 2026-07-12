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
import { useCanPerform } from '@/hooks/useCanPerform';
import type {
  DashboardWidget, WidgetType, DashboardChartType,
} from '@/app/services/api/types';

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
// Exported so the bar's Add section (AddWidgetSection in BiSmartRightBar)
// renders the SAME catalogue — one source of truth for the tile set.
export const WIDGET_TILE_GROUPS: WidgetGroup[] = [
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

const DRAFT_KEY = (projectId: string) => `bi-draft:${projectId}`;

interface ChartPaletteRailProps {
  projectId: string;
  pageId: string;
  existingWidgets: DashboardWidget[];
  onWidgetAdded?: (
    widget: DashboardWidget,
    prefetchedData?: Record<string, unknown>[],
  ) => void;
  /**
   * Start adding a chart / kpi_card / table / text — opens its config form
   * docked in the right panel (BiSmartRightBar's Configure section), never a
   * popup. Hosted by DashboardEditor, exactly like the edit flow.
   */
  onStartAdd: (
    widgetType: WidgetType,
    chartType: DashboardChartType | null,
  ) => void;
  /** Controlled collapse state — page persists it across reloads. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function ChartPaletteRail({
  projectId,
  onStartAdd,
  collapsed = false,
  onCollapsedChange,
}: ChartPaletteRailProps) {
  // Action-RBAC gate (System 2): picking a tile / resuming a draft / saving a
  // text widget all create a widget (POST /widgets → require_action
  // 'bi_reporting','create'). Fail-open while the allow-set loads; honest
  // disabled + tooltip on a resolved deny.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const createDeniedReason = 'Requires the "create" permission on Business Reporting.';

  const [search, setSearch] = useState('');

  // Stale localStorage drafts from the retired popup flow are purged, never
  // resurfaced: the live form state now lives in the Configure panel
  // (addDraft in DashboardEditor), so a second "resume" entry point would
  // silently compete with it.
  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_KEY(projectId));
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const handleItemSelect = (
    widgetType: WidgetType,
    chartType: DashboardChartType | null,
  ) => {
    // Every type — chart / KPI / table / TEXT — opens docked in the right
    // panel (BiSmartRightBar's Configure section). No popup.
    clearDraft();
    onStartAdd(widgetType, chartType);
  };


  // Filter tiles by search query
  const filtered = WIDGET_TILE_GROUPS.map((g) => ({
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
        {WIDGET_TILE_GROUPS.flatMap((g) => g.items.slice(0, 2)).map((it) => {
          const Icon = it.icon;
          return (
            <motion.button
              key={`${it.widgetType}-${it.chartType}-mini`}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleItemSelect(it.widgetType, it.chartType)}
              disabled={!canCreate}
              title={canCreate ? it.title : createDeniedReason}
              className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
            >
              <Icon className="h-4 w-4" />
            </motion.button>
          );
        })}
      </aside>
    );
  }

  return (
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

        {/* Draft-resume banner removed: the live form state lives in the
            Configure panel (addDraft in DashboardEditor); the localStorage draft
            was vestigial (see the note above) and its two buttons duplicated it. */}

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
                        disabled={!canCreate}
                        className="group flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:shadow-sm"
                        title={canCreate ? it.title : createDeniedReason}
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
  );
}

// Chart / KPI / Table / Text configs are ALL hosted in the right panel
// (BiSmartRightBar's Configure section) by DashboardEditor — no popup here.
