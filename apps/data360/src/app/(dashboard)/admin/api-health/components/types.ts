// Shared view-model types for the API Health admin tab.
// These are purely presentational contracts — no service-layer imports here,
// so the components that consume them stay tsc-clean (page.tsx is @ts-nocheck).

export type ProbeStatus = 'idle' | 'running' | 'success' | 'error' | 'warn';

export type ProbeResult = {
  status: ProbeStatus;
  ms?: number;
  error?: string;
  httpStatus?: number;
  /** Captured from the failing request's axios config when available. */
  method?: string;
  url?: string;
  /**
   * Raw JSON-stringified response body when the backend returned an object.
   * Kept separately from `error` (which is a human-friendly extracted string)
   * so the structured defect parser is lossless for the flat error shape
   * `{ error_code, message, query_id, ... }` whose extra fields would otherwise
   * be dropped by the message-first extraction in the page's catch block.
   */
  errorBody?: string;
  /**
   * Capped JSON snapshot of the EXACT data the endpoint returned on success
   * (truncated to ~2000 chars in the probe to bound memory). Absent on
   * warn/error rows — those carry `error` / `errorBody` instead.
   */
  data?: string;
};

/** A single probed endpoint flattened for the drill / detail panel. */
export type ProbeDetail = {
  module: string;
  name: string;
  result?: ProbeResult;
  isSlow: boolean;
};

/** Latency (ms) at/above which a successful probe is flagged "slow". */
export const SLOW_THRESHOLD_MS = 1500;

// ════════════════════════════════════════════════════════════
// Defect detection — distinguish a REAL backend defect from an
// EXPECTED validation 4xx (probes use the fake id __test_health_check__,
// so "not found / field required / invalid name" are correct, not bugs).
// ════════════════════════════════════════════════════════════

/** Structured view of a parsed error body. Missing fields are `null`. */
export type ParsedError = {
  code: string | null;
  message: string | null;
  queryId: string | null;
  snowflakeCode: string | null;
  hint: string | null;
  /** Raw text we parsed (or fell back to) — always available for display. */
  raw: string;
};

/** Error codes that signal a genuine defect rather than fake-id validation. */
const DEFECT_CODES = new Set(['SQL_COMPILATION_ERROR', 'QUERY_CANCELLED', 'CompilationError']);

/**
 * Defensive parse of a raw error string (often JSON). Never throws.
 * Walks both the flat shape `{ error_code, message, query_id, snowflake_code, hint }`
 * and the nested shape `{ error: { code, message, snowflake_query_id } }`,
 * falling back to the raw string for everything it can't extract.
 */
export function parseErrorBody(raw?: string | null): ParsedError {
  const text = raw == null ? '' : String(raw);
  const empty: ParsedError = {
    code: null,
    message: text || null,
    queryId: null,
    snowflakeCode: null,
    hint: null,
    raw: text,
  };
  if (!text) return empty;

  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!obj || typeof obj !== 'object') return empty;

  const nested = obj.error && typeof obj.error === 'object' ? obj.error : null;
  const pick = (...vals: any[]): string | null => {
    for (const v of vals) {
      if (v != null && v !== '' && typeof v !== 'object') return String(v);
    }
    return null;
  };

  return {
    code: pick(obj.error_code, nested?.code),
    message: pick(obj.message, nested?.message) ?? (text || null),
    queryId: pick(obj.query_id, nested?.snowflake_query_id, nested?.query_id),
    snowflakeCode: pick(obj.snowflake_code, nested?.snowflake_code),
    hint: pick(obj.hint, nested?.hint),
    raw: text,
  };
}

// ════════════════════════════════════════════════════════════
// Known-unimplemented — an FE service stub that deliberately throws
// CLIENT-SIDE because the backend route genuinely does not exist yet. These
// are HONEST sentinels (the FE labels them "[fn] not implemented — no backend
// route") thrown synchronously with NO HTTP round-trip, so they carry no
// httpStatus. They are a known-gap signal, NOT a defect/regression.
//
// Safety: the `httpStatus == null` guard means a real 501/5xx (which carries a
// status) can NEVER match — so this can't mask a genuine backend failure. And a
// genuine client-side crash (TypeError / "Network Error" / timeout) won't match
// the "not implemented" marker. So the pattern only catches the intentional FE
// stubs, by their own self-description, and never enumerates function names.
// ════════════════════════════════════════════════════════════
const KNOWN_UNIMPLEMENTED_PATTERN = /not implemented/i;

export function isKnownUnimplemented(result?: ProbeResult | null): boolean {
  if (!result) return false;
  // Only a synchronous client-side throw (no HTTP response) qualifies.
  if (result.status !== 'error') return false;
  if (result.httpStatus != null) return false;
  const text = `${result.error ?? ''} ${result.errorBody ?? ''}`;
  return KNOWN_UNIMPLEMENTED_PATTERN.test(text);
}

// ════════════════════════════════════════════════════════════
// Config-dependent rejection — the route EXISTS and EXECUTES, but cannot
// succeed in the probe environment because it needs account-level infrastructure
// the test identity/account lacks (a configured API integration, a notebook
// runtime, a real stage). These surface as execution-time errors — and one
// (createGitRepository) arrives as a SQL_COMPILATION_ERROR / 5xx that `isDefect`
// would otherwise flag. They are NOT code defects: the correct outcome is a clean
// rejection, so they classify as benign (grey), like an expected validation 4xx.
//
// Surgical by design — a NARROW allowlist of the exact execution-time messages,
// so genuine SQL_COMPILATION_ERRORs elsewhere stay defects (DEFECT_CODES is
// untouched).
//   "Missing option(s): [API_INTEGRATION]" → createGitRepository (no API
//                                             integration configured in account)
//   "NOTEBOOK_RUNTIME_REQUIRED"            → executeNotebook (no notebook runtime)
//   "STAGE_NOT_FOUND"                      → createStreamlitApp (no real stage)
// ════════════════════════════════════════════════════════════
const CONFIG_DEPENDENT_REJECTION_PATTERN =
  /Missing option\(s\): \[API_INTEGRATION\]|NOTEBOOK_RUNTIME_REQUIRED|STAGE_NOT_FOUND/i;

export function isConfigDependentRejection(result?: ProbeResult | null): boolean {
  if (!result) return false;
  const text = `${result.error ?? ''} ${result.errorBody ?? ''}`;
  return CONFIG_DEPENDENT_REJECTION_PATTERN.test(text);
}

/**
 * True when a probe surfaced a GENUINE defect (vs an expected validation 4xx).
 * Rule: status==='error' (5xx/network) OR httpStatus 405/408 OR the parsed
 * error code is a known compilation/cancellation failure.
 *
 * Carve-outs FIRST (so neither can ever be miscounted as a defect):
 *  - known-unimplemented: an honest FE stub that never hit the network.
 *  - config-dependent rejection: a route that works but needs unprovisioned
 *    account infra (incl. createGitRepository's SQL_COMPILATION_ERROR).
 */
export function isDefect(result?: ProbeResult | null): boolean {
  if (!result) return false;
  if (isKnownUnimplemented(result)) return false;
  if (isConfigDependentRejection(result)) return false;
  if (result.status === 'error') return true;
  if (result.httpStatus === 405 || result.httpStatus === 408) return true;
  const { code } = parseErrorBody(result.errorBody ?? result.error);
  return code != null && DEFECT_CODES.has(code);
}

// ════════════════════════════════════════════════════════════
// Expected classification — a 4xx that is the API CORRECTLY rejecting
// the probe's fake/empty test input (FAKE_ID, empty lists, TEST_TABLE, no
// body). These read as benign, NOT as warnings.
// ════════════════════════════════════════════════════════════

/**
 * Signature of a correct rejection of fake/empty probe input:
 * "not found" / "field required" / validation phrasing / the probe markers
 * (__test_health_check__, TEST_TABLE) / object-does-not-exist / not-authorized.
 *
 * Each token below ONLY appears in a CORRECT-rejection message (a 4xx where the
 * API properly refuses the probe's fake/empty/policy-blocked input), never in a
 * genuine defect. `isExpected` consults this pattern only AFTER `isDefect` has
 * returned false AND the status is 4xx, so even a broad token like "already exists"
 * can never mask a 5xx / 405 / 408 / SQL_COMPILATION_ERROR — those are not-4xx or
 * are caught by `isDefect` first.
 *
 * Additions (phrase → board row(s) that were slipping to 'warn'):
 *   "should have at least"  → Pydantic list-min on empty-list probes, e.g.
 *                             "List should have at least 1 item after validation,
 *                             not 0" (detectPrimaryKeys([]), detectRelations([],[]),
 *                             generateSemanticModel({tables:[]}), …). Distinct from
 *                             the existing "must have at least" (Pydantic v1 wording).
 *   "No fields to update"   → update/alter with an empty / no-op patch body
 *                             (updateRole, updateUser, alterComputePool,
 *                             alterNotebook, updateSecurityAxis, …) → 400.
 *   "cannot be enabled or disabled" / "MFA_TOGGLE_UNSUPPORTED"
 *                           → setUserMfa(FAKE_ID,false) → 422 correct policy
 *                             rejection (MFA toggle unsupported for this user).
 *   "Request must include either" / "MISSING_ZONE_OR_TABLE"
 *                           → freshness/zone probes → 422 (companion to the
 *                             existing "Provide (zone|table)" token).
 *   "already exists"        → create-with-sentinel whose object already exists,
 *                             e.g. addUser → 400 "Object '__TEST_HEALTH_CHECK__'
 *                             already exists" (a correct duplicate rejection).
 *   "requires role ORGADMIN"→ lifecycle-role authz rejection, e.g.
 *                             deleteReaderAccount → 403 "requires role ORGADMIN;
 *                             caller role is 'ACCOUNTADMIN'".
 * Note: "confirm=true is required" (dropComputePool / dropContainerService → 422)
 * is already covered by the existing `required\b` token — no new alternative added.
 */
const EXPECTED_PATTERN =
  /not found|field required|must have at least|should have at least|missing required field|No fields to update|Input should be|does not exist|not authorized|cannot be enabled or disabled|MFA_TOGGLE_UNSUPPORTED|Request must include either|MISSING_ZONE_OR_TABLE|already exists|requires role ORGADMIN|__test_health_check__|TEST_TABLE|required\b|valid integer|valid list|valid string|Provide (zone|table)/i;

/** True when the combined error text matches the fake-id / validation signature. */
export function matchesExpectedPattern(result?: ProbeResult | null): boolean {
  if (!result) return false;
  // Test BOTH the human message AND the raw body — "field required" lands in
  // `error`, while OBJECT_NOT_FOUND / "does not exist" lands in `errorBody`.
  const text = `${result.error ?? ''} ${result.errorBody ?? ''}`;
  return EXPECTED_PATTERN.test(text);
}

/**
 * True when a 4xx is the API CORRECTLY rejecting the probe's test input —
 * not a problem. Rule: 4xx AND not a genuine defect AND the error matches the
 * fake-id / validation signature.
 */
export function isExpected(result?: ProbeResult | null): boolean {
  if (!result) return false;
  const code = result.httpStatus;
  if (!(code != null && code >= 400 && code < 500)) return false;
  if (isDefect(result)) return false;
  return matchesExpectedPattern(result);
}

/**
 * The unified "benign / not-an-issue" predicate the board uses for the grey
 * bucket. Folds together the THREE non-failure outcomes so counts, filters,
 * coloring, and the per-release rollup treat them identically:
 *   1) isExpected               — the API correctly rejecting fake/empty 4xx input
 *   2) isKnownUnimplemented      — an honest FE stub for a route that doesn't exist
 *   3) isConfigDependentRejection — a working route blocked by unprovisioned infra
 * None of these is a defect or a regression; all read grey, never red/amber.
 * (Per-row microcopy still distinguishes them — see page.tsx.)
 */
export function isExpectedOrKnown(result?: ProbeResult | null): boolean {
  return isExpected(result) || isKnownUnimplemented(result) || isConfigDependentRejection(result);
}

/**
 * A residual "warn": a 4xx that is neither a genuine defect nor an expected
 * rejection (rare — an unrecognised 4xx that still warrants a glance).
 */
export function isResidualWarn(result?: ProbeResult | null): boolean {
  if (!result) return false;
  const code = result.httpStatus;
  if (!(code != null && code >= 400 && code < 500)) return false;
  return !isDefect(result) && !isExpected(result);
}
