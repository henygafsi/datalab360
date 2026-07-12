'use client';

/**
 * administration/access-insights — account-level object access intelligence
 * for the Account Overview "Data Objects & Models" tab.
 *
 *   GET /api/administration/access-insights
 *     → { top_objects:      [{ object, accesses, users }],
 *         hot_unmonitored:  [{ object, accesses, users }],
 *         window_days, degraded }
 *
 * `top_objects` ranks the most-read objects over the window (ACCESS_HISTORY);
 * `hot_unmonitored` is the subset of hot tables with NO DMF coverage — the
 * exact list the Data Quality monitors page should adopt next.
 * Envelope: standard_response — payload at res.data.data (see account-health.ts).
 * Degrades honestly: a 404/501 throws the Unavailable error (route not
 * deployed), anything else propagates; the caller renders "—", never fake 0s.
 */
import axios from 'axios';
import apiClient from '@/lib/api-client';

const PATH = '/api/administration/access-insights';

export interface AccessInsightObject {
  /** Fully-qualified object name (DB.SCHEMA.TABLE). */
  object: string;
  /** Read events over the window. */
  accesses: number;
  /** Distinct users touching the object. */
  users: number;
}

export interface AccessInsights {
  top_objects: AccessInsightObject[];
  hot_unmonitored: AccessInsightObject[];
  /** Lookback window the backend computed over (days). */
  window_days: number | null;
  /** Per-source degrade reasons (null = fully live). */
  degraded: Record<string, string> | string | null;
}

/** Endpoint absent on this environment (404/501) — degrade quietly. */
export class AccessInsightsUnavailableError extends Error {
  constructor() {
    super('access-insights endpoint not deployed');
    this.name = 'AccessInsightsUnavailableError';
  }
}

function asObjects(v: unknown): AccessInsightObject[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      object: String(r.object ?? ''),
      accesses: Number(r.accesses ?? 0),
      users: Number(r.users ?? 0),
    }))
    .filter((r) => r.object.length > 0);
}

export async function getAccessInsights(): Promise<AccessInsights> {
  try {
    const res = await apiClient.get(PATH, { timeout: 60_000 });
    const payload = (res.data?.data ?? res.data) as Partial<AccessInsights>;
    return {
      top_objects: asObjects(payload?.top_objects),
      hot_unmonitored: asObjects(payload?.hot_unmonitored),
      window_days:
        typeof payload?.window_days === 'number' ? payload.window_days : null,
      degraded: payload?.degraded ?? null,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404 || status === 501) throw new AccessInsightsUnavailableError();
    }
    throw err;
  }
}
