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
 *
 * Dedupe (T3): the SAME `(projectId, days)` rollup is requested by several
 * consumers that mount together on one page — e.g. the workflow header's
 * `WorkflowAdnBadge` and the smart-panel's `ProjectKpiStrip` both fetch this
 * project's rollup the instant the workflow opens. A module-level memo (below)
 * gives every consumer ONE shared in-flight promise (and a briefly-warm settled
 * value, so staggered mounts still coalesce), so the backend sees a single GET
 * instead of one per consumer. The returned shape is unchanged — this only
 * affects *how/when* the fetch happens. Correctness is preserved by evicting the
 * memo on the same SSE projects/rollup cache-invalidation the app already
 * broadcasts, so a real change never lingers in the cache.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  getProjectRollup,
  ScoreCardsUnavailableError,
  type ProjectRollup,
} from '@/app/services/command-center/score-cards';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

// ── Module-level rollup memo (dedupe + in-flight promise sharing) ────────────
//
// Keyed by `(projectId, days)`. An entry holds the shared GET promise plus —
// once it settles successfully — the resolved value and a settle timestamp.
// Multiple consumers asking for the same key share the one promise (and, for a
// short window after it settles, the one value), so two near-simultaneous
// mounts produce a single backend request rather than two.

interface RollupCacheEntry {
  /** The shared GET promise — every concurrent consumer awaits this exact one. */
  promise: Promise<ProjectRollup>;
  /** Resolved value, populated once (and only if) the GET settles successfully. */
  value?: ProjectRollup;
  /** ms timestamp of a successful settle; `undefined` while still in-flight. */
  settledAt?: number;
}

const rollupCache = new Map<string, RollupCacheEntry>();

/**
 * How long a settled value may be served without a fresh GET. This is what makes
 * the dedupe robust to *staggered* mounts (the consumers don't always mount in
 * the same React commit). SSE eviction (below) guarantees a genuinely-changed
 * rollup is dropped well before this window matters, so a served value always
 * matches what a fresh GET would have returned.
 */
const ROLLUP_FRESH_MS = 30_000;

/**
 * Cache keys that mean "a project rollup may have changed". The unified projects
 * model tags rollup-affecting writes with `CacheKey.PROJECTS`; the dedicated
 * `project_rollup` / `rollup` literals are matched defensively in case the
 * backend emits a granular key (no `CACHE_KEYS` constant exists for those).
 */
const ROLLUP_INVALIDATION_KEYS: ReadonlySet<string> = new Set([
  CACHE_KEYS.PROJECTS,
  'project_rollup',
  'rollup',
]);

function rollupKey(projectId: string, days?: number): string {
  return `${projectId}::${days ?? ''}`;
}

/**
 * Shared fetch. Returns the in-flight promise when one exists, a still-warm
 * settled value when one is available, else starts (and memoises) a new GET.
 * Failures are never cached — the entry is dropped so a retry / next mount
 * re-fetches cleanly.
 */
function fetchRollupShared(
  projectId: string,
  days?: number,
): Promise<ProjectRollup> {
  const key = rollupKey(projectId, days);
  const existing = rollupCache.get(key);
  if (existing) {
    // Still in-flight → every concurrent consumer awaits the one GET.
    if (existing.settledAt === undefined) return existing.promise;
    // Settled and still warm → reuse without a network round-trip.
    if (
      existing.value !== undefined &&
      Date.now() - existing.settledAt < ROLLUP_FRESH_MS
    ) {
      return Promise.resolve(existing.value);
    }
    // Settled but stale → fall through and refetch (replaces the entry below).
  }

  const promise = getProjectRollup(projectId, days);
  const entry: RollupCacheEntry = { promise };
  rollupCache.set(key, entry);

  promise.then(
    (value) => {
      // Only record if this is still the active entry for the key — a newer
      // fetch or an eviction may have replaced/removed it in the meantime.
      if (rollupCache.get(key) === entry) {
        entry.value = value;
        entry.settledAt = Date.now();
      }
    },
    () => {
      // Don't cache failures — drop so retry / the next mount re-fetches.
      if (rollupCache.get(key) === entry) rollupCache.delete(key);
    },
  );

  return promise;
}

/** Drop one exact `(projectId, days)` entry — used by an explicit refetch. */
function evictRollupKey(projectId: string, days?: number): void {
  rollupCache.delete(rollupKey(projectId, days));
}

/**
 * Drop the SETTLED cached variants for a project (all `days` windows) on SSE
 * invalidation. In-flight entries are deliberately kept: they were started after
 * (or concurrently with) the event and are being shared right now — removing one
 * would force a sibling consumer into a redundant second GET.
 */
function evictRollupProjectSettled(projectId: string): void {
  const prefix = `${projectId}::`;
  for (const [key, entry] of rollupCache) {
    if (key.startsWith(prefix) && entry.settledAt !== undefined) {
      rollupCache.delete(key);
    }
  }
}

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

  const refetch = useCallback(() => {
    // Honor an explicit retry/refresh: drop the memoised entry so we truly
    // re-GET, never hand the user back the stale value they asked to refresh.
    if (projectId) evictRollupKey(projectId, days);
    setReloadKey((k) => k + 1);
  }, [projectId, days]);

  // Evict the module memo when the app's shared SSE stream reports a
  // projects/rollup change, so the next consumer to mount re-fetches. Mounted
  // consumers keep their current data (matching today's behaviour — there is no
  // live auto-refresh on invalidation, only a stale-cache drop).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!projectId || !lastInvalidation) return;
    const keys = lastInvalidation.keys ?? [];
    if (keys.some((k) => ROLLUP_INVALIDATION_KEYS.has(k))) {
      evictRollupProjectSettled(projectId);
    }
  }, [lastInvalidation, projectId]);

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

    // Shared fetch: dedupes against any concurrent consumer of the same
    // `(projectId, days)` so the backend sees ONE GET, not one per consumer.
    fetchRollupShared(projectId, days)
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
