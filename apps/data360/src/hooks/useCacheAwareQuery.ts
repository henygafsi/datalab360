/**
 * Cache-aware query hook that automatically refetches when SSE cache invalidation events occur
 *
 * This hook wraps standard data fetching with cache invalidation awareness,
 * triggering automatic refetches when the backend broadcasts invalidation events.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { invalidatedKeysAtom, lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import type { CacheKey } from './useCacheInvalidation';

interface UseCacheAwareQueryOptions<T> {
  /**
   * Cache keys this query depends on
   * When any of these keys are invalidated, the query will refetch
   */
  cacheKeys: CacheKey[];
  /**
   * Whether the query is enabled
   */
  enabled?: boolean;
  /**
   * Initial data to use before fetch completes
   */
  initialData?: T;
  /**
   * Debounce time in ms for refetches (default: 100ms)
   */
  debounceMs?: number;
}

interface UseCacheAwareQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  /** Whether the data is stale and a refetch is pending */
  isStale: boolean;
  /** Timestamp of last successful fetch */
  lastFetchedAt: Date | null;
}

/**
 * Cache-aware query hook
 *
 * @example
 * ```tsx
 * function ProjectsList() {
 *   const { data, loading, isStale } = useCacheAwareQuery(
 *     () => fetchProjects(),
 *     {
 *       cacheKeys: ['projects', 'table_mappings'],
 *       enabled: true,
 *     }
 *   );
 *
 *   return (
 *     <div>
 *       {isStale && <span>Refreshing...</span>}
 *       {data?.map(project => <ProjectCard key={project.id} {...project} />)}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCacheAwareQuery<T>(
  fetchFn: () => Promise<T>,
  options: UseCacheAwareQueryOptions<T>
): UseCacheAwareQueryResult<T> {
  const { cacheKeys, enabled = true, initialData, debounceMs = 100 } = options;

  const [data, setData] = useState<T | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const invalidatedKeys = useAtomValue(invalidatedKeysAtom);
  const lastInvalidation = useAtomValue(lastInvalidationAtom);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const fetchFnRef = useRef(fetchFn);

  // Update fetchFn ref
  fetchFnRef.current = fetchFn;

  // Create stable cache keys string for dependency
  const cacheKeysString = useMemo(() => cacheKeys.sort().join(','), [cacheKeys]);

  const doFetch = useCallback(async () => {
    if (!enabled || !mountedRef.current) return;

    setLoading(true);
    try {
      const result = await fetchFnRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setIsStale(false);
        setLastFetchedAt(new Date());
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      doFetch();
    } else {
      setLoading(false);
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [enabled, cacheKeysString]); // Re-fetch when cache keys change

  // Watch for cache invalidation events
  useEffect(() => {
    if (!lastInvalidation || !enabled) return;

    // Check if any of our cache keys were invalidated
    const shouldRefetch = lastInvalidation.keys.some(key =>
      cacheKeys.includes(key as CacheKey)
    );

    if (shouldRefetch) {
      // Mark as stale immediately
      setIsStale(true);

      // Debounce the actual refetch
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        doFetch();
      }, debounceMs);
    }
  }, [lastInvalidation, cacheKeys, enabled, doFetch, debounceMs]);

  const refetch = useCallback(async () => {
    setIsStale(true);
    await doFetch();
  }, [doFetch]);

  return {
    data,
    loading,
    error,
    refetch,
    isStale,
    lastFetchedAt,
  };
}

/**
 * Hook to check if specific cache keys have been invalidated
 * Useful for components that need to know about invalidation without refetching
 */
export function useCacheInvalidationWatcher(cacheKeys: CacheKey[]) {
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  const [wasInvalidated, setWasInvalidated] = useState(false);

  useEffect(() => {
    if (!lastInvalidation) return;

    const shouldNotify = lastInvalidation.keys.some(key =>
      cacheKeys.includes(key as CacheKey)
    );

    if (shouldNotify) {
      setWasInvalidated(true);
      // Reset after a short delay
      const timer = setTimeout(() => setWasInvalidated(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [lastInvalidation, cacheKeys]);

  return {
    wasInvalidated,
    lastInvalidation,
  };
}

export type { CacheKey };
