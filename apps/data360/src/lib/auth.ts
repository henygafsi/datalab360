/**
 * Unified Authentication Utilities
 *
 * This module provides authentication helpers that work in both
 * server-side (SSR) and client-side contexts.
 *
 * IMPORTANT: This file must NOT import authOptions at the top level
 * because authOptions contains server-side only environment variables
 * that will cause errors when bundled for client-side code.
 */

import { getServerSession } from 'next-auth/next';
import { getSession } from 'next-auth/react';
import { Session } from 'next-auth';

/**
 * Authentication headers interface for API requests
 */
export interface AuthHeaders {
  Authorization: string;
  'Content-Type': string;
  'X-Account-Name': string;
  'X-Username': string;
}

/**
 * Session with user data from Snowflake authentication
 */
export interface SnowflakeSession extends Session {
  user: {
    id: string;
    username: string;
    account_name: string;
    access_token: string;
    role: string;
    items?: any[];
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  tokenExpired?: boolean;
  error?: string;
}

/**
 * Check if code is running on the server
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Lazy load authOptions only on server-side to prevent client bundling issues
 */
async function getAuthOptions() {
  const { authOptions } = await import('@/app/api/auth/[...nextauth]/auth-options');
  return authOptions;
}

/**
 * Get session in a context-aware way (works in both server and client)
 *
 * For Server Components / API Routes: Uses getServerSession
 * For Client Components: Uses getSession
 *
 * @returns Session object or null if not authenticated
 */
export async function getAuthSession(): Promise<SnowflakeSession | null> {
  try {
    if (isServer()) {
      // Server-side: use getServerSession with authOptions (lazy loaded)
      const authOptions = await getAuthOptions();
      const session = await getServerSession(authOptions);
      return session as SnowflakeSession | null;
    } else {
      // Client-side: use getSession from next-auth/react
      const session = await getSession();
      return session as SnowflakeSession | null;
    }
  } catch (error) {
    console.error('[Auth] Error getting session:', error);
    return null;
  }
}

/**
 * Get authentication headers for API requests
 * Works in both server and client contexts
 *
 * @throws Error if no valid session/token is available
 * @returns Headers object for authenticated API requests
 */
export async function getAuthHeaders(): Promise<AuthHeaders> {
  const session = await getAuthSession();

  if (!session?.user?.access_token) {
    throw new AuthError('No access token available. Please sign in.');
  }

  // Check if token is expired
  if (session.tokenExpired) {
    throw new TokenExpiredError('Session token has expired. Please sign in again.');
  }

  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
}

/**
 * Get authentication headers without throwing (returns null on failure)
 * Useful for optional authentication scenarios
 */
export async function getAuthHeadersSafe(): Promise<AuthHeaders | null> {
  try {
    return await getAuthHeaders();
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getAuthSession();
  return !!session?.user?.access_token && !session.tokenExpired;
}

/**
 * Get the current user's access token
 * @throws Error if not authenticated
 */
export async function getAccessToken(): Promise<string> {
  const session = await getAuthSession();

  if (!session?.user?.access_token) {
    throw new AuthError('Not authenticated');
  }

  if (session.tokenExpired) {
    throw new TokenExpiredError('Token expired');
  }

  return session.user.access_token;
}

/**
 * Get account name from session
 */
export async function getAccountName(): Promise<string | null> {
  const session = await getAuthSession();
  return session?.user?.account_name || null;
}

/**
 * Get username from session
 */
export async function getUsername(): Promise<string | null> {
  const session = await getAuthSession();
  return session?.user?.username || null;
}

/**
 * Get user role from session
 */
export async function getUserRole(): Promise<string | null> {
  const session = await getAuthSession();
  return session?.user?.role || null;
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Custom error class for token expiration
 */
export class TokenExpiredError extends AuthError {
  constructor(message: string = 'Token expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

/**
 * Type guard to check if error is an auth error
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Type guard to check if error is a token expiration error
 */
export function isTokenExpiredError(error: unknown): error is TokenExpiredError {
  return error instanceof TokenExpiredError;
}

/**
 * Server-side only: Get session for Server Components
 * This is a convenience wrapper that enforces server-side usage
 *
 * @throws Error if called on client side
 */
export async function getServerAuthSession(): Promise<SnowflakeSession | null> {
  if (!isServer()) {
    throw new Error('getServerAuthSession can only be called on the server');
  }
  const authOptions = await getAuthOptions();
  return getServerSession(authOptions) as Promise<SnowflakeSession | null>;
}

/**
 * Server-side only: Get auth headers for server components/API routes
 *
 * @throws Error if called on client side or no session
 */
export async function getServerAuthHeaders(): Promise<AuthHeaders> {
  if (!isServer()) {
    throw new Error('getServerAuthHeaders can only be called on the server');
  }

  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions) as SnowflakeSession | null;

  if (!session?.user?.access_token) {
    throw new AuthError('No access token available');
  }

  return {
    'Authorization': `Bearer ${session.user.access_token}`,
    'Content-Type': 'application/json',
    'X-Account-Name': session.user.account_name || '',
    'X-Username': session.user.username || '',
  };
}
