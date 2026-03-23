'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import apiClient from '@/lib/api-client';

/**
 * Server-side pagination hook for large datasets.
 * Fetches one page at a time from the backend using LIMIT/OFFSET.
 *
 * Usage:
 *   const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } =
 *     useServerPagination('/gouvernance/users', { pageSize: 50 });
 */

export interface ServerPaginationOptions {
  pageSize?: number;
  params?: Record<string, string | number | boolean | undefined>;
  enabled?: boolean;
  transformResponse?: (data: any) => { rows: any[]; total: number };
}

export interface ServerPaginationResult<T = Record<string, any>> {
  data: T[];
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  refresh: () => void;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  setSort: (key: string) => void;
  search: string;
  setSearch: (q: string) => void;
}

export function useServerPagination<T = Record<string, any>>(
  endpoint: string,
  options: ServerPaginationOptions = {},
): ServerPaginationResult<T> {
  const {
    pageSize: defaultPageSize = 50,
    params: extraParams = {},
    enabled = true,
    transformResponse,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearchRaw] = useState('');
  const refreshRef = useRef(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  const setSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortDir('desc');
      }
      return key;
    });
    setPage(1);
  }, []);

  const setSearch = useCallback((q: string) => {
    setSearchRaw(q);
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    refreshRef.current += 1;
    setPage((p) => p); // trigger re-fetch
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const fetchPage = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryParams: Record<string, any> = {
          ...extraParams,
          page,
          page_size: pageSize,
        };
        if (sortKey) {
          queryParams.sort_by = sortKey;
          queryParams.sort_dir = sortDir;
        }
        if (search) {
          queryParams.search = search;
        }

        const response = await apiClient.get(endpoint, { params: queryParams });
        if (cancelled) return;

        if (transformResponse) {
          const { rows, total: t } = transformResponse(response.data);
          setData(rows);
          setTotal(t);
        } else {
          // Standard Data360 response format
          const body = response.data;
          const rows = body.data ?? body.rows ?? body.items ?? body.results ?? [];
          const t = body.pagination?.total ?? body.total ?? body.count ?? rows.length;
          setData(rows);
          setTotal(t);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to load data');
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPage();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, page, pageSize, sortKey, sortDir, search, enabled, refreshRef.current]);

  return {
    data,
    loading,
    error,
    page,
    pageSize,
    total,
    totalPages,
    hasNext,
    hasPrev,
    setPage,
    setPageSize,
    refresh,
    sortKey,
    sortDir,
    setSort,
    search,
    setSearch,
  };
}
