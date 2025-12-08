'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { routes } from '@/config/routes';

interface SessionGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * SessionGuard Component
 *
 * Protects routes by checking authentication status.
 * Redirects to login page if user is not authenticated.
 *
 * This provides a second layer of protection after middleware,
 * handling edge cases like:
 * - Session expiration during use
 * - Backend token invalidation
 * - Race conditions during authentication
 */
export default function SessionGuard({ children, fallback }: SessionGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Wait for session to be loaded
    if (status === 'loading') {
      return;
    }

    // If unauthenticated, redirect to login
    if (status === 'unauthenticated') {
      console.warn('[SessionGuard] User not authenticated, redirecting to login');
      router.replace(routes.signIn);
      return;
    }

    // Check if session is valid
    if (status === 'authenticated' && session) {
      // Check token expiration
      const token = session.user?.access_token;
      // Cast user to include potential exp property from JWT
      const user = session.user as { exp?: number } | undefined;
      const tokenExp = user?.exp;

      if (!token) {
        console.warn('[SessionGuard] No access token in session, redirecting to login');
        signOut({ callbackUrl: routes.signIn, redirect: true });
        return;
      }

      // Check if token is expired
      if (tokenExp && typeof tokenExp === 'number') {
        const now = Date.now() / 1000;
        if (now > tokenExp) {
          console.warn('[SessionGuard] Token expired, redirecting to login');
          signOut({ callbackUrl: routes.signIn, redirect: true });
          return;
        }
      }

      // Session is valid
      setIsChecking(false);
    }
  }, [session, status, router]);

  // Show loading state while checking authentication
  if (status === 'loading' || isChecking) {
    return fallback || <SessionGuardLoadingFallback />;
  }

  // If not authenticated after check, show nothing (redirect is happening)
  if (status === 'unauthenticated' || !session) {
    return fallback || <SessionGuardLoadingFallback />;
  }

  // User is authenticated, render children
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
