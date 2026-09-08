/**
 * activation.ts — the /studio/activation client (tranche 3, probed live
 * 2026-09-06 on :8078, schema_version studio.activation.v1).
 *
 * Read-only status (scope / tests / cost / funding / blockers) plus the ONE
 * real mutation of the onboarding journey: POST /studio/activation/request.
 * That request is only ever fired on an explicit user click — never on mount.
 *
 * Money rules (from the backend contract, enforced by the UI):
 *  - `estimate.money` is ABSENT for non-ACCOUNTADMIN callers — never derive it.
 *  - present with state 'unconfigured' ⇒ amount is null ⇒ "not valued yet",
 *    never rendered as 0.
 */

import apiClient from '@/lib/api-client';

/* ── GET /studio/activation/{draft_id} ─────────────────────────────── */

export interface ActivationScope {
  sources?: Array<{ fqn: string }>;
  entities?: Array<{ entity_id: string; source_fqn?: string }>;
  relationships_retained?: unknown[];
  report_id?: string | null;
  automations?: unknown[];
}

export interface ActivationDqGate {
  /** 'pass' | 'warn' | 'blocked' | 'not_evaluated' (verbatim backend verdict). */
  overall?: string;
  blockers?: Array<string | { message?: string; [k: string]: unknown }>;
  evaluated_at?: string | null;
  run_id?: string | null;
}

export interface ActivationTests {
  dq_gate?: ActivationDqGate | null;
  report?: { kpis?: number; charts?: number; status?: string } | null;
  automation_simulations?: unknown[];
}

/** Connector dependency — the probed backend sends a map keyed by connector id. */
export interface ActivationConnector {
  status?: string;
  label?: string;
  [k: string]: unknown;
}

export interface ActivationEstimateLine {
  rule_id?: string;
  label: string;
  quantity?: number | null;
  unit_cost_credits?: number | null;
  credits?: number | null;
  gate?: string; // 'soft' | 'hard'
  why?: string;
  state?: string; // 'estimated' | …
}

export interface ActivationMoney {
  amount?: number | null;
  currency?: string | null;
  policy_version?: string | null;
  estimated?: boolean;
  /** 'unconfigured' ⇒ no pricing policy set — "not valued yet", never 0. */
  state?: string;
}

export interface ActivationEstimate {
  credit_rules_version?: string;
  lines?: ActivationEstimateLine[];
  total_credits?: number | null;
  state?: string;
  free_preview?: { credits?: number | null; note?: string };
  note?: string;
  /** ABSENT (undefined) for non-ACCOUNTADMIN callers — a normal state, not an error. */
  money?: ActivationMoney;
  pricing_policy?: { state?: string; version?: string | null; source?: string | null };
}

export interface ActivationFunding {
  /** 'not_required' | 'requires_accountadmin' | 'authorisation_by_accountadmin' */
  status?: string;
  can_view_balance?: boolean;
  next_step?: string | null;
}

export interface ActivationStatusResponse {
  draft_id: string;
  schema_version?: string;
  scope?: ActivationScope;
  access?: { caller?: { username?: string; product_role?: string }; note?: string };
  tests?: ActivationTests;
  dependencies?: {
    connectors?: Record<string, ActivationConnector | string | null>;
    redis?: unknown;
  };
  conditions?: Record<string, unknown>;
  estimate?: ActivationEstimate;
  funding?: ActivationFunding;
  activation?: { status?: string };
  blockers?: string[];
  can_request?: boolean;
  execution_time_ms?: number;
}

export async function getActivation(draftId: string): Promise<ActivationStatusResponse> {
  const { data } = await apiClient.get<ActivationStatusResponse>(
    `/studio/activation/${encodeURIComponent(draftId)}`,
    { timeout: 60_000 },
  );
  return data;
}

/* ── POST /studio/activation/request (REAL mutation — user click only) ─ */

export interface ActivationRequestResult {
  activation?: { status?: string; [k: string]: unknown }; // 'requested' | 'authorised'
  [k: string]: unknown;
}

export async function requestActivation(body: {
  draft_id: string;
  scope: 'test_run' | 'full';
  note?: string;
}): Promise<ActivationRequestResult> {
  const { data } = await apiClient.post<ActivationRequestResult>(
    '/studio/activation/request',
    body,
    { timeout: 60_000 },
  );
  return data;
}

/**
 * 409 ACTIVATION_BLOCKED{blockers} → the verbatim blocker list; null when the
 * error is anything else (the caller falls back to its generic error leg).
 */
export function extractActivationBlockers(e: unknown): string[] | null {
  const anyE = e as {
    response?: { status?: number; data?: { detail?: unknown; blockers?: unknown } };
  };
  if (anyE?.response?.status !== 409) return null;
  const raw = anyE.response?.data;
  const detail =
    raw && typeof raw.detail === 'object' && raw.detail !== null
      ? (raw.detail as { blockers?: unknown })
      : raw;
  const blockers = (detail as { blockers?: unknown } | undefined)?.blockers;
  return Array.isArray(blockers) ? blockers.map((b) => String(b)) : [];
}
