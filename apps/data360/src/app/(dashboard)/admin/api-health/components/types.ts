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

// ════════════════════════════════════════════════════════════
// Fake-identifier rejection — the probe deliberately injects made-up
// identifiers (FAKE_ID '__test_health_check__', which the warehouse upper-cases
// to __TEST_HEALTH_CHECK__; FAKE_TABLE 'TEST_TABLE'; and the DDL placeholders the
// alter-table probes pass — NEW_COL / NEW_NAME / OLD_COL / REF_TABLE / REF_COL).
// When the backend replies with a SQL-compilation / object-does-not-exist /
// invalid-name / unsupported-type error that NAMES one of those sentinels, it is
// the API CORRECTLY refusing fabricated input — EXPECTED, not a defect — even
// though such a body carries error_code SQL_COMPILATION_ERROR (which DEFECT_CODES
// would otherwise flag). Examples the probe produces today:
//   getGrantsForRole → 404 "Role '__TEST_HEALTH_CHECK__' does not exist"
//   renameTable      → 404 "Database '__TEST_HEALTH_CHECK__' does not exist"
//   addColumn        → 400 "Unsupported data type 'NEW_COL'"
//   createComputePool→ 400 "Invalid compute pool name '__TEST_HEALTH_CHECK__'"
//
// Surgical, two-part AND so it can NEVER swallow a genuine failure:
//   (1) 4xx ONLY — a real 5xx (status 'error', e.g. getStorageDatabases 500) is
//       never carved out, and 405/408 are handled as defects before this runs.
//   (2) the message must BOTH name a probe sentinel token AND read as a
//       compilation / not-found / invalid-name / unsupported-type rejection.
// A genuine 500 with no sentinel token matches neither gate → stays a defect.
//
// The sentinels are probe-only literals that never name a real object, so they
// cannot appear in a production error. Bare 'COL' is deliberately EXCLUDED — too
// generic (it would match "column", "protocol", …); the distinctive compound
// forms (NEW_COL, OLD_COL, REF_COL) are safe. FAKE_DB (CP_DATA360) and
// FAKE_SCHEMA (PUBLIC) are real objects, so they are NOT sentinels either.
// ════════════════════════════════════════════════════════════
const PROBE_FAKE_ID_PATTERN =
  /__test_health_check__|TEST_TABLE|NEW_COL|NEW_NAME|OLD_COL|REF_TABLE|REF_COL/i;

/**
 * The shape of a "the object/type you named isn't valid" rejection: an
 * object/db/role "does not exist", an "invalid <x> name", or an "unsupported data
 * type". Paired with a probe sentinel (above) on a 4xx, these are correct
 * rejections of fake input — never a defect.
 */
const COMPILATION_REJECTION_PATTERN =
  /does not exist|invalid \w[\w ]*name|unsupported data type/i;

export function isFakeIdRejection(result?: ProbeResult | null): boolean {
  if (!result) return false;
  // 4xx only — never widen into the 5xx / transport lane, so a genuine server
  // error (status 'error') stays a defect even if its body echoes a probe token.
  const http = result.httpStatus;
  if (!(http != null && http >= 400 && http < 500)) return false;
  const text = `${result.error ?? ''} ${result.errorBody ?? ''}`;
  // Gate 1: the message must name a fabricated probe identifier.
  if (!PROBE_FAKE_ID_PATTERN.test(text)) return false;
  // Gate 2: it must read as a compilation / not-found / invalid-name / type
  // rejection — either via the structured error_code or the message phrasing.
  const { code } = parseErrorBody(result.errorBody ?? result.error);
  const isCompilationCode = code != null && DEFECT_CODES.has(code);
  return isCompilationCode || COMPILATION_REJECTION_PATTERN.test(text);
}

/**
 * True when a probe surfaced a GENUINE defect (vs an expected validation 4xx).
 * Rule: status==='error' (5xx/network) OR httpStatus 405/408 OR the parsed
 * error code is a known compilation/cancellation failure.
 *
 * Carve-outs (so none is ever miscounted as a defect):
 *  - known-unimplemented: an honest FE stub that never hit the network.
 *  - config-dependent rejection: a route that works but needs unprovisioned
 *    account infra (incl. createGitRepository's SQL_COMPILATION_ERROR).
 *  - fake-id rejection: a 4xx SQL-compilation / not-found / invalid-name /
 *    unsupported-type error naming a probe sentinel = the API correctly refusing
 *    fabricated input. Checked AFTER the 5xx and 405/408 defect returns, and it
 *    is itself 4xx-gated, so it can never hide a genuine transport/method failure.
 */
export function isDefect(result?: ProbeResult | null): boolean {
  if (!result) return false;
  if (isKnownUnimplemented(result)) return false;
  if (isConfigDependentRejection(result)) return false;
  // Genuine-defect signals FIRST, so the fake-id carve-out can never swallow them:
  // a 5xx / network failure (status 'error') and a 405/408 are always defects.
  if (result.status === 'error') return true;
  if (result.httpStatus === 405 || result.httpStatus === 408) return true;
  // The API correctly rejecting a probe's FAKE identifier is EXPECTED, not a
  // defect — even though the body carries error_code SQL_COMPILATION_ERROR.
  if (isFakeIdRejection(result)) return false;
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
 *   "Unsupported data type" + the DDL sentinels
 *   (NEW_COL|NEW_NAME|OLD_COL|REF_TABLE|REF_COL)
 *                           → alter-table probes naming a fabricated column/type,
 *                             e.g. addColumn → 400 "Unsupported data type 'NEW_COL'".
 *                             These pair with `isFakeIdRejection` (which un-flags the
 *                             matching SQL_COMPILATION_ERROR in `isDefect`) so the
 *                             row reads Expected, not a residual warn.
 * Note: "confirm=true is required" (dropComputePool / dropContainerService → 422)
 * is already covered by the existing `required\b` token — no new alternative added.
 */
const EXPECTED_PATTERN =
  /not found|field required|must have at least|should have at least|missing required field|No fields to update|Input should be|does not exist|not authorized|cannot be enabled or disabled|MFA_TOGGLE_UNSUPPORTED|Request must include either|MISSING_ZONE_OR_TABLE|already exists|requires role ORGADMIN|__test_health_check__|TEST_TABLE|NEW_COL|NEW_NAME|OLD_COL|REF_TABLE|REF_COL|Unsupported data type|required\b|valid integer|valid list|valid string|Provide (zone|table)/i;

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
 * bucket. Folds together the non-failure outcomes so counts, filters, coloring,
 * and the per-release rollup treat them identically:
 *   1) isExpected               — the API correctly rejecting fake/empty 4xx input
 *   2) isKnownUnimplemented      — an honest FE stub for a route that doesn't exist
 *   3) isConfigDependentRejection — a working route blocked by unprovisioned infra
 *   4) isFakeIdRejection         — a 4xx SQL-compilation / not-found / invalid-name
 *                                  / unsupported-type error naming a probe sentinel
 *                                  (folded in explicitly so the row is benign even
 *                                  if its exact wording misses EXPECTED_PATTERN)
 * None of these is a defect or a regression; all read grey, never red/amber.
 * (Per-row microcopy still distinguishes them — see page.tsx.)
 */
export function isExpectedOrKnown(result?: ProbeResult | null): boolean {
  return (
    isExpected(result) ||
    isKnownUnimplemented(result) ||
    isConfigDependentRejection(result) ||
    isFakeIdRejection(result)
  );
}

/**
 * A residual "warn": a 4xx that is neither a genuine defect nor a benign
 * rejection (rare — an unrecognised 4xx that still warrants a glance). Excludes
 * `isFakeIdRejection` so a fake-id compilation 4xx whose exact wording misses
 * EXPECTED_PATTERN still reads benign/operational instead of dinging the board.
 */
export function isResidualWarn(result?: ProbeResult | null): boolean {
  if (!result) return false;
  const code = result.httpStatus;
  if (!(code != null && code >= 400 && code < 500)) return false;
  return !isDefect(result) && !isExpected(result) && !isFakeIdRejection(result);
}
