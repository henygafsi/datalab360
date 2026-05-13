'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Camera, Download, Loader2, RefreshCw, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import DrillThroughPanel from './DrillThroughPanel';
import { useDashboard } from '../hooks/useDashboard';
import { useExecuteDashboard } from '../hooks/useExecuteDashboard';

import PageTabs from './PageTabs';
import DashboardGrid from './DashboardGrid';
import FilterBar from './FilterBar';
import AddWidgetPanel from './AddChartPanel';
//import DashboardTemplates from './DashboardTemplates';
//import type { DashboardTemplate } from './DashboardTemplates';
import TimeIntelligenceBar, {
  createDefaultTimeState,
  computePreviousRange,
} from './TimeIntelligenceBar';
import type { TimeIntelligenceState } from './TimeIntelligenceBar';

import {
  updateWidget,
  deleteWidget as deleteWidgetApi,
  saveSnapshot,
  exportDashboard,
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
    executing, executingWidgetId, results, previousResults, errors,
    statuses, lastSummary,
    executeAll, executeSingle, clearResults, setWidgetResult,
  } = useExecuteDashboard(projectId);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

  // Time intelligence state
  const [timeState, setTimeState] = useState<TimeIntelligenceState>(createDefaultTimeState);

  // Local state derived from dashboard data
  const [pages, setPages] = useState<FullDashboardPage[]>([]);
  const [globalFilters, setGlobalFilters] = useState<DashboardFilter[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [snapshotting, setSaving] = useState(false);
  const [crossWidgetFilter, setCrossWidgetFilter] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [drillWidget, setDrillWidget] = useState<DashboardWidget | null>(null);
  
  // Pending layout changes for batch saving
  const [pendingLayoutChanges, setPendingLayoutChanges] = useState<Record<string, {x: number; y: number; w: number; h: number}>>({});
  const [hasUnsavedLayoutChanges, setHasUnsavedLayoutChanges] = useState(false);

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

  // Handle page switch — clear old results and reset auto-fetch key
  const handlePageSelect = useCallback(
    (pageId: string) => {
      setActivePageId(pageId);
      clearResults();
      autoFetchedKeyRef.current = null;
    },
    [clearResults]
  );

  // Execute single widget with current time range
  const handleExecuteSingle = useCallback(
    (widget: DashboardWidget) => {
      executeSingle(widget, timeState.range);
    },
    [executeSingle, timeState.range]
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

  // Apply template — create placeholder widgets from template config
   /**
 const handleApplyTemplate = useCallback(
    (template: DashboardTemplate) => {
      if (!activePageId) return;
      const templateWidgets: DashboardWidget[] = template.widgets.map((tw, i) => {
        const yOffset = i * 4; // stack vertically
        return {
          widget_id: `template-${template.id}-${i}-${Date.now()}`,
          page_id: activePageId,
          widget_type: tw.widgetType,
          chart_type: tw.config.chartType || null,
          title: tw.title,
          chart_config: {
            database: '',
            schema: '',
            table: '',
            x: tw.config.suggestedDimension || null,
            measures: (tw.config.suggestedMeasures || []).map((col) => ({
              column: col,
              aggregator: 'SUM',
            })),
            filters: [],
            groupBy: [],
            limit: null,
          },
          position_x: 0,
          position_y: yOffset,
          width: tw.width,
          height: tw.height,
        };
      });

      setPages((prev) =>
        prev.map((p) =>
          p.page_id === activePageId
            ? { ...p, widgets: [...p.widgets, ...templateWidgets] }
            : p
        )
      );

      toast.success(`Applied "${template.name}" template with ${template.widgets.length} widgets. Configure each widget's data source.`);
    },
    [activePageId]
  );**/

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

  // Cross-widget filter: when a chart element is clicked, filter other widgets
  const handleCrossWidgetFilter = useCallback((filterKey: string, filterValue: string) => {
    setCrossWidgetFilter(prev => {
      // Toggle off if same value clicked again
      if (prev[filterKey] === filterValue) {
        const next = { ...prev };
        delete next[filterKey];
        return next;
      }
      return { ...prev, [filterKey]: filterValue };
    });
  }, []);

  const clearCrossWidgetFilter = useCallback(() => {
    setCrossWidgetFilter({});
  }, []);

  // Track which page+timeRange we already auto-fetched to avoid duplicate calls
  const autoFetchedKeyRef = useRef<string | null>(null);

  // Build a stable key from page + time range to detect changes
  const fetchKey = useMemo(
    () => `${activePageId}|${timeState.range.from}|${timeState.range.to}|${timeState.compareEnabled}`,
    [activePageId, timeState.range.from, timeState.range.to, timeState.compareEnabled]
  );

  // Auto-fetch data for widgets when page loads or time range changes
  useEffect(() => {
    if (
      activePageId &&
      pageWidgets.length > 0 &&
      !executing &&
      autoFetchedKeyRef.current !== fetchKey
    ) {
      autoFetchedKeyRef.current = fetchKey;
      const prevRange = timeState.compareEnabled ? computePreviousRange(timeState.range) : null;
      executeAll(pageWidgets, timeState.range, prevRange);
    }
  }, [fetchKey, pageWidgets.length, executing, executeAll, timeState]);

  // Handle time state change — trigger re-fetch
  const handleTimeStateChange = useCallback(
    (newState: TimeIntelligenceState) => {
      setTimeState(newState);
      // Reset auto-fetch key so the effect will re-trigger
      autoFetchedKeyRef.current = null;
    },
    []
  );

  // Handle manual refresh (for auto-refresh timer and refresh button)
  const handleRefreshNow = useCallback(() => {
    autoFetchedKeyRef.current = null;
    clearResults();
    if (pageWidgets.length > 0) {
      const prevRange = timeState.compareEnabled ? computePreviousRange(timeState.range) : null;
      executeAll(pageWidgets, timeState.range, prevRange);
    }
  }, [pageWidgets, timeState, clearResults, executeAll]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 animate-pulse" role="status" aria-label="Loading dashboard widgets">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        ))}
        <span className="sr-only">Loading dashboard widgets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 dark:text-red-400 font-medium mb-2">Failed to load dashboard</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error.message}</p>
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
          {lastSummary && lastSummary.total > 0 && (() => {
            const { ok, empty, errored, mismatched, total } = lastSummary;
            const tone =
              errored > 0 ? 'red'
              : (mismatched > 0 || empty > 0) ? 'amber'
              : 'green';
            const toneClasses: Record<string, string> = {
              green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800',
              amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
              red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
            };
            const dotColors: Record<string, string> = {
              green: 'bg-green-500',
              amber: 'bg-amber-500',
              red: 'bg-red-500',
            };
            const label =
              errored > 0 ? `${errored}/${total} errored`
              : mismatched > 0 ? `${mismatched}/${total} need config`
              : empty > 0 ? `${ok}/${total} with data`
              : `${ok}/${total} loaded`;
            return (
              <button
                type="button"
                onClick={() => setStatusDrawerOpen(true)}
                aria-label={`Widget render status — ${label}. Click for details.`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${toneClasses[tone]} hover:opacity-90`}
              >
                <span className={`w-2 h-2 rounded-full ${dotColors[tone]}`} />
                {label}
              </button>
            );
          })()}
          {Object.keys(crossWidgetFilter).length > 0 && (
            <div className="flex items-center gap-2">
              {Object.entries(crossWidgetFilter).map(([col, val]) => (
                <Badge key={col} size="sm" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 gap-1">
                  {col}: {val}
                  <button onClick={() => setCrossWidgetFilter(prev => { const n = { ...prev }; delete n[col]; return n; })} className="ml-1 hover:text-purple-900 dark:hover:text-purple-200">
                    <XCircle className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button variant="text" size="sm" onClick={clearCrossWidgetFilter} className="text-xs text-purple-600 dark:text-purple-400">
                Clear All
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Refresh dashboard & reload data">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetch();
                handleRefreshNow();
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

           <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={isExporting}
            onClick={async () => {
              if (isExporting) return;
              setIsExporting(true);
              try {
                const blob = await exportDashboard(projectId);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dashboard-${projectId}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success('Dashboard exported');
              } catch (err) {
                toast.error(getApiErrorMessage(err));
              } finally {
                setIsExporting(false);
              }
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export JSON
          </Button>
        </div>
      </div>

      {/* Time Intelligence Bar */}
      <TimeIntelligenceBar
        state={timeState}
        onChange={handleTimeStateChange}
        onRefreshNow={handleRefreshNow}
        executing={executing}
      />

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

      {/* Template Gallery (shown when page has no widgets) 
      {activePageId && pageWidgets.length === 0 && (
        <div className="mt-4">
          <DashboardTemplates onApplyTemplate={handleApplyTemplate} />
        </div>
      )}*/}

      {/* Dashboard Grid */}
      {activePageId && (
        <div data-dashboard-grid role="tabpanel" id={`tabpanel-${activePageId}`} aria-label={activePage?.title || 'Dashboard page'}>
          <DashboardGrid
            widgets={pageWidgets}
            widgetResults={results}
            previousWidgetResults={timeState.compareEnabled ? previousResults : undefined}
            widgetErrors={errors}
            compareEnabled={timeState.compareEnabled}
            executingWidgetId={executingWidgetId}
            onConfigureWidget={handleConfigureWidget}
            onDeleteWidget={handleDeleteWidget}
            onExecuteSingleWidget={handleExecuteSingle}
            onAddWidget={() => setShowAddWidget(true)}
            onLayoutChange={handleLayoutChange}
            crossWidgetFilter={crossWidgetFilter}
            onCrossWidgetFilter={handleCrossWidgetFilter}
            onDrillThrough={(widget) => setDrillWidget(widget)}

          />
        </div>
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
        {/* Drill-through panel */}
      {drillWidget && (
        <DrillThroughPanel
          isOpen
          onClose={() => setDrillWidget(null)}
          dashboardId={projectId}
          widget={drillWidget}
        />
      )}

      {/* Widget render status drawer — opened by the status pill in the toolbar. */}
      {statusDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Widget render status"
          onClick={() => setStatusDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-md bg-white dark:bg-slate-900 shadow-xl h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Widget render status</h3>
              <button
                type="button"
                onClick={() => setStatusDrawerOpen(false)}
                aria-label="Close"
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <XCircle className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {Object.values(statuses).length === 0 && (
                <li className="p-4 text-sm text-slate-500 dark:text-slate-400">No widgets rendered yet.</li>
              )}
              {Object.values(statuses).map((s) => {
                const palette: Record<string, string> = {
                  ok: 'bg-green-500',
                  empty: 'bg-amber-500',
                  config_mismatch: 'bg-amber-500',
                  error: 'bg-red-500',
                };
                const labelMap: Record<string, string> = {
                  ok: 'Loaded',
                  empty: 'No data',
                  config_mismatch: 'Config mismatch',
                  error: 'Error',
                };
                return (
                  <li key={s.widget_id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${palette[s.status]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {s.title || s.widget_id}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {labelMap[s.status]} · {s.row_count} row{s.row_count === 1 ? '' : 's'}
                        </p>
                        {s.error && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400 break-words">
                            {s.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
