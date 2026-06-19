/**
 * Cortex Service - AI recommendations for platform errors (Account Overview)
 *
 * NOTE: There is no dedicated /cortex/recommend backend route.
 * This service builds a recommendation prompt from error context and
 * delegates to POST /cortex/complete (which exists in the backend).
 */
import apiClient from '@/lib/api-client';
import { toServiceError } from '../_errors';
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
 * Uses POST /cortex/complete under the hood (no dedicated /cortex/recommend route).
 * Builds a structured prompt from the error context / events and sends it to
 * the Cortex LLM completion endpoint.
 */
export async function getCortexRecommend(request: RecommendRequest): Promise<RecommendResponse> {
  // Build a recommendation prompt from error context or events
  let prompt: string;
  if (request.error_context) {
    prompt =
      'You are a Snowflake and Data360 platform expert. Analyze this error and provide ' +
      'concise, actionable recommendations to resolve it. Include root cause, fix steps, ' +
      'and prevention tips.\n\nError:\n' +
      request.error_context;
  } else if (request.events && request.events.length > 0) {
    const summary = request.events
      .slice(0, 10)
      .map(
        (e, i) =>
          `${i + 1}. [${e.EVENT_STATUS ?? 'ERROR'}] ${e.EVENT_ERROR ?? e.EVENT_TYPE ?? 'unknown'}` +
          (e.USERNAME ? ` (user: ${e.USERNAME})` : ''),
      )
      .join('\n');
    prompt =
      'You are a Snowflake and Data360 platform expert. Analyze these recent platform errors ' +
      'and provide a prioritized list of actionable recommendations.\n\nErrors:\n' +
      summary;
  } else {
    prompt =
      'You are a Snowflake and Data360 platform expert. No specific error context was provided. ' +
      'List the top 5 general health-check recommendations for a Snowflake-based data platform.';
  }

  const model = request.model || 'mistral-large2';

  try {
    const { data } = await apiClient.post<{ data?: { response?: string; model?: string } }>(
      '/cortex/complete',
      { prompt, model },
    );

    const inner = data?.data ?? (data as any);
    return {
      response: inner?.response ?? inner?.completion ?? '',
      model: inner?.model ?? model,
    };
  } catch (error: any) {
    console.error('Cortex recommend (via /complete) error:', error);
    throw toServiceError(error, 'Failed to get recommendation');
  }
}
