/**
 * useOverviewKpis — single-call payload for the Account-overview Overview tab.
 *
 * Behaviour:
 *   - Hits GET /command-center/overview-kpis?range=<…> on mount and on
 *     range change.
 *   - Re-polls every 60s while the tab is visible (cache TTL is 5min on
 *     the backend, but UI shows a live "Updated Ns ago" indicator).
 *   - `refresh()` triggers the proc-side refresh + immediate re-fetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getOverviewKpis,
  refreshOverviewKpis,
  type OverviewKpiPayload,
  type OverviewRange,
} from '@/app/services/command-center';

const POLL_MS = 60_000;

export function useOverviewKpis(initialRange: OverviewRange = '30d') {
  const [range, setRange] = useState<OverviewRange>(initialRange);
  const [data, setData] = useState<OverviewKpiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(
    async (force = false) => {
      // Skip if a request finished < 5s ago (StrictMode double-mount guard)
      if (!force && Date.now() - lastFetchRef.current < 5_000) return;
      setLoading(true);
      try {
        const payload = await getOverviewKpis(range);
        setData(payload);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setLoading(false);
        lastFetchRef.current = Date.now();
      }
    },
    [range]
  );

  // Initial + range-change fetch
  useEffect(() => {
    void fetchData(true);
  }, [fetchData]);

  // Background poll
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void fetchData(false);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [fetchData]);

  // User-triggered refresh (Refresh button)
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshOverviewKpis(range);
      await fetchData(true);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRefreshing(false);
    }
  }, [range, fetchData]);

  return { range, setRange, data, loading, refreshing, error, refresh };
}
