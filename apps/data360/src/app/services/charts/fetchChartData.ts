/**
 * Charts Service - Fetch Chart Data
 * Works in both server-side (SSR) and client-side contexts.
 * Payload is normalized to match backend ChartConfig (database, schema, table, measures, etc.).
 */
import apiClient from '@/lib/api-client';
import { ChartDataResponse, ChartRequest } from './types';

function normalizeChartRequest(request: ChartRequest): Record<string, unknown> {
  const measures = Array.isArray(request.measures) ? request.measures : [];
  const body: Record<string, unknown> = {
    database: request.database ?? 'CP_DATA360',
    schema: request.schema ?? 'EVENT_STORE',
    table: request.table ?? '',
    measures: measures.map((m) => ({
      column: String(m?.column ?? ''),
      ...(m?.aggregator ? { aggregator: m.aggregator } : {}),
      ...(m?.seuils?.length ? { seuils: m.seuils } : {}),
    })),
    filters: Array.isArray(request.filters) ? request.filters : [],
    groupBy: Array.isArray(request.groupBy) ? request.groupBy : [],
  };
  if (request.x != null && request.x !== '') body.x = request.x;
  if (request.limit != null && request.limit > 0) body.limit = request.limit;
  return body;
}

export async function fetchChartData(request: ChartRequest): Promise<ChartDataResponse> {
  const body = normalizeChartRequest(request);
  const { data } = await apiClient.post<ChartDataResponse>('/bi_reporting/charts/data', body);
  return data;
}
