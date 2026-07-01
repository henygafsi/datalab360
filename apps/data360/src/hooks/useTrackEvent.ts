'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import apiClient from '@/lib/api-client';

/**
 * Lightweight frontend event tracking for Data360.
 * Sends batched events to backend POST /api/data360/track (non-blocking, fire-and-forget).
 *
 * Events tracked:
 * - PAGE_VIEW: automatic on route change
 * - TAB_SWITCH: manual call
 * - FEATURE_CLICK: manual call
 * - ERROR_ENCOUNTER: manual call
 * - SEARCH_QUERY: manual call
 * - EXPORT_ACTION: manual call
 */

interface TrackEventPayload {
  event_type: string;
  module: string;
  action: string;
  details?: Record<string, unknown>;
}

// Debounce page views to prevent rapid-fire on route changes
const PAGE_VIEW_DEBOUNCE_MS = 500;

// Batch events to reduce network calls (send every 10s or when batch reaches 10 events)
const BATCH_INTERVAL_MS = 10000;
const MAX_BATCH_SIZE = 10;

let eventBatch: TrackEventPayload[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch(): void {
  if (eventBatch.length === 0) return;

  const events = [...eventBatch];
  eventBatch = [];

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Fire-and-forget via apiClient (auth headers added automatically by interceptor)
  apiClient
    .post('/api/data360/track', { events })
    .catch(() => {
      // Silent fail — tracking should never break the app
    });
}

function queueEvent(payload: TrackEventPayload): void {
  eventBatch.push({
    ...payload,
    details: {
      ...payload.details,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.pathname : '',
    },
  });

  if (eventBatch.length >= MAX_BATCH_SIZE) {
    flushBatch();
  } else if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushBatch();
      batchTimer = null;
    }, BATCH_INTERVAL_MS);
  }
}

/** Detect Data360 module from the current URL pathname. */
function detectModule(pathname: string): string {
  if (pathname.includes('account-overview')) return 'account_overview';
  // 'data-product' before 'data-source' — neither overlaps, but keep the
  // most specific data-* routes ahead of the generic connect bucket.
  if (pathname.includes('data-product')) return 'data_products';
  if (pathname.includes('data-source')) return 'connect';
  if (pathname.includes('explore-design')) return 'explore_design';
  if (pathname.includes('mapping')) return 'mapping';
  if (pathname.includes('workflow')) return 'workflow';
  if (pathname.includes('bi-dashboard')) return 'bi_dashboard';
  if (pathname.includes('governance')) return 'governance';
  if (pathname.includes('data-quality')) return 'data_quality';
  if (pathname.includes('intelligent')) return 'cortex';
  if (pathname.includes('observability')) return 'observability';
  if (pathname.includes('client-accounts')) return 'client_accounts';
  // 'administration' contains 'admin', so the admin bucket below also catches it.
  if (pathname.includes('admin')) return 'admin';
  return 'unknown';
}

/**
 * Hook: auto-tracks PAGE_VIEW on route change and exposes manual tracking helpers.
 *
 * Usage:
 *   const { trackTabSwitch, trackFeatureClick, trackError } = useTrackEvent();
 *   trackTabSwitch('warehouses');
 *   trackFeatureClick('deploy_model', { tables: 5 });
 *   trackError('Failed to load policies');
 */
export function useTrackEvent() {
  const pathname = usePathname();
  const lastPageView = useRef<string>('');
  const pageViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-track page views on route change (debounced)
  useEffect(() => {
    if (pathname === lastPageView.current) return;

    if (pageViewTimer.current) clearTimeout(pageViewTimer.current);
    pageViewTimer.current = setTimeout(() => {
      lastPageView.current = pathname;
      queueEvent({
        event_type: 'PAGE_VIEW',
        module: detectModule(pathname),
        action: 'view',
        details: { page: pathname },
      });
    }, PAGE_VIEW_DEBOUNCE_MS);

    return () => {
      if (pageViewTimer.current) clearTimeout(pageViewTimer.current);
    };
  }, [pathname]);

  // Flush pending events on page unload
  useEffect(() => {
    const handleUnload = () => flushBatch();
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const trackTabSwitch = useCallback(
    (tabName: string) => {
      queueEvent({
        event_type: 'TAB_SWITCH',
        module: detectModule(pathname),
        action: tabName,
      });
    },
    [pathname],
  );

  const trackFeatureClick = useCallback(
    (featureName: string, details?: Record<string, unknown>) => {
      queueEvent({
        event_type: 'FEATURE_CLICK',
        module: detectModule(pathname),
        action: featureName,
        details,
      });
    },
    [pathname],
  );

  const trackError = useCallback(
    (errorMessage: string, details?: Record<string, unknown>) => {
      queueEvent({
        event_type: 'ERROR_ENCOUNTER',
        module: detectModule(pathname),
        action: 'error',
        details: { error: errorMessage, ...details },
      });
    },
    [pathname],
  );

  const trackSearch = useCallback(
    (query: string) => {
      queueEvent({
        event_type: 'SEARCH_QUERY',
        module: detectModule(pathname),
        action: 'search',
        details: { query },
      });
    },
    [pathname],
  );

  const trackExport = useCallback(
    (format: string, details?: Record<string, unknown>) => {
      queueEvent({
        event_type: 'EXPORT_ACTION',
        module: detectModule(pathname),
        action: format,
        details,
      });
    },
    [pathname],
  );

  return {
    trackTabSwitch,
    trackFeatureClick,
    trackError,
    trackSearch,
    trackExport,
  };
}
