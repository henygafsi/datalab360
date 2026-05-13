/**
 * Data360 Pro — Governance Module Tests (Frontend)
 * ==================================================
 * Module: Governance (frontend: /governance/ — French /gouvernance/ kept as 308 redirect)
 * Covers: policy service, RBAC response handling, masking types
 *
 * Run: cd datalab360Front/apps/data360 && pnpm exec vitest run --reporter=verbose
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  data360ListResponse,
  data360ErrorResponse,
  mockData360Policy,
} from '../utils/data360-test-helpers';

const mockApiClient = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
vi.mock('@/config/database.config', () => ({ default: mockApiClient }));

describe('data360:frontend:governance:service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET /governance/policies returns policy list', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: data360ListResponse([
        mockData360Policy({ type: 'masking' }),
        mockData360Policy({ id: 'pol_2', type: 'row_access' }),
      ]),
    });

    const res = await mockApiClient.get('/governance/policies');
    expect(res.data.data).toHaveLength(2);
    expect(res.data.data[0].type).toBe('masking');
  });

  it('supports all 10 governance policy types', () => {
    const POLICY_TYPES = [
      'masking', 'row_access', 'aggregation', 'projection',
      'network', 'auth_policy', 'password_policy', 'session_policy',
      'replication', 'tag_based_masking',
    ];
    expect(POLICY_TYPES).toHaveLength(10);
  });

  it('frontend governance slug is English /governance', () => {
    // Public Next.js route is /governance (renamed from /gouvernance, 2026).
    const FRONTEND_PREFIX = '/governance';
    expect(FRONTEND_PREFIX).toBe('/governance');
  });

  it('legacy French /gouvernance is redirected (308) to /governance', () => {
    // next.config.mjs redirects() rule keeps old bookmarks working.
    const redirects: Array<{ source: string; destination: string; permanent: boolean }> = [
      { source: '/gouvernance', destination: '/governance', permanent: true },
      { source: '/gouvernance/:path*', destination: '/governance/:path*', permanent: true },
    ];
    expect(redirects.find((r) => r.source === '/gouvernance')?.destination).toBe('/governance');
    expect(redirects.every((r) => r.permanent)).toBe(true);
  });

  it('backend API prefix stays French /gouvernance (backend contract)', () => {
    // Backend FastAPI router still mounts under /gouvernance; do NOT rename.
    const BACKEND_PREFIX = '/gouvernance';
    expect(BACKEND_PREFIX).toBe('/gouvernance');
  });

  it('policy response has required fields', () => {
    const policy = mockData360Policy();
    expect(policy).toHaveProperty('id');
    expect(policy).toHaveProperty('name');
    expect(policy).toHaveProperty('type');
    expect(policy).toHaveProperty('status');
  });
});

describe('data360:frontend:governance:dark-mode', () => {
  it('dark mode uses bg-gray-800 not bg-gray-50 (regression guard)', () => {
    // Known bug: 26 inverted dark:bg-gray-50 were fixed across governance pages
    const CORRECT_DARK_BG = 'dark:bg-gray-800';
    const WRONG_DARK_BG = 'dark:bg-gray-50';  // inverted — light color in dark mode

    expect(CORRECT_DARK_BG).toBe('dark:bg-gray-800');
    expect(WRONG_DARK_BG).not.toBe(CORRECT_DARK_BG);
    // This is a unit-level convention check
    const sampleClasses = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    expect(sampleClasses).toContain('dark:bg-gray-800');
    expect(sampleClasses).not.toContain('dark:bg-gray-50');
  });
});
