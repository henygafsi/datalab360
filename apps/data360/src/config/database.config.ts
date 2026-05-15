/**
 * Centralized Database Configuration
 *
 * This file contains all database-related constants to ensure consistency
 * and security across the application. All hardcoded database/schema names
 * should reference this configuration.
 */

// Environment-based configuration with secure defaults
const ENV_PRIMARY_DB = process.env.NEXT_PUBLIC_PRIMARY_DB || 'CP_DATA360';

/**
 * Resolve the API base URL.
 *
 * In PRODUCTION, force HTTPS so mixed-content (https page → http API) never
 * leaks credentials in the clear.
 *
 * In DEVELOPMENT (`NODE_ENV !== 'production'`) we trust the operator's env
 * value verbatim — the local backend may legitimately only listen on plain
 * HTTP (e.g. http://api.datalab360.io on port 80), and silently upgrading
 * to https://... :443 breaks the dev signin flow with ECONNREFUSED.
 */
function resolveApiUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return 'https://www.api.datalab360.io:8443';
  if (url.startsWith('//')) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (process.env.NODE_ENV === 'production' && url.startsWith('http://')) {
    url = `https://${url.slice('http://'.length)}`;
  }
  return url;
}

const ENV_API_URL = resolveApiUrl(
  process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443',
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
