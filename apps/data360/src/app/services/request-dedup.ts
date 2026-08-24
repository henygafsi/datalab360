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
      cache.set(key, { at: Date.now(), data });
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
