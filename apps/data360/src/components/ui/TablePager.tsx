'use client';

/**
 * Table standardization primitives (2026-07-11 workflow + intelligent
 * refactor) — mirrors the shared AuditTable pattern
 * (app/shared/command-center/AuditTable.tsx): pageSize ~25 when long, sticky
 * header, compact footer with Prev/Next. Use these to retrofit EXISTING
 * custom-markup tables without rewriting them:
 *
 *   · usePagedRows(rows)   — client-side pagination state (25/page default);
 *   · <TablePager/>        — the AuditTable-style footer (hidden when 1 page);
 *   · <PagedDataTable/>    — a full generic rows-of-objects table (sticky
 *     header + pagination + uniform density) for raw query/result grids.
 */

import React, { useEffect, useMemo, useState } from 'react';

export function usePagedRows<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  // New data resets to the first page.
  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  const visible = useMemo(
    () => rows.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [rows, safePage, pageSize],
  );

  return { visible, page: safePage, totalPages, setPage, total: rows.length };
}

export function TablePager({
  page,
  totalPages,
  total,
  onPage,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div
      className={`flex items-center justify-between border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400 ${className ?? ''}`}
    >
      <span>
        {total} row{total === 1 ? '' : 's'} · page {page + 1}/{totalPages}
      </span>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="rounded px-2 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="rounded px-2 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800"
        >
          Next ›
        </button>
      </span>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

/**
 * Generic result grid — sticky header, uniform density, paginated at 25.
 * The standard treatment for raw query/prediction/preview row sets.
 */
export function PagedDataTable({
  rows,
  columns,
  pageSize = 25,
  maxHeightClass = 'max-h-[420px]',
  emptyLabel = 'No data',
}: {
  rows: Array<Record<string, unknown>>;
  columns?: string[];
  pageSize?: number;
  maxHeightClass?: string;
  emptyLabel?: string;
}) {
  const cols = useMemo(
    () => (columns && columns.length ? columns : rows.length ? Object.keys(rows[0]) : []),
    [columns, rows],
  );
  const pager = usePagedRows(rows, pageSize);

  if (!rows.length || !cols.length) {
    return <p className="py-6 text-center text-xs text-gray-400">{emptyLabel}</p>;
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <div className={`overflow-auto ${maxHeightClass}`}>
        <table className="w-full min-w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pager.visible.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
              >
                {cols.map((c) => (
                  <td
                    key={c}
                    className="max-w-[280px] truncate whitespace-nowrap px-3 py-1.5 text-gray-700 dark:text-gray-300"
                    title={formatCell(row[c])}
                  >
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePager
        page={pager.page}
        totalPages={pager.totalPages}
        total={pager.total}
        onPage={pager.setPage}
      />
    </div>
  );
}
