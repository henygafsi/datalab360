'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { useCacheInvalidation, CACHE_KEYS, CacheKey } from '@/hooks/useCacheInvalidation';
import { atom, useSetAtom, useAtomValue } from 'jotai';
import Link from 'next/link';

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

  const isSessionExpired =
    !!error && (error.includes('session expired') || error.includes('Sync offline'));

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
