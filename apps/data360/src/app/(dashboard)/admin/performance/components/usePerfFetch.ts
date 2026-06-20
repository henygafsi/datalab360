'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api-client';
import { NotDeployedError } from '@/app/services/admin-performance';

export type PerfState = 'idle' | 'loading' | 'done' | 'error' | 'not-deployed';

/**
 * usePerfFetch — small fetch state machine shared by every axis panel.
 *
 * Distinguishes a "not deployed yet" backend (404/501 → {@link NotDeployedError})
 * from a real error so panels can degrade quietly. Supports an optional live
 * refresh interval (ms) and re-runs whenever `deps` change.
 *
 * Live-poll resilience:
 *   - {@link lastSuccessAt} records the wall-clock of the most recent SUCCESSFUL
 *     fetch (null until the first success). Panels surface it as a
 *     "last updated HH:MM" / stale indicator so a silently-failing poll cannot
 *     masquerade as fresh data.
 *   - `failures` counts CONSECUTIVE errors since the last success. While live and
 *     failing we back off exponentially (interval × 2^failures, capped) rather
 *     than hammering a down endpoint at the base cadence.
 */
export function usePerfFetch<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  liveMs?: number | null,
  /**
   * Gate the fetch. Defaults to true so existing callers are unchanged. Pass
   * `false` (e.g. before an account is selected) to skip firing entirely —
   * prevents the `/performance/null/overview` 403 from a premature null-account
   * fetch. When it flips true, the fetch runs.
   */
  enabled: boolean = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<PerfState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [failures, setFailures] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest fetcher without retriggering the effect on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // Consecutive-failure counter mirrored in a ref so the self-scheduling poll
  // loop can read the current backoff factor without re-subscribing.
  const failuresRef = useRef(0);

  const load = useCallback(async (initial: boolean) => {
    if (initial) setState((s) => (s === 'done' ? 'done' : 'loading'));
    try {
      const d = await fetcherRef.current();
      setData(d);
      setState('done');
      setError(null);
      setLastSuccessAt(Date.now());
      failuresRef.current = 0;
      setFailures(0);
    } catch (e) {
      if (e instanceof NotDeployedError) {
        setState('not-deployed');
        // A not-deployed route is a stable condition, not a flaky failure — don't
        // accrue backoff (the live effect already skips polling a dead route).
      } else {
        setError(getApiErrorMessage(e));
        setState((s) => (s === 'done' ? 'done' : 'error'));
        failuresRef.current += 1;
        setFailures(failuresRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enabled) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  // Live polling with exponential backoff on consecutive failures. We schedule
  // each tick with setTimeout (not a fixed setInterval) so the delay can grow
  // while the endpoint is failing and snap back to the base cadence on recovery.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!liveMs || !enabled) return;

    let cancelled = false;
    const MAX_BACKOFF_MS = 5 * 60_000; // never wait more than 5 min between polls

    const schedule = () => {
      if (cancelled) return;
      // interval × 2^failures, capped — a healthy poll (failures 0) keeps `liveMs`.
      const delay = Math.min(liveMs * 2 ** failuresRef.current, MAX_BACKOFF_MS);
      timer.current = setTimeout(async () => {
        if (cancelled) return;
        await load(false);
        schedule();
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMs, enabled, ...deps]);

  return {
    data,
    state,
    error,
    /** Epoch ms of the most recent successful fetch (null until first success). */
    lastSuccessAt,
    /** Consecutive errors since the last success (0 when healthy). */
    failures,
    reload: () => void load(true),
  };
}
