'use client';

import { useMemo, useCallback } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import type { LayoutItem } from 'react-grid-layout';
import { Plus } from 'lucide-react';
import type { DashboardWidget } from '@/app/services/api/types';
import WidgetCard from './GridChartCard';
import { useCanPerform } from '@/hooks/useCanPerform';

// @ts-ignore
import 'react-grid-layout/css/styles.css';

const ResponsiveGrid = WidthProvider(Responsive);

interface WidgetDataResult {
  data: Record<string, unknown>[];
  query?: string;
}

interface DashboardGridProps {
  widgets: DashboardWidget[];
  widgetResults: Record<string, WidgetDataResult>;
  previousWidgetResults?: Record<string, WidgetDataResult>;
  widgetErrors?: Record<string, string>;
  compareEnabled?: boolean;
  executingWidgetId?: string | null;
  onConfigureWidget: (widget: DashboardWidget) => void;
  onDeleteWidget: (widgetId: string) => void;
  onExecuteSingleWidget: (widget: DashboardWidget) => void;
  onAddWidget: () => void;
  onLayoutChange: (updates: { widget_id: string; x: number; y: number; w: number; h: number }[]) => void;
  crossWidgetFilter?: Record<string, string>;
  onCrossWidgetFilter?: (filterKey: string, filterValue: string) => void;
  onDrillThrough?: (widget: DashboardWidget) => void;
  /**
   * Action-RBAC module the add/edit/delete gates resolve against. Defaults to
   * 'bi_reporting' (BI dashboard unaffected). Forwarded to each WidgetCard.
   */
  rbacModule?: string;
}

/** Minimum sizes per widget type */
const MIN_SIZE: Record<string, { minW: number; minH: number }> = {
  kpi_card: { minW: 3, minH: 2 },
  chart: { minW: 4, minH: 3 },
  table: { minW: 4, minH: 3 },
  text: { minW: 2, minH: 1 },
};

export default function DashboardGrid({
  widgets,
  widgetResults,
  previousWidgetResults,
  widgetErrors,
  compareEnabled,
  executingWidgetId,
  onConfigureWidget,
  onDeleteWidget,
  onExecuteSingleWidget,
  onAddWidget,
  onLayoutChange,
  crossWidgetFilter,
  onCrossWidgetFilter,
  onDrillThrough,
  rbacModule = 'bi_reporting',
}: DashboardGridProps) {
  // Action-RBAC gate (System 2): adding a widget hits POST /widgets which the
  // backend gates with require_action(rbacModule,'create'). Fail-open while
  // the allow-set loads so the button never flashes disabled; honest disabled +
  // tooltip once /my-permissions resolves to a deny.
  const createPerm = useCanPerform(rbacModule, 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const createDeniedReason = 'Requires the "create" permission for this module.';

  // Build layout from widget positions
  const layout = useMemo(
    () =>
      widgets.map((w): LayoutItem => {
        const mins = MIN_SIZE[w.widget_type] || { minW: 2, minH: 2 };
        return {
          i: w.widget_id,
          x: w.position_x,
          y: w.position_y,
          w: w.width,
          h: w.height,
          minW: mins.minW,
          minH: mins.minH,
        };
      }),
    [widgets]
  );

  // Persist layout changes after drag/resize
  const handleLayoutChange = useCallback(
    (currentLayout: readonly LayoutItem[]) => {
      const updates = currentLayout.map((item) => ({
        widget_id: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      }));

      const changed = updates.some((u) => {
        const orig = widgets.find((w) => w.widget_id === u.widget_id);
        if (!orig) return false;
        return (
          orig.position_x !== u.x ||
          orig.position_y !== u.y ||
          orig.width !== u.w ||
          orig.height !== u.h
        );
      });

      if (changed) {
        onLayoutChange(updates);
      }
    },
    [widgets, onLayoutChange]
  );

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
          <Plus className="h-8 w-8 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
          No widgets on this page
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Add charts, KPIs, tables or text to build your dashboard
        </p>
        <button
          onClick={onAddWidget}
          disabled={!canCreate}
          title={!canCreate ? createDeniedReason : undefined}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
        >
          Add Widget
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveGrid
        className="layout"
        layouts={{ lg: layout } as any}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 24, md: 18, sm: 12, xs: 6, xxs: 3 }}
        rowHeight={50}
        margin={[12, 12] as [number, number]}
        containerPadding={[0, 0] as [number, number]}
        draggableHandle=".drag-handle"
        onLayoutChange={handleLayoutChange as any}
        isResizable
        isDraggable
        compactType="vertical"
        useCSSTransforms
      >
        {widgets.map((widget) => (
          <div key={widget.widget_id}>
            <WidgetCard
              widget={widget}
              executionData={widgetResults[widget.widget_id]}
              previousExecutionData={previousWidgetResults?.[widget.widget_id]}
              fetchError={widgetErrors?.[widget.widget_id]}
              compareEnabled={compareEnabled}
              executing={executingWidgetId === widget.widget_id}
              onConfigure={onConfigureWidget}
              onDelete={onDeleteWidget}
              onExecuteSingle={onExecuteSingleWidget}
              crossWidgetFilter={crossWidgetFilter}
              onCrossWidgetFilter={onCrossWidgetFilter}
              onDrillThrough={onDrillThrough}
              rbacModule={rbacModule}
            />
          </div>
        ))}
      </ResponsiveGrid>

      {/* Floating Add Button */}
      <button
        onClick={onAddWidget}
        disabled={!canCreate}
        className="fixed bottom-8 right-8 p-3 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/30 dark:shadow-blue-900/40 hover:bg-blue-700 dark:hover:bg-blue-500 hover:scale-105 transition-all z-10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-blue-600"
        title={canCreate ? 'Add widget' : createDeniedReason}
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
