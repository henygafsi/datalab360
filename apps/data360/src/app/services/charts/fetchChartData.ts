/**
 * Charts Service - Fetch Chart Data
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import { ChartDataResponse, ChartRequest } from './types';

export async function fetchChartData(request: ChartRequest): Promise<ChartDataResponse> {
  const { data } = await apiClient.post<ChartDataResponse>('/bi_reporting/charts/data', request);
  return data;
}
