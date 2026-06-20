'use client';

import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * usePagination — page a row array WITHOUT scroll. Returns the current page
 * slice + the controls state for <Pager/>. Resets to page 0 when the row
 * count or pageSize changes (e.g. after a filter), so you never land on an
 * out-of-range page. Use with <Pager/> to give every admin table a clean,
 * responsive, scroll-free pager instead of a `max-h … overflow-auto` box.
 */
export function usePagination<T>(rows: readonly T[], pageSize = 12) {
  const [page, setPage] = useState(0);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Keep page in range when rows/pageSize change (filter, reload, view switch).
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const slice = useMemo(
    () => rows.slice(page * pageSize, page * pageSize + pageSize),
    [rows, page, pageSize],
  );

  return {
    page,
    setPage,
    pageCount,
    total,
    slice,
    from: total === 0 ? 0 : page * pageSize + 1,
    to: Math.min(total, (page + 1) * pageSize),
  };
}

interface PagerProps {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPage: (p: number) => void;
  className?: string;
  /** Noun for the count line, e.g. "endpoints", "rows". */
  unit?: string;
}

/** Compact, responsive pager bar: "1–12 of 240 rows · ‹ 1/20 ›". No scroll. */
export default function Pager({
  page,
  pageCount,
  total,
  from,
  to,
  onPage,
  className,
  unit = 'rows',
}: PagerProps) {
  if (total === 0) return null;
  const btn =
    'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors enabled:hover:bg-slate-100 enabled:hover:text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:enabled:hover:bg-slate-800 dark:enabled:hover:text-slate-200';
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-[11px] text-slate-500 dark:text-slate-400',
        className,
      )}
    >
      <span className="tabular-nums">
        {from}–{to} of {total.toLocaleString()} {unit}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={btn}
            disabled={page <= 0}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className={btn}
            disabled={page >= pageCount - 1}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
