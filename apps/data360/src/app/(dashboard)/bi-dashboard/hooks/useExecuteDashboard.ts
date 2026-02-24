'use client';

import { useState, useCallback } from 'react';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import type { DashboardWidget } from '@/app/services/api/types';
import { getApiErrorMessage } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface WidgetDataResult {
  data: Record<string, unknown>[];
  query?: string;
}

/** Build a fetchChartData-compatible request from a widget's chart_config */
function buildRequest(widget: DashboardWidget) {
  const cfg = widget.chart_config!;

  // Table widgets use raw mode with columns array
  if (widget.widget_type === 'table' || cfg.mode === 'raw') {
    return {
      database: cfg.database,
      schema: cfg.schema,
      table: cfg.table,
      mode: 'raw' as const,
      columns: cfg.columns || [],
      filters: cfg.filters as any,
      limit: cfg.limit || 100,
    };
  }

  // Chart / KPI widgets use aggregate mode (default)
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
    filters: cfg.filters as any,
    groupBy: cfg.groupBy,
    limit: cfg.limit || undefined,
  };
}

export function useExecuteDashboard() {
  const [executing, setExecuting] = useState(false);
  const [executingWidgetId, setExecutingWidgetId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, WidgetDataResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Execute all data widgets on the current page.
   * For each widget with chart_config, POST /charts/data individually.
   */
  const executeAll = useCallback(async (widgets: DashboardWidget[]) => {
    const dataWidgets = widgets.filter(
      (w) => w.chart_config && ['chart', 'kpi_card', 'table'].includes(w.widget_type)
    );
    if (dataWidgets.length === 0) return;

    setExecuting(true);
    setErrors({});

    console.log('[BI] executeAll — fetching data for', dataWidgets.length, 'widgets');
    const settled = await Promise.allSettled(
      dataWidgets.map(async (w) => {
        const req = buildRequest(w);
        console.log('[BI] fetchChartData request for', w.widget_id, w.widget_type, ':', req);
        const response = await fetchChartData(req);
        console.log('[BI] fetchChartData response for', w.widget_id, ':', response.data?.length, 'rows');
        return { widgetId: w.widget_id, result: { data: response.data } };
      })
    );

    const newResults: Record<string, WidgetDataResult> = {};
    const newErrors: Record<string, string> = {};
    let successCount = 0;
    let failCount = 0;

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        newResults[s.value.widgetId] = s.value.result;
        successCount++;
      } else {
        console.error('[BI] Widget fetch failed:', s.reason);
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

    setExecuting(false);
  }, []);

  /**
   * Execute a single widget's chart data.
   */
  const executeSingle = useCallback(async (widget: DashboardWidget) => {
    if (!widget.chart_config) return;
    setExecutingWidgetId(widget.widget_id);
    try {
      const response = await fetchChartData(buildRequest(widget));
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
    errors,
    executeAll,
    executeSingle,
    clearResults,
    setWidgetResult,
  };
}
