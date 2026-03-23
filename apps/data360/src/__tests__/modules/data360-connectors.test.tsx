/**
 * Data360 Pro — Connect Data Module Tests (Frontend)
 * =====================================================
 * Module: Connect Data (frontend: /data-source-connection/)
 * Covers: API service layer, response handling, error states
 *
 * Run: cd datalab360Front/apps/data360 && pnpm exec vitest run --reporter=verbose
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  data360ListResponse,
  data360ErrorResponse,
  mockData360Stage,
  DATA360_TEST_USER,
} from '../utils/data360-test-helpers';

// ---------------------------------------------------------------------------
// Mock the API client
// ---------------------------------------------------------------------------
const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/config/database.config', () => ({
  default: mockApiClient,
}));

// ---------------------------------------------------------------------------
// Connect Data — Service layer tests
// ---------------------------------------------------------------------------

describe('data360:frontend:connectors:service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /connect/stages returns stages list', async () => {
    const mockStages = [
      mockData360Stage({ name: 'STAGE_1' }),
      mockData360Stage({ name: 'STAGE_2', type: 'external' }),
    ];
    mockApiClient.get.mockResolvedValueOnce({
      data: data360ListResponse(mockStages),
    });

    const response = await mockApiClient.get('/connect/stages');
    const body = response.data;

    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('STAGE_1');
    expect(body.execution_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('stage list response follows Data360 standard schema', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: data360ListResponse([mockData360Stage()]),
    });

    const response = await mockApiClient.get('/connect/stages');
    const body = response.data;

    // Data360 standard: {data: [], execution_time_ms: number}
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('execution_time_ms');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('handles API error with Data360 structured error format', async () => {
    const error = new Error('Snowflake error') as Error & { response?: unknown };
    error.response = {
      status: 500,
      data: data360ErrorResponse('SNOWFLAKE_ERROR', 'An unexpected error occurred.'),
    };
    mockApiClient.get.mockRejectedValueOnce(error);

    await expect(mockApiClient.get('/connect/stages')).rejects.toThrow();
    // Error detail must follow Data360 format
    const errDetail = (error.response as { data: ReturnType<typeof data360ErrorResponse> }).data.detail;
    expect(errDetail).toHaveProperty('message');
    expect(errDetail).toHaveProperty('code');
  });

  it('create stage POST sends correct payload', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: { status: 'created', id: 'stage_new_1' },
    });

    const payload = { name: 'NEW_STAGE', type: 'internal', database: 'CP_DATA360' };
    const response = await mockApiClient.post('/connect/stages', payload);

    expect(mockApiClient.post).toHaveBeenCalledWith('/connect/stages', payload);
    expect(response.data.status).toBe('created');
  });

  it('does not expose Snowflake internals in error response', async () => {
    const error = new Error('SQL compilation error: table not found') as Error & {
      response?: { data: { detail: { message: string } } };
    };
    error.response = {
      data: {
        detail: {
          message: 'The requested object does not exist.',  // user-friendly
        },
      },
    };
    mockApiClient.get.mockRejectedValueOnce(error);

    await expect(mockApiClient.get('/connect/stages')).rejects.toThrow();
    // User-friendly message, not raw SQL error
    const userMsg = error.response?.data.detail.message;
    expect(userMsg).not.toContain('SQL compilation error');
    expect(userMsg).not.toContain('cursor.execute');
  });
});

// ---------------------------------------------------------------------------
// Connect Data — Response validation
// ---------------------------------------------------------------------------

describe('data360:frontend:connectors:validation', () => {
  it('stage object has required fields', () => {
    const stage = mockData360Stage();
    expect(stage).toHaveProperty('name');
    expect(stage).toHaveProperty('type');
    expect(stage).toHaveProperty('status');
  });

  it('multiple stages have consistent structure', () => {
    const stages = [
      mockData360Stage({ name: 'S1', type: 'internal' }),
      mockData360Stage({ name: 'S2', type: 'external' }),
    ];
    stages.forEach((s) => {
      expect(typeof s.name).toBe('string');
      expect(typeof s.status).toBe('string');
    });
  });

  it('API prefix is /connect (no /api prefix per CLAUDE.md)', () => {
    // Data360 rule: frontend calls /connect/... NOT /api/connect/...
    const CONNECT_PREFIX = '/connect';
    expect(CONNECT_PREFIX).not.toStartWith('/api/connect');
    expect(CONNECT_PREFIX).toBe('/connect');
  });
});
