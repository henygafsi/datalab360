/**
 * ai-guided-cache.ts
 *
 * Client-side LRU cache for the Cortex calls fired by the AI-Guided Modeling
 * wizard's Detect step (`aiClassifyColumns` + `detectRelations`).
 *
 * Cache-reuse decision
 * --------------------
 * The workflow wizard ships `wizard-cortex-cache.ts`. We deliberately do NOT
 * import it: its public `hashKey(kind, description, option, model)` signature
 * and `kind: 'understanding' | 'workflow' | 'code'` union are workflow-shaped
 * (free-text description + model id). This wizard's cache key is a different
 * shape entirely — `projectId + sorted(table FQNs) + step` — and its kinds are
 * `'classify' | 'relations'`. Shoehorning a table-set key through the
 * description-shaped signature would be uglier than a small copy, so this is
 * option (b) from the task: a copy with the same get/set/clear API, a retyped
 * `kind` union, and a distinct STORAGE_KEY so the two caches never collide.
 *
 * Storage: localStorage under `data360.ai-guided.cortex-cache.v1`.
 * TTL: 7 days. Max entries: 50. Eviction: LRU (oldest `timestamp` wins).
 * Per-tab only — not cross-tab synchronized (same trade-off as the workflow
 * cache; concurrent edits of the same draft would need a backend cache).
 */

export type AiGuidedCacheKind = 'classify' | 'relations';

export interface AiGuidedCacheEntry {
  kind: AiGuidedCacheKind;
  /** Serialized detection result (JSON.stringify of the API payload). */
  response: string;
  timestamp: number;
}

const STORAGE_KEY = 'data360.ai-guided.cortex-cache.v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES = 50;

type CacheMap = Record<string, AiGuidedCacheEntry>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function read(): CacheMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheMap;
    if (!parsed || typeof parsed !== 'object') return {};
    const cleaned: CacheMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as AiGuidedCacheEntry).response === 'string' &&
        typeof (v as AiGuidedCacheEntry).timestamp === 'number'
      ) {
        cleaned[k] = v as AiGuidedCacheEntry;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function write(map: CacheMap): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled — silently drop the cache.
  }
}

/**
 * Tiny FNV-1a-style 32-bit hash. Cryptographic strength is not required —
 * we only need a stable, compact string-of-the-key for indexing.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Build a stable cache key for an AI-Guided detection call.
 *
 * Key = `aiguided:<kind>:<projectId>:<fnv1a(sorted table FQNs)>`.
 * The table FQNs are sorted so the same set in any order hits the same entry —
 * an Admin re-running detection on identical tables gets a synchronous hit.
 */
export function hashKey(
  kind: AiGuidedCacheKind,
  projectId: string,
  tableFqns: string[],
): string {
  const sorted = [...tableFqns].sort().join('|');
  return `aiguided:${kind}:${projectId}:${fnv1a(sorted)}`;
}

/**
 * Look up a cached response. Returns the serialized response or null on miss.
 * Side effect: refreshes the entry's timestamp (used by LRU eviction).
 */
export function getCached(key: string): string | null {
  const map = read();
  const entry = map[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    delete map[key];
    write(map);
    return null;
  }
  entry.timestamp = Date.now();
  map[key] = entry;
  write(map);
  return entry.response;
}

/**
 * Insert or update a cached response. Enforces MAX_ENTRIES via LRU eviction.
 */
export function setCached(
  key: string,
  response: string,
  kind: AiGuidedCacheKind,
): void {
  const map = read();
  map[key] = { kind, response, timestamp: Date.now() };

  const entries = Object.entries(map);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.length - MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      delete map[entries[i][0]];
    }
  }
  write(map);
}

/**
 * Clear cache entries. Pass a full key to evict one, a prefix (e.g.
 * `'aiguided:'`) to clear a namespace, or no arg to wipe all.
 */
export function clearCache(prefix?: string): void {
  if (!isBrowser()) return;
  if (!prefix) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  const map = read();
  let changed = false;
  for (const k of Object.keys(map)) {
    if (k === prefix || k.startsWith(prefix)) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) write(map);
}
