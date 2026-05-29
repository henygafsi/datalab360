'use client';

import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { Badge } from 'rizzui';
import { Search, Download, ChevronUp, ChevronDown, ArrowUpDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  format?: 'number' | 'date' | 'bytes' | 'duration' | 'percent';
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps {
  data: Record<string, any>[];
  columns?: DataTableColumn[];
  loading?: boolean;
  emptyMessage?: string;
  title?: string;
  searchable?: boolean;
  exportable?: boolean;
  pageSize?: number;
  onRowClick?: (row: Record<string, any>) => void;
  className?: string;
}

const FMT: Record<string, (v: any) => string> = {
  number: (v) => (v == null ? '-' : Number(v).toLocaleString()),
  date: (v) => (v == null ? '-' : new Date(v).toLocaleString()),
  bytes: (v) => {
    if (v == null) return '-';
    const n = Number(v);
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
    return `${(n / 1073741824).toFixed(2)} GB`;
  },
  duration: (v) => {
    if (v == null) return '-';
    const ms = Number(v);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  },
  percent: (v) => (v == null ? '-' : `${Number(v).toFixed(1)}%`),
};

function formatCell(value: any, format?: string): string {
  if (format && FMT[format]) return FMT[format](value);
  if (value == null) return '-';
  return String(value);
}

function autoColumns(data: Record<string, any>[]): DataTableColumn[] {
  if (!data.length) return [];
  return Object.keys(data[0]).map((key) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    sortable: true,
    filterable: true,
  }));
}

const PAGE_SIZES = [10, 25, 50, 100];

export default function DataTable({
  data, columns: colsProp, loading, emptyMessage = 'No data available',
  title, searchable = true, exportable = true, pageSize: defaultPageSize = 25,
  onRowClick, className,
}: DataTableProps) {
  const cols = useMemo(() => colsProp ?? autoColumns(data), [colsProp, data]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const deferredColFilters = useDeferredValue(colFilters);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pgSize, setPgSize] = useState(defaultPageSize);
  const [showColFilters, setShowColFilters] = useState(false);

  // Global search + column filters
  const filtered = useMemo(() => {
    let rows = data;
    if (deferredSearch) {
      const q = deferredSearch.toLowerCase();
      rows = rows.filter((r) => cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)));
    }
    return rows.filter((r) =>
      Object.entries(deferredColFilters).every(([k, v]) => {
        if (!v) return true;
        return String(r[k] ?? '').toLowerCase().includes(v.toLowerCase());
      }),
    );
  }, [data, cols, deferredSearch, deferredColFilters]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pgSize));
  const pageData = useMemo(() => sorted.slice(page * pgSize, (page + 1) * pgSize), [sorted, page, pgSize]);

  const onSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  }, [sortKey]);

  const exportCsv = useCallback(() => {
    const hdr = cols.map((c) => c.label).join(',');
    const rows = sorted.map((r) => cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([hdr + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${title || 'export'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [cols, sorted, title]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden', className)}>
        {title && <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"><div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" /></div>}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 flex-1 animate-pulse rounded bg-gray-200 dark:bg-gray-700" style={{ animationDelay: `${(i * 4 + j) * 40}ms` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden', className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5">
        <div className="flex items-center gap-3">
          {title && <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>}
          <Badge size="sm" variant="flat" color="secondary">{sorted.length} rows</Badge>
        </div>
        <div className="flex items-center gap-2">
          {searchable && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="h-8 w-44 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-2 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
          )}
          <button onClick={() => setShowColFilters(!showColFilters)} className={cn('rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300', showColFilters && 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400')}>
            <Filter className="h-4 w-4" />
          </button>
          {exportable && (
            <button onClick={exportCsv} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Export CSV">
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/80">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {cols.map((col) => (
                <th key={col.key} className={cn('py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap', col.align === 'right' ? 'text-right' : 'text-left', col.width)}>
                  {col.sortable ? (
                    <button onClick={() => onSort(col.key)} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200">
                      {col.label}
                      {sortKey === col.key ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
            {showColFilters && (
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {cols.map((col) => (
                  <th key={`f-${col.key}`} className="py-1.5 px-3">
                    {col.filterable ? (
                      <input type="text" placeholder="Filter..." value={colFilters[col.key] || ''}
                        onChange={(e) => { setColFilters((p) => ({ ...p, [col.key]: e.target.value })); setPage(0); }}
                        className="h-7 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {pageData.length === 0 ? (
              <tr><td colSpan={cols.length} className="py-12 text-center text-gray-400 dark:text-gray-500">{emptyMessage}</td></tr>
            ) : pageData.map((row, ri) => (
              <tr key={ri} onClick={() => onRowClick?.(row)}
                className={cn('transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50', onRowClick && 'cursor-pointer')}>
                {cols.map((col) => (
                  <td key={col.key} className={cn('py-2 px-3 text-gray-700 dark:text-gray-300 whitespace-nowrap', col.align === 'right' && 'text-right')}>
                    {col.render ? col.render(row[col.key], row) : formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Rows per page:</span>
            <select value={pgSize} onChange={(e) => { setPgSize(Number(e.target.value)); setPage(0); }}
              className="h-7 rounded border border-gray-200 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{page * pgSize + 1}-{Math.min((page + 1) * pgSize, sorted.length)} of {sorted.length}</span>
            <button disabled={page === 0} onClick={() => setPage(page - 1)}
              className="ml-2 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
              className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
