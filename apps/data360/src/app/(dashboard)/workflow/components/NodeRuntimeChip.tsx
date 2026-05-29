'use client';

import React from 'react';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RuntimeChipStatus = 'success' | 'failed' | 'running' | 'pending' | undefined;

export interface NodeRuntimeChipProps {
  status?: RuntimeChipStatus;
  duration_ms?: number;
  rows?: number;
}

/**
 * Compact runtime chip rendered in every node header.
 * - Green: success
 * - Amber: success but slow (>5s)
 * - Red: failed
 * - Grey: never run
 *
 * Reads only from the values explicitly provided — never reaches into `data`.
 * Width is capped to ~70px to keep the node header compact.
 */
const NodeRuntimeChip: React.FC<NodeRuntimeChipProps> = ({ status, duration_ms, rows }) => {
  const hasRun = status !== undefined && status !== null;
  const isSuccess = status === 'success';
  const isFailed = status === 'failed';
  const isSlow = isSuccess && typeof duration_ms === 'number' && duration_ms > 5000;

  // Format duration: <1s -> "Xms", 1-60s -> "X.Xs", >=60s -> "Xm Ys"
  const fmt = (ms?: number): string => {
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
  };

  // Build aria-label for screen readers
  const ariaLabel = (() => {
    if (!hasRun) return 'Last run: never run';
    const parts: string[] = ['Last run:'];
    if (typeof duration_ms === 'number') parts.push(fmt(duration_ms));
    if (status) parts.push(status);
    if (typeof rows === 'number') parts.push(`${rows.toLocaleString()} rows`);
    return parts.join(', ');
  })();

  // Status -> tailwind palette
  const palette = !hasRun
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400'
    : isFailed
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      : isSlow
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        : isSuccess
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';

  const Icon = !hasRun ? Clock : isFailed ? AlertCircle : CheckCircle;

  const label = !hasRun
    ? 'Never run'
    : isFailed
      ? 'Failed'
      : typeof duration_ms === 'number'
        ? fmt(duration_ms)
        : status ?? '—';

  // Tooltip on title attr — fast and works without portal
  const title = (() => {
    if (!hasRun) return 'This block has not run yet';
    const lines: string[] = [];
    lines.push(`Status: ${status}`);
    if (typeof duration_ms === 'number') lines.push(`Duration: ${fmt(duration_ms)}`);
    if (typeof rows === 'number') lines.push(`Rows: ${rows.toLocaleString()}`);
    return lines.join(' · ');
  })();

  return (
    <span
      aria-label={ariaLabel}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md',
        'text-[10px] font-medium leading-none',
        'max-w-[70px] whitespace-nowrap overflow-hidden text-ellipsis',
        palette,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
};

export default NodeRuntimeChip;
