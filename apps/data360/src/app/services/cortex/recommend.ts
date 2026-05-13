/**
 * Cortex Service - AI recommendations for platform errors (Account Overview)
 */
import apiClient from '@/lib/api-client';
import type { DashboardErrorEvent } from '@/app/services/governance/types';

export interface RecommendRequest {
  error_context?: string;
  /** Events from GET /governance/dashboard/errors */
  events?: DashboardErrorEvent[];
  model?: string;
}

export interface RecommendResponse {
  response: string;
  model: string;
}

/**
 * Get AI-powered recommendations to resolve platform errors.
 * Uses Snowflake Cortex LLM (e.g. mistral-7b) to suggest fixes.
 */
export async function getCortexRecommend(request: RecommendRequest): Promise<RecommendResponse> {
  const { data } = await apiClient.post<{ data: RecommendResponse }>('/cortex/recommend', request);
  return data?.data ?? data;
}
