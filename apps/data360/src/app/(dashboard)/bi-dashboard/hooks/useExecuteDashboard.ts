'use client';

import { useState, useCallback } from 'react';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import { renderDashboard } from '@/app/services/api/biDashboardApi';
import type {
  DashboardWidget,
  WidgetRenderStatus,
  RenderWidgetRequest,
} from '@/app/services/api/types';
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

export interface WidgetStatusEntry {
  widget_id: string;
  status: WidgetRenderStatus;
  error: string | null;
  row_count: number;
  /** Optional widget title for display in the status drawer. */
  title?: string;
}

export interface RenderSummary {
  ok: number;
  empty: number;
  errored: number;
  mismatched: number;
  total: number;
}

export function useExecuteDashboard(projectId?: string) {
  const [executing, setExecuting] = useState(false);
  const [executingWidgetId, setExecutingWidgetId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, WidgetDataResult>>({});
  const [previousResults, setPreviousResults] = useState<Record<string, WidgetDataResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, WidgetStatusEntry>>({});
  const [lastSummary, setLastSummary] = useState<RenderSummary | null>(null);

  /**
   * Execute all data widgets on the current page.
   *
   * Uses POST /bi-dashboard/{projectId}/render (single round-trip, server-side
   * fan-out) when a projectId is supplied; falls back to N individual
   * /charts/data calls otherwise. The single call returns per-widget
   * {status, data, error}, which we surface as a status pill rather than a
   * lying "Loaded 8 widgets" success toast.
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

    const newResults: Record<string, WidgetDataResult> = {};
    const newErrors: Record<string, string> = {};
    const newStatuses: Record<string, WidgetStatusEntry> = {};
    let summary: RenderSummary = { ok: 0, empty: 0, errored: 0, mismatched: 0, total: 0 };

    if (projectId) {
      // Batched path — single POST, server fans out per-widget.
      const widgetTitles: Record<string, string | undefined> = Object.fromEntries(
        dataWidgets.map((w) => [w.widget_id, w.title || undefined])
      );
      const payload: RenderWidgetRequest[] = dataWidgets.map((w) => ({
        widget_id: w.widget_id,
        config: buildRequest(w, timeRange) as Record<string, unknown>,
      }));
      try {
        const resp = await renderDashboard(projectId, payload);
        summary = resp.summary;
        // Build a quick lookup from widget_id → expected measure/x columns so we
        // can post-hoc detect "SQL returned rows but the chart's expected column
        // isn't in the payload" (case (d) from the audit). The backend can't
        // catch this because the query itself succeeded.
        const widgetById = new Map(dataWidgets.map((w) => [w.widget_id, w]));
        for (const w of resp.widgets) {
          newResults[w.widget_id] = { data: w.data || [] };
          if (w.error) newErrors[w.widget_id] = w.error;
          let effectiveStatus = w.status;
          if (effectiveStatus === 'ok' && w.data && w.data.length > 0) {
            const widget = widgetById.get(w.widget_id);
            const cfg = widget?.chart_config;
            const expected: string[] = [];
            if (cfg?.x) expected.push(cfg.x);
            for (const m of cfg?.measures || []) {
              if (m?.column) expected.push(m.column);
            }
            if (expected.length > 0) {
              const keys = Object.keys(w.data[0] || {});
              const present = expected.some((c) =>
                keys.some((k) => k.toLowerCase() === c.toLowerCase()),
              );
              if (!present) {
                effectiveStatus = 'config_mismatch';
                // Reclassify against summary too so the pill stays honest.
                summary = { ...summary, ok: summary.ok - 1, mismatched: summary.mismatched + 1 };
                if (!newErrors[w.widget_id]) {
                  newErrors[w.widget_id] =
                    `Query returned columns [${keys.join(', ')}], chart expects [${expected.join(', ')}]`;
                }
              }
            }
          }
          newStatuses[w.widget_id] = {
            widget_id: w.widget_id,
            status: effectiveStatus,
            error: newErrors[w.widget_id] || w.error,
            row_count: w.row_count,
            title: widgetTitles[w.widget_id],
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to render dashboard';
        console.error('[BI] renderDashboard failed:', msg);
        // Mark every widget as errored so the UI never silently swallows the failure.
        for (const w of dataWidgets) {
          newResults[w.widget_id] = { data: [] };
          newErrors[w.widget_id] = msg;
          newStatuses[w.widget_id] = {
            widget_id: w.widget_id,
            status: 'error',
            error: msg,
            row_count: 0,
            title: w.title || undefined,
          };
        }
        summary = { ok: 0, empty: 0, errored: dataWidgets.length, mismatched: 0, total: dataWidgets.length };
        toast.error('Failed to render widgets');
      }
    } else {
      // Fallback path — keeps the hook usable in contexts without a projectId.
      const settled = await Promise.allSettled(
        dataWidgets.map(async (w) => {
          const req = buildRequest(w, timeRange);
          try {
            const response = await fetchChartData(req);
            return { widget: w, data: response.data ?? [], error: null as string | null };
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load data';
            console.error('[BI] Widget fetch failed for', w.widget_id, ':', msg);
            return { widget: w, data: [] as Record<string, unknown>[], error: msg };
          }
        })
      );
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          const { widget: w, data, error } = s.value;
          newResults[w.widget_id] = { data };
          let status: WidgetRenderStatus;
          if (error) {
            newErrors[w.widget_id] = error;
            const lowered = error.toLowerCase();
            status = (lowered.includes('invalid identifier') || lowered.includes('not found'))
              ? 'config_mismatch' : 'error';
          } else {
            status = data.length > 0 ? 'ok' : 'empty';
          }
          newStatuses[w.widget_id] = {
            widget_id: w.widget_id,
            status,
            error,
            row_count: data.length,
            title: w.title || undefined,
          };
          if (status === 'ok') summary.ok++;
          else if (status === 'empty') summary.empty++;
          else if (status === 'config_mismatch') summary.mismatched++;
          else summary.errored++;
        }
      }
      summary.total = dataWidgets.length;
    }

    setResults((prev) => ({ ...prev, ...newResults }));
    setErrors((prev) => ({ ...prev, ...newErrors }));
    setStatuses(newStatuses);
    setLastSummary(summary);

    // Replace the old "Loaded data for X widget(s)" lying toast with a honest
    // summary: only toast loudly on hard failures. Partial empties/mismatches
    // are surfaced via the per-widget status pill, not a green check.
    if (summary.errored > 0) {
      toast.error(
        `${summary.errored} widget${summary.errored === 1 ? '' : 's'} failed to load`,
        { id: 'bi-render-status' },
      );
    } else if (summary.mismatched > 0) {
      toast(
        `${summary.mismatched} widget${summary.mismatched === 1 ? '' : 's'} need${summary.mismatched === 1 ? 's' : ''} reconfiguration`,
        { id: 'bi-render-status', icon: '⚠️' },
      );
    }
    // No toast on all-ok / all-empty; the inline summary pill handles those.

    // Fetch comparison data for previous period if requested.
    if (previousTimeRange) {
      if (projectId) {
        const payload: RenderWidgetRequest[] = dataWidgets.map((w) => ({
          widget_id: w.widget_id,
          config: buildRequest(w, previousTimeRange) as Record<string, unknown>,
        }));
        try {
          const resp = await renderDashboard(projectId, payload);
          const prev: Record<string, WidgetDataResult> = {};
          for (const w of resp.widgets) prev[w.widget_id] = { data: w.data || [] };
          setPreviousResults(prev);
        } catch (err) {
          console.error('[BI] previous-period render failed:', err);
          setPreviousResults({});
        }
      } else {
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
      }
    } else {
      setPreviousResults({});
    }

    setExecuting(false);
  }, [projectId]);

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
      setStatuses((prev) => ({
        ...prev,
        [widget.widget_id]: {
          widget_id: widget.widget_id,
          status: (response.data?.length || 0) > 0 ? 'ok' : 'empty',
          error: null,
          row_count: response.data?.length || 0,
          title: widget.title || undefined,
        },
      }));
      toast.success('Widget data loaded');
    } catch (err) {
      const msg = getApiErrorMessage(err);
      toast.error(msg);
      setErrors((prev) => ({
        ...prev,
        [widget.widget_id]: msg,
      }));
      const lowered = msg.toLowerCase();
      const status: WidgetRenderStatus =
        (lowered.includes('invalid identifier') || lowered.includes('not found'))
          ? 'config_mismatch' : 'error';
      setStatuses((prev) => ({
        ...prev,
        [widget.widget_id]: {
          widget_id: widget.widget_id,
          status,
          error: msg,
          row_count: 0,
          title: widget.title || undefined,
        },
      }));
    } finally {
      setExecutingWidgetId(null);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults({});
    setPreviousResults({});
    setErrors({});
    setStatuses({});
    setLastSummary(null);
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
    statuses,
    lastSummary,
    executeAll,
    executeSingle,
    clearResults,
    setWidgetResult,
  };
}
