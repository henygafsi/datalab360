'use client';

/**
 * AuditTable — a self-contained audit grid that DETECTS its own filters from the
 * data columns (the account-overview port of the BI dashboard's smart-filter
 * idea: "detect filters from queries / metadata"). Given a list of row objects it:
 *   - classifies each column as date / categorical / numeric / text by name + values,
 *   - renders auto-detected categorical multi-selects + a date-range (for the first
 *     detected date column) + a free-text search,
 *   - filters the rows client-side and renders the result.
 *
 * Reusable across every Account-Overview tab so the static global filter header
 * can be retired in favour of per-tab, data-driven filters that actually filter
 * the tab's data.
 */

import { useEffect, useMemo, useState } from 'react';

export type Row = Record<string, unknown>;

type ColKind = 'date' | 'categorical' | 'numeric' | 'text';

const DATE_NAME = /(^|_)(date|time|timestamp|created|updated|last|_at|_on)($|_)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function classify(col: string, values: unknown[]): ColKind {
  const nonNull = values.filter((v) => v != null && v !== '');
  if (nonNull.length === 0) return 'text';
  const sample = nonNull.slice(0, 40);
  const isDate =
    DATE_NAME.test(col) ||
    sample.every((v) => typeof v === 'string' && ISO_DATE.test(v as string));
  if (isDate) return 'date';
  if (sample.every((v) => typeof v === 'number')) return 'numeric';
  const distinct = new Set(nonNull.map((v) => String(v)));
  if (distinct.size > 1 && distinct.size <= 25) return 'categorical';
  return 'text';
}

function prettify(key: string): string {
  return key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof v === 'string' && ISO_DATE.test(v)) return v.slice(0, 19).replace('T', ' ');
  return String(v);
}

interface DetectedFilter {
  col: string;
  kind: ColKind;
  options?: string[]; // categorical
}

export default function AuditTable({
  rows,
  columns,
  title,
  subtitle,
  pageSize,
  maxCols = 8,
}: {
  rows: Row[];
  columns?: string[];
  title?: string;
  subtitle?: string;
  /** When set, paginate to this many rows/page (compact footer). Omit = full table. */
  pageSize?: number;
  maxCols?: number;
}) {
  const cols = useMemo(() => {
    if (columns && columns.length) return columns;
    return rows.length ? Object.keys(rows[0]) : [];
  }, [columns, rows]);

  // Detect filterable columns from the data.
  const detected: DetectedFilter[] = useMemo(() => {
    if (!rows.length) return [];
    const out: DetectedFilter[] = [];
    for (const c of cols) {
      const values = rows.map((r) => r[c]);
      const kind = classify(c, values);
      if (kind === 'categorical') {
        const options = Array.from(new Set(values.filter((v) => v != null && v !== '').map((v) => String(v)))).sort();
        out.push({ col: c, kind, options });
      } else if (kind === 'date') {
        out.push({ col: c, kind });
      }
    }
    // Cap to the 5 most useful filters (categoricals first, then first date).
    return out.sort((a, b) => (a.kind === 'categorical' ? -1 : 1) - (b.kind === 'categorical' ? -1 : 1)).slice(0, 5);
  }, [rows, cols]);

  const [selected, setSelected] = useState<Record<string, string>>({}); // col -> chosen value ('' = all)
  const [dateFrom, setDateFrom] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Active filters reset pagination to the first page.
  useEffect(() => {
    setPage(0);
  }, [selected, dateFrom, search]);

  const filtered = useMemo(() => {
    let out = rows;
    for (const [col, val] of Object.entries(selected)) {
      if (val) out = out.filter((r) => String(r[col] ?? '') === val);
    }
    for (const [col, from] of Object.entries(dateFrom)) {
      if (from) out = out.filter((r) => String(r[col] ?? '') >= from);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => cols.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
    }
    return out;
  }, [rows, selected, dateFrom, search, cols]);

  // Full table — no internal scroll, no row/column cap, no height limit.
  // Show every column and every (filtered) row; the page itself scrolls.
  // When `pageSize` is set we additionally cap rows-per-page (still no scroll).
  const shownCols = cols;
  const hasFilters = detected.length > 0;

  const paginate = pageSize != null && pageSize > 0;
  const totalPages = paginate ? Math.max(1, Math.ceil(filtered.length / pageSize!)) : 1;
  const safePage = Math.min(page, totalPages - 1);
  const visible = paginate ? filtered.slice(safePage * pageSize!, (safePage + 1) * pageSize!) : filtered;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      {(title || subtitle) && (
        <div className="mb-2 flex items-baseline justify-between">
          {title && <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>}
          {subtitle && <span className="text-[10px] uppercase tracking-wide text-gray-400">{subtitle}</span>}
        </div>
      )}

      {/* Auto-detected filters */}
      {hasFilters && rows.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {detected.map((f) =>
            f.kind === 'categorical' ? (
              <select
                key={f.col}
                value={selected[f.col] ?? ''}
                onChange={(e) => {
                  setSelected((s) => ({ ...s, [f.col]: e.target.value }));
                }}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                title={`Filter by ${prettify(f.col)}`}
              >
                <option value="">{prettify(f.col)}: all</option>
                {f.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <label key={f.col} className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                {prettify(f.col)} ≥
                <input
                  type="date"
                  value={dateFrom[f.col] ?? ''}
                  onChange={(e) => {
                    setDateFrom((s) => ({ ...s, [f.col]: e.target.value }));
                  }}
                  className="rounded-md border border-gray-200 bg-gray-50 px-1 py-0.5 text-[11px] dark:border-gray-700 dark:bg-gray-800"
                />
              </label>
            )
          )}
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search…"
            className="ml-auto w-32 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">No data</p>
      ) : (
        <>
          <table className="w-full table-auto text-left text-[11px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {shownCols.map((c) => (
                  <th key={c} className="px-2 py-1 font-medium text-gray-500 dark:text-gray-400">
                    {prettify(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  {shownCols.map((c) => (
                    <td key={c} className="px-2 py-1 text-gray-700 dark:text-gray-300">
                      {formatCell(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {paginate && totalPages > 1 ? (
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-[11px] text-gray-500 dark:border-gray-800">
              <span>
                {filtered.length} row{filtered.length === 1 ? '' : 's'} · page {safePage + 1}/{totalPages}
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  className="rounded px-2 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800"
                >
                  ‹ Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="rounded px-2 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800"
                >
                  Next ›
                </button>
              </span>
            </div>
          ) : (
            <div className="mt-2 text-[10px] text-gray-400">
              {filtered.length} row{filtered.length === 1 ? '' : 's'}
              {filtered.length !== rows.length ? ` / ${rows.length}` : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
}
