/**
 * Formatting utilities for Organization Accounts.
 *
 * Backend sends numeric fields as strings ("1234.5") or null/undefined even
 * though types declare `number`. Every formatter coerces + guards so it never
 * crashes on a string/null input; a missing/non-numeric value renders "—"
 * (no fake 0).
 */
import { safeNum } from '@/lib/format-number';

type Numeric = number | string | null | undefined;

export function formatCredits(value: Numeric): string {
  const v = safeNum(value);
  if (v == null) return '—';
  if (v >= 1000000) {
    return `${(v / 1000000).toFixed(2)}M`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1)}K`;
  }
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBytes(bytes: Numeric): string {
  let v = safeNum(bytes);
  if (v == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

export function formatStorage(tb: Numeric): string {
  const v = safeNum(tb);
  if (v == null) return '—';
  if (v >= 1000) {
    return `${(v / 1000).toFixed(2)} PB`;
  }
  if (v < 0.01) {
    return `${(v * 1024).toFixed(2)} GB`;
  }
  return `${v.toFixed(2)} TB`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDuration(ms: Numeric): string {
  const v = safeNum(ms);
  if (v == null) return '—';
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

export function formatNumber(value: Numeric): string {
  const v = safeNum(value);
  if (v == null) return '—';
  if (v >= 1000000) {
    return `${(v / 1000000).toFixed(1)}M`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1)}K`;
  }
  return v.toLocaleString();
}

export function getHealthColor(score: Numeric): string {
  const v = safeNum(score) ?? 0;
  if (v >= 80) return 'text-green-500';
  if (v >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

export function getHealthBgColor(score: Numeric): string {
  const v = safeNum(score) ?? 0;
  if (v >= 80) return 'bg-green-500';
  if (v >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Extract a human-readable message from a thrown API error (axios-style).
 * Falls back to a generic label so callers can always render an inline error
 * state with the exact backend detail when present.
 */
export function extractApiError(err: unknown, fallback = 'Failed to load data'): string {
  const e = err as { response?: { status?: number; data?: { detail?: unknown; message?: unknown } }; message?: string };
  const raw = e?.response?.data?.detail ?? e?.response?.data?.message;
  // `detail` may be a STRUCTURED OBJECT (e.g. a 503 svc/cache state
  // {errorCode, error_code, account, reason, message}) — returning it raw made
  // 15 consumers render an object as a React child ("Objects are not valid as a
  // React child"), crashing client-accounts / cost-governance / etc. Coerce.
  const detail = typeof raw === 'string'
    ? raw
    : (raw && typeof raw === 'object'
        ? ((raw as Record<string, unknown>).detail
          || (raw as Record<string, unknown>).message
          || (raw as Record<string, unknown>).reason)
        : undefined);
  if (typeof detail === 'string' && detail) return detail;
  const status = e?.response?.status;
  if (status === 404 || status === 405) return `${fallback} — endpoint not available (${status}).`;
  if (status) return `${fallback} (HTTP ${status}).`;
  if (e?.message) return `${fallback}: ${e.message}`;
  return fallback;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-green-500';
    case 'warning':
      return 'text-yellow-500';
    case 'critical':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}
