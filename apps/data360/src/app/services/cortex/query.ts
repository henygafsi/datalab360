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

    const response = await axios.post<CortexQueryResponse>(
      `${API_BASE_URL}/cortex/query`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Cortex query response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error in cortex query:', error);
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.detail || error.message;
      throw new Error(`Cortex query failed: ${message}`);
    }
    throw error;
  }
}
