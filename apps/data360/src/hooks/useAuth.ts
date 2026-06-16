'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';

/** Module name to ID mapping */
const MODULE_ID_MAP: Record<string, number> = {
  connect_datalake: 1,
  explore_design: 2,
  workflow: 3,
  bi_reporting: 4,
  data_quality: 5,
  governance: 6,
  kpis_store: 7,
  dashboard: 8,
  observability: 9,
  intelligent: 10,
  account_overview: 11,
  client_accounts: 12,
};

/** All module IDs for admin roles */
const ALL_MODULE_IDS = Object.values(MODULE_ID_MAP);

/**
 * Shared, cached session-token fetch (kills the /api/auth/session storm).
 * Every useAuth consumer (14+ across the app) previously fired its OWN
 * `fetch('/api/auth/session')` on mount when no localStorage token existed →
 * N concurrent requests + retries spamming the dev log and adding render latency.
 * This dedupes to a SINGLE in-flight request and caches the resolved token
 * module-wide, so all consumers (and all later mounts) resolve instantly with
 * zero extra network — svc-cached auth, ~0 render time cross-page.
 */
let _sessionTokenCache: string | null = null;
let _sessionTokenInFlight: Promise<string | null> | null = null;
function fetchSessionTokenOnce(): Promise<string | null> {
  if (_sessionTokenCache) return Promise.resolve(_sessionTokenCache);
  if (_sessionTokenInFlight) return _sessionTokenInFlight;
  _sessionTokenInFlight = fetch('/api/auth/session')
    .then((r) => r.json())
    .then((session: any) => {
      const t: string | null = session?.user?.access_token || null;
      if (t) _sessionTokenCache = t; // cache so later mounts skip the network entirely
      return t;
    })
    .catch(() => null)
    .finally(() => {
      _sessionTokenInFlight = null; // allow a single retry later if it returned null
    });
  return _sessionTokenInFlight;
}

/**
 * Safe auth hook that works WITHOUT SessionProvider dependency.
 * Reads username + role from JWT token in localStorage.
 * Falls back gracefully if no token exists.
 *
 * Returns { username, isAuthenticated, role, allowedModules }
 * - role defaults to 'ACCOUNTADMIN' if not in JWT
 * - allowedModules defaults to all modules for admin roles
 */
export function useAuth() {
  const [username, setUsername] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState('ACCOUNTADMIN');
  const [allowedModules, setAllowedModules] = useState<number[]>(ALL_MODULE_IDS);

  useEffect(() => {
    let parsedRole = 'ACCOUNTADMIN';
    let authenticated = false;

    const initAuth = (token: string) => {
      if (token && token.includes('.')) {
        const payload = JSON.parse(
          atob(token.split('.')[1] || '{}')
        ) as Record<string, string>;
        const user = payload.sub || payload.username || payload.user || '';
        setUsername(user);
        authenticated = !!user;
        setIsAuthenticated(authenticated);
        parsedRole = payload.role || 'ACCOUNTADMIN';
        setRole(parsedRole);
      }
    };

    try {
      const token =
        localStorage.getItem('access_token') ||
        localStorage.getItem('snowflake_token') ||
        '';
      if (token) {
        initAuth(token);
      } else {
        // Fallback: ONE shared, cached session-token fetch (deduped across all
        // consumers) instead of a per-consumer /api/auth/session storm.
        fetchSessionTokenOnce().then((t) => {
          if (t) {
            localStorage.setItem('access_token', t);
            localStorage.setItem('snowflake_token', t);
            initAuth(t);
          }
        });
      }
    } catch {
      setUsername('');
      setIsAuthenticated(false);
      setRole('ACCOUNTADMIN');
    }

    // Fetch allowed modules for non-admin roles
    if (authenticated) {
      const isAdmin = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'].includes(parsedRole.toUpperCase());
      if (isAdmin) {
        setAllowedModules(ALL_MODULE_IDS);
      } else {
        apiClient
          .get('/user/me/modules')
          .then(({ data }) => {
            const modules = (data?.modules || [])
              .map((m: string) => MODULE_ID_MAP[m] || 0)
              .filter(Boolean);
            if (modules.length > 0) setAllowedModules(modules);
          })
          .catch(() => {
            // Silently fallback to all modules if endpoint unavailable
          });
      }
    }
  }, []);

  return { username, isAuthenticated, role, allowedModules };
}
