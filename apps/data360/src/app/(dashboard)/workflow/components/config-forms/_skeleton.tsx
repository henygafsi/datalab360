'use client';

/**
 * Loading skeleton shown while a lazy-loaded ETL config form is being fetched.
 *
 * Rendered as the `loading` prop of `next/dynamic` imports in
 * `ETLConfigSidebar.tsx`. The 50-150ms shimmer is intentional — it masks the
 * lazy-load and keeps the right sidebar visually anchored.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface ConfigFormSkeletonProps {
  /** Block type the form will configure (used for the visible label). */
  type?: string;
}

const Row: React.FC<{ width: string }> = ({ width }) => (
  <div className="space-y-1.5">
    <div className={cn('h-3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse', width)} />
    <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 animate-pulse" />
  </div>
);

const ConfigFormSkeleton: React.FC<ConfigFormSkeletonProps> = ({ type }) => (
  <div className="space-y-4" aria-busy="true" aria-label={`Loading ${type ?? 'block'} configuration`}>
    {type && (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Loading <span className="font-mono">{type}</span> configuration…
      </p>
    )}
    <Row width="w-20" />
    <Row width="w-24" />
    <Row width="w-16" />
  </div>
);

export default ConfigFormSkeleton;
