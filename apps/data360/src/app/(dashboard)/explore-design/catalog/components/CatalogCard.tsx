'use client';

/**
 * CatalogCard — one object in the Sources/Products grid. All the top-level
 * signal lives on the card: products show domain, status chip, owner and
 * color-bucketed quality/trust mini-scores; sources show type chip, database
 * and the schemas × tables inventory. Numbers never fake: null → '—'.
 */

import React from 'react';
import { Database, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CatalogItem } from './useExploreCatalog';

function scoreClass(v: number | null): string {
  if (v === null || v === undefined) return 'text-slate-400 dark:text-slate-500';
  if (v >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (v >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function fmtScore(v: number | null): string {
  return v === null || v === undefined ? '—' : String(Math.round(v));
}

function statusChipClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'published' || s === 'active' || s === 'certified')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (s === 'draft' || s === 'pending')
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  if (s === 'deprecated' || s === 'archived' || s === 'retired')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300';
}

export default function CatalogCard({
  item,
  selected,
  onSelect,
}: {
  item: CatalogItem;
  selected: boolean;
  onSelect: (item: CatalogItem) => void;
}) {
  const isProduct = item.kind === 'product';
  const p = item.product;
  const s = item.source;

  // Status (product) and type (source) get dedicated chips below — keep the
  // free tag row for the remaining chips only (no duplicates).
  const extraTags = item.tags.filter((t) => {
    if (isProduct) return t !== p?.status && !t.startsWith('owner: ');
    return t !== s?.type;
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-lg border bg-white p-3 text-left transition-colors hover:border-blue-300 dark:bg-slate-800/60 dark:hover:border-blue-700',
        selected
          ? 'border-blue-500 ring-1 ring-blue-500/40 dark:border-blue-500'
          : 'border-slate-200 dark:border-slate-700',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {isProduct ? (
            <Package className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
          ) : (
            <Database className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          )}
          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            {item.name}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
            isProduct
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
          )}
        >
          {isProduct ? 'Product' : 'Source'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {item.projectLabel && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            #{item.projectLabel}
          </span>
        )}
        {isProduct && p?.status && (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize',
              statusChipClass(p.status),
            )}
          >
            {p.status}
          </span>
        )}
        {!isProduct && s?.type && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700/70 dark:text-slate-300">
            {s.type}
          </span>
        )}
        {extraTags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500 dark:bg-slate-700/70 dark:text-slate-300"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500">
        {isProduct ? (
          <>
            <span className="min-w-0 truncate">
              Owner{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {p?.owner || '—'}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span>
                Quality{' '}
                <span className={cn('font-semibold', scoreClass(item.qualityScore))}>
                  {fmtScore(item.qualityScore)}
                </span>
              </span>
              <span>
                Trust{' '}
                <span className={cn('font-semibold', scoreClass(item.trustScore))}>
                  {fmtScore(item.trustScore)}
                </span>
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate">
              DB{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {s?.database || '—'}
              </span>
            </span>
            <span className="shrink-0">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {item.schemaCount ?? '—'}
              </span>{' '}
              schemas ×{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {item.tableCount ?? '—'}
              </span>{' '}
              tables
            </span>
          </>
        )}
      </div>
    </button>
  );
}
