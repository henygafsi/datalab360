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
  gouvernance: 6,
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
        // Fallback: fetch from NextAuth session and persist to localStorage
        fetch('/api/auth/session')
          .then((r) => r.json())
          .then((session) => {
            const t = session?.user?.access_token;
            if (t) {
              localStorage.setItem('access_token', t);
              localStorage.setItem('snowflake_token', t);
              initAuth(t);
            }
          })
          .catch(() => {});
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
