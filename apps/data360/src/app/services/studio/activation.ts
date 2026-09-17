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

/** The action the conditional-intelligence DQ engine can apply to a rule. */
export type DqActionKind = 'auto_fix' | 'quarantine_dlq' | 'waive';

export interface DqCheckActionOption {
  kind: DqActionKind;
  label?: string;
  /** false when the action needs something first (e.g. a proposed model, or a
   *  business decision) — `reason` says what, and the button stays disabled. */
  available?: boolean;
  reason?: string;
  requires?: string[];
  detail?: string;
}

export interface DqCheckResolution {
  run_id?: string;
  action?: string;
  at?: string;
  by?: string;
  reason?: string;
  applied?: boolean;
  /** 'applied_design_time' (a dedup/rule now handles it) | 'waived'. */
  state?: string;
  next?: { run_job?: unknown; replay_dlq?: unknown };
}

/** One DQ check with its per-rule resolution options (contract dq.v1). */
export interface DqGateCheck {
  /** the gate's human options line on failing checks — rendered verbatim. */
  options_hint?: string | null;
  id: string;
  rule?: string;
  object?: string;
  entity_id?: string;
  columns?: string[];
  blocking?: boolean;
  verdict?: string;
  message?: string;
  evidence?: Record<string, unknown>;
  /** what the engine recommends — the primary action to offer first. */
  suggested_action?: 'auto_fix' | 'quarantine_dlq' | 'decision' | null;
  actions?: DqCheckActionOption[];
  handled?: boolean;
  resolution?: DqCheckResolution | null;
  target_id?: string;
  job_id?: string;
  truth?: string;
}

export interface ActivationDqGate {
  /** 'pass' | 'warn' | 'blocked' | 'not_evaluated' (verbatim backend verdict).
   *  Note: the gate reads 'warn' (never 'pass') once every defect is HANDLED —
   *  the original verdict + evidence stay visible, the source data is untouched. */
  overall?: string;
  /** legacy flat list — kept for back-compat. */
  blockers?: Array<string | { message?: string; [k: string]: unknown }>;
  /** the structured blocking checks (each with its resolution actions). */
  blockers_detail?: DqGateCheck[];
  /** every check (blocking + non-blocking + handled). */
  checks?: DqGateCheck[];
  /** the checks already handled (dedup/rule applied, or waived). */
  handled?: DqGateCheck[];
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

/* ── DQ RESOLVE — the per-rule standardized action (contract dq.v1) ────
 * The engine already knows, per rule, which action fixes it (`suggested_action`
 * from the gate: dedup / filter_out / orphans / decision). Resolving is a
 * DESIGN-TIME change (a dedup mapping / a quarantine rule / a waiver) — the
 * source data is never touched and the DLQ only fills when the job runs
 * (`next.run_job`, explicit, credit-gated). Idempotent; undoable by run_id. */

export interface DqResolveResult {
  /** 'applied' | 'already_applied' (idempotent). */
  status?: string;
  run_id?: string;
  check?: DqGateCheck;
  gate?: { overall?: string; blockers?: unknown[]; handled?: unknown[] };
  next?: { run_job?: unknown; replay_dlq?: unknown };
}

export async function resolveDqCheck(
  draftId: string,
  body: { check_id: string; action: DqActionKind; reason?: string },
): Promise<DqResolveResult> {
  const { data } = await apiClient.post<DqResolveResult>(
    `/studio/drafts/${encodeURIComponent(draftId)}/dq/resolve`,
    body,
    { timeout: 60_000 },
  );
  return data;
}

export async function undoDqResolve(
  draftId: string,
  run_id: string,
): Promise<Record<string, unknown>> {
  const { data } = await apiClient.post<Record<string, unknown>>(
    `/studio/drafts/${encodeURIComponent(draftId)}/dq/resolve/undo`,
    { run_id },
    { timeout: 60_000 },
  );
  return data;
}

/** A resolve refusal rendered as a product answer: the code + message the
 *  backend sends (403 APPROVAL_REQUIRED, 422 REASON_REQUIRED,
 *  409 DQ_ACTION_UNAVAILABLE{actions}) — never a raw stack. */
export function dqResolveRefusal(
  e: unknown,
): { code?: string; message: string; actions?: DqCheckActionOption[] } | null {
  const anyE = e as {
    response?: { status?: number; data?: { detail?: unknown; message?: unknown } };
  };
  const status = anyE?.response?.status;
  if (status == null || status < 400) return null;
  const raw = anyE.response?.data;
  const detail =
    raw && typeof raw.detail === 'object' && raw.detail !== null
      ? (raw.detail as Record<string, unknown>)
      : (raw as Record<string, unknown> | undefined);
  const code = detail?.error_code ?? detail?.code;
  const message =
    (typeof detail?.message === 'string' && detail.message) ||
    (status === 403
      ? 'An ACCOUNTADMIN must approve a waiver.'
      : status === 422
        ? 'A reason of at least 10 characters is required to waive.'
        : 'This action is not available right now.');
  const actions = Array.isArray(detail?.actions)
    ? (detail!.actions as DqCheckActionOption[])
    : undefined;
  return { code: code ? String(code) : undefined, message: String(message), actions };
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
