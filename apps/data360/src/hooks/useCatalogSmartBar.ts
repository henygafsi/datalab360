'use client';

/**
 * useCatalogSmartBar — Données consolidées du SmartRightBar pour une table Snowflake.
 *
 * Ce hook centralise:
 * 1. La récupération parallèle des 6 sections (S1-S6)
 * 2. L'invalidation SSE — se recharge automatiquement quand le backend publie
 *    un événement cache_invalidation sur les CACHE_KEYS pertinents
 * 3. Le tracking des vues (useTrackEvent)
 *
 * Usage:
 *   const { context, governance, lineage, ingestion, ownership, history, isLoading } =
 *     useCatalogSmartBar({ db: 'CP_DATA360', schema: 'SALES', table: 'ORDERS_FACT' });
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_KEYS, useCacheInvalidationSubscription as useCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import {
  getTableContext,
  getTableGovernance,
  getTableLineage,
  getTableIngestion,
  getTableOwnership,
  getTableHistory,
  type TableContext,
  type TableGovernance,
  type TableLineage,
  type TableIngestion,
  type TableOwnership,
  type HistoryEvent,
} from '@/app/services/catalog/rightbar';

interface CatalogSmartBarItem {
  db: string;
  schema: string;
  table: string;
  module?: string;
}

interface CatalogSmartBarData {
  context:    TableContext | null;
  governance: TableGovernance | null;
  lineage:    TableLineage | null;
  ingestion:  TableIngestion | null;
  ownership:  TableOwnership | null;
  history:    HistoryEvent[];
  isLoading:  boolean;
  /** True if at least one section returned data (graceful partial loading). */
  hasData:    boolean;
  /** Manual refetch — also called automatically on SSE invalidation. */
  refetch:    () => void;
}

/** CACHE_KEYS that trigger a refetch of SmartRightBar data. */
const SMARTBAR_CACHE_KEYS = new Set([
  CACHE_KEYS.CATALOG,
  CACHE_KEYS.TAGS,
  CACHE_KEYS.TABLE_GOVERNANCE,
  CACHE_KEYS.TABLE_LINEAGE,
  CACHE_KEYS.TABLE_INGESTION,
  CACHE_KEYS.TABLE_OWNERSHIP,
  CACHE_KEYS.GOVERNANCE_RATE,
  CACHE_KEYS.MASKING_POLICIES,
  CACHE_KEYS.ROW_ACCESS_POLICIES,
  CACHE_KEYS.DATA_LINEAGE,
  CACHE_KEYS.DATA_PROFILES,
  CACHE_KEYS.TABLES,
]);

export function useCatalogSmartBar(item: CatalogSmartBarItem | null): CatalogSmartBarData {
  const { db, schema, table, module = 'catalog' } = item ?? {};
  const { trackFeatureClick } = useTrackEvent();

  const [context,    setContext]    = useState<TableContext | null>(null);
  const [governance, setGovernance] = useState<TableGovernance | null>(null);
  const [lineage,    setLineage]    = useState<TableLineage | null>(null);
  const [ingestion,  setIngestion]  = useState<TableIngestion | null>(null);
  const [ownership,  setOwnership]  = useState<TableOwnership | null>(null);
  const [history,    setHistory]    = useState<HistoryEvent[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);

  // Track the current item to avoid stale state on fast selection changes
  const currentItemRef = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!db || !schema || !table) return;

    const key = `${db}.${schema}.${table}`;
    currentItemRef.current = key;
    setIsLoading(true);

    // Parallel fetch — all 6 sections concurrently
    const [ctx, gov, lin, ing, own, hist] = await Promise.all([
      getTableContext(db, schema, table),
      getTableGovernance(db, schema, table),
      getTableLineage(db, schema, table),
      getTableIngestion(db, schema, table),
      getTableOwnership(db, schema, table),
      getTableHistory(db, schema, table, 5),
    ]);

    // Guard: item may have changed during the async fetch
    if (currentItemRef.current !== key) return;

    setContext(ctx);
    setGovernance(gov);
    setLineage(lin);
    setIngestion(ing);
    setOwnership(own);
    setHistory(hist);
    setIsLoading(false);

    // Track selection as a feature click (fire-and-forget)
    trackFeatureClick('smartbar_table_selected', { module, db, schema, table });
  }, [db, schema, table, module, trackFeatureClick]);

  // Fetch on item change
  useEffect(() => {
    if (!db || !schema || !table) {
      // Reset all sections when no item selected
      setContext(null);
      setGovernance(null);
      setLineage(null);
      setIngestion(null);
      setOwnership(null);
      setHistory([]);
      setIsLoading(false);
      return;
    }
    void fetchAll();
  }, [db, schema, table, fetchAll]);

  // SSE cache invalidation — auto-refetch when relevant cache keys are invalidated
  useCacheInvalidation({
    onInvalidate: (keys) => {
      if (!db || !schema || !table) return;
      const relevant = keys.some((k) => SMARTBAR_CACHE_KEYS.has(k as typeof CACHE_KEYS[keyof typeof CACHE_KEYS]));
      if (relevant) {
        void fetchAll();
      }
    },
  });

  const hasData = Boolean(context ?? governance ?? lineage ?? ingestion ?? ownership ?? history.length);

  return {
    context,
    governance,
    lineage,
    ingestion,
    ownership,
    history,
    isLoading,
    hasData,
    refetch: fetchAll,
  };
}
