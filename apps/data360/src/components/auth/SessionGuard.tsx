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
export default function SessionGuard({ children, fallback }: SessionGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

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

  // Show loading state while session is being determined
  if (status === 'loading' || !isReady) {
    return fallback || <SessionGuardLoadingFallback />;
  }

  // If not authenticated, show loading (redirect is happening)
  if (status === 'unauthenticated') {
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
