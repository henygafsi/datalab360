'use client';

import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import Breadcrumb from '@/components/ui/Breadcrumb';
import DependenciesCard from '@/app/shared/observability/dependencies-card';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';

/**
 * Standalone object-dependencies route (upstream/downstream lineage + full
 * dependency graph). Backed by /observability/dependencies and
 * /observability/dependencies/graph. DependenciesCard owns its async states.
 */
export default function DependencyGraphPage() {
  // Fire-and-forget PAGE_VIEW on mount/route change (DependenciesCard does not track).
  useTrackEvent();
  // DependenciesCard is prop-less and self-fetching, so a keyed remount is the
  // minimal way to re-pull it when the backend pushes an observability/lineage
  // cache-invalidation (probe checks). Mirrors the main dashboard's SSE pattern
  // via the global atom (one shared connection).
  const [resetKey, setResetKey] = useState(0);
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant = lastInvalidation.keys.some(
      (k: string) =>
        k === CACHE_KEYS.OBSERVABILITY_DASHBOARD || k === CACHE_KEYS.DATA_LINEAGE,
    );
    if (relevant) setResetKey((k) => k + 1);
  }, [lastInvalidation]);

  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'Dependencies', href: '/observability/dependencies' },
        ]}
      />
      <FreshnessDisclaimer
        className="mb-4"
        detail="Dependencies come from the data warehouse's ACCOUNT_USAGE.OBJECT_DEPENDENCIES, which is delayed (typically up to a few hours). Newly created objects may not appear immediately."
      />
      <DependenciesCard key={resetKey} />
    </div>
  );
}
