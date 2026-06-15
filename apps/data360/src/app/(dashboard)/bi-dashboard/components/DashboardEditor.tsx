'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Camera, Download, Loader2, RefreshCw, XCircle, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { normalizeChartId } from './reporting-catalog-grounding';
import DrillThroughPanel from './DrillThroughPanel';
import { useDashboard } from '../hooks/useDashboard';
import { useExecuteDashboard } from '../hooks/useExecuteDashboard';
import { useTrackEvent } from '@/hooks/useTrackEvent';

import PageTabs from './PageTabs';
import DashboardGrid from './DashboardGrid';
import SmartFilterBar from './SmartFilterBar';
import AddWidgetPanel from './AddChartPanel';
import ChartPaletteRail from './ChartPaletteRail';
import BiSmartRightBar, { type BiPanelSection, type AiProposal } from './BiSmartRightBar';
//import DashboardTemplates from './DashboardTemplates';
//import type { DashboardTemplate } from './DashboardTemplates';
import type { AppliedFilter } from '../hooks/useSmartFilters';

import {
  updateWidget,
  deleteWidget as deleteWidgetApi,
  createWidget,
  nlToChart,
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
  FullDashboardPage,
  BIDashboardChartConfig,
  DashboardChartType,
  WidgetType,
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

/**
 * Defensively turn the loose chart_config returned by POST /bi-dashboard/nl-to-chart
 * into a BIDashboardChartConfig, falling back to the dashboard's default db/schema.
 */
function nlConfigToChartConfig(
  raw: Record<string, unknown>,
  defaults: { database?: string | null; schema?: string | null },
): BIDashboardChartConfig {
  const measuresRaw = raw.measures ?? raw.suggestedMeasures ?? raw.y;
  const measures = Array.isArray(measuresRaw)
    ? measuresRaw
        .map((m) =>
          typeof m === 'string'
            ? { column: m, aggregator: 'SUM' }
            : m && typeof m === 'object' && 'column' in m
              ? {
                  column: String((m as { column: unknown }).column),
                  aggregator: String((m as { aggregator?: unknown }).aggregator || 'SUM'),
                }
              : null,
        )
        .filter((m): m is { column: string; aggregator: string } => !!m && !!m.column)
    : typeof measuresRaw === 'string'
      ? [{ column: measuresRaw, aggregator: 'SUM' }]
      : [];

  const dimRaw = raw.x ?? raw.dimension ?? raw.suggestedDimension ?? raw.groupBy;
  const x =
    typeof dimRaw === 'string'
      ? dimRaw
      : Array.isArray(dimRaw) && typeof dimRaw[0] === 'string'
        ? (dimRaw[0] as string)
        : null;

  const groupByRaw = raw.groupBy;
  const groupBy = Array.isArray(groupByRaw)
    ? groupByRaw.filter((g): g is string => typeof g === 'string')
    : x
      ? [x]
      : [];

  return {
    database: String(raw.database || defaults.database || ''),
    schema: String(raw.schema || defaults.schema || ''),
    table: String(raw.table || ''),
    x,
    measures,
    filters: [],
    groupBy,
    limit: typeof raw.limit === 'number' ? raw.limit : null,
  };
}

/** Stack a freshly added widget below the existing ones (mirrors ChartPaletteRail). */
function nextWidgetPosition(widgets: DashboardWidget[]): { x: number; y: number } {
  if (widgets.length === 0) return { x: 0, y: 0 };
  return { x: 0, y: Math.max(...widgets.map((w) => w.position_y + w.height)) };
}

export default function DashboardEditor({ projectId, projectName }: DashboardEditorProps) {
  // Fire-and-forget analytics (R11/H10). The hook also auto-emits a PAGE_VIEW
  // for this per-project route; the explicit mount event below adds projectId.
  const { trackFeatureClick, trackTabSwitch } = useTrackEvent();
  const { data: dashboard, loading, error, refetch } = useDashboard(projectId);
  const {
    executing, executingWidgetId, results, errors,
    statuses, lastSummary,
    executeAll, executeSingle, clearResults, setWidgetResult,
  } = useExecuteDashboard(projectId);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

  // Smart filters — auto-detected from the page's tables (replaces the two dead
  // bars). Selections are injected per-widget into the render payload.
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);

  // Local state derived from dashboard data
  const [pages, setPages] = useState<FullDashboardPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [showAddWidget, setShowAddWidget] = useState(false);
  // ChartPaletteRail collapse state — persisted to localStorage so the
  // user's choice survives page reloads.
  const [paletteCollapsed, setPaletteCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('bi-palette-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  // Add flow — a palette tile was clicked; its config form is hosted in the
  // right panel (BiSmartRightBar) exactly like the edit flow. Mutually
  // exclusive with editingWidget.
  const [addDraft, setAddDraft] = useState<{
    widgetType: WidgetType;
    chartType: DashboardChartType | null;
  } | null>(null);
  const [snapshotting, setSaving] = useState(false);
  const [crossWidgetFilter, setCrossWidgetFilter] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [drillWidget, setDrillWidget] = useState<DashboardWidget | null>(null);

  // BiSmartRightBar — docked right panel that hosts widget config (no popup) +
  // runs / schedule / share / AI. Section + collapse persist to versioned keys.
  const [panelSection, setPanelSection] = useState<BiPanelSection>(() => {
    if (typeof window === 'undefined') return 'configure';
    try {
      return (window.localStorage.getItem('data360.bi.panel.section.v1') as BiPanelSection) || 'configure';
    } catch {
      return 'configure';
    }
  });
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('data360.bi.panel.collapsed.v1') === '1';
    } catch {
      return false;
    }
  });
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null);

  const setPaletteCollapsedPersist = useCallback((c: boolean) => {
    setPaletteCollapsed(c);
    try {
      window.localStorage.setItem('bi-palette-collapsed', c ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  // "Hidable bars when click on center" — clicking the empty canvas toggles both
  // rails so the charts can run full-width, then brings them back on a 2nd click.
  const handleCanvasBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return; // only the empty canvas, not a widget
      const anyOpen = !panelCollapsed || !paletteCollapsed;
      setPanelCollapsed(anyOpen);
      setPaletteCollapsedPersist(anyOpen);
    },
    [panelCollapsed, paletteCollapsed, setPaletteCollapsedPersist],
  );

  // NL-to-chart bar (POST /bi-dashboard/nl-to-chart → createWidget on the active page)
  const [nlQuestion, setNlQuestion] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [nlUnavailable, setNlUnavailable] = useState(false);

  // Pending layout changes for batch saving
  const [pendingLayoutChanges, setPendingLayoutChanges] = useState<Record<string, {x: number; y: number; w: number; h: number}>>({});
  const [hasUnsavedLayoutChanges, setHasUnsavedLayoutChanges] = useState(false);

  // Page-view on mount (fire-and-forget, never blocks render).
  useEffect(() => {
    trackFeatureClick('bi_editor_view', { projectId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync from API data
  useEffect(() => {
    if (!dashboard) return;
    setPages(dashboard.pages || []);
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

  // Default data source for the ADD flow — the most common complete
  // db/schema/table among this page's widgets. Passed to the add-mode config
  // forms so Database/Schema/Table (and their column lists) are pre-filled
  // instead of starting blank. Undefined when no widget has a complete source.
  const defaultSource = useMemo<{ database: string; schema: string; table: string } | undefined>(() => {
    const counts = new Map<string, { database: string; schema: string; table: string; n: number }>();
    for (const w of pageWidgets) {
      const c = w.chart_config;
      if (!c?.database || !c?.schema || !c?.table) continue;
      const key = `${c.database} ${c.schema} ${c.table}`;
      const entry = counts.get(key);
      if (entry) entry.n += 1;
      else counts.set(key, { database: c.database, schema: c.schema, table: c.table, n: 1 });
    }
    let best: { database: string; schema: string; table: string; n: number } | undefined;
    for (const v of counts.values()) {
      if (!best || v.n > best.n) best = v;
    }
    return best ? { database: best.database, schema: best.schema, table: best.table } : undefined;
  }, [pageWidgets]);

  // Rule-based AI proposals for the right panel — deterministic, so the "AI"
  // section never errors. They reference the page's real tables when present.
  const aiProposals = useMemo<AiProposal[]>(() => {
    const tables = [
      ...new Set(pageWidgets.map((w) => w.chart_config?.table).filter(Boolean) as string[]),
    ];
    if (pageWidgets.length === 0) {
      return [
        {
          id: 'first-chart',
          title: 'Generate your first chart',
          rationale: 'Describe what you want in the AI bar above — e.g. “monthly revenue by region” — and it builds a ready chart.',
        },
        {
          id: 'scan-source',
          title: 'Pick a data source to chart',
          rationale: 'Scan your tables and add one from the left palette to start visualizing.',
          href: '/explore-design',
          hrefLabel: 'Open Explore',
        },
      ];
    }
    return [
      {
        id: 'enrich',
        title: 'Enrich with a related source',
        rationale: tables.length
          ? `This page reports on ${tables.join(', ')}. Bring in a related table to deepen the analysis.`
          : 'Scan more tables to enrich this dashboard.',
        href: '/explore-design',
        hrefLabel: 'Open Explore',
      },
      {
        id: 'rls',
        title: 'Secure these reports (RLS)',
        rationale: 'Apply row-level security so each viewer only sees the rows they’re entitled to.',
        href: '/governance/policies',
        hrefLabel: 'Open Policies',
      },
      {
        id: 'snapshot',
        title: 'Save a restorable version',
        rationale: 'Snapshot the current design from the Runs section so you can roll back later.',
      },
    ];
  }, [pageWidgets]);

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
      trackTabSwitch(pageId);
    },
    [clearResults, trackTabSwitch]
  );

  // Execute single widget with the active smart filters
  const handleExecuteSingle = useCallback(
    (widget: DashboardWidget) => {
      executeSingle(widget, appliedFilters);
    },
    [executeSingle, appliedFilters]
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

  // Configure widget — focus the right panel's Configure section (no popup)
  const handleConfigureWidget = useCallback((widget: DashboardWidget) => {
    setEditingWidget(widget);
    setAddDraft(null);
    setPanelSection('configure');
    setPanelCollapsed(false);
  }, []);

  // Start adding a widget from the left palette — host its config in the right
  // panel (Configure section), mirroring the edit flow. No popup.
  const handleStartAdd = useCallback(
    (widgetType: WidgetType, chartType: DashboardChartType | null) => {
      setAddDraft({ widgetType, chartType });
      setEditingWidget(null);
      setPanelSection('configure');
      setPanelCollapsed(false);
    },
    [],
  );

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
    // Single chokepoint for every add path (palette, panel, chart/kpi/table
    // config, NL-to-chart) — fire-and-forget analytics.
    trackFeatureClick('bi_widget_added', {
      widget_type: widget.widget_type,
      chart_type: widget.chart_type,
    });
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
  }, [activePageId, setWidgetResult, trackFeatureClick]);

  // Save a NEW chart widget from the docked Configure form (add flow). The
  // ChartConfigModal hands back a ComponentConfig (same shape as the edit
  // flow's handleSaveChartConfig), so we reuse toChartConfig here.
  const handleAddChartSave = useCallback(
    async (config: ComponentConfig) => {
      if (!activePageId || !addDraft) return;
      const chartConfig = toChartConfig(config);
      const title = config.title || 'Untitled chart';
      const pos = nextWidgetPosition(pageWidgets);
      try {
        const response = await createWidget(projectId, {
          page_id: activePageId,
          widget_type: 'chart',
          chart_type: addDraft.chartType,
          title,
          chart_config: chartConfig,
          position_x: pos.x,
          position_y: pos.y,
          width: 12,
          height: 4,
        });
        handleWidgetAdded(
          {
            widget_id: response.widget_id,
            page_id: activePageId,
            widget_type: 'chart',
            chart_type: addDraft.chartType,
            title,
            chart_config: chartConfig,
            position_x: pos.x,
            position_y: pos.y,
            width: 12,
            height: 4,
          },
          config.prefetched?.data,
        );
        setAddDraft(null);
        toast.success(`${title} added`);
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [projectId, activePageId, addDraft, pageWidgets, handleWidgetAdded],
  );

  // Save a NEW KPI / Table widget from the docked Configure form (add flow).
  // The Kpi/Table modals hand back { title, chartConfig, prefetchedData } — the
  // SAME shape the edit flow's handleSaveDataWidgetConfig consumes — so we pass
  // chartConfig straight through (no toChartConfig conversion).
  const handleAddDataWidgetSave = useCallback(
    async (result: { title: string; chartConfig: BIDashboardChartConfig; prefetchedData?: Record<string, unknown>[] }) => {
      if (!activePageId || !addDraft) return;
      const isKpi = addDraft.widgetType === 'kpi_card';
      const width = isKpi ? 4 : 12;
      const height = isKpi ? 2 : 4;
      const pos = nextWidgetPosition(pageWidgets);
      try {
        const response = await createWidget(projectId, {
          page_id: activePageId,
          widget_type: addDraft.widgetType,
          chart_type: null,
          title: result.title,
          chart_config: result.chartConfig,
          position_x: pos.x,
          position_y: pos.y,
          width,
          height,
        });
        handleWidgetAdded(
          {
            widget_id: response.widget_id,
            page_id: activePageId,
            widget_type: addDraft.widgetType,
            chart_type: null,
            title: result.title,
            chart_config: result.chartConfig,
            position_x: pos.x,
            position_y: pos.y,
            width,
            height,
          },
          result.prefetchedData,
        );
        setAddDraft(null);
        toast.success(`${result.title} added`);
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [projectId, activePageId, addDraft, pageWidgets, handleWidgetAdded],
  );

  // NL-to-chart: turn a plain-language question into a chart widget on the
  // active page. POST /bi-dashboard/nl-to-chart → createWidget → append (the
  // auto-fetch effect then executes & renders it). Honest about backends that
  // don't expose the endpoint (isUnavailable → quiet disabled state).
  const handleNlGenerate = useCallback(async () => {
    const q = nlQuestion.trim();
    if (!q || !activePageId || nlLoading) return;
    setNlLoading(true);
    setNlError(null);
    try {
      const res = await nlToChart(
        q,
        dashboard?.default_database || undefined,
        dashboard?.default_schema || undefined,
      );
      const cfg = (res?.chart_config ?? null) as Record<string, unknown> | null;
      if (!cfg || Object.keys(cfg).length === 0) {
        setNlError(
          "Couldn't turn that into a chart — try rephrasing, or name the table and measure explicitly.",
        );
        return;
      }
      const chartType = normalizeChartId(
        cfg.chartType ?? cfg.chart_type ?? cfg.type,
        'bar',
      ) as DashboardChartType;
      const chartConfig = nlConfigToChartConfig(cfg, {
        database: dashboard?.default_database,
        schema: dashboard?.default_schema,
      });
      const title = q.length > 60 ? `${q.slice(0, 57)}…` : q;
      const pos = nextWidgetPosition(pageWidgets);
      const response = await createWidget(projectId, {
        page_id: activePageId,
        widget_type: 'chart',
        chart_type: chartType,
        title,
        chart_config: chartConfig,
        position_x: pos.x,
        position_y: pos.y,
        width: 12,
        height: 4,
      });
      handleWidgetAdded({
        widget_id: response.widget_id,
        page_id: activePageId,
        widget_type: 'chart',
        chart_type: chartType,
        title,
        chart_config: chartConfig,
        position_x: pos.x,
        position_y: pos.y,
        width: 12,
        height: 4,
      });
      setNlQuestion('');
      toast.success('Chart generated from your question');
    } catch (err) {
      if (isUnavailable(err)) {
        setNlUnavailable(true);
      } else {
        setNlError(getApiErrorMessage(err));
      }
    } finally {
      setNlLoading(false);
    }
  }, [nlQuestion, activePageId, nlLoading, dashboard, pageWidgets, projectId, handleWidgetAdded]);

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

  // Smart filters applied — store and trigger a re-fetch with the new WHERE clauses.
  const handleFiltersApply = useCallback((filters: AppliedFilter[]) => {
    setAppliedFilters(filters);
    autoFetchedKeyRef.current = null;
  }, []);

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
      setLastSnapshotId(res.version_id);
      trackFeatureClick('bi_dashboard_snapshot', { version_id: res.version_id });
      toast.success(`Snapshot saved (${res.version_id})`);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [projectId, trackFeatureClick]);

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

  // Track which page+filters we already auto-fetched to avoid duplicate calls
  const autoFetchedKeyRef = useRef<string | null>(null);

  // Build a stable key from page + active filters to detect changes
  const fetchKey = useMemo(
    () => `${activePageId}|${JSON.stringify(appliedFilters)}`,
    [activePageId, appliedFilters]
  );

  // Auto-fetch data for widgets when the page loads or filters change
  useEffect(() => {
    if (
      activePageId &&
      pageWidgets.length > 0 &&
      !executing &&
      autoFetchedKeyRef.current !== fetchKey
    ) {
      autoFetchedKeyRef.current = fetchKey;
      executeAll(pageWidgets, appliedFilters);
    }
  }, [fetchKey, pageWidgets.length, executing, executeAll, appliedFilters]);

  // Handle manual refresh (for auto-refresh timer and refresh button)
  const handleRefreshNow = useCallback(() => {
    autoFetchedKeyRef.current = null;
    clearResults();
    if (pageWidgets.length > 0) {
      executeAll(pageWidgets, appliedFilters);
    }
  }, [pageWidgets, appliedFilters, clearResults, executeAll]);

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

      {/* Page Tabs */}
      <PageTabs
        projectId={projectId}
        pages={simplifiedPages}
        activePageId={activePageId}
        onPageSelect={handlePageSelect}
        onPagesChange={handlePagesChange}
      />

      {/* Smart Filters — auto-detected date & dimension columns from this page's
          tables. Replaces the manual FilterBar (filters never reached render) and
          the TimeIntelligenceBar (time filtering was a no-op). */}
      <SmartFilterBar
        widgets={pageWidgets}
        onChange={handleFiltersApply}
        onRefreshNow={handleRefreshNow}
        executing={executing}
      />

      {/* NL-to-chart bar — POST /bi-dashboard/nl-to-chart, appends a widget to the active page */}
      {activePageId && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <Sparkles className="h-4 w-4 shrink-0 text-cyan-500" />
            {nlUnavailable ? (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                AI chart generation isn&apos;t available on this backend yet.
              </span>
            ) : (
              <>
                <input
                  value={nlQuestion}
                  onChange={(e) => setNlQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleNlGenerate();
                    }
                  }}
                  placeholder={'Ask AI to build a chart — e.g. "Monthly revenue by region"'}
                  aria-label="Describe the chart you want the AI to generate"
                  disabled={nlLoading}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-60 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => void handleNlGenerate()}
                  disabled={!nlQuestion.trim() || nlLoading}
                  aria-busy={nlLoading}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-40"
                >
                  {nlLoading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Generate</>
                  )}
                </button>
              </>
            )}
          </div>
          {nlError && (
            <p className="px-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {nlError}
            </p>
          )}
        </div>
      )}

      {/* Template Gallery (shown when page has no widgets)
      {activePageId && pageWidgets.length === 0 && (
        <div className="mt-4">
          <DashboardTemplates onApplyTemplate={handleApplyTemplate} />
        </div>
      )}*/}

      {/* Dashboard area: ChartPaletteRail (left, add charts) + Grid (center,
          click-empty-canvas to hide both rails) + BiSmartRightBar (right, hosts
          widget config / runs / schedule / share / AI — no popups). */}
      {activePageId && (
        <div className="flex min-h-[480px] gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <ChartPaletteRail
            projectId={projectId}
            pageId={activePageId}
            existingWidgets={pageWidgets}
            onWidgetAdded={handleWidgetAdded}
            onStartAdd={handleStartAdd}
            collapsed={paletteCollapsed}
            onCollapsedChange={setPaletteCollapsedPersist}
          />
          <div
            data-dashboard-grid
            role="tabpanel"
            id={`tabpanel-${activePageId}`}
            aria-label={activePage?.title || 'Dashboard page'}
            className="min-w-0 flex-1 overflow-auto"
            onClick={handleCanvasBackgroundClick}
          >
            <DashboardGrid
              widgets={pageWidgets}
              widgetResults={results}
              previousWidgetResults={undefined}
              widgetErrors={errors}
              compareEnabled={false}
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
          <BiSmartRightBar
            projectId={projectId}
            projectName={projectName}
            projectStatus="draft"
            pageCount={pages.length}
            widgetCount={pageWidgets.length}
            section={panelSection}
            onSectionChange={setPanelSection}
            collapsed={panelCollapsed}
            onCollapsedChange={setPanelCollapsed}
            editingWidget={editingWidget}
            configSlot={
              editingWidget && editingWidget.widget_type === 'chart' && editingWidget.chart_config ? (
                <ChartConfigModal
                  variant="panel"
                  isOpen
                  onClose={() => setEditingWidget(null)}
                  onSave={handleSaveChartConfig}
                  initialConfig={toComponentConfig(editingWidget)}
                  chartType={editingWidget.chart_type || undefined}
                />
              ) : editingWidget && editingWidget.widget_type === 'kpi_card' ? (
                <KpiCardConfigModal
                  variant="panel"
                  isOpen
                  onClose={() => setEditingWidget(null)}
                  onSave={handleSaveDataWidgetConfig}
                  initialConfig={{
                    title: editingWidget.title || '',
                    chartConfig: editingWidget.chart_config || undefined,
                  }}
                />
              ) : editingWidget && editingWidget.widget_type === 'table' ? (
                <TableConfigModal
                  variant="panel"
                  isOpen
                  onClose={() => setEditingWidget(null)}
                  onSave={handleSaveDataWidgetConfig}
                  initialConfig={{
                    title: editingWidget.title || '',
                    chartConfig: editingWidget.chart_config || undefined,
                  }}
                />
              ) : addDraft && addDraft.widgetType === 'chart' ? (
                <ChartConfigModal
                  key="add-chart"
                  variant="panel"
                  isOpen
                  onClose={() => setAddDraft(null)}
                  onSave={handleAddChartSave}
                  chartType={addDraft.chartType || undefined}
                  defaultSource={defaultSource}
                />
              ) : addDraft && addDraft.widgetType === 'kpi_card' ? (
                <KpiCardConfigModal
                  key="add-kpi"
                  variant="panel"
                  isOpen
                  onClose={() => setAddDraft(null)}
                  onSave={handleAddDataWidgetSave}
                  defaultSource={defaultSource}
                />
              ) : addDraft && addDraft.widgetType === 'table' ? (
                <TableConfigModal
                  key="add-table"
                  variant="panel"
                  isOpen
                  onClose={() => setAddDraft(null)}
                  onSave={handleAddDataWidgetSave}
                  defaultSource={defaultSource}
                />
              ) : undefined
            }
            onSnapshot={handleSnapshot}
            snapshotting={snapshotting}
            lastSnapshotId={lastSnapshotId}
            onRefreshNow={handleRefreshNow}
            executing={executing}
            aiProposals={aiProposals}
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

        {/* Widget config (chart / kpi / table) now lives in BiSmartRightBar's
            Configure section (variant="panel") — no popups. */}

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
