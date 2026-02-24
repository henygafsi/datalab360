'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Camera, Loader2, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';

import { useDashboard } from '../hooks/useDashboard';
import { useExecuteDashboard } from '../hooks/useExecuteDashboard';

import PageTabs from './PageTabs';
import DashboardGrid from './DashboardGrid';
import FilterBar from './FilterBar';
import AddWidgetPanel from './AddChartPanel';

import {
  updateWidget,
  deleteWidget as deleteWidgetApi,
  saveSnapshot,
} from '@/app/services/api/biDashboardApi';
import ChartConfigModal, {
  ComponentConfig,
} from './widget-config/ChartConfigModal';
import KpiCardConfigModal from './widget-config/KpiCardConfigModal';
import TableConfigModal from './widget-config/TableConfigModal';
import type {
  DashboardPage,
  DashboardWidget,
  DashboardFilter,
  FullDashboardPage,
  BIDashboardChartConfig,
} from '@/app/services/api/types';

interface DashboardEditorProps {
  projectId: string;
  projectName: string;
}

/** Convert widget chart_config to ComponentConfig for ConfigurationModal */
function toComponentConfig(widget: DashboardWidget): ComponentConfig {
  const cfg = widget.chart_config;
  if (!cfg) {
    return { id: widget.widget_id, title: widget.title || '' };
  }
  return {
    id: widget.widget_id,
    title: widget.title || '',
    database: cfg.database,
    schema: cfg.schema,
    table: cfg.table,
    xAxisColumn: cfg.x || undefined,
    measures: (cfg.measures || []).map((m) => ({
      column: m.column,
      aggregator: (m.aggregator as any) || 'SUM',
      seuils: m.seuils as any,
    })),
    groupBy: cfg.groupBy || [],
    limit: cfg.limit || undefined,
    chartType: widget.chart_type || undefined,
  };
}

/** Convert ComponentConfig back to BIDashboardChartConfig */
function toChartConfig(cfg: ComponentConfig): BIDashboardChartConfig {
  return {
    database: cfg.database || '',
    schema: cfg.schema || '',
    table: cfg.table || '',
    x: cfg.xAxisColumn || null,
    measures: (cfg.measures || []).map((m) => ({
      column: m.column,
      aggregator: m.aggregator || 'SUM',
      seuils: m.seuils,
    })),
    filters: [],
    groupBy: Array.isArray(cfg.groupBy) ? cfg.groupBy : cfg.groupBy ? [cfg.groupBy] : [],
    limit: cfg.limit || null,
  };
}

export default function DashboardEditor({ projectId, projectName }: DashboardEditorProps) {
  const { data: dashboard, loading, error, refetch } = useDashboard(projectId);
  const {
    executing, executingWidgetId, results, executeAll, executeSingle, clearResults, setWidgetResult,
  } = useExecuteDashboard();

  // Local state derived from dashboard data
  const [pages, setPages] = useState<FullDashboardPage[]>([]);
  const [globalFilters, setGlobalFilters] = useState<DashboardFilter[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [snapshotting, setSaving] = useState(false);

  // Sync from API data
  useEffect(() => {
    if (!dashboard) return;
    setPages(dashboard.pages || []);
    setGlobalFilters(dashboard.global_filters || []);
    if (!activePageId && dashboard.pages?.length > 0) {
      setActivePageId(dashboard.pages[0].page_id);
    }
  }, [dashboard]);

  // Active page data
  const activePage = useMemo(
    () => pages.find((p) => p.page_id === activePageId) || null,
    [pages, activePageId]
  );

  const pageWidgets = activePage?.widgets || [];
  const pageFilters = activePage?.filters || [];
  const allFilters = useMemo(
    () => [...globalFilters, ...pageFilters],
    [globalFilters, pageFilters]
  );

  // Simple page objects for PageTabs (without nested widgets/filters)
  const simplifiedPages: DashboardPage[] = useMemo(
    () => pages.map((p) => ({
      page_id: p.page_id,
      title: p.title,
      layout: p.layout,
      page_order: p.page_order,
    })),
    [pages]
  );

  // Handle page switch — clear old results
  const handlePageSelect = useCallback(
    (pageId: string) => {
      setActivePageId(pageId);
      clearResults();
    },
    [clearResults]
  );

  // Execute single widget
  const handleExecuteSingle = useCallback(
    (widget: DashboardWidget) => {
      executeSingle(widget);
    },
    [executeSingle]
  );

  // Delete widget
  const handleDeleteWidget = useCallback(
    async (widgetId: string) => {
      try {
        await deleteWidgetApi(projectId, widgetId);
        // Update local state — remove from the active page's widgets
        setPages((prev) =>
          prev.map((p) =>
            p.page_id === activePageId
              ? { ...p, widgets: p.widgets.filter((w) => w.widget_id !== widgetId) }
              : p
          )
        );
        toast.success('Widget deleted');
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [projectId, activePageId]
  );

  // Handle layout change from DashboardGrid (drag / resize)
  const handleLayoutChange = useCallback(
    (updates: { widget_id: string; x: number; y: number; w: number; h: number }[]) => {
      // Update local state immediately
      setPages((prev) =>
        prev.map((p) =>
          p.page_id === activePageId
            ? {
                ...p,
                widgets: p.widgets.map((w) => {
                  const u = updates.find((u) => u.widget_id === w.widget_id);
                  if (!u) return w;
                  return {
                    ...w,
                    position_x: u.x,
                    position_y: u.y,
                    width: u.w,
                    height: u.h,
                  };
                }),
              }
            : p
        )
      );

      // Persist each changed widget to backend (fire-and-forget)
      for (const u of updates) {
        const orig = pageWidgets.find((w) => w.widget_id === u.widget_id);
        if (
          orig &&
          (orig.position_x !== u.x ||
            orig.position_y !== u.y ||
            orig.width !== u.w ||
            orig.height !== u.h)
        ) {
          updateWidget(projectId, u.widget_id, {
            position_x: u.x,
            position_y: u.y,
            width: u.w,
            height: u.h,
          }).catch(() => {
            // silently ignore — user can refresh to re-sync
          });
        }
      }
    },
    [projectId, activePageId, pageWidgets]
  );

  // Configure widget — open modal
  const handleConfigureWidget = useCallback((widget: DashboardWidget) => {
    setEditingWidget(widget);
  }, []);

  // Save chart widget config from ConfigurationModal
  const handleSaveChartConfig = useCallback(
    async (config: ComponentConfig) => {
      if (!editingWidget) return;
      try {
        const chartConfig = toChartConfig(config);
        await updateWidget(projectId, editingWidget.widget_id, {
          title: config.title,
          chart_config: chartConfig,
        });
        setPages((prev) =>
          prev.map((p) =>
            p.page_id === activePageId
              ? {
                  ...p,
                  widgets: p.widgets.map((w) =>
                    w.widget_id === editingWidget.widget_id
                      ? { ...w, title: config.title || w.title, chart_config: chartConfig }
                      : w
                  ),
                }
              : p
          )
        );
        if (config.prefetched?.data) {
          setWidgetResult(editingWidget.widget_id, config.prefetched.data);
        }
        setEditingWidget(null);
        toast.success('Widget updated');
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [projectId, editingWidget, activePageId, setWidgetResult]
  );

  // Save KPI / Table widget config from dedicated modals
  const handleSaveDataWidgetConfig = useCallback(
    async (result: { title: string; chartConfig: BIDashboardChartConfig; prefetchedData?: Record<string, unknown>[] }) => {
      if (!editingWidget) return;
      try {
        await updateWidget(projectId, editingWidget.widget_id, {
          title: result.title,
          chart_config: result.chartConfig,
        });
        setPages((prev) =>
          prev.map((p) =>
            p.page_id === activePageId
              ? {
                  ...p,
                  widgets: p.widgets.map((w) =>
                    w.widget_id === editingWidget.widget_id
                      ? { ...w, title: result.title, chart_config: result.chartConfig }
                      : w
                  ),
                }
              : p
          )
        );
        if (result.prefetchedData) {
          setWidgetResult(editingWidget.widget_id, result.prefetchedData);
        }
        setEditingWidget(null);
        toast.success('Widget updated');
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [projectId, editingWidget, activePageId, setWidgetResult]
  );

  // Add widget callback — also inject prefetched data if available
  const handleWidgetAdded = useCallback((widget: DashboardWidget, prefetchedData?: Record<string, unknown>[]) => {
    setPages((prev) =>
      prev.map((p) =>
        p.page_id === activePageId
          ? { ...p, widgets: [...p.widgets, widget] }
          : p
      )
    );
    if (prefetchedData && prefetchedData.length > 0) {
      setWidgetResult(widget.widget_id, prefetchedData);
    }
  }, [activePageId, setWidgetResult]);

  // Handle pages change from PageTabs (add/rename/delete)
  const handlePagesChange = useCallback((updatedSimplePages: DashboardPage[]) => {
    setPages((prev) => {
      // Merge: keep existing widgets/filters for pages that still exist, add empty for new pages
      const existingMap = new Map(prev.map((p) => [p.page_id, p]));
      return updatedSimplePages.map((sp) => {
        const existing = existingMap.get(sp.page_id);
        if (existing) {
          return { ...existing, title: sp.title, layout: sp.layout, page_order: sp.page_order };
        }
        return { ...sp, widgets: [], filters: [] };
      });
    });
  }, []);

  // Handle filters change
  const handleFiltersChange = useCallback((updatedFilters: DashboardFilter[]) => {
    const global = updatedFilters.filter((f) => f.scope === 'global');
    const page = updatedFilters.filter((f) => f.scope === 'page');
    setGlobalFilters(global);
    if (activePageId) {
      setPages((prev) =>
        prev.map((p) =>
          p.page_id === activePageId ? { ...p, filters: page } : p
        )
      );
    }
  }, [activePageId]);

  // Snapshot
  const handleSnapshot = useCallback(async () => {
    setSaving(true);
    try {
      const res = await saveSnapshot(projectId);
      toast.success(`Snapshot saved (${res.version_id})`);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  // Track which page we already auto-fetched to avoid duplicate calls
  const autoFetchedPageRef = useRef<string | null>(null);

  // Auto-fetch data for widgets when page loads
  useEffect(() => {
    if (
      activePageId &&
      pageWidgets.length > 0 &&
      !executing &&
      autoFetchedPageRef.current !== activePageId
    ) {
      autoFetchedPageRef.current = activePageId;
      executeAll(pageWidgets);
    }
  }, [activePageId, pageWidgets.length, executing, executeAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-500">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 font-medium mb-2">Failed to load dashboard</p>
        <p className="text-sm text-slate-500 mb-4">{error.message}</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Badge size="lg" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {pageWidgets.length} widget{pageWidgets.length !== 1 ? 's' : ''}
          </Badge>
          {pages.length > 1 && (
            <Badge size="sm" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {pages.length} pages
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Refresh dashboard & reload data">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetch();
                autoFetchedPageRef.current = null;
                clearResults();
                if (pageWidgets.length > 0) executeAll(pageWidgets);
              }}
              disabled={executing}
              className="gap-1.5"
            >
              {executing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </Tooltip>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSnapshot}
            disabled={snapshotting}
            className="gap-1.5"
          >
            {snapshotting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
            ) : (
              <><Camera className="h-3.5 w-3.5" /> Snapshot</>
            )}
          </Button>
        </div>
      </div>

      {/* Page Tabs */}
      <PageTabs
        projectId={projectId}
        pages={simplifiedPages}
        activePageId={activePageId}
        onPageSelect={handlePageSelect}
        onPagesChange={handlePagesChange}
      />

      {/* Filter Bar */}
      <FilterBar
        projectId={projectId}
        pageId={activePageId}
        filters={allFilters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Dashboard Grid */}
      {activePageId && (
        <DashboardGrid
          widgets={pageWidgets}
          widgetResults={results}
          executingWidgetId={executingWidgetId}
          onConfigureWidget={handleConfigureWidget}
          onDeleteWidget={handleDeleteWidget}
          onExecuteSingleWidget={handleExecuteSingle}
          onAddWidget={() => setShowAddWidget(true)}
          onLayoutChange={handleLayoutChange}
        />
      )}

      {/* Add Widget Panel */}
      {activePageId && (
        <AddWidgetPanel
          projectId={projectId}
          pageId={activePageId}
          existingWidgets={pageWidgets}
          isOpen={showAddWidget}
          onClose={() => setShowAddWidget(false)}
          onWidgetAdded={handleWidgetAdded}
        />
      )}

      {/* Edit Chart Widget → ChartConfigModal */}
      {editingWidget && editingWidget.widget_type === 'chart' && editingWidget.chart_config && (
        <ChartConfigModal
          isOpen
          onClose={() => setEditingWidget(null)}
          onSave={handleSaveChartConfig}
          initialConfig={toComponentConfig(editingWidget)}
          chartType={editingWidget.chart_type || undefined}
        />
      )}

      {/* Edit KPI Card → KpiCardConfigModal */}
      {editingWidget && editingWidget.widget_type === 'kpi_card' && (
        <KpiCardConfigModal
          isOpen
          onClose={() => setEditingWidget(null)}
          onSave={handleSaveDataWidgetConfig}
          initialConfig={{
            title: editingWidget.title || '',
            chartConfig: editingWidget.chart_config || undefined,
          }}
        />
      )}

      {/* Edit Data Table → TableConfigModal */}
      {editingWidget && editingWidget.widget_type === 'table' && (
        <TableConfigModal
          isOpen
          onClose={() => setEditingWidget(null)}
          onSave={handleSaveDataWidgetConfig}
          initialConfig={{
            title: editingWidget.title || '',
            chartConfig: editingWidget.chart_config || undefined,
          }}
        />
      )}
    </div>
  );
}
