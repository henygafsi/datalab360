/**
 * Cortex Service - Query
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';
import axios from 'axios';
import { toServiceError } from '../_errors';

export interface CortexQueryRequest {
  prompt: string;
  semantic_model?: string;
}

export interface CortexQueryResult {
  type: 'text' | 'sql' | 'suggestions';
  text?: string;
  query?: string;
  data?: any[];
  /** Follow-up suggestion chips returned for some Cortex Analyst responses. */
  suggestions?: string[];
}

export interface CortexQueryResponse {
  request_id: string;
  results: CortexQueryResult[];
}

/**
 * Sends a query to the Cortex service for data analysis and interpretation.
 * @param request - The query request containing the user's prompt
 * @returns A promise that resolves to the Cortex response with interpreted results
 * @throws Error if the API call fails or response is not OK.
 */
export async function queryCortex(request: CortexQueryRequest): Promise<CortexQueryResponse> {
  try {
    const response = await apiClient.post('/cortex/query', request);
    const responseData = response.data;

    // If response is wrapped in { status, message, data } format
    if (responseData.data !== undefined) {
      if (responseData.data.results || responseData.data.request_id) {
        return responseData.data as CortexQueryResponse;
      }
    }

    // If response is direct CortexQueryResponse format
    if (responseData.results !== undefined || responseData.request_id) {
      return responseData as CortexQueryResponse;
    }

    // Check for response key
    if (responseData.response) {
      return {
        request_id: responseData.request_id || 'unknown',
        results: Array.isArray(responseData.response) ? responseData.response : [{ type: 'text', text: String(responseData.response) }],
      };
    }

    // Check for message as result
    if (responseData.message && !responseData.status) {
      return {
        request_id: responseData.request_id || 'unknown',
        results: [{ type: 'text', text: responseData.message }],
      };
    }

    // Fallback - try to construct response from available data
    return {
      request_id: responseData.request_id || 'unknown',
      results: responseData.results || responseData.data?.results || [],
    };
  } catch (error) {
    console.error('Error in cortex query:', error);
    if (axios.isAxiosError(error)) {
      throw toServiceError(error, 'Query failed');
    }
    throw error;
  }
}
