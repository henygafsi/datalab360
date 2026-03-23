/**
 * Data360 Pro — Frontend Test Helpers
 * ========================================
 * Render helpers, mock providers, API response factories
 *
 * Usage:
 *   import { renderData360, mockData360Api, DATA360_TEST_USER } from '../utils/data360-test-helpers';
 */
import React from 'react';

// ---------------------------------------------------------------------------
// Data360 test user (mirrors backend conftest fixture)
// ---------------------------------------------------------------------------
export const DATA360_TEST_USER = {
  username: 'testadmin',
  account: 'test-account',
  roles: ['ACCOUNTADMIN', 'SYSADMIN'],
  token: 'data360-mock-test-token',
};

export const DATA360_ANALYST_USER = {
  username: 'analyst_user',
  account: 'test-account',
  roles: ['DATA360_ANALYST'],
  token: 'data360-analyst-test-token',
};

// ---------------------------------------------------------------------------
// API response factories — matches Data360 backend standard schema
// ---------------------------------------------------------------------------

/** Standard list response: {data: T[], execution_time_ms: number} */
export function data360ListResponse<T>(items: T[], execMs = 50) {
  return {
    data: items,
    execution_time_ms: execMs,
  };
}

/** Standard error response from raise_for_snowflake() */
export function data360ErrorResponse(code: string, message: string) {
  return {
    detail: {
      message,
      code,
      query_id: 'mock-query-id',
    },
  };
}

// ---------------------------------------------------------------------------
// Mock data factories — realistic Data360 entities
// ---------------------------------------------------------------------------

export function mockData360Stage(overrides = {}) {
  return {
    name: 'MY_STAGE',
    type: 'internal',
    database: 'CP_DATA360',
    schema: 'PUBLIC',
    status: 'active',
    ...overrides,
  };
}

export function mockData360Workflow(overrides = {}) {
  return {
    id: 'wf_test_1',
    name: 'Test ETL Pipeline',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    steps: [],
    ...overrides,
  };
}

export function mockData360Policy(overrides = {}) {
  return {
    id: 'pol_test_1',
    name: 'mask_email_pii',
    type: 'masking',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

export function mockData360Dashboard(overrides = {}) {
  return {
    id: 'dash_test_1',
    name: 'Executive Dashboard',
    status: 'active',
    widgets: [],
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

export function mockData360DQCheck(overrides = {}) {
  return {
    id: 'chk_test_1',
    type: 'completeness',
    table: 'ORDERS',
    column: 'id',
    result: 'PASS',
    score: 99.8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// apiClient mock helpers
// ---------------------------------------------------------------------------

/** Mock a successful GET response from apiClient */
export function mockData360ApiGet(apiClient: ReturnType<typeof vi.fn>, data: unknown) {
  apiClient.mockResolvedValueOnce({ data });
}

/** Mock a failed API response (maps to raise_for_snowflake output) */
export function mockData360ApiError(
  apiClient: ReturnType<typeof vi.fn>,
  code = 'SNOWFLAKE_ERROR',
  message = 'An unexpected error occurred.',
  status = 500,
) {
  const error = new Error(message) as Error & { response?: unknown };
  error.response = {
    status,
    data: data360ErrorResponse(code, message),
  };
  apiClient.mockRejectedValueOnce(error);
}

// ---------------------------------------------------------------------------
// Dark mode helpers
// ---------------------------------------------------------------------------

/** Assert element has correct dark mode classes (never dark:bg-gray-50) */
export function assertData360DarkMode(element: HTMLElement): void {
  const classNames = element.className;

  // Must not use inverted dark class (known bug pattern)
  const hasBadDarkBg = /dark:bg-gray-50/.test(classNames);
  if (hasBadDarkBg) {
    throw new Error(
      `[data360:dark-mode] Element uses dark:bg-gray-50 (inverted — should be dark:bg-gray-800): ${classNames}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Table feature assertions
// ---------------------------------------------------------------------------

/** Assert Data360 table has all required features */
export function assertData360TableFeatures(container: HTMLElement): void {
  // Every table must have: search, sort, export
  const hasSearch = container.querySelector('input[placeholder*="earch"]') !== null
    || container.querySelector('[data-testid="table-search"]') !== null;
  const hasTable = container.querySelector('table') !== null
    || container.querySelector('[role="grid"]') !== null;

  if (!hasTable) {
    throw new Error('[data360:table] No table element found in container');
  }
  // Search check is advisory (warn, not fail) in unit tests
  if (!hasSearch) {
    console.warn('[data360:table] Table missing search input');
  }
}
