/**
 * Centralized Database Configuration
 *
 * This file contains all database-related constants to ensure consistency
 * and security across the application. All hardcoded database/schema names
 * should reference this configuration.
 */

// Environment-based configuration with secure defaults
const ENV_PRIMARY_DB = process.env.NEXT_PUBLIC_PRIMARY_DB || 'CP_DATA360';
// HTTPS is not yet available on the backend, so the server-side default and the
// bare-host upgrade both use http. An explicit https:// URL in the env var is
// still honored for when the backend gains TLS.
const DEFAULT_SERVER_API_URL = 'http://api.datalab360.io';

// Client-side calls go through the Next.js rewrite (`/api-proxy/*`) so the browser
// only sees same-origin HTTPS — the rewrite proxies to the backend over HTTP on
// the server. Server-side calls (NextAuth authorize, RSC, route handlers) hit the
// backend directly using NEXT_PUBLIC_API_URL.
function resolveApiUrl(rawUrl: string): string {
  if (typeof window !== 'undefined') return '/api-proxy';
  let url = (rawUrl || '').trim();
  if (!url) return DEFAULT_SERVER_API_URL;
  if (url.startsWith('//')) url = `http:${url}`;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

const ENV_API_URL = resolveApiUrl(
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_SERVER_API_URL,
);

/**
 * Database Configuration Constants
 */
export const DATABASE_CONFIG = {
  // Primary database name
  PRIMARY_DATABASE: ENV_PRIMARY_DB,

  // Schema names
  SCHEMAS: {
    GOVERNANCE: 'gouvernance',
    RETAIL: 'RETAIL_DW',
    PUBLIC: 'PUBLIC',
    INFORMATION_SCHEMA: 'INFORMATION_SCHEMA',
  },

  // Fully qualified schema names (database.schema format)
  FQN: {
    GOVERNANCE: `${ENV_PRIMARY_DB.toLowerCase()}.gouvernance`,
    RETAIL: `${ENV_PRIMARY_DB}.RETAIL_DW`,
  },
} as const;

/**
 * API Configuration Constants
 */
export const API_CONFIG = {
  BASE_URL: ENV_API_URL,

  // API endpoint prefixes
  ENDPOINTS: {
    GOVERNANCE: '/gouvernance',
    CORTEX: '/cortex',
    MAPPING: '/mapping',
    WORKFLOW: '/workflow',
    AUTH: '/auth',
  },
} as const;

/**
 * Default values for forms and selectors
 */
export const DEFAULTS = {
  DATABASE: ENV_PRIMARY_DB,
  SCHEMA: DATABASE_CONFIG.SCHEMAS.GOVERNANCE,
  GOVERNANCE_FQN: DATABASE_CONFIG.FQN.GOVERNANCE,
} as const;

// Type exports for TypeScript support
export type SchemaName = typeof DATABASE_CONFIG.SCHEMAS[keyof typeof DATABASE_CONFIG.SCHEMAS];
export type DatabaseName = typeof DATABASE_CONFIG.PRIMARY_DATABASE;

// Helper function to build fully qualified names
export function buildFQN(database: string, schema: string): string {
  return `${database}.${schema}`;
}

// Helper function to get governance schema FQN
export function getGovernanceFQN(): string {
  return DATABASE_CONFIG.FQN.GOVERNANCE;
}

// Helper function to get API base URL
export function getApiBaseUrl(): string {
  return API_CONFIG.BASE_URL;
}
