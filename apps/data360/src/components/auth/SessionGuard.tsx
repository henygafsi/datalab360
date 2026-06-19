'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';
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

  // Handle token expiration
  const handleTokenExpired = useCallback(async () => {
    console.warn('[SessionGuard] Token expired, signing out...');
    await signOut({ redirect: false });
    router.replace(routes.signIn);
  }, [router]);

  // Verify in the BACKGROUND — never block the paint. Dashboard routes are
  // already gated server-side by src/middleware.ts (unauthenticated requests
  // never reach here — they're 302'd to /signin), so by render time the request
  // is authenticated. We only react to a *definitive* client-side change:
  // unauthenticated → redirect, or an expired-token flag → sign out.
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(routes.signIn);
      return;
    }
    if (status === 'authenticated' && (session?.tokenExpired || session?.error === 'TokenExpired')) {
      handleTokenExpired();
    }
  }, [status, session, router, handleTokenExpired]);

  // Only the definitive signed-out state blocks (while we redirect). During
  // 'loading' (and 'authenticated') we render the app shell immediately — no
  // more full-screen "Verifying session..." on every navigation/refresh. A stale
  // local token edge case is still caught by the background effect above.
  if (status === 'unauthenticated' && !hasValidLocalToken()) {
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
