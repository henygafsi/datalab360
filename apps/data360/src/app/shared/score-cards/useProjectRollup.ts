'use client';

/**
 * useProjectRollup — a thin client hook over `getProjectRollup` (Data360 G7).
 *
 * Wraps the precomputed per-project KPI rollup
 * (`GET /command-center/projects/{id}/rollup`) with loading / error / data +
 * an idempotent `refetch`. Mirrors the availability contract of the score-cards
 * service: a 404/501 surfaces as `unavailable` (the feature isn't provisioned
 * on this backend yet — render nothing, never a failing Retry), while any other
 * failure (5xx / network / auth) is a genuine, retryable `error`.
 *
 * A fetch-effect with an `ignore` cleanup flag guards against setState after
 * unmount or out-of-order responses; passing a falsy `projectId` is a no-op
 * (clears state) so the hook is safe to call before a project is selected.
 */
// ////dependency//// shared.score-cards → services.command-center.score-cards
import { useCallback, useEffect, useState } from 'react';
import {
  getProjectRollup,
  ScoreCardsUnavailableError,
  type ProjectRollup,
} from '@/app/services/command-center/score-cards';

export interface UseProjectRollupResult {
  /** The composed rollup, or null while loading / on error / when unavailable. */
  data: ProjectRollup | null;
  /** True from the moment a fetch starts until it settles. */
  loading: boolean;
  /** Genuine, retryable failure (5xx / network / auth) — show a retry affordance. */
  error: boolean;
  /** Route not provisioned (404/501) — render nothing, no pointless Retry. */
  unavailable: boolean;
  /** Re-run the fetch (e.g. after a cache invalidation or a manual refresh). */
  refetch: () => void;
}

/**
 * @param projectId The project to scope the rollup to. Falsy → no fetch.
 * @param days      Optional lookback window (defaults to the backend default, 30).
 */
export function useProjectRollup(
  projectId: string | null | undefined,
  days?: number,
): UseProjectRollupResult {
  const [data, setData] = useState<ProjectRollup | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [unavailable, setUnavailable] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // No project selected yet → clear and bail (no spurious fetch).
    if (!projectId) {
      setData(null);
      setLoading(false);
      setError(false);
      setUnavailable(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(false);
    setUnavailable(false);
    setData(null);

    getProjectRollup(projectId, days)
      .then((result) => {
        if (ignore) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setLoading(false);
        // 404/501 → quiet unavailable; everything else → retryable error.
        if (err instanceof ScoreCardsUnavailableError) setUnavailable(true);
        else setError(true);
      });

    return () => {
      ignore = true;
    };
  }, [projectId, days, reloadKey]);

  return { data, loading, error, unavailable, refetch };
}

export default useProjectRollup;
