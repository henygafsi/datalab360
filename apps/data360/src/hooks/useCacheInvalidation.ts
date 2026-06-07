'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Cache key mapping between backend and frontend
 * Must match backend CacheKey enum exactly
 */
export const CACHE_KEYS = {
  // ── Connections / Datalake ─────────────────────────────────────────────
  CONNECTIONS: 'connections',
  STAGES: 'stages',
  INTEGRATIONS: 'integrations',
  CONNECTORS: 'connectors',
  CONNECTOR_CREDENTIALS: 'connector_credentials',
  CONNECTOR_AUDIT: 'connector_audit',

  // ── Projects (unified) ────────────────────────────────────────────────
  PROJECTS: 'projects',
  PROJECT_CONTRIBUTORS: 'project_contributors',
  PROJECT_EVENTS: 'project_events',
  PROJECT_VERSIONS: 'project_versions',
  TABLE_MAPPINGS: 'table_mappings',
  DATABASES: 'databases',
  SCHEMAS: 'schemas',
  TABLES: 'tables',
  TABLE_METADATA: 'table_metadata',
  DEPLOYMENTS: 'deployments',

  // ── Workflow ──────────────────────────────────────────────────────────
  WORKFLOWS: 'workflows',
  TASKS: 'tasks',
  APPROVALS: 'approvals',

  // ── Gouvernance ───────────────────────────────────────────────────────
  USERS: 'users',
  ROLES: 'roles',
  GRANTS: 'grants',
  POLICIES: 'policies',
  MASKING_POLICIES: 'masking_policies',
  ROW_ACCESS_POLICIES: 'row_access_policies',
  USER_PERMISSIONS: 'user_permissions',
  ENTERPRISE_USERS: 'enterprise_users',
  SECURITY_MATRIX: 'security_matrix',

  // ── Cortex / AI Intelligence ──────────────────────────────────────────
  CORTEX: 'cortex',
  SEMANTIC_MODELS: 'semantic_models',
  ML_MODELS: 'ml_models',
  FINE_TUNE_JOBS: 'fine_tune_jobs',
  CHAT: 'chat',

  // ── Data Quality ──────────────────────────────────────────────────────
  DATA_QUALITY: 'data_quality',
  DMF_RESULTS: 'dmf_results',
  QUALITY_CHECKS: 'quality_checks',
  QUALITY_METRICS: 'quality_metrics',
  DATA_PROFILES: 'data_profiles',
  ANOMALIES: 'anomalies',
  REPORTS: 'reports',

  // ── Data Engineering (via Explore & Design) ───────────────────────────
  DYNAMIC_TABLES: 'dynamic_tables',
  STREAMS: 'streams',
  EVENT_TABLES: 'event_tables',
  HYBRID_TABLES: 'hybrid_tables',
  ALERTS: 'alerts',

  // ── Developer Tools (via Workflow) ────────────────────────────────────
  GIT_REPOSITORIES: 'git_repositories',
  COMPUTE_POOLS: 'compute_pools',
  CONTAINER_SERVICES: 'container_services',
  NOTEBOOKS: 'notebooks',

  // ── Observability ─────────────────────────────────────────────────────
  OBSERVABILITY_DASHBOARD: 'observability_dashboard',
  DATA_LINEAGE: 'data_lineage',
  USER_ACTIVITY: 'user_activity',
  SECURITY_POSTURE: 'security_posture',
  UNUSED_RESOURCES: 'unused_resources',
  WAREHOUSE_USAGE: 'warehouse_usage',
  QUERY_PERFORMANCE: 'query_performance',
  STORAGE_METRICS: 'storage_metrics',
  COMPLIANCE_METRICS: 'compliance_metrics',

  // ── Analytics / Dashboard ─────────────────────────────────────────────
  DASHBOARD: 'dashboard',
  KPI: 'kpi',

  // ── Organization Accounts ─────────────────────────────────────────────
  ORG_ACCOUNTS: 'org_accounts',
  ORG_ACCOUNTS_DASHBOARD: 'org_accounts_dashboard',
  ORG_CREDITS: 'org_credits',
  ORG_STORAGE: 'org_storage',
  ORG_LOGINS: 'org_logins',
  ORG_HEALTH: 'org_health',
  ORG_ALERTS: 'org_alerts',
  READER_ACCOUNTS: 'reader_accounts',
  DATA_SHARES: 'data_shares',

  // ── Data Products ─────────────────────────────────────────────────────
  DATA_PRODUCTS: 'data_products',

  // ── DWH Data ──────────────────────────────────────────────────────────
  SALES: 'sales',
  CUSTOMERS: 'customers',
  PRODUCTS: 'products',

  // ── AI ────────────────────────────────────────────────────────────────
  AI_SUGGESTIONS: 'ai_suggestions',

  // ── Catalog / SmartRightBar ────────────────────────────────────────────
  // Fired by backend after tag apply, classification, masking or ownership changes.
  CATALOG: 'catalog',
  TAGS: 'tags',
  TABLE_GOVERNANCE: 'table_governance',
  TABLE_LINEAGE: 'table_lineage',
  TABLE_INGESTION: 'table_ingestion',
  TABLE_OWNERSHIP: 'table_ownership',
  GOVERNANCE_RATE: 'governance_rate',

  // ── Legacy (kept for backward compat, no backend equivalent) ──────────
  CHARTS: 'charts',
  ACTIVITY: 'activity',
  DWH_STORAGE: 'dwh_storage',
  DWH_HEALTH: 'dwh_health',
  SECURITY_AXES: 'security_axes',
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
// Timeouts and reconnect tuning for the SSE stream.
const INITIAL_CONNECT_TIMEOUT_MS = 8_000;
const IDLE_TIMEOUT_MS = 90_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function useCacheInvalidation(options: CacheInvalidationOptions = {}) {
  const {
    onInvalidate,
    debug = false,
    sseUrl,
    redirectOnOffline = true,
    maxReconnectAttempts = 5,
  } = options;
  const { data: session, status } = useSession();

  // Abort controller for the active fetch stream.
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isRedirectingRef = useRef(false);
  const isUnmountedRef = useRef(false);
  // Latest options held in refs so the connect loop reads current values
  // without re-creating itself on every render.
  const onInvalidateRef = useRef(onInvalidate);
  const debugRef = useRef(debug);
  useEffect(() => { onInvalidateRef.current = onInvalidate; }, [onInvalidate]);
  useEffect(() => { debugRef.current = debug; }, [debug]);

  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const log = useCallback((...args: unknown[]) => {
    if (debugRef.current) {
      console.log('[SSE]', ...args);
    }
  }, []);

  /**
   * Handle when sync is persistently offline.
   * Note: We don't auto-signout — just surface error state to the UI.
   */
  const handleOfflineError = useCallback(() => {
    if (isRedirectingRef.current) return;
    isRedirectingRef.current = true;
    log('Sync offline - SSE connection failed');
    setError('Sync offline');
  }, [log]);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    // Don't connect if not authenticated.
    if (status !== 'authenticated' || !session?.user?.access_token) {
      log('Waiting for authentication...');
      return;
    }

    // Abort any in-flight stream before starting a new one.
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch { /* noop */ }
      abortControllerRef.current = null;
    }

    // Resolve API URL.
    // - In the browser, prefer the same-origin `/api-proxy` rewrite so the SSE
    //   connection inherits the page's HTTPS + cookies. fetch() is happy with a
    //   relative URL — DO NOT prepend `https://` to it (that produces the
    //   malformed `https:///api-proxy` and triggers ERR_NAME_NOT_RESOLVED).
    // - On the server, fall back to the explicit env URL.
    const rawApiUrl =
      sseUrl ||
      (typeof window !== 'undefined'
        ? '/api-proxy'
        : process.env.NEXT_PUBLIC_API_URL || 'http://api.datalab360.io');
    let apiUrl = (rawApiUrl || '').trim();
    const isRelative = apiUrl.startsWith('/');
    if (!isRelative) {
      if (apiUrl.startsWith('//')) apiUrl = `https:${apiUrl}`;
      if (!/^https?:\/\//i.test(apiUrl)) apiUrl = `https://${apiUrl}`;
      if (process.env.NODE_ENV === 'production' && apiUrl.startsWith('http://')) {
        apiUrl = `https://${apiUrl.slice(7)}`;
      }
    }
    // No token in URL — JWT is passed via Authorization header in fetch().
    const streamUrl = `${apiUrl}/cache-stream/stream`;
    const token = session.user.access_token;

    log('Connecting to SSE:', streamUrl);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Initial-connect timeout: aborts if the server doesn't respond within 8s.
    // Cleared once the first event is parsed (long-poll mode).
    let initialConnectTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      log('Initial connect timeout, aborting');
      try { abortController.abort(); } catch { /* noop */ }
    }, INITIAL_CONNECT_TIMEOUT_MS);

    // Idle timeout: no events of any kind (data, heartbeat comment) in 90s → reconnect.
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    // Heartbeat timeout: if no `:heartbeat` comment or `heartbeat` event in 60s, reconnect.
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

    const clearAllTimers = () => {
      if (initialConnectTimer) { clearTimeout(initialConnectTimer); initialConnectTimer = null; }
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        log('Idle timeout reached, aborting');
        try { abortController.abort(); } catch { /* noop */ }
      }, IDLE_TIMEOUT_MS);
    };

    const resetHeartbeatTimer = () => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        log('Heartbeat timeout reached, aborting');
        try { abortController.abort(); } catch { /* noop */ }
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const scheduleReconnect = () => {
      if (isUnmountedRef.current) return;
      reconnectAttemptsRef.current += 1;
      if (redirectOnOffline && reconnectAttemptsRef.current >= maxReconnectAttempts) {
        log(`Max reconnect attempts (${maxReconnectAttempts}) exceeded`);
        handleOfflineError();
        return;
      }
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptsRef.current - 1),
        RECONNECT_MAX_MS
      );
      log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const handleSSEBlock = (block: string) => {
      // An SSE "event" is a block separated by a blank line. Inside the block,
      // lines starting with ":" are comments (e.g. heartbeats). The "data:" field
      // accumulates across lines, "event:" sets the event type, "id:" sets the id.
      let eventName: string | null = null;
      const dataLines: string[] = [];
      let sawComment = false;
      for (const rawLine of block.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (!line) continue;
        if (line.startsWith(':')) {
          sawComment = true;
          // Treat any comment (including `:heartbeat`) as liveness signal.
          resetHeartbeatTimer();
          continue;
        }
        const colonIdx = line.indexOf(':');
        const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
        // Per spec: if the value starts with a space, strip exactly one.
        let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') eventName = value;
        else if (field === 'data') dataLines.push(value);
        // ignore `id`, `retry` — we don't currently use Last-Event-ID resume.
      }

      if (dataLines.length === 0) {
        // Pure comment block (heartbeat) — already noted above.
        return;
      }

      const dataStr = dataLines.join('\n');
      let parsed: SSEEvent | null = null;
      try {
        parsed = JSON.parse(dataStr) as SSEEvent;
      } catch (parseError) {
        console.error('[SSE] Failed to parse event data:', parseError);
        return;
      }

      // Heartbeat events from backend: emitted as `event: heartbeat` + JSON body.
      const effectiveType = parsed.type || (eventName as SSEEvent['type']);
      const evt: SSEEvent = { ...parsed, type: effectiveType };
      log('SSE Event:', evt);
      setLastEvent(evt);

      switch (evt.type) {
        case 'connected':
          log('SSE Connected:', evt.client_id);
          setIsConnected(true);
          setClientId(evt.client_id || null);
          setError(null);
          reconnectAttemptsRef.current = 0;
          break;
        case 'cache_invalidation':
          if (evt.cache_keys && onInvalidateRef.current) {
            onInvalidateRef.current(evt.cache_keys, evt.reason);
          }
          break;
        case 'heartbeat':
          // Already handled by resetHeartbeatTimer below
          break;
      }
      // Any event (data or heartbeat) keeps the connection alive.
      void sawComment; // satisfy lint about unused
      resetHeartbeatTimer();
    };

    (async () => {
      try {
        const response = await fetch(streamUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          credentials: 'include',
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (initialConnectTimer) { clearTimeout(initialConnectTimer); initialConnectTimer = null; }
          // 401/403 — the JWT used for the SSE stream was rejected. This is
          // the only path where the session is actually expired.
          if (response.status === 401 || response.status === 403) {
            log(`SSE auth rejected (${response.status}) — session expired.`);
            setIsConnected(false);
            setError('session_expired');
            reconnectAttemptsRef.current = maxReconnectAttempts;
            return;
          }
          // 404/502/503 → SSE endpoint not available; soft-degrade silently.
          if (response.status === 404 || response.status === 502 || response.status === 503) {
            log(`SSE endpoint unavailable (${response.status}) — not retrying.`);
            setIsConnected(false);
            setError(null);
            reconnectAttemptsRef.current = maxReconnectAttempts;
            return;
          }
          // Any other non-OK is a transient network/server hiccup — soft-degrade
          // and keep retrying quietly. Do NOT surface as "session expired".
          log(`SSE non-OK status ${response.status} — soft-degrade, will retry.`);
          setIsConnected(false);
          setError(null);
          scheduleReconnect();
          return;
        }
        if (!response.body) {
          throw new Error('SSE response has no body');
        }

        log('SSE response opened');
        // First byte received — clear initial-connect timeout, arm idle/heartbeat timers.
        if (initialConnectTimer) { clearTimeout(initialConnectTimer); initialConnectTimer = null; }
        resetIdleTimer();
        resetHeartbeatTimer();

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            log('SSE stream ended by server');
            break;
          }
          // Any chunk activity resets the idle timer.
          resetIdleTimer();
          buffer += decoder.decode(value, { stream: true });
          // SSE event boundaries are double newlines. Handle both \n\n and \r\n\r\n.
          let sepIdx: number;
          while (true) {
            const lf = buffer.indexOf('\n\n');
            const crlf = buffer.indexOf('\r\n\r\n');
            if (lf === -1 && crlf === -1) { sepIdx = -1; break; }
            if (lf === -1) sepIdx = crlf;
            else if (crlf === -1) sepIdx = lf;
            else sepIdx = Math.min(lf, crlf);
            const sepLen = (sepIdx === crlf && crlf !== -1) ? 4 : 2;
            const block = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + sepLen);
            if (block.length > 0) handleSSEBlock(block);
          }
        }

        // Server closed the stream cleanly → reconnect.
        if (!isUnmountedRef.current && !abortController.signal.aborted) {
          setIsConnected(false);
          scheduleReconnect();
        }
      } catch (err) {
        const aborted = abortController.signal.aborted;
        if (aborted && isUnmountedRef.current) {
          // Component unmounted — don't reconnect.
          return;
        }
        log('SSE stream error:', (err as Error)?.message || err);
        setIsConnected(false);
        // Transient network failure — keep retrying quietly. Don't paint the
        // page red; the session itself is fine.
        setError(null);
        scheduleReconnect();
      } finally {
        clearAllTimers();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, sseUrl, log, redirectOnOffline, maxReconnectAttempts, handleOfflineError]);

  // Connect when authenticated — single useEffect to avoid reconnection loops.
  useEffect(() => {
    isUnmountedRef.current = false;
    if (status === 'authenticated' && session?.user?.access_token) {
      connect();
    }

    return () => {
      isUnmountedRef.current = true;
      log('Closing SSE connection');
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch { /* noop */ }
        abortControllerRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.access_token]);

  return {
    isConnected,
    clientId,
    lastEvent,
    error,
    reconnect: connect,
  };
}

export default useCacheInvalidation;
