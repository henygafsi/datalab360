/**
 * http-status — runtime HTTP-status helpers for the honest CTA gate.
 *
 * The actionable-insights overlay ([[_actionable-insights-overlay]]) needs ONE
 * authoritative rule: a CTA whose backend route is absent (404) or not-yet-
 * implemented (501) must self-disable — never silently fail, never fake success.
 *
 * Works for both raw `AxiosError` and the wrapped `ServerError` thrown by the
 * api-client interceptor (both expose `.response.status`). Pure, no imports —
 * safe to use in any client component.
 */

/** Best-effort extraction of an HTTP status code from any thrown error shape. */
export function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as {
    response?: { status?: number };
    status?: number;
  };
  return e.response?.status ?? e.status ?? undefined;
}

/** True when the route does not exist on this backend (resource/path absent). */
export function is404(error: unknown): boolean {
  return httpStatus(error) === 404;
}

/** True when the route exists but is not implemented / disabled (stub). */
export function is501(error: unknown): boolean {
  return httpStatus(error) === 501;
}

/**
 * The load-bearing predicate: the action is "unavailable on this backend".
 * 404 (route absent) or 501 (declared-but-disabled) both flip a CTA to its
 * honest disabled state. Everything else is a real error to surface.
 */
export function isUnavailable(error: unknown): boolean {
  const s = httpStatus(error);
  return s === 404 || s === 501;
}

/** True for auth failures (let the app's auth flow handle the redirect). */
export function isAuthStatus(error: unknown): boolean {
  return httpStatus(error) === 401;
}
