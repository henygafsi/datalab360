import { getSession } from 'next-auth/react';
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export interface CortexQueryRequest {
  prompt: string;
}

export interface CortexQueryResult {
  type: 'text' | 'sql';
  text?: string;
  query?: string;
  data?: any[];
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
    const session = await getSession();
    if (!session?.user?.access_token) {
      throw new Error('No access token available');
    }
    const token = session.user.access_token;

    console.log('🔍 Cortex query request:', request);

    const response = await axios.post(
      `${API_BASE_URL}/cortex/query`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('🔍 Cortex query raw response:', JSON.stringify(response.data, null, 2));
    console.log('🔍 Response type:', typeof response.data);

    // Handle wrapped response (StandardResponse format) or direct response
    const responseData = response.data;

    // If response is wrapped in { status, message, data } format
    if (responseData.data !== undefined) {
      console.log('🔍 Found data field:', responseData.data);
      if (responseData.data.results || responseData.data.request_id) {
        console.log('✅ Returning responseData.data as CortexQueryResponse');
        return responseData.data as CortexQueryResponse;
      }
    }

    // If response is direct CortexQueryResponse format
    if (responseData.results !== undefined || responseData.request_id) {
      console.log('✅ Response is direct CortexQueryResponse format');
      return responseData as CortexQueryResponse;
    }

    // Check for response key
    if (responseData.response) {
      console.log('🔍 Found response key:', responseData.response);
      return {
        request_id: responseData.request_id || 'unknown',
        results: Array.isArray(responseData.response) ? responseData.response : [{ type: 'text', text: String(responseData.response) }],
      };
    }

    // Check for message as result
    if (responseData.message && !responseData.status) {
      console.log('🔍 Found message:', responseData.message);
      return {
        request_id: responseData.request_id || 'unknown',
        results: [{ type: 'text', text: responseData.message }],
      };
    }

    // Fallback - try to construct response from available data
    console.log('⚠️ Cortex query - constructing fallback response');
    console.log('⚠️ Available keys:', Object.keys(responseData));
    return {
      request_id: responseData.request_id || 'unknown',
      results: responseData.results || responseData.data?.results || [],
    };
  } catch (error) {
    console.error('❌ Error in cortex query:', error);
    if (axios.isAxiosError(error)) {
      console.error('❌ Error response:', error.response?.data);
      const message = error.response?.data?.detail || error.response?.data?.message || error.message;
      throw new Error(`Cortex query failed: ${message}`);
    }
    throw error;
  }
}
