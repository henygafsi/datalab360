'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { useCacheInvalidation, CACHE_KEYS, CacheKey } from '@/hooks/useCacheInvalidation';
import { atom, useSetAtom, useAtomValue } from 'jotai';
import Link from 'next/link';
import { invalidateMyPermissions } from '@/hooks/useCanPerform';

/**
 * Cache keys that mutate the Action-RBAC allow-set. The backend tags every D360
 * role / permission mutation (create/update/delete role, bulk-set permissions,
 * apply-template) with `CacheKey.GRANTS`; the backend now also emits a dedicated
 * `permissions` key on Action-RBAC matrix writes. `user_permissions` / `roles`
 * are included defensively. When any of these arrives over the SSE stream we drop
 * the cached `my-permissions` set so gated content/buttons re-resolve live —
 * no reload — right after an admin edits the matrix.
 */
const RBAC_INVALIDATION_KEYS: ReadonlySet<string> = new Set([
  CACHE_KEYS.GRANTS,
  CACHE_KEYS.USER_PERMISSIONS,
  CACHE_KEYS.ROLES,
  // Backend emits 'permissions' on D360 action-matrix mutations (in addition to
  // 'grants'); there is no CACHE_KEYS constant for it, so match the literal.
  'permissions',
]);

/**
 * Atom to track which cache keys have been invalidated
 * Components can subscribe to this for reactive updates
 */
const initialInvalidatedKeys: Set<string> = new Set();
export const invalidatedKeysAtom = atom(initialInvalidatedKeys);

interface LastInvalidationInfo {
  keys: string[];
  reason?: string;
  timestamp: Date;
}
export const lastInvalidationAtom = atom<LastInvalidationInfo | null>(null);

interface CacheInvalidationContextType {
  isConnected: boolean;
  clientId: string | null;
  error: string | null;
  reconnect: () => void;
  /**
   * Manually mark a cache key as stale
   * Useful for local mutations before server confirmation
   */
  markStale: (keys: CacheKey[]) => void;
}

const CacheInvalidationContext = createContext<CacheInvalidationContextType | null>(null);

interface CacheInvalidationProviderProps {
  children: ReactNode;
  /**
   * Enable debug logging
   */
  debug?: boolean;
  /**
   * Show connection indicator in UI
   */
  showIndicator?: boolean;
}

/**
 * Provider component for real-time cache invalidation
 *
 * Connects to backend SSE stream and broadcasts cache invalidation events
 * to all subscribed components via Jotai atoms.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <CacheInvalidationProvider debug showIndicator>
 *   {children}
 * </CacheInvalidationProvider>
 *
 * // In any component
 * const { isConnected } = useCacheInvalidationContext();
 * ```
 */
export function CacheInvalidationProvider({
  children,
  debug = false,
  showIndicator = true,
}: CacheInvalidationProviderProps) {
  const setInvalidatedKeys = useSetAtom(invalidatedKeysAtom);
  const setLastInvalidation = useSetAtom(lastInvalidationAtom);

  const handleInvalidate = useCallback((keys: string[], reason?: string) => {
    // Live RBAC re-gate: if an Action-RBAC mutation invalidated the allow-set,
    // drop the cached my-permissions so every useCanPerform consumer re-resolves
    // without a reload (admin edits → content/buttons update in place).
    if (keys.some((k) => RBAC_INVALIDATION_KEYS.has(k))) {
      invalidateMyPermissions();
    }

    // Update the invalidated keys atom
    setInvalidatedKeys((prev: Set<string>) => {
      const newSet = new Set(prev);
      keys.forEach((key) => newSet.add(key));
      return newSet;
    });

    // Update the last invalidation info
    setLastInvalidation({
      keys,
      reason,
      timestamp: new Date(),
    });

    // Clear the invalidated keys after a short delay
    // This allows components to react to the invalidation
    setTimeout(() => {
      setInvalidatedKeys((prev: Set<string>) => {
        const newSet = new Set(prev);
        keys.forEach((key) => newSet.delete(key));
        return newSet;
      });
    }, 100);

    if (debug) {
      console.log('[CacheProvider] Invalidated keys:', keys);
      console.log('[CacheProvider] Reason:', reason);
    }
  }, [setInvalidatedKeys, setLastInvalidation, debug]);

  const { isConnected, clientId, error, reconnect } = useCacheInvalidation({
    onInvalidate: handleInvalidate,
    debug,
    redirectOnOffline: false, // Never auto-signout on SSE failure
  });

  const markStale = useCallback((keys: CacheKey[]) => {
    handleInvalidate(keys, 'Manual invalidation');
  }, [handleInvalidate]);

  return (
    <CacheInvalidationContext.Provider
      value={{
        isConnected,
        clientId,
        error,
        reconnect,
        markStale,
      }}
    >
      {showIndicator && (
        <SSEIndicator isConnected={isConnected} error={error} />
      )}
      {children}
    </CacheInvalidationContext.Provider>
  );
}

/**
 * Hook to access cache invalidation context
 */
export function useCacheInvalidationContext() {
  const context = useContext(CacheInvalidationContext);
  if (!context) {
    throw new Error(
      'useCacheInvalidationContext must be used within CacheInvalidationProvider'
    );
  }
  return context;
}

/**
 * Subscribe to real-time cache-invalidation events WITHOUT opening another SSE
 * stream.
 *
 * The single `CacheInvalidationProvider` (mounted once in the dashboard shell)
 * owns the only `/cache-stream/stream` connection and re-broadcasts every event
 * through {@link lastInvalidationAtom} (a fresh `{ keys, reason, timestamp }`
 * object per event). This hook reads that atom and fires `onInvalidate` exactly
 * once per NEW event — so any number of components can react to invalidations
 * with zero extra connections.
 *
 * IMPORTANT: components must use THIS (or read the atoms directly), never call
 * {@link useCacheInvalidation} directly — each direct call opens its own SSE
 * stream (the duplication this hook exists to eliminate).
 *
 * @param watchKeys keys to react to; omit/empty to fire on every event. The
 *   callback may still do its own finer-grained key check (back-compat with the
 *   previous `onInvalidate` callbacks, which filtered internally).
 * @param onInvalidate called with the invalidated keys + optional reason.
 *
 * @example
 * useOnCacheInvalidation(undefined, (keys) => {
 *   if (keys.includes(CACHE_KEYS.GRANTS)) reload();
 * });
 */
export function useOnCacheInvalidation(
  watchKeys: readonly string[] | ReadonlySet<string> | undefined,
  onInvalidate: (keys: string[], reason?: string) => void,
) {
  const last = useAtomValue(lastInvalidationAtom);
  // Latest callback / keys held in refs so the effect depends ONLY on `last`
  // (a new object ref per event) → it fires exactly once per event, not on every
  // render or whenever an inline callback identity changes.
  const cbRef = useRef(onInvalidate);
  cbRef.current = onInvalidate;
  const keysRef = useRef(watchKeys);
  keysRef.current = watchKeys;
  // Seed with the mount-time value so a pre-existing (pre-mount) event is NOT
  // replayed — matching the old hook, which only fired on events after mount.
  const seenRef = useRef(last);

  useEffect(() => {
    if (last === seenRef.current) return; // no new event since last handled (incl. mount)
    seenRef.current = last;
    if (!last) return;
    const watch = keysRef.current;
    const watchSet = watch ? (watch instanceof Set ? watch : new Set(watch)) : null;
    if (watchSet && watchSet.size > 0 && !last.keys.some((k) => watchSet.has(k))) return;
    cbRef.current(last.keys, last.reason);
  }, [last]);
}

/**
 * Drop-in replacement for {@link useCacheInvalidation} that does NOT open its own
 * SSE stream — it subscribes to the singleton Provider's broadcast instead.
 *
 * Same call shape as the old hook (`{ onInvalidate }`) so a component can switch
 * off the per-component stream by changing only its import, e.g.:
 *   `import { useCacheInvalidationSubscription as useCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';`
 *
 * Only `onInvalidate` is honoured (the other stream-management options —
 * debug/sseUrl/redirectOnOffline/maxReconnectAttempts — belong to the single
 * owning connection and are ignored here). Connection status is available via
 * {@link useCacheInvalidationContext}.
 */
export function useCacheInvalidationSubscription(
  options: { onInvalidate?: (keys: string[], reason?: string) => void } = {},
) {
  const { onInvalidate } = options;
  useOnCacheInvalidation(undefined, (keys, reason) => {
    onInvalidate?.(keys, reason);
  });
}

/**
 * SSE Connection Indicator — clickable. Opens a small status popover with
 * connection state, last sync time, and any error detail. Color encodes status:
 *   green  = connected (real-time sync OK)
 *   amber  = idle / never-connected (informational)
 *   red    = connection error
 */
function SSEIndicator({ isConnected, error }: { isConnected: boolean; error: string | null }) {
  const [open, setOpen] = useState(false);
  const lastInvalidation = useAtomValue(lastInvalidationAtom);

  // Hide silently while connecting on initial mount (no signal worth showing yet).
  if (!isConnected && !error) {
    return null;
  }

  const tone: 'green' | 'red' = isConnected ? 'green' : 'red';
  const palette = {
    green: {
      pill: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
      dot: 'bg-green-500',
      label: 'Real-time sync',
    },
    red: {
      pill: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
      dot: 'bg-red-500',
      label: 'Sync offline',
    },
  }[tone];

  const isSessionExpired = error === 'session_expired';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${palette.label}. Click for details.`}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg border ${palette.pill} hover:opacity-90 transition-opacity`}
      >
        <span className={`w-2 h-2 rounded-full ${palette.dot} ${isConnected ? 'animate-pulse' : ''}`} />
        <span>{palette.label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sync status details"
          className="absolute bottom-full right-0 mb-2 w-72 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-slate-900 dark:text-white">Real-time sync</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close sync status"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Status</dt>
              <dd className={`font-medium ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Last event</dt>
              <dd className="text-slate-700 dark:text-slate-300">
                {lastInvalidation?.timestamp
                  ? lastInvalidation.timestamp.toLocaleTimeString()
                  : '—'}
              </dd>
            </div>
            {lastInvalidation?.reason && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400 flex-shrink-0">Reason</dt>
                <dd className="text-slate-700 dark:text-slate-300 text-right truncate">
                  {lastInvalidation.reason}
                </dd>
              </div>
            )}
            {error && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400 mb-1">Error</dt>
                <dd className="text-red-600 dark:text-red-400 break-words">{error}</dd>
              </div>
            )}
          </dl>
          {isSessionExpired && (
            <Link
              href="/signin"
              className="mt-3 block w-full text-center px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700"
            >
              Sign in again
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export cache keys for convenience
export { CACHE_KEYS };
export type { CacheKey };
