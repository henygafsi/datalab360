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

/**
 * True when a probe surfaced a GENUINE defect (vs an expected validation 4xx).
 * Rule: status==='error' (5xx/network) OR httpStatus 405/408 OR the parsed
 * error code is a known compilation/cancellation failure.
 */
export function isDefect(result?: ProbeResult | null): boolean {
  if (!result) return false;
  if (result.status === 'error') return true;
  if (result.httpStatus === 405 || result.httpStatus === 408) return true;
  const { code } = parseErrorBody(result.errorBody ?? result.error);
  return code != null && DEFECT_CODES.has(code);
}
