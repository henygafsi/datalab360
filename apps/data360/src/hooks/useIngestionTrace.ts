'use client';

/**
 * useIngestionTrace — ONE bulk, account-global ingestion trace, hydrated after
 * first paint and exposed as an O(1) `lookup(db,schema,table)`.
 *
 * Design constraints (surfacing job):
 *  · ONE fetch total per hook instance → call this ONCE high in the tree
 *    (explore-design page.tsx), never inside a list row. Rows receive `lookup`
 *    as a prop and do a pure `Map.get` — no per-row fetch (no N+1).
 *  · Fire-and-forget, fail-soft: a failure leaves an empty map; list render is
 *    never blocked on it (hydrate AFTER first paint).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getIngestionTrace,
  ingestionKey,
  type IngestionTraceEntry,
  type IngestionTraceMap,
} from '@/app/services/explore-design/ingestionTrace';

export interface UseIngestionTrace {
  /** O(1) per-table lookup. Returns null when no trace exists for the table. */
  lookup: (db?: string | null, schema?: string | null, table?: string | null) => IngestionTraceEntry | null;
  /** True while the single bulk fetch is in flight. Never blocks list render. */
  loading: boolean;
  /** Manual refresh (also re-runs on `days` change). */
  refresh: () => void;
}

export function useIngestionTrace(days = 7): UseIngestionTrace {
  const [map, setMap] = useState<IngestionTraceMap>(() => new Map());
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchTrace = useCallback(() => {
    setLoading(true);
    // fire-and-forget — getIngestionTrace itself is fail-soft (returns empty map).
    void getIngestionTrace(days)
      .then((next) => {
        if (mountedRef.current) setMap(next);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [days]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTrace();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchTrace]);

  const lookup = useCallback(
    (db?: string | null, schema?: string | null, table?: string | null): IngestionTraceEntry | null => {
      if (!db || !schema || !table) return null;
      return map.get(ingestionKey(db, schema, table)) ?? null;
    },
    [map],
  );

  return { lookup, loading, refresh: fetchTrace };
}
