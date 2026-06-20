import type { AxiosError } from 'axios';

/**
 * Normalize an error thrown by an `apiClient` call into a clean, throwable Error
 * that preserves the underlying HTTP status and the original axios response.
 *
 * Why this exists:
 * Many service wrappers used `throw new Error(error.response?.data?.detail || ...)`.
 * When the backend `detail` is an OBJECT (e.g. `{ error_code, message }`), that produced
 * the literal string `"[object Object]"`, AND the fresh `Error` dropped `error.response`,
 * so callers and the health board lost the real HTTP status + message.
 *
 * Behavior:
 * - Builds a clean string message:
 *   - string `detail`/`data`            → used as-is
 *   - object `detail`/`data`            → `detail.message` || `detail.error?.message` || JSON.stringify(detail)
 *   - otherwise                         → axios `error.message` || `fallbackMsg`
 * - Preserves status + response: when the input is an axios error (has `isAxiosError`/`response`),
 *   the ORIGINAL error is returned with a cleaned `.message` and a `.status` shortcut attached,
 *   so `err.response.status` / `err.status` remain intact for the caller / health board.
 * - For non-axios errors, returns a plain `Error(message)`.
 *
 * Usage: `throw toServiceError(error, 'Failed to ...');`
 */
export function toServiceError(error: unknown, fallbackMsg: string): Error {
  const ax = error as AxiosError<any> | undefined;
  const data = ax?.response?.data;
  // Backend may put the payload under `detail`, or return it directly as `data`.
  const detail = (data && typeof data === 'object' && 'detail' in (data as any)
    ? (data as any).detail
    : data) as unknown;

  let message = fallbackMsg;

  if (typeof detail === 'string' && detail.trim()) {
    message = detail;
  } else if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; error?: { message?: string } };
    message = d.message || d.error?.message || JSON.stringify(detail);
  } else if (ax?.message) {
    message = ax.message;
  }

  // Preserve the original axios error (status + response) when available.
  if (ax && (ax.isAxiosError || ax.response)) {
    ax.message = message;
    (ax as AxiosError & { status?: number }).status = ax.response?.status;
    return ax;
  }

  // Non-axios error (programming error, network throw without response, etc.)
  if (error instanceof Error) {
    error.message = message;
    return error;
  }
  return new Error(message);
}
