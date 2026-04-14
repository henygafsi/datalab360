'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Cache key mapping between backend and frontend
 * Must match backend CacheKey enum exactly
 */
export const CACHE_KEYS = {
  // Mapping module
  PROJECTS: 'projects',
  TABLE_MAPPINGS: 'table_mappings',
  WORKFLOWS: 'workflows',
  DATABASES: 'databases',
  SCHEMAS: 'schemas',
  TABLES: 'tables',

  // Gouvernance module
  USERS: 'users',
  ROLES: 'roles',
  GRANTS: 'grants',
  POLICIES: 'policies',
  SECURITY_AXES: 'security_axes',
  DASHBOARD: 'dashboard',
  ACTIVITY: 'activity',
  DWH_STORAGE: 'dwh_storage',
  DWH_HEALTH: 'dwh_health',

  // Cortex module
  CORTEX: 'cortex',
  SEMANTIC_MODELS: 'semantic_models',
  ML_MODELS: 'ml_models',
  FINE_TUNE_JOBS: 'fine_tune_jobs',

  // Charts
  CHARTS: 'charts',

  // BI Dashboard
  BI_DASHBOARDS: 'bi_dashboards',

  // Data Engineering objects (via Explore & Design)
  DYNAMIC_TABLES: 'dynamic_tables',
  STREAMS: 'streams',
  EVENT_TABLES: 'event_tables',
  HYBRID_TABLES: 'hybrid_tables',
  ALERTS: 'alerts',

  // Developer tools (via Workflow)
  GIT_REPOSITORIES: 'git_repositories',
  COMPUTE_POOLS: 'compute_pools',
  CONTAINER_SERVICES: 'container_services',
  NOTEBOOKS: 'notebooks',

  // Quality & Observability
  QUALITY_METRICS: 'quality_metrics',
  DATA_QUALITY: 'data_quality',
  DMF_RESULTS: 'dmf_results',
  QUALITY_CHECKS: 'quality_checks',
  DATA_PROFILES: 'data_profiles',
  ANOMALIES: 'anomalies',
  OBSERVABILITY_DASHBOARD: 'observability_dashboard',
  DATA_LINEAGE: 'data_lineage',
  USER_ACTIVITY: 'user_activity',
  SECURITY_POSTURE: 'security_posture',
  WAREHOUSE_USAGE: 'warehouse_usage',
  QUERY_PERFORMANCE: 'query_performance',
  STORAGE_METRICS: 'storage_metrics',
  COMPLIANCE_METRICS: 'compliance_metrics',

  // Organization Accounts
  ORG_ACCOUNTS: 'org_accounts',

  // Data Products
  DATA_PRODUCTS: 'data_products',

  // Deployments
  DEPLOYMENTS: 'deployments',

  // AI
  AI_SUGGESTIONS: 'ai_suggestions',
} as const;

export type CacheKey = typeof CACHE_KEYS[keyof typeof CACHE_KEYS];

interface SSEEvent {
  type: 'connected' | 'cache_invalidation' | 'heartbeat';
  cache_keys?: string[];
  reason?: string;
  triggered_by?: string;
  timestamp?: string;
  client_id?: string;
}

interface CacheInvalidationOptions {
  /** Callback when cache keys are invalidated */
  onInvalidate?: (keys: string[], reason?: string) => void;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom SSE endpoint URL */
  sseUrl?: string;
  /**
   * Redirect to sign-in page when sync is persistently offline
   * After maxReconnectAttempts failures, user will be signed out
   * @default true
   */
  redirectOnOffline?: boolean;
  /**
   * Maximum reconnection attempts before redirecting to sign-in
   * @default 5
   */
  maxReconnectAttempts?: number;
}

/**
 * Hook for real-time cache invalidation via SSE
 *
 * Connects to backend SSE stream and receives cache invalidation events
 * in real-time. Use this to trigger React Query refetches or Jotai atom updates.
 *
 * @example
 * ```tsx
 * const { isConnected, lastEvent } = useCacheInvalidation({
 *   onInvalidate: (keys) => {
 *     keys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
 *   }
 * });
 * ```
 */
export function useCacheInvalidation(options: CacheInvalidationOptions = {}) {
  const {
    onInvalidate,
    debug = false,
    sseUrl,
    redirectOnOffline = true,
    maxReconnectAttempts = 5,
  } = options;
  const { data: session, status } = useSession();

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isRedirectingRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const log = useCallback((...args: unknown[]) => {
    if (debug) {
      console.log('[SSE]', ...args);
    }
  }, [debug]);

  /**
   * Handle when sync is persistently offline
   * Note: We don't auto-signout - just show error state
   */
  const handleOfflineError = useCallback(() => {
    if (isRedirectingRef.current) return;
    isRedirectingRef.current = true;
    log('⚠️ Sync offline - SSE connection failed');
    setError('Sync offline');
  }, [log]);

  const connect = useCallback(() => {
    // Don't connect if not authenticated
    if (status !== 'authenticated' || !session?.user?.access_token) {
      log('⏳ Waiting for authentication...');
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const apiUrl = sseUrl || process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';
    // EventSource can't send Authorization headers — pass token as query param
    const token = (session as any)?.user?.access_token || '';
    const streamUrl = `${apiUrl}/cache-stream/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    log('🔌 Connecting to SSE:', streamUrl);

    try {
      const eventSource = new EventSource(streamUrl, {
        withCredentials: true,
      });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        log('✅ SSE Connection opened');
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEvent;
          log('📨 SSE Event:', data);
          setLastEvent(data);

          switch (data.type) {
            case 'connected':
              log('✅ SSE Connected:', data.client_id);
              setIsConnected(true);
              setClientId(data.client_id || null);
              break;

            case 'cache_invalidation':
              log('🔄 Cache Invalidation:', data.cache_keys);
              log('   Reason:', data.reason);
              log('   Triggered by:', data.triggered_by);

              if (data.cache_keys && onInvalidate) {
                onInvalidate(data.cache_keys, data.reason);
              }
              break;

            case 'heartbeat':
              log('💓 Heartbeat received');
              break;
          }
        } catch (parseError) {
          console.error('[SSE] Failed to parse event:', parseError);
        }
      };

      eventSource.onerror = (err) => {
        console.error('❌ SSE Error:', err);
        setIsConnected(false);
        setError('Connection lost');

        reconnectAttemptsRef.current++;

        // Check if we should stop reconnecting after max attempts
        if (redirectOnOffline && reconnectAttemptsRef.current >= maxReconnectAttempts) {
          log(`❌ Max reconnect attempts (${maxReconnectAttempts}) exceeded`);
          handleOfflineError();
          return;
        }

        // Exponential backoff for reconnection
        const maxDelay = 30000; // 30 seconds max
        const baseDelay = 1000; // 1 second base
        const delay = Math.min(
          baseDelay * Math.pow(2, reconnectAttemptsRef.current),
          maxDelay
        );

        log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      setError('Failed to connect');
    }
  }, [session, status, sseUrl, onInvalidate, log, redirectOnOffline, maxReconnectAttempts, handleOfflineError]);

  // Connect when authenticated - single useEffect to avoid reconnection loops
  useEffect(() => {
    // Only connect if authenticated and not already connected
    if (status === 'authenticated' && session?.user?.access_token) {
      connect();
    }

    return () => {
      log('🔌 Closing SSE connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.access_token, log]);

  return {
    isConnected,
    clientId,
    lastEvent,
    error,
    reconnect: connect,
  };
}

export default useCacheInvalidation;
