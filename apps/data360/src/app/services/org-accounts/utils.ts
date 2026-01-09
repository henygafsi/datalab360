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

export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
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

export function getCloudIcon(cloud: string): string {
  switch (cloud) {
    case 'AWS':
      return '🔶';
    case 'AZURE':
      return '🔷';
    case 'GCP':
      return '🔴';
    default:
      return '☁️';
  }
}

export function getCloudColor(cloud: string): string {
  switch (cloud) {
    case 'AWS':
      return '#ff9900';
    case 'AZURE':
      return '#0078d4';
    case 'GCP':
      return '#4285f4';
    default:
      return '#6b7280';
  }
}

export function getEditionColor(edition: string): string {
  switch (edition) {
    case 'BUSINESS_CRITICAL':
      return '#ef4444';
    case 'ENTERPRISE':
      return '#3b82f6';
    case 'STANDARD':
      return '#6b7280';
    default:
      return '#9ca3af';
  }
}

export function getAlertIcon(type: string): string {
  switch (type) {
    case 'critical':
      return '🔴';
    case 'warning':
      return '🟡';
    case 'security':
      return '🔒';
    case 'info':
      return '🔵';
    default:
      return '⚪';
  }
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
