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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep latest fetcher without retriggering the effect on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (initial: boolean) => {
    if (initial) setState((s) => (s === 'done' ? 'done' : 'loading'));
    try {
      const d = await fetcherRef.current();
      setData(d);
      setState('done');
      setError(null);
    } catch (e) {
      if (e instanceof NotDeployedError) {
        setState('not-deployed');
      } else {
        setError(getApiErrorMessage(e));
        setState((s) => (s === 'done' ? 'done' : 'error'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enabled) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (liveMs && enabled) timer.current = setInterval(() => void load(false), liveMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMs, ...deps]);

  return { data, state, error, reload: () => void load(true) };
}
