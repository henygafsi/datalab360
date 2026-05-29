/**
 * Charts Service - Fetch Chart Data
 * Works in both server-side (SSR) and client-side contexts.
 * Payload is normalized to match backend ChartConfig (database, schema, table, measures, etc.).
 */
import apiClient from '@/lib/api-client';
import { ChartDataResponse, ChartRequest } from './types';

function normalizeChartRequest(request: ChartRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    database: request.database ?? 'CP_DATA360',
    schema: request.schema ?? 'RETAIL_DW',
    table: request.table ?? '',
  };

  // Raw mode: send columns array instead of measures (for table widgets)
  if (request.mode === 'raw') {
    body.mode = 'raw';
    if (Array.isArray(request.columns) && request.columns.length > 0) {
      body.columns = request.columns;
    }
    if (request.limit != null && request.limit > 0) body.limit = request.limit;
    if (Array.isArray(request.filters) && request.filters.length > 0) body.filters = request.filters;
    return body;
  }

  // Aggregate mode (default): send measures, x, groupBy, filters
  const measures = Array.isArray(request.measures) ? request.measures : [];
  body.measures = measures.map((m) => ({
    column: String(m?.column ?? ''),
    ...(m?.aggregator ? { aggregator: m.aggregator } : {}),
    ...(m?.seuils?.length ? { seuils: m.seuils } : {}),
  }));
  body.filters = Array.isArray(request.filters) ? request.filters : [];
  body.groupBy = Array.isArray(request.groupBy) ? request.groupBy : [];
  if (request.x != null && request.x !== '') body.x = request.x;
  if (request.limit != null && request.limit > 0) body.limit = request.limit;
  return body;
}

export async function fetchChartData(request: ChartRequest): Promise<ChartDataResponse> {
  const body = normalizeChartRequest(request);
  const { data } = await apiClient.post<ChartDataResponse>('/bi-dashboard/charts/data', body);
  return data;
}
