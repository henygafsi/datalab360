'use client';

/**
 * useWorkflowSectionCache — a tiny, module-level data cache for the Workflow
 * smart-panel's lazy sections (Deploy / Usage / Cost / Governance / …).
 *
 * WHY THIS EXISTS (latency):
 * The right-bar is already lazy — each section body is conditionally rendered
 * (`{activeSection === X && <Body/>}`), so a section only mounts (and only fires
 * its fetch) when it becomes active. The remaining cost is that conditional
 * rendering UNMOUNTS the previous section, so flipping back to a tab refetched
 * from scratch — a fresh request waterfall on every tab switch. There is no
 * React Query / SWR in this app, so this is the minimal shared primitive that
 * gives "fetch-once, serve-cache-on-revisit" keyed by [workflowId, section].
 *
 * FRESHNESS (no stale-after-mutation regression):
 * The cache is evicted on the app's normal SSE cache-invalidation events (the
 * same `lastInvalidationAtom` + `CACHE_KEYS` spine that `useCacheAwareQuery`
 * uses). Removing refetch-on-activation would otherwise drop the only way these
 * sections refreshed after a Submit-deploy / Run / Save-version mutation; the
 * eviction below restores it. `evictWorkflowSectionCache` deletes the matching
 * entries AND notifies mounted readers so the active section refetches at once,
 * while non-mounted sections simply fetch fresh on their next activation.
 *
 * Semantics:
 *   · enabled + key, no fresh entry  → fetch, cache the result/error
 *   · enabled + key, fresh entry     → serve cache (no network)
 *   · stale entry (> staleTime)      → background refresh, keep showing prior data
 *   · reload()                       → force refetch (Retry / after a mutation)
 *   · in-flight dedupe               → concurrent readers of one key share a call
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getApiErrorMessage } from '@/lib/api-client';

export type SectionFetchState = 'idle' | 'loading' | 'done' | 'error';

export interface SectionQueryResult<T> {
  state: SectionFetchState;
  data: T | null;
  error: string | null;
  /** HTTP status of a failed call (for 404/501 "not deployed yet" handling). */
  errorStatus: number | null;
  /** Force a refetch, bypassing the staleness window. */
  reload: () => void;
}

interface Entry<T> {
  ts: number;
  data?: T;
  error?: string;
  status?: number | null;
  /** In-flight fetch, shared so concurrent readers of one key don't duplicate. */
  promise?: Promise<void>;
}

/** Default freshness window — a re-activation within this serves cache, no call. */
export const WORKFLOW_SECTION_STALE_MS = 60_000;

// Module-level store: survives section unmount/remount (that's the whole point).
const cache = new Map<string, Entry<unknown>>();

// Minimal pub/sub so mounted readers re-render (and re-run their fetch effect)
// when an SSE invalidation evicts their key.
const listeners = new Set<() => void>();
let epoch = 0;
function emit(): void {
  epoch += 1;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getEpoch(): number {
  return epoch;
}

function statusOf(err: unknown): number | null {
  const s = (err as { response?: { status?: number } } | null)?.response?.status;
  return typeof s === 'number' ? s : null;
}

/**
 * Evict every cache entry whose key starts with `prefix` (e.g. `wf:${id}:`).
 * Notifies mounted readers so the active section refetches immediately; the
 * rest fetch fresh on their next activation. Call this from a component that is
 * always mounted (the panel) in response to an SSE invalidation.
 */
export function evictWorkflowSectionCache(prefix: string): void {
  let changed = false;
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) {
      cache.delete(k);
      changed = true;
    }
  }
  if (changed) emit();
}

export function useWorkflowSectionQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { enabled?: boolean; staleTime?: number } = {},
): SectionQueryResult<T> {
  const { enabled = true, staleTime = WORKFLOW_SECTION_STALE_MS } = opts;

  // Re-render on eviction (epoch bump) — and make the fetch-effect depend on it
  // so the active section refetches when its key is evicted.
  const epochSnapshot = useSyncExternalStore(subscribe, getEpoch, getEpoch);

  // Keep the latest fetcher without retriggering the effect (callers recreate it
  // each render). `key` is the cache identity, not the closure.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const run = useCallback(
    async (k: string, bypassStale: boolean) => {
      const existing = cache.get(k) as Entry<T> | undefined;
      const hasFreshData =
        !!existing && existing.data !== undefined && Date.now() - existing.ts < staleTime;
      if (!bypassStale && hasFreshData) return; // serve cache, no network
      if (!bypassStale && existing?.promise) {
        await existing.promise; // dedupe a concurrent in-flight fetch
        return;
      }
      const fetchPromise = (async () => {
        try {
          const data = await fetcherRef.current();
          cache.set(k, { ts: Date.now(), data });
        } catch (err) {
          cache.set(k, { ts: Date.now(), error: getApiErrorMessage(err), status: statusOf(err) });
        }
      })();
      // Mark in-flight. On an explicit reload, drop the prior result so the UI
      // shows a loading state; on a background (stale) refresh, keep showing the
      // previous data to avoid a flash.
      cache.set(
        k,
        bypassStale
          ? { ts: existing?.ts ?? 0, promise: fetchPromise }
          : { ...(existing ?? { ts: 0 }), promise: fetchPromise },
      );
      await fetchPromise;
    },
    [staleTime],
  );

  useEffect(() => {
    if (!enabled || !key) return;
    let ignore = false;
    void run(key, false).then(() => {
      if (!ignore) rerender();
    });
    return () => {
      ignore = true;
    };
    // `epochSnapshot` is intentionally a dep: an eviction bumps it and re-runs
    // the fetch (cache is now empty for this key → fresh call).
  }, [enabled, key, epochSnapshot, run, rerender]);

  const reload = useCallback(() => {
    if (!key) return;
    void run(key, true).then(() => rerender());
  }, [key, run, rerender]);

  const entry = key ? (cache.get(key) as Entry<T> | undefined) : undefined;
  let state: SectionFetchState = 'idle';
  let data: T | null = null;
  let error: string | null = null;
  let errorStatus: number | null = null;
  if (entry?.data !== undefined) {
    state = 'done';
    data = entry.data as T;
  } else if (entry?.error !== undefined) {
    state = 'error';
    error = entry.error;
    errorStatus = entry.status ?? null;
  } else if (enabled && key) {
    state = 'loading';
  }

  return { state, data, error, errorStatus, reload };
}
