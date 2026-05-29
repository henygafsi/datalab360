/**
 * Formatting utilities for Organization Accounts
 */

export function formatCredits(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(2)} ${units[i]}`;
}

export function formatStorage(tb: number): string {
  if (tb >= 1000) {
    return `${(tb / 1000).toFixed(2)} PB`;
  }
  if (tb < 0.01) {
    return `${(tb * 1024).toFixed(2)} GB`;
  }
  return `${tb.toFixed(2)} TB`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

export function getHealthColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  return 'text-red-500';
}

export function getHealthBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Extract a human-readable message from a thrown API error (axios-style).
 * Falls back to a generic label so callers can always render an inline error
 * state with the exact backend detail when present.
 */
export function extractApiError(err: unknown, fallback = 'Failed to load data'): string {
  const e = err as { response?: { status?: number; data?: { detail?: string; message?: string } }; message?: string };
  const detail = e?.response?.data?.detail ?? e?.response?.data?.message;
  if (detail) return detail;
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
