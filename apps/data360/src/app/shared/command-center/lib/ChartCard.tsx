'use client';

/**
 * ChartCard — the single thin wrapper for every chart / table of the
 * Account Overview reporting surface.
 *
 * Guarantees:
 *  - uniform card chrome (border, padding, title row, freshness chip);
 *  - one fixed-height body shared by ALL states (ready / loading /
 *    preparing / error / empty) → zero layout shift on transitions;
 *  - no page-level horizontal overflow: wide children scroll inside
 *    their own overflow-x container.
 */

import React from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { getApiErrorMessage } from '@/lib/api-client';
import type { AoMeta } from './meta';
import FreshnessChip from './FreshnessChip';
import PreparingState from './PreparingState';

export type ChartCardState = 'ready' | 'loading' | 'preparing' | 'error' | 'empty';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Per-response freshness meta (AO-001) — rendered as a FreshnessChip. */
  meta?: AoMeta | null;
  state?: ChartCardState;
  /** Raw error (Axios or otherwise) — summarized via getApiErrorMessage. */
  error?: unknown;
  emptyTitle?: string;
  emptyHint?: string;
  preparingLabel?: string;
  /** Fixed body height in px — identical across all states. */
  height?: number;
  /** Right-aligned header slot (filters, toggles, menus). */
  actions?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
  children: React.ReactNode;
}

export default function ChartCard({
  title,
  subtitle,
  meta,
  state = 'ready',
  error,
  emptyTitle,
  emptyHint,
  preparingLabel,
  height = 260,
  actions,
  onRetry,
  className = '',
  children,
}: ChartCardProps) {
  const busy = state === 'loading' || state === 'preparing';

  let body: React.ReactNode;
  switch (state) {
    case 'loading':
      body = (
        <div className="absolute inset-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
          <span className="sr-only">Loading</span>
        </div>
      );
      break;
    case 'preparing':
      body = (
        <div className="absolute inset-0 flex items-center justify-center">
          <PreparingState domainLabel={preparingLabel} />
        </div>
      );
      break;
    case 'error': {
      const detail = error != null ? getApiErrorMessage(error) : null;
      body = (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center"
        >
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Couldn&apos;t load this view
          </p>
          {detail && (
            <p
              className="line-clamp-2 max-w-sm text-xs text-slate-500 dark:text-slate-400"
              title={detail}
            >
              {detail}
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 rounded-md bg-accent-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
            >
              Retry
            </button>
          )}
        </div>
      );
      break;
    }
    case 'empty':
      body = (
        <div className="absolute inset-0 flex items-center justify-center">
          <EmptyState compact title={emptyTitle ?? 'No data yet'} description={emptyHint} />
        </div>
      );
      break;
    default:
      body = <div className="h-full w-full overflow-x-auto">{children}</div>;
  }

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </h3>
          {subtitle && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {meta ? <FreshnessChip meta={meta} /> : null}
          {actions}
        </div>
      </div>
      <div
        aria-busy={busy || undefined}
        className="relative overflow-hidden"
        style={{ height }}
      >
        {body}
      </div>
    </section>
  );
}
