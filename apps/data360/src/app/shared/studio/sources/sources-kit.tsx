'use client';

/**
 * sources-kit — the shared vocabulary of the Sources views (Connections /
 * Objects in use): formatters that render '—' rather than a fake 0, the
 * family/status words, and the copyable physical path. Presentational only.
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const FAMILY_LABELS: Record<string, string> = {
  warehouse: 'Warehouse & lakehouse',
  database: 'Databases',
  // the backend says 'object_storage' on /studio/sources and 'cloud_storage'
  // on the catalog — same family, one label for both spellings
  object_storage: 'Files & storage',
  cloud_storage: 'Files & storage',
  saas_application: 'Applications & SaaS',
  api: 'APIs & code',
  events: 'Event streams',
  media: 'Documents & media',
};

export function familyLabel(family?: string | null): string {
  if (!family) return '—';
  return FAMILY_LABELS[family] ?? family.replace(/_/g, ' ');
}

/**
 * Brand rule: never show vendor names in customer-facing PROSE — a
 * backend-seeded connection name like « Snowflake (session) » must render
 * neutrally. It must never touch an IDENTIFIER: a database really named
 * SNOWFLAKE_INTELLIGENCE stays as-is (the user matches it against their
 * own warehouse), so only a standalone vendor word is neutralised.
 */
export function neutralLabel(label?: string | null): string {
  if (!label) return '';
  const looksLikeIdentifier = /[._:]/.test(label) || /^[A-Z0-9_]+$/.test(label);
  if (looksLikeIdentifier) return label;
  return label
    .replace(/\bsnowflake\b/gi, 'your warehouse')
    .replace(/\bcortex\b/gi, 'AI')
    .replace(/\bkimi\b/gi, 'AI');
}

export const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  available: { label: 'ready', tone: 'text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'partially ready', tone: 'text-amber-600 dark:text-amber-400' },
  to_configure: { label: 'to configure', tone: 'text-slate-500 dark:text-slate-400' },
  not_integrated: { label: 'not integrated yet', tone: 'text-slate-400 dark:text-slate-500' },
};

export function fmtCount(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

export function fmtBytes(n?: number | null): string {
  if (n == null) return '—';
  if (n === 0) return '0 KB';
  // a 500-byte table is « 1 KB », never a fake « 0 KB »
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** The physical path, copyable in one click — a fiche header requirement:
 *  business name on top, the exact technical path always within reach. */
export function CopyableFqn({ fqn }: { fqn: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={fqn}>
        {fqn}
      </span>
      <button
        type="button"
        aria-label={`Copy the physical path ${fqn}`}
        onClick={() => {
          void navigator.clipboard?.writeText(fqn).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-slate-200"
      >
        {copied ? (
          <Check aria-hidden className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy aria-hidden className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

/** Sortable column header — a plain button, aria-sort on the th. */
export function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: { field: string; dir: 'asc' | 'desc' };
  onSort: (field: string) => void;
}) {
  const active = sort.field === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:text-slate-300"
      >
        {label}
        {active && <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

/** Prev/next pagination over an already-bounded list — the requirement is a
 *  legible list, not infinite scroll; page size keeps rows scannable. */
export function Pager({
  page,
  pageCount,
  onPage,
  total,
  shown,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  total: number;
  shown: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <button
        type="button"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        className="rounded-lg border border-slate-200 px-2 py-0.5 disabled:opacity-40 dark:border-slate-700"
      >
        Previous
      </button>
      <span className="tabular-nums">
        page {page + 1} of {pageCount} · {shown} of {total}
      </span>
      <button
        type="button"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        className="rounded-lg border border-slate-200 px-2 py-0.5 disabled:opacity-40 dark:border-slate-700"
      >
        Next
      </button>
    </div>
  );
}
