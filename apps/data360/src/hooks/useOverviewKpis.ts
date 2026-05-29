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
const MAX_POLL_MS = 600_000; // 10 min cap
// Hard stop after 5 consecutive failures. The overview-kpis cache is known
// to 404 in some deploys (CP_DATA360.DATA360_CACHE schema missing), so a
// permanent stop after ~5 min of failures keeps the console quiet for the
// rest of the session. The page falls back to /command-center/summary
// which is always available. User can still hit Refresh to retry manually.
const MAX_FAILURES = 5;

export function useOverviewKpis(initialRange: OverviewRange = '30d') {
  const [range, setRange] = useState<OverviewRange>(initialRange);
  const [data, setData] = useState<OverviewKpiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastFetchRef = useRef<number>(0);
  const failuresRef = useRef<number>(0);
  const deadRef = useRef<boolean>(false);
  const [tick, setTick] = useState(0); // bump to re-create interval after backoff

  const fetchData = useCallback(
    async (force = false) => {
      if (deadRef.current) return;
      // Skip if a request finished < 5s ago (StrictMode double-mount guard)
      if (!force && Date.now() - lastFetchRef.current < 5_000) return;
      setLoading(true);
      try {
        const payload = await getOverviewKpis(range);
        setData(payload);
        setError(null);
        if (failuresRef.current > 0) {
          failuresRef.current = 0;
          setTick((t) => t + 1); // reset interval to base
        }
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_FAILURES) {
          deadRef.current = true; // stop polling for the session
        } else {
          setTick((t) => t + 1); // re-create interval at the new cadence
        }
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

  // Background poll. The interval is re-created when tick or range changes,
  // but does NOT call fetchData() in the body — only the interval's tick
  // fires it. That avoids the "fire immediately on every backoff bump"
  // spam bug.
  useEffect(() => {
    if (deadRef.current) return;
    const currentInterval =
      failuresRef.current === 0
        ? POLL_MS
        : Math.min(POLL_MS * 2 ** (failuresRef.current - 1), MAX_POLL_MS);
    const timer = window.setInterval(() => {
      if (!document.hidden) void fetchData(false);
    }, currentInterval);
    return () => window.clearInterval(timer);
  }, [tick, fetchData]);

  // User-triggered refresh — resets dead/backoff state and tries once.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    failuresRef.current = 0;
    deadRef.current = false;
    setTick((t) => t + 1);
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
