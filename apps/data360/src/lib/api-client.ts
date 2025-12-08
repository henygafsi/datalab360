/**
 * Secure API Client with Authentication Handling
 *
 * This module provides a centralized axios instance that:
 * - Automatically adds authentication headers
 * - Handles 401 responses by redirecting to login
 * - Handles token expiration
 * - Provides consistent error handling
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { API_CONFIG } from '@/config/database.config';

// Track if we're already redirecting to prevent multiple redirects
let isRedirecting = false;

// Create axios instance with base configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add authentication token to all requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const session = await getSession();

      if (session?.user?.access_token) {
        config.headers.Authorization = `Bearer ${session.user.access_token}`;
      } else {
        // No token available - this will be caught by response interceptor
        console.warn('[API Client] No access token available for request:', config.url);
      }
    } catch (error) {
      console.error('[API Client] Error getting session:', error);
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
    // Successful response - return as is
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config;

    // Handle 401 Unauthorized - Token expired or invalid
    if (status === 401) {
      console.warn('[API Client] 401 Unauthorized - Redirecting to login');

      if (!isRedirecting && typeof window !== 'undefined') {
        isRedirecting = true;

        // Sign out and redirect to login
        await signOut({
          callbackUrl: '/signin',
          redirect: true
        });

        // Reset flag after a delay
        setTimeout(() => {
          isRedirecting = false;
        }, 5000);
      }

      return Promise.reject(new AuthenticationError('Session expired. Please sign in again.'));
    }

    // Handle 403 Forbidden - Insufficient permissions
    if (status === 403) {
      console.warn('[API Client] 403 Forbidden - Access denied');
      return Promise.reject(new AuthorizationError('You do not have permission to access this resource.'));
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

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Helper function to check if an error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AuthenticationError) return true;
  if (error instanceof AxiosError && error.response?.status === 401) return true;
  if (error instanceof Error && error.message.includes('No access token')) return true;
  return false;
}

/**
 * Helper function to redirect to login page
 * Can be called from anywhere in the app
 */
export async function redirectToLogin(): Promise<void> {
  if (!isRedirecting && typeof window !== 'undefined') {
    isRedirecting = true;
    await signOut({ callbackUrl: '/signin', redirect: true });
    setTimeout(() => {
      isRedirecting = false;
    }, 5000);
  }
}

export default apiClient;
