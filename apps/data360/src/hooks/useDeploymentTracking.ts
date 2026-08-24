/**
 * Hooks for deployment tracking.
 *
 * useActiveDeployments — event-driven: fetches once on mount, then refreshes
 *   on the shared SSE `deployments` cache-invalidation events (every lifecycle
 *   mutation fires one server-side) + on tab re-focus, with a slow 120s safety
 *   poll as the only timer. Drives the header progress chip and the "Resume
 *   deploy" links in the notification dropdown.
 *
 *   (Previously this polled /deployments/track every 10s on every dashboard
 *   page — ~8.6k Snowflake queries/day per open tab. The SSE channel already
 *   existed; the poll was redundant.)
 *
 * useDeploymentDetail — single-deployment refresh on the same SSE events
 *   (step mutations invalidate `deployments`) + a 30s safety poll while the
 *   deployment is non-terminal. Used by the deploy popup when reopened.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDeployment,
  isTerminal,
  listActiveDeployments,
  type DeploymentRow,
} from '@/app/services/deployment-tracking';
import { pingNotifications } from '@/hooks/useNotifications';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useOnCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';

// Slow safety net only — SSE invalidation is the primary refresh signal.
const ACTIVE_POLL_MS = 120_000;
// Exponential backoff cap for repeated failures (e.g. DEPLOYMENTS table not
// yet bootstrapped). 120s → 240s → … → cap 10min. Resets on success.
const ACTIVE_MAX_POLL_MS = 600_000;
// Hard stop after this many consecutive failures. The /deployments/track
// endpoint is one we know returns 404 in some deploys, so a permanent
// stop keeps the console quiet and reduces XHR noise to zero.
const ACTIVE_MAX_FAILURES = 5;
const DETAIL_POLL_MS = 30_000;
const DETAIL_POLL_MS_BG = 60_000; // when tab is hidden

// ----- Active deployments (header chip + dropdown) ----------------------
export function useActiveDeployments() {
  const [items, setItems] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Refs survive renders without triggering re-fires. setPollInterval is
  // intentionally NOT in the effect deps because re-creating the interval
  // every backoff bump would fire an immediate `void refresh()`, causing 404 spam.
  const failuresRef = useRef<number>(0);
  const deadRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tick, setTick] = useState(0); // bump to re-create the interval after backoff

  const refresh = useCallback(async () => {
    if (deadRef.current) return;
    setLoading(true);
    try {
      const list = await listActiveDeployments();
      setItems(list);
      setError(null);
      if (failuresRef.current > 0) {
        failuresRef.current = 0;
        setTick((t) => t + 1); // reset interval to base
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      failuresRef.current += 1;
      if (failuresRef.current >= ACTIVE_MAX_FAILURES) {
        deadRef.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        setTick((t) => t + 1); // re-create interval at the new (longer) cadence
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Primary refresh signal: the shared SSE stream. Every deployment lifecycle
  // mutation fires an `deployments` invalidation server-side, so the chip
  // updates within the SSE latency instead of a poll tick.
  useOnCacheInvalidation([CACHE_KEYS.DEPLOYMENTS], () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    void refresh();
  });

  // Compute current cadence from failures (no extra state, no extra
  // re-renders just to bump the interval).
  const currentInterval =
    failuresRef.current === 0
      ? ACTIVE_POLL_MS
      : Math.min(
          ACTIVE_POLL_MS * 2 ** (failuresRef.current - 1),
          ACTIVE_MAX_POLL_MS,
        );

  // Initial fetch — runs ONCE on mount only.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety-net timer only. Does NOT call refresh() in the body — only the
  // interval tick fires it, so the effect doesn't re-fire every time the
  // interval changes (which caused 404 spam).
  useEffect(() => {
    if (deadRef.current) return;
    // Skip the tick while the tab is hidden — the header chip isn't visible, so
    // there's no reason to hit /deployments/track in the background. Resume
    // (with an immediate refresh) when the tab becomes visible again.
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    }, currentInterval);
    intervalRef.current = id;
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) void refresh();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(id);
      intervalRef.current = null;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { items, loading, error, refresh };
}

// ----- Single deployment detail -----------------------------------------
export function useDeploymentDetail(deploymentId: string | null) {
  const [row, setRow] = useState<DeploymentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true);
    try {
      const r = await getDeployment(deploymentId);
      setRow(r);
      setError(null);
      // When the status flips to terminal, ping the badge bus so the bell
      // counter refreshes without waiting for its own poll.
      if (lastStatusRef.current && lastStatusRef.current !== r.status) {
        pingNotifications();
      }
      lastStatusRef.current = r.status;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  // Step mutations invalidate `deployments` server-side — refresh on the SSE
  // event instead of a 2s poll. The timer below is only a safety net.
  useOnCacheInvalidation([CACHE_KEYS.DEPLOYMENTS], () => {
    if (!deploymentId) return;
    if (row && isTerminal(row.status)) return;
    void refresh();
  });

  useEffect(() => {
    if (!deploymentId) {
      setRow(null);
      return;
    }
    void refresh();
    let timer: number;
    const schedule = () => {
      const next =
        row && isTerminal(row.status)
          ? 0 // stop polling
          : document.hidden
            ? DETAIL_POLL_MS_BG
            : DETAIL_POLL_MS;
      if (next > 0) {
        timer = window.setTimeout(async () => {
          await refresh();
          schedule();
        }, next);
      }
    };
    schedule();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId, row?.status]);

  return { row, loading, error, refresh };
}
