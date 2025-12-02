import axios from 'axios';
import { getSession } from 'next-auth/react';
import { SAMPLE_DATABASES } from './sampleData';

/**
 * TODO (Backend): Configure CORS headers to allow requests from the frontend
 *
 * Required CORS configuration on backend:
 * ```python
 * from fastapi.middleware.cors import CORSMiddleware
 *
 * app.add_middleware(
 *     CORSMiddleware,
 *     allow_origins=["http://localhost:3000"],  # Frontend URL
 *     allow_credentials=True,
 *     allow_methods=["*"],
 *     allow_headers=["*"],
 * )
 * ```
 */

/**
 * Fetches the list of databases from the API.
 * Falls back to sample data if API fails (e.g., CORS error)
 *
 * Expected API Response Format:
 * {
 *   "databases": [
 *     { "name": "RETAIL_DB" },
 *     { "name": "ANALYTICS_DB" }
 *   ]
 * }
 *
 * @returns {Promise<string[]>} - A promise that resolves to the list of database names.
 */
export const getDatabases = async (): Promise<string[]> => {
  const session = await getSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available. Please log in again.');
  }
  const token = session.user.access_token;

  const url = `${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    // Extracting the database names from the response data
    const databases = response.data.databases.map((db: { name: string }) => db.name);
    return databases;
  } catch (error: any) {
    // Detect CORS errors
    const isCorsError =
      error.message?.includes('CORS') ||
      error.message?.includes('Network Error') ||
      error.code === 'ERR_NETWORK' ||
      (error.response === undefined && error.request);

    if (isCorsError) {
      throw new Error('Unable to connect to the server. Please check your network connection or contact your administrator.');
    }

    if (error.response?.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }

    if (error.response?.status === 403) {
      throw new Error('You do not have permission to access databases.');
    }

    throw new Error(error.response?.data?.message || error.message || 'Failed to fetch databases. Please try again.');
  }
};
