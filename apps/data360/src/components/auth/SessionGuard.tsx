'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { routes } from '@/config/routes';

interface SessionGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * SessionGuard Component
 *
 * Protects routes by checking authentication status and token validity.
 * Redirects to login page if user is not authenticated or token is expired.
 *
 * Features:
 * - Checks session status via NextAuth
 * - Monitors token expiration
 * - Handles graceful redirect on auth failures
 */
/**
 * Synchronous, network-free check for an already-valid JWT in localStorage.
 * Lets the guard render the app shell IMMEDIATELY instead of blocking the whole
 * screen behind a `/api/auth/session` round-trip + hydration on every load — the
 * cause of the multi-second full-screen "Verifying session..." that reads as a loop.
 */
function hasValidLocalToken(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token =
      localStorage.getItem('access_token') || localStorage.getItem('snowflake_token');
    if (!token || !token.includes('.')) return false;
    const payload = JSON.parse(atob(token.split('.')[1] || '{}')) as { exp?: number };
    // exp is unix seconds; render if absent or still in the future.
    if (payload.exp && payload.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export default function SessionGuard({ children, fallback }: SessionGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  // Optimistic: a valid local JWT lets us render now and verify in the background.
  const [optimistic, setOptimistic] = useState(false);
  useEffect(() => {
    setOptimistic(hasValidLocalToken());
  }, []);

  // Handle token expiration
  const handleTokenExpired = useCallback(async () => {
    console.warn('[SessionGuard] Token expired, signing out...');
    await signOut({ redirect: false });
    router.replace(routes.signIn);
  }, [router]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated') {
      router.replace(routes.signIn);
      return;
    }

    if (status === 'authenticated') {
      // Check for token expiration flag from session callback
      if (session?.tokenExpired || session?.error === 'TokenExpired') {
        handleTokenExpired();
        return;
      }
      setIsReady(true);
    }
  }, [status, session, router, handleTokenExpired]);

  // If the background check DEFINITIVELY says signed-out, stop and redirect —
  // even if we were rendering optimistically from a stale local token.
  if (status === 'unauthenticated') {
    return fallback || <SessionGuardLoadingFallback />;
  }

  // Render as soon as EITHER the session verified (isReady) OR a valid local
  // token exists (optimistic). No more waiting on the network for every page.
  if (!isReady && !optimistic) {
    return fallback || <SessionGuardLoadingFallback />;
  }

  return <>{children}</>;
}

/**
 * Default loading fallback for SessionGuard
 */
function SessionGuardLoadingFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Verifying session...
        </p>
      </div>
    </div>
  );
}
