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
// Exponential backoff: on consecutive failures, multiply the interval up to
// a 10-minute cap. The backend cache (CP_DATA360.DATA360_CACHE.OVERVIEW_KPIS)
// can be missing if the account bootstrap didn't run — but it might be
// materialised any moment by a backend task, so we keep checking, just less
// often. On the first success, cadence snaps back to POLL_MS.
const MAX_POLL_MS = 600_000; // 10 min cap

export function useOverviewKpis(initialRange: OverviewRange = '30d') {
  const [range, setRange] = useState<OverviewRange>(initialRange);
  const [data, setData] = useState<OverviewKpiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchRef = useRef<number>(0);
  const failuresRef = useRef<number>(0);
  const [currentInterval, setCurrentInterval] = useState<number>(POLL_MS);

  const fetchData = useCallback(
    async (force = false) => {
      // Skip if a request finished < 5s ago (StrictMode double-mount guard)
      if (!force && Date.now() - lastFetchRef.current < 5_000) return;
      setLoading(true);
      try {
        const payload = await getOverviewKpis(range);
        setData(payload);
        setError(null);
        // Recovered — reset backoff to normal cadence.
        if (failuresRef.current > 0) {
          failuresRef.current = 0;
          setCurrentInterval(POLL_MS);
        }
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        failuresRef.current += 1;
        // 60s * 2^n capped at 10min: 60s, 2m, 4m, 8m, 10m, 10m, …
        const next = Math.min(POLL_MS * 2 ** (failuresRef.current - 1), MAX_POLL_MS);
        setCurrentInterval(next);
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

  // Background poll with adaptive interval (resets to POLL_MS on success,
  // backs off on failure).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void fetchData(false);
    }, currentInterval);
    return () => window.clearInterval(timer);
  }, [fetchData, currentInterval]);

  // User-triggered refresh (Refresh button) — always tries immediately,
  // ignores backoff.
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
