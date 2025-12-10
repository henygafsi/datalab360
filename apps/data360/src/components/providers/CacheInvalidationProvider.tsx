'use client';

import { createContext, useContext, useCallback, ReactNode } from 'react';
import { useCacheInvalidation, CACHE_KEYS, CacheKey } from '@/hooks/useCacheInvalidation';
import { atom, useSetAtom } from 'jotai';
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
 * SSE Connection Indicator
 */
function SSEIndicator({ isConnected, error }: { isConnected: boolean; error: string | null }) {
  if (isConnected) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg border border-green-200 dark:border-green-800">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        Real-time sync
      </div>
    );
  }

  if (error) {
    // Check if this is a session expiration error
    const isSessionExpired = error.includes('session expired') || error.includes('Sync offline');

    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg border border-red-200 dark:border-red-800">
        <span className="w-2 h-2 bg-red-500 rounded-full" />
        <span>Sync offline</span>
        {isSessionExpired && (
          <Link
            href="/signin"
            className="ml-1 underline hover:text-red-600 dark:hover:text-red-300"
          >
            Sign in
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg border border-amber-200 dark:border-amber-800">
      <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
      Connecting...
    </div>
  );
}

// Re-export cache keys for convenience
export { CACHE_KEYS };
export type { CacheKey };
