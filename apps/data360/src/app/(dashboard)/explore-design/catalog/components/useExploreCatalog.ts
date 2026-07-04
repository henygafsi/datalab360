'use client';

/**
 * useExploreCatalog — consolidated data for the Explore & Design cataloging
 * sub-page (redesign spec §6: Sources vs Products vs tags — NO mindmap).
 *
 * Feeders (all WIRED catalog services): GET /catalog/sources, /catalog/products,
 * /catalog/scores. Each feeder degrades independently (unavailable / error) —
 * partial data renders honestly, missing numbers stay '—'.
 *
 * SOURCE vs PRODUCT derivation: an item is a PRODUCT when it comes from the
 * data-product catalog (published/curated model); everything else surfaced by
 * /catalog/sources is a SOURCE. Source-type tags come from the local tag store
 * (sourceTags — backend write not available yet, read-only here).
 *
 * Refresh: SSE singleton subscription on catalog keys + manual refresh().
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CACHE_KEYS,
  useOnCacheInvalidation,
} from '@/components/providers/CacheInvalidationProvider';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import {
  getCatalogProducts,
  getCatalogScores,
  getCatalogSources,
  type CatalogProduct,
  type CatalogScoresResponse,
} from '@/app/services/catalog';
import { readTag, tagKey } from '@/app/services/catalog/sourceTags';

export type CatalogKind = 'source' | 'product';

/** Unified card model for the catalog grid. */
export interface CatalogItem {
  id: string;
  kind: CatalogKind;
  name: string;
  /** Product domain / source database — rendered as the project chip. */
  projectLabel: string | null;
  /** Free chips: product status/owner, source type, local source-type tag. */
  tags: string[];
  /** Mini-signals (null → '—', never 0-faked). */
  qualityScore: number | null;
  trustScore: number | null;
  /** Source-only counts. */
  schemaCount: number | null;
  tableCount: number | null;
  /** Original records for the detail drawer. */
  product?: CatalogProduct;
  source?: { name: string; type: string; database?: string; schema_count?: number; table_count?: number };
}

export interface ExploreCatalogData {
  items: CatalogItem[];
  scores: CatalogScoresResponse | null;
  loading: boolean;
  /** Hard error (network/5xx) across feeders, if everything failed. */
  error: string | null;
  /** Per-feeder honest degradation flags (404/501 → not available yet). */
  sourcesUnavailable: boolean;
  productsUnavailable: boolean;
  refresh: () => void;
}

const CATALOG_CACHE_KEYS: ReadonlySet<string> = new Set([
  CACHE_KEYS.CATALOG,
  CACHE_KEYS.TAGS,
  CACHE_KEYS.TABLES,
  CACHE_KEYS.DATABASES,
]);

export function useExploreCatalog(): ExploreCatalogData {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [scores, setScores] = useState<CatalogScoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourcesUnavailable, setSourcesUnavailable] = useState(false);
  const [productsUnavailable, setProductsUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [sourcesRes, productsRes, scoresRes] = await Promise.allSettled([
      getCatalogSources(),
      getCatalogProducts(),
      getCatalogScores(),
    ]);

    const next: CatalogItem[] = [];

    if (productsRes.status === 'fulfilled') {
      setProductsUnavailable(false);
      for (const p of productsRes.value.products ?? []) {
        next.push({
          id: `product:${p.product_id}`,
          kind: 'product',
          name: p.name,
          projectLabel: p.domain || null,
          tags: [p.status, p.owner ? `owner: ${p.owner}` : null].filter(Boolean) as string[],
          qualityScore: p.quality_score,
          trustScore: p.trust_score,
          schemaCount: null,
          tableCount: null,
          product: p,
        });
      }
    } else if (isUnavailable(productsRes.reason)) {
      setProductsUnavailable(true);
    }

    if (sourcesRes.status === 'fulfilled') {
      setSourcesUnavailable(false);
      for (const s of sourcesRes.value.sources ?? []) {
        const localTag = s.database ? readTag(tagKey(s.database)) : readTag(tagKey(s.name));
        next.push({
          id: `source:${s.name}`,
          kind: 'source',
          name: s.name,
          projectLabel: s.database || null,
          tags: [s.type, localTag].filter(Boolean) as string[],
          qualityScore: null,
          trustScore: null,
          schemaCount: s.schema_count ?? null,
          tableCount: s.table_count ?? null,
          source: s,
        });
      }
    } else if (isUnavailable(sourcesRes.reason)) {
      setSourcesUnavailable(true);
    }

    if (scoresRes.status === 'fulfilled') {
      setScores(scoresRes.value);
    }

    // Hard error only when BOTH card feeders hard-failed (nothing to show).
    const hardFailures = [sourcesRes, productsRes].filter(
      (r) => r.status === 'rejected' && !isUnavailable(r.reason),
    ) as PromiseRejectedResult[];
    if (hardFailures.length === 2) {
      setError(getApiErrorMessage(hardFailures[0].reason));
    }

    setItems(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useOnCacheInvalidation(CATALOG_CACHE_KEYS, () => {
    void load();
  });

  return {
    items,
    scores,
    loading,
    error,
    sourcesUnavailable,
    productsUnavailable,
    refresh: load,
  };
}
