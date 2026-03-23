'use client';

import { useState, useCallback } from 'react';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import type { DashboardWidget } from '@/app/services/api/types';
import { getApiErrorMessage } from '@/lib/api-client';
import toast from 'react-hot-toast';
import type { TimeRange } from '../components/TimeIntelligenceBar';

interface WidgetDataResult {
  data: Record<string, unknown>[];
  query?: string;
}

/**
 * Build time range filters to inject into each request.
 * NOTE: Returns empty array because _TIME_RANGE_FROM/_TIME_RANGE_TO are sentinel
 * column names that do not exist in real Snowflake tables and cause SQL compilation
 * errors (invalid identifier). Time intelligence filtering is handled at the UI level.
 * When a widget's chart_config explicitly defines a date/timestamp column in its filters,
 * those are applied directly.
 */
function buildTimeFilters(_timeRange?: TimeRange): any[] {
  return [];
}

/** Build a fetchChartData-compatible request from a widget's chart_config */
function buildRequest(widget: DashboardWidget, timeRange?: TimeRange) {
  const cfg = widget.chart_config!;
  const timeFilters = buildTimeFilters(timeRange);

  // Table widgets use raw mode with columns array
  if (widget.widget_type === 'table' || cfg.mode === 'raw') {
    const existingFilters = Array.isArray(cfg.filters) ? cfg.filters : [];
    return {
      database: cfg.database,
      schema: cfg.schema,
      table: cfg.table,
      mode: 'raw' as const,
      columns: cfg.columns || [],
      filters: [...existingFilters, ...timeFilters] as any,
      limit: cfg.limit || 100,
    };
  }

  // Chart / KPI widgets use aggregate mode (default)
  const existingFilters = Array.isArray(cfg.filters) ? cfg.filters : [];
  return {
    database: cfg.database,
    schema: cfg.schema,
    table: cfg.table,
    x: cfg.x || undefined,
    measures: (cfg.measures || []).map((m) => ({
      column: m.column,
      aggregator: (m.aggregator || undefined) as any,
      seuils: m.seuils as any,
    })),
    filters: [...existingFilters, ...timeFilters] as any,
    groupBy: cfg.groupBy,
    limit: cfg.limit || undefined,
  };
}

export function useExecuteDashboard() {
  const [executing, setExecuting] = useState(false);
  const [executingWidgetId, setExecutingWidgetId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, WidgetDataResult>>({});
  const [previousResults, setPreviousResults] = useState<Record<string, WidgetDataResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Execute all data widgets on the current page.
   * For each widget with chart_config, POST /charts/data individually.
   * Optionally pass a timeRange to inject date filters, and previousTimeRange for comparison.
   */
  const executeAll = useCallback(async (
    widgets: DashboardWidget[],
    timeRange?: TimeRange,
    previousTimeRange?: TimeRange | null,
  ) => {
    const dataWidgets = widgets.filter(
      (w) => w.chart_config && ['chart', 'kpi_card', 'table'].includes(w.widget_type)
    );
    if (dataWidgets.length === 0) return;

    setExecuting(true);
    setErrors({});

    // console.log('[BI] executeAll — fetching data for', dataWidgets.length, 'widgets');
    // Pair each settled result with its widget so rejections can map back to a widget ID.
    const settled = await Promise.allSettled(
      dataWidgets.map(async (w) => {
        const req = buildRequest(w, timeRange);
        // console.log('[BI] fetchChartData request for', w.widget_id, w.widget_type, ':', req);
        try {
          const response = await fetchChartData(req);
          // console.log('[BI] fetchChartData response for', w.widget_id, ':', response.data?.length, 'rows');
          return { widgetId: w.widget_id, result: { data: response.data }, error: null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to load data';
          console.error('[BI] Widget fetch failed for', w.widget_id, ':', msg);
          // Return a sentinel so the widget resolves (no infinite spinner)
          return { widgetId: w.widget_id, result: { data: [] }, error: msg };
        }
      })
    );

    const newResults: Record<string, WidgetDataResult> = {};
    const newErrors: Record<string, string> = {};
    let successCount = 0;
    let failCount = 0;

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        newResults[s.value.widgetId] = s.value.result;
        if (s.value.error) {
          newErrors[s.value.widgetId] = s.value.error;
          failCount++;
        } else {
          successCount++;
        }
      } else {
        // Promise itself rejected (shouldn't happen with inner try-catch, but guard anyway)
        console.error('[BI] Unexpected Promise rejection:', s.reason);
        failCount++;
      }
    }

    setResults((prev) => ({ ...prev, ...newResults }));
    setErrors((prev) => ({ ...prev, ...newErrors }));

    if (failCount > 0) {
      toast.error(`${failCount} widget(s) failed to load data`);
    } else if (successCount > 0) {
      toast.success(`Loaded data for ${successCount} widget(s)`);
    }

    // Fetch comparison data for previous period if requested
    if (previousTimeRange) {
      const prevSettled = await Promise.allSettled(
        dataWidgets.map(async (w) => {
          const req = buildRequest(w, previousTimeRange);
          const response = await fetchChartData(req);
          return { widgetId: w.widget_id, result: { data: response.data } };
        })
      );
      const prevResults: Record<string, WidgetDataResult> = {};
      for (const s of prevSettled) {
        if (s.status === 'fulfilled') {
          prevResults[s.value.widgetId] = s.value.result;
        }
      }
      setPreviousResults(prevResults);
    } else {
      setPreviousResults({});
    }

    setExecuting(false);
  }, []);

  /**
   * Execute a single widget's chart data.
   */
  const executeSingle = useCallback(async (widget: DashboardWidget, timeRange?: TimeRange) => {
    if (!widget.chart_config) return;
    setExecutingWidgetId(widget.widget_id);
    try {
      const response = await fetchChartData(buildRequest(widget, timeRange));
      setResults((prev) => ({
        ...prev,
        [widget.widget_id]: { data: response.data },
      }));
      toast.success('Widget data loaded');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      setErrors((prev) => ({
        ...prev,
        [widget.widget_id]: getApiErrorMessage(err),
      }));
    } finally {
      setExecutingWidgetId(null);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults({});
    setPreviousResults({});
    setErrors({});
  }, []);

  /** Inject prefetched data for a widget (e.g. from ConfigurationModal) */
  const setWidgetResult = useCallback((widgetId: string, data: Record<string, unknown>[]) => {
    setResults((prev) => ({
      ...prev,
      [widgetId]: { data },
    }));
  }, []);

  return {
    executing,
    executingWidgetId,
    results,
    previousResults,
    errors,
    executeAll,
    executeSingle,
    clearResults,
    setWidgetResult,
  };
}
