/**
 * Secure API Client with Authentication Handling
 *
 * This module provides a centralized axios instance that:
 * - Automatically adds authentication headers from NextAuth session
 * - Works in both server-side (SSR) and client-side contexts
 * - Handles 401/403 responses with appropriate error classes
 * - Provides consistent error handling without auto-signout
 * - Lets components handle auth errors gracefully
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_CONFIG } from '@/config/database.config';
import {
  getAuthSession,
  AuthError,
  TokenExpiredError,
} from '@/lib/auth';

// Create axios instance with base configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: 30000, // 30 seconds (allows for multiple parallel Snowflake queries + network latency)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add authentication token and account context to all requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Use unified auth helper that works in both server and client
      const session = await getAuthSession();

      if (session?.user?.access_token) {
        // Check for token expiration
        if (session.tokenExpired) {
          console.warn('[API Client] Token expired, request may fail');
        }

        // Add Bearer token for authentication
        config.headers.Authorization = `Bearer ${session.user.access_token}`;

        // Add account context for Snowflake multi-tenant support
        if (session.user.account_name) {
          config.headers['X-Account-Name'] = session.user.account_name;
        }

        // Add username context if available
        if (session.user.username) {
          config.headers['X-Username'] = session.user.username;
        }
      }
    } catch (error) {
      // Log only in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[API Client] Error getting session:', error);
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle authentication errors
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;

    // Handle 401 Unauthorized - Token expired or invalid
    if (status === 401) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[API Client] 401 Unauthorized - Token may be expired or invalid');
      }
      return Promise.reject(new AuthenticationError('Session expired. Please sign in again.'));
    }

    // Handle 403 Forbidden - Insufficient permissions
    if (status === 403) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[API Client] 403 Forbidden - Access denied');
      }
      return Promise.reject(new AuthorizationError('You do not have permission to access this resource.'));
    }

    // Handle 500 Internal Server Error
    // Pass through the original error so components can access the actual backend error message
    if (status === 500) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[API Client] 500 Internal Server Error:', error.response?.data);
      }
      // Don't wrap in ServerError - pass through original error so response.data.detail is accessible
      return Promise.reject(error);
    }

    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[API Client] Request timeout:', error.message);
      }
      return Promise.reject(new TimeoutError('Request took too long. The server may be slow or unavailable.'));
    }

    // Handle network errors
    if (!error.response) {
      console.error('[API Client] Network error:', error.message);
      return Promise.reject(new NetworkError('Unable to connect to the server. Please check your connection.'));
    }

    // Handle other errors
    return Promise.reject(error);
  }
);

// Custom error classes for better error handling
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ServerError extends Error {
  response?: {
    data?: {
      detail?: string | { detail?: string };
      message?: string;
    };
    status?: number;
  };

  constructor(message: string, originalError?: AxiosError) {
    super(message);
    this.name = 'ServerError';
    // Preserve the original response data so components can access the backend error detail
    if (originalError?.response) {
      this.response = {
        data: originalError.response.data as any,
        status: originalError.response.status,
      };
    }
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Helper function to check if an error is an authentication error
 */
export function isAuthClientError(error: unknown): boolean {
  if (error instanceof AuthenticationError) return true;
  if (error instanceof AuthError) return true;
  if (error instanceof TokenExpiredError) return true;
  if (error instanceof AxiosError && error.response?.status === 401) return true;
  if (error instanceof Error && error.message.includes('No access token')) return true;
  return false;
}

/**
 * Helper function to redirect to login page
 * Can be called from anywhere in the app (client-side only)
 */
export function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/signin';
  }
}

/**
 * Create a server-side API client for use in Server Components and API routes
 * This creates a fresh axios instance with auth headers pre-configured
 *
 * @param headers - Optional pre-computed auth headers
 */
export async function createServerApiClient(headers?: Record<string, string>): Promise<AxiosInstance> {
  const serverClient = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: 300000,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  // If headers not provided, get them from session
  if (!headers) {
    try {
      const session = await getAuthSession();
      if (session?.user?.access_token) {
        serverClient.defaults.headers.common['Authorization'] = `Bearer ${session.user.access_token}`;
        serverClient.defaults.headers.common['X-Account-Name'] = session.user.account_name || '';
        serverClient.defaults.headers.common['X-Username'] = session.user.username || '';
      }
    } catch (error) {
      console.error('[Server API Client] Failed to get auth headers:', error);
    }
  }

  return serverClient;
}

/**
 * Make an authenticated fetch request (works in both server and client)
 * This is useful for Server Components where axios may not be ideal
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const session = await getAuthSession();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (session?.user?.access_token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${session.user.access_token}`;
    (headers as Record<string, string>)['X-Account-Name'] = session.user.account_name || '';
    (headers as Record<string, string>)['X-Username'] = session.user.username || '';
  }

  const fullUrl = url.startsWith('http') ? url : `${API_CONFIG.BASE_URL}${url}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    cache: options.cache || 'no-store', // Default to no caching for API calls
  });

  if (response.status === 401) {
    throw new AuthenticationError('Session expired. Please sign in again.');
  }

  if (response.status === 403) {
    throw new AuthorizationError('You do not have permission to access this resource.');
  }

  return response;
}

/**
 * Make an authenticated JSON fetch request
 * Returns parsed JSON response
 */
export async function authFetchJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await authFetch(url, options);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export default apiClient;
