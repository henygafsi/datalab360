/**
 * Secure API client: adds auth headers, handles 401/403. Data journey: UI/service → apiClient → backend.
 */
// ////dependency//// lib → config.database.config, lib.auth (session/token)
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
  timeout: 120000, // 2 minutes – Snowflake queries (policies, mappings, etc.) can be slow; backend owns SDK
  headers: {
    'Content-Type': 'application/json',
  },
});

// Redundancy detection (dev): log when same (method, url) is called within REDUNDANCY_WINDOW_MS
const REDUNDANCY_WINDOW_MS = 2000;
const _recentCalls: { key: string; ts: number }[] = [];
function _detectRedundantCall(method: string, url: string): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
  const key = `${method}:${url}`;
  const now = Date.now();
  const recent = _recentCalls.filter((c) => now - c.ts < REDUNDANCY_WINDOW_MS);
  if (recent.some((c) => c.key === key)) {
    console.warn(`[API Redundancy] Same request within ${REDUNDANCY_WINDOW_MS}ms: ${method} ${url}`);
  }
  _recentCalls.length = 0;
  _recentCalls.push(...recent, { key, ts: now });
}

// Request interceptor - Add authentication token and account context to all requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    const method = (config.method ?? 'get').toUpperCase();
    const fullUrl = config.baseURL ? `${config.baseURL}${url}` : url;
    _detectRedundantCall(method, fullUrl);

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

    // 401 = real auth only (no token, invalid/expired token). Do NOT redirect on endpoint/infra issues.
    // Backend uses 503 for SESSION_NOT_IN_PROCESS so only real auth returns 401 → redirect to sign-in
    if (status === 401) {
      const data = error.response?.data as { error_code?: string; detail?: string } | undefined;
      const errorCode = data?.error_code;
      const isRealAuth = !errorCode || ['NOT_AUTHENTICATED', 'TOKEN_INVALID_OR_EXPIRED', 'SESSION_EXPIRED'].includes(errorCode);
      if (isRealAuth && typeof window !== 'undefined' && !window.location.pathname.startsWith('/signin') && !window.location.pathname.startsWith('/auth/')) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[API Client] 401 Unauthorized (auth) - Redirecting to sign-in');
        }
        window.location.href = '/signin';
      }
      const message = typeof data?.detail === 'string' ? data.detail : (data?.detail as any)?.detail ?? 'Session expired. Please sign in again.';
      return Promise.reject(new AuthenticationError(message));
    }

    // 503 = endpoint/infra (e.g. SESSION_NOT_IN_PROCESS) → do NOT redirect, show message
    if (status === 503) {
      const data = error.response?.data as { error_code?: string; detail?: string; hint?: string } | undefined;
      const message = typeof data?.detail === 'string' ? data.detail : (data?.detail as any)?.detail ?? 'Service temporarily unavailable.';
      return Promise.reject(new ServerError(message, error));
    }

    // Handle 403 Forbidden - Insufficient permissions
    if (status === 403) {
      const data = error.response?.data as { detail?: string | { detail?: string } } | undefined;
      const message = typeof data?.detail === 'string' ? data.detail : (data?.detail as any)?.detail ?? 'You do not have permission to access this resource.';
      if (process.env.NODE_ENV === 'development') {
        console.warn('[API Client] 403 Forbidden -', message);
      }
      return Promise.reject(new AuthorizationError(message));
    }

    // Handle 404 Not Found - pass through so components can show "not found" message
    if (status === 404) {
      return Promise.reject(error);
    }

    // Handle 422 Unprocessable Entity - validation/body error, show backend detail in UI
    if (status === 422) {
      return Promise.reject(error);
    }

    // Handle 400 Bad Request - pass through so components can show backend message
    if (status === 400) {
      return Promise.reject(error);
    }

    // 500 - Only redirect to signin when detail indicates connection/session failure (no connection)
    if (status === 500) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[API Client] 500 Internal Server Error:', error.response?.data);
      }
      const data = error.response?.data as { detail?: string | { detail?: string }; error_code?: string } | undefined;
      const detailStr = typeof data?.detail === 'string' ? data.detail : (data?.detail as any)?.detail;
      const suggestsNoConnection = detailStr && typeof detailStr === 'string' && /connection|session\s*expired|not\s*authenticated|cursor\s*closed/i.test(detailStr);
      if (suggestsNoConnection && typeof window !== 'undefined' && !window.location.pathname.startsWith('/signin') && !window.location.pathname.startsWith('/auth/')) {
        window.location.href = '/signin';
      }
      return Promise.reject(error);
    }

    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[API Client] Request timeout:', error.message);
      }
      return Promise.reject(new TimeoutError('Request took too long. The server may be slow or unavailable.'));
    }

    // Handle network errors (server disconnected) → redirect to sign-in so user can retry when back
    if (!error.response) {
      console.error('[API Client] Network error (server disconnected?):', error.message);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/signin') && !window.location.pathname.startsWith('/auth/') && (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error'))) {
        window.location.href = '/signin';
      }
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
 * Only redirect when error is real auth (no token, expired token). Do not redirect on 503 or 401 endpoint/infra issues.
 */
export function shouldRedirectToLoginOnError(err: { response?: { status?: number; data?: { error_code?: string } } }): boolean {
  const status = err?.response?.status;
  const code = err?.response?.data?.error_code;
  if (status === 503) return false;
  if (status === 401) {
    const realAuth = !code || ['NOT_AUTHENTICATED', 'TOKEN_INVALID_OR_EXPIRED', 'SESSION_EXPIRED'].includes(code);
    return realAuth;
  }
  if (status === 500) {
    const detail = (err?.response?.data as any)?.detail;
    const s = typeof detail === 'string' ? detail : (detail?.detail ?? '');
    return /connection|session\s*expired|not\s*authenticated|cursor\s*closed/i.test(String(s));
  }
  return false;
}

/** Smart captions for Snowflake error_code / errno (best practices). */
const SNOWFLAKE_CAPTIONS: Record<string, string> = {
  '000904': 'Objet (table, schéma ou base) inexistant. Vérifiez les noms ou exécutez init_metadata.',
  '090105': 'Objet inexistant. Vérifiez les permissions et le schéma.',
  '250001': 'Privilèges insuffisants. Vérifiez les rôles et grants Snowflake.',
  '390111': 'Session expirée. Reconnectez-vous.',
  '252006': 'Connexion ou curseur fermé. Relancez le backend avec --workers 1 ou reconnectez-vous.',
  '250002': 'Connexion fermée. Reconnectez-vous.',
};

/**
 * Extract user-friendly error message from API error (AxiosError or similar).
 * Uses detail, error_code, and snowflake (errno, sqlstate, msg) for smart captions.
 */
export function getApiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { data?: unknown; status?: number } }).response;
    const data = res?.data as Record<string, unknown> | undefined;
    const status = res?.status;
    if (data && typeof data === 'object') {
      const snowflake = data.snowflake as { errno?: number; sqlstate?: string; msg?: string } | undefined;
      if (snowflake?.errno != null && SNOWFLAKE_CAPTIONS[String(snowflake.errno)]) {
        return SNOWFLAKE_CAPTIONS[String(snowflake.errno)];
      }
      if (snowflake?.msg && typeof snowflake.msg === 'string' && snowflake.msg.length < 300) {
        return snowflake.msg;
      }
      const code = data.error_code as string | undefined;
      if (code === 'SESSION_NOT_IN_PROCESS') {
        return 'Session non disponible (backend multi-workers). Utilisez --workers 1 ou reconnectez-vous.';
      }
      let detail = data.detail;
      if (typeof detail === 'string' && detail.length > 0 && detail.length < 400) return detail;
      if (detail && typeof detail === 'object') {
        const d = detail as Record<string, unknown>;
        if (typeof d.message === 'string' && d.message.length > 0) return d.message;
        if (typeof d.detail === 'string') return d.detail as string;
      }
      const errObj = data.error as { message?: string; error_code?: string } | undefined;
      if (errObj && typeof errObj === 'object' && typeof errObj.message === 'string') return errObj.message;
      if (errObj && typeof errObj === 'object' && errObj.error_code != null) return String(errObj.error_code);
      if (typeof data.message === 'string') return data.message;
    }
    if (status === 401) return 'Session expirée. Veuillez vous reconnecter.';
    if (status === 503) return 'Service temporairement indisponible. Utilisez un seul worker ou reconnectez-vous.';
    if (status === 403) return 'Accès refusé.';
    if (status === 404) return 'Ressource introuvable.';
    if (status === 501) {
      const detail = data?.detail;
      return typeof detail === 'string' ? detail : 'Fonctionnalité non disponible pour le moment.';
    }
    if (status === 422 || status === 400) return 'Données invalides. Vérifiez les champs ou la requête Snowflake.';
    if (status === 500) return 'Erreur serveur. Réessayez ou vérifiez les logs Snowflake.';
  }
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
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
