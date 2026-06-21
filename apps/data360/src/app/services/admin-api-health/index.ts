'use client';

/**
 * admin-api-health — persist & read api-health "release runs".
 *
 * Wraps the ACCOUNTADMIN-gated backend
 * (`app/modules/administration/api_health_runs_router.py`):
 *
 *   POST /admin/api-health/runs          → persist one probe sweep as a tracked
 *                                          per-release run (returns run_id + KPIs)
 *   GET  /admin/api-health/runs          → per-run KPIs + per-release rollup/trend
 *   GET  /admin/api-health/runs/{run_id} → stored rows + summary + slowest-N
 *
 * Every call goes through {@link apiClient}. A 404/501 (backend not deployed
 * yet) surfaces as {@link NotDeployedError} — reusing the SAME class the perf
 * service exports — so the history view degrades to a quiet "not available on
 * this backend yet" notice instead of a hard error. All KPI numbers are real or
 * `null` (the backend never fabricates a 0).
 */
import axios from 'axios';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { NotDeployedError } from '@/app/services/admin-performance';

// ── Types ─────────────────────────────────────────────────────────────────

/** One probed endpoint row trimmed for persistence (no large data snapshots). */
export interface HealthResultRow {
  endpoint: string;
  module?: string;
  label?: string;
  method?: string;
  path?: string;
  status?: string;
  /** Honest bucket: defect | slow | expected | warn | ok | error. */
  category?: string;
  http_status?: number | null;
  time_ms?: number | null;
  error?: string;
}

/** KPI summary shared by a single run and a per-release rollup. */
export interface RunKpis {
  total: number;
  ok: number;
  defects: number;
  expected: number;
  slow: number;
  warn: number;
  errors: number;
  c4xx: number;
  c5xx: number;
  /** ok / total — null when no rows. Expected 4xx are NOT counted as success. */
  success_rate: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
}

export interface RunRow extends RunKpis {
  run_id: string;
  release: string;
  run_ts: string | null;
  actor: string | null;
}

export interface ReleaseRollup extends RunKpis {
  release: string;
  run_count: number;
  last_run_ts: string | null;
}

export interface ListRunsResponse {
  runs: RunRow[];
  releases: ReleaseRollup[];
  latest: RunRow | null;
  count: number;
  /** Present when the backend degraded (no history yet / SVC lacks SELECT). */
  note?: string;
}

export interface PersistRunResponse {
  run_id: string;
  release: string;
  persisted: number;
  run_ts?: string;
  summary: RunKpis;
  note?: string;
}

export interface RunDetailRow {
  module: string | null;
  endpoint: string | null;
  label: string | null;
  method: string | null;
  path: string | null;
  status: string | null;
  category: string | null;
  http_status: number | null;
  time_ms: number | null;
  error: string | null;
}

export interface SlowestRow {
  module: string | null;
  endpoint: string | null;
  time_ms: number | null;
  http_status: number | null;
  status: string | null;
}

export interface RunDetailResponse {
  run_id: string;
  summary: (RunRow | null);
  rows: RunDetailRow[];
  slowest: SlowestRow[];
  note?: string;
}

// ── Degradation ─────────────────────────────────────────────────────────────

function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

/** The backend wraps the persist response in a `{ data, permissions }` envelope. */
interface Envelope<T> {
  data: T;
}

// ── Calls ─────────────────────────────────────────────────────────────────

const H = API.admin.apiHealth;

/** Persist a probe sweep as a tracked release run. */
export async function persistApiHealthRun(
  release: string,
  results: HealthResultRow[],
): Promise<PersistRunResponse> {
  try {
    const { data } = await apiClient.post<Envelope<PersistRunResponse>>(
      H.persistRun(),
      { release, results },
    );
    // Defensive: the route returns { data, permissions }; fall back to the raw
    // body if a future version unwraps it.
    return (data as Envelope<PersistRunResponse>)?.data ?? (data as unknown as PersistRunResponse);
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}

/** Per-run KPIs + per-release rollup/trend (newest first). */
export async function listApiHealthRuns(
  opts?: { release?: string; limit?: number },
): Promise<ListRunsResponse> {
  try {
    const { data } = await apiClient.get<ListRunsResponse>(
      H.listRuns(opts?.release, opts?.limit),
    );
    return data;
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}

/** Stored endpoint rows + summary + slowest-N for one persisted run. */
export async function getApiHealthRunDetail(runId: string): Promise<RunDetailResponse> {
  try {
    const { data } = await apiClient.get<RunDetailResponse>(H.runDetail(runId));
    return data;
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}

export { NotDeployedError };
