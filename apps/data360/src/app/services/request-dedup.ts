/**
 * dedupGet — module-level GET dedup + short TTL cache.
 *
 * The app has no client-side query cache (no React Query/SWR), so several
 * components independently fetching the same endpoint fire N identical
 * requests per page load (measured live: /command-center/recommendations ×3,
 * /administration/account-health ×2, /command-center/overview-kpis ×2).
 * Until a proper query cache lands (P1), this collapses same-key calls into
 * one request and serves repeats from a short-TTL cache.
 *
 * Key discipline: the key must encode every request parameter that changes
 * the payload (e.g. `cc:recos:${days ?? 'default'}`).
 */
const cache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

export async function dedupGet<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const p = fetcher()
    .then((data) => {
      // B2: a heavy read may answer a cache miss with HTTP 200
      // { state:'preparing', … } while it computes in the background. That
      // envelope is a TRANSIENT signal — caching it for the TTL would pin
      // every retry to "preparing" long after the data is ready. Share it
      // with concurrent callers (in-flight dedup) but never store it.
      if ((data as { state?: unknown } | null)?.state !== 'preparing') {
        cache.set(key, { at: Date.now(), data });
      }
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}

/** Drop cached entries whose key starts with `prefix` (e.g. after a mutation
 *  or an SSE cache-invalidation event). */
export function invalidateDedup(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
