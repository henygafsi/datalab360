import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { env } from '@/env.mjs';
import { pagesOptions } from './pages-options';
import { login, LoginData, LoginResponse } from '@/app/services/auth/login';

// Snowflake token typically expires in 1 hour, but we'll use a conservative 55 minutes
const SNOWFLAKE_TOKEN_LIFETIME_MS = 1144 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  debug: process.env.NEXTAUTH_DEBUG === 'true',
  pages: {
    ...pagesOptions,
  },
  session: {
    strategy: 'jwt',
    // Session max age should match or be less than Snowflake token lifetime
    // We use 8 hours as a reasonable session length with token refresh handling
    maxAge: 8 * 60 * 60, // 8 hours
  },
  callbacks: {
    async session({ session, token }) {
      // Build session from JWT token - runs on every authenticated request
      // Check if token might be expired
      const tokenExpired = token.token_issued_at
        ? Date.now() - (token.token_issued_at as number) > SNOWFLAKE_TOKEN_LIFETIME_MS
        : false;

      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub || token.username as string,
          access_token: token.access_token as string,
          account_name: token.account_name as string,
          username: token.username as string,
          role: token.role as string,
          items: token.items as any[],
        },
        // Expose token status for client-side handling
        tokenExpired,
        error: tokenExpired ? 'TokenExpired' : undefined,
      };
    },
    async jwt({ token, user, trigger, session }) {
      // Handle initial sign-in
      if (user) {
        token.account_name = (user as any).account_name;
        token.username = (user as any).username;
        token.role = (user as any).role;
        token.items = (user as any).items;
        token.access_token = (user as any).access_token;
        token.token_type = (user as any).token_type;
        token.token_issued_at = Date.now();
      }

      // Session update trigger — used by the role switcher: the backend mints
      // a FRESH bearer (role + recomputed module items) on POST /user/profile/role
      // and the client pushes it here via useSession().update({...}). The new
      // token is what keys the backend's role-scoped caches, so it MUST replace
      // the login-time one.
      if (trigger === 'update') {
        const s = session as
          | { access_token?: string; role?: string; items?: unknown[] }
          | undefined;
        if (s?.access_token) {
          token.access_token = s.access_token;
          token.token_issued_at = Date.now();
        }
        if (s?.role) token.role = s.role;
        if (s?.items) token.items = s.items;
        if (!s?.access_token && token.access_token) {
          // Legacy refresh path (no payload): just re-stamp issuance.
          token.token_issued_at = Date.now();
        }
      }

      return token;
    },
    async redirect({ url, baseUrl }) {
      // Handle callback URLs securely
      if (url.startsWith('/')) {
        // If it's just the root or sign-in page, redirect to account-overview
        if (url === '/' || url.startsWith('/signin')) {
          return `${baseUrl}/account-overview`;
        }
        // If it's another internal path, use it
        return `${baseUrl}${url}`;
      }
      // If the URL already includes the baseUrl
      if (url.startsWith(baseUrl)) {
        // Check if it's the root path
        if (url === baseUrl || url === `${baseUrl}/` || url.startsWith(`${baseUrl}/signin`)) {
          return `${baseUrl}/account-overview`;
        }
        return url;
      }
      // Default to account-overview (don't allow external redirects)
      return `${baseUrl}/account-overview`;
    },
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        account_name: { label: 'Account Name', type: 'text' },
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Validate required credentials
        if (!credentials?.account_name || !credentials?.username || !credentials?.password) {
          throw new Error('Missing credentials');
        }

        // Sanitize inputs (basic XSS prevention)
        const loginData: LoginData = {
          account_name: credentials.account_name.trim(),
          username: credentials.username.trim(),
          password: credentials.password, // Don't trim password
        };

        try {
          // Call the FastAPI backend for Snowflake authentication
          const response: LoginResponse = await login(loginData);

          // Validate response has required fields
          if (!response.access_token) {
            throw new Error('Invalid response from authentication server');
          }

          // Return user object for JWT callback
          return {
            id: response.username,
            account_name: loginData.account_name,
            access_token: response.access_token,
            token_type: response.token_type || 'Bearer',
            username: response.username,
            role: response.role || 'user',
            items: response.items || [],
          };
        } catch (error: any) {
          if (process.env.NODE_ENV === 'development') {
            // Message only — never log the credentials object (contains the password).
            console.error('[Auth] Login failed:', error?.message ?? error);
          }
          // Rethrow a CLEAN Error carrying the backend `detail` string (already
          // extracted by login()): NextAuth puts a thrown authorize() Error's
          // message into the `?error=` query param / `result.error`, which the
          // sign-in form renders (with a special case for the 250001
          // "Multi-factor authentication is required" enrollment error).
          // A bare rethrow could surface an axios object; normalize to Error.
          const detail =
            typeof error?.message === 'string' && error.message.trim().length > 0
              ? error.message
              : 'Invalid credentials';
          throw new Error(detail);
        }
      },
    }),
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  events: {
    async signOut({ token }) {
      // Optional: Notify backend to invalidate Snowflake session
      if (process.env.NODE_ENV === 'development') {
        console.log('[Auth] User signed out:', token?.username);
      }
    },
  },
};
