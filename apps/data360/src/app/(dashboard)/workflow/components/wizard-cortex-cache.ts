/**
 * wizard-cortex-cache.ts
 *
 * Client-side LRU cache for Cortex /complete responses used by the AI Guided
 * Workflow wizard. The Snowflake Cortex warehouse has a 15s SQL execution
 * limit per call and round-trips are 2-8s in practice — re-opening a draft
 * or stepping back/forward through the wizard re-fires the same prompt and
 * the user waits again for the same answer. Caching the three calls
 * (understanding, workflow, code) makes a re-opened draft feel instant.
 *
 * Persona contract:
 *   - Superadmin sees streaming on FIRST call only (cache miss).
 *   - Admin re-opening the same draft gets a synchronous cache hit + a small
 *     "(cached)" chip in the step header.
 *   - QA's "Regenerate" / retry button MUST bust the matching key before
 *     re-firing — handled by the wizard calling `clearCache(hashKey(...))`
 *     in every retry closure.
 *
 * Storage: localStorage under `data360.wizard.cortex-cache.v1`.
 * TTL: 7 days. Max entries: 50. Eviction: LRU (oldest `timestamp` wins eviction).
 *
 * The cache is intentionally NOT cross-tab synchronized — concurrent edits
 * of the same draft would be a much bigger UX problem to solve and we'd
 * need a backend cache anyway. Per-tab is fine for the use cases above.
 */

export interface CortexCacheEntry {
  kind: 'understanding' | 'workflow' | 'code';
  prompt: string;
  response: string;
  timestamp: number;
}

const STORAGE_KEY = 'data360.wizard.cortex-cache.v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES = 50;

type CacheMap = Record<string, CortexCacheEntry>;

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
    // Drop any entry whose shape doesn't match (forward-compat for v2).
    const cleaned: CacheMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as CortexCacheEntry).response === 'string' &&
        typeof (v as CortexCacheEntry).timestamp === 'number'
      ) {
        cleaned[k] = v as CortexCacheEntry;
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
 * we only need stable string-of-the-key for indexing. Output is base36 to
 * keep the localStorage payload compact.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit multiply: hash * 0x01000193
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned then base36
  return (hash >>> 0).toString(36);
}

/**
 * Build a stable cache key for a wizard Cortex call.
 *
 * Normalization:
 *   - trim whitespace
 *   - slice description to 500 chars (matches the prompt builder's slice)
 *   - DON'T lowercase — Cortex output is case-sensitive (proper nouns,
 *     enum values like "Low|Medium|High" matter)
 *
 * The kind / option / model are included raw so changing any of them
 * produces a distinct key.
 */
export function hashKey(
  kind: string,
  description: string,
  option: string,
  model: string,
): string {
  const desc = description.trim().slice(0, 500);
  return `wizard:${kind}:${model}:${option}:${fnv1a(desc)}`;
}

/**
 * Look up a cached response. Returns the response text or null on miss.
 * Side effect: refreshes the entry's timestamp (used by LRU eviction).
 */
export function getCached(key: string): string | null {
  const map = read();
  const entry = map[key];
  if (!entry) return null;
  // TTL check — drop expired entries lazily on lookup.
  if (Date.now() - entry.timestamp > TTL_MS) {
    delete map[key];
    write(map);
    return null;
  }
  // Touch the entry so subsequent LRU eviction respects recency.
  entry.timestamp = Date.now();
  map[key] = entry;
  write(map);
  return entry.response;
}

/**
 * Insert or update a cached response. Enforces MAX_ENTRIES via LRU eviction
 * (oldest `timestamp` wins eviction).
 */
export function setCached(
  key: string,
  response: string,
  kind: CortexCacheEntry['kind'],
): void {
  const map = read();
  map[key] = {
    kind,
    // We don't store the full prompt — `key` already encodes it. The prompt
    // field is reserved for future "show me what I asked" UI; leave empty
    // to keep payload small.
    prompt: '',
    response,
    timestamp: Date.now(),
  };

  // LRU eviction: if we exceeded MAX_ENTRIES, drop the oldest until we fit.
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
 * Clear cache entries. Pass a full key to evict one entry, or a prefix
 * (e.g. `'wizard:'`) to clear a whole namespace. No arg = wipe all.
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

/**
 * Count cached entries — used by the "Clear AI cache" link to show how many
 * entries will be wiped, so the action is non-surprising.
 */
export function countCached(): number {
  return Object.keys(read()).length;
}
