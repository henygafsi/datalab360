'use client';

import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import Breadcrumb from '@/components/ui/Breadcrumb';
import TrustCenterCard from '@/app/shared/observability/trust-center-card';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';

/**
 * Standalone Trust Center route. Findings/summary are read from
 * /observability/trust-center/*; TrustCenterCard owns its own loading / empty /
 * error states and surfaces backend failures inline.
 */
export default function TrustCenterPage() {
  // TrustCenterCard is prop-less and self-fetching, so a keyed remount is the
  // minimal way to re-pull it when the backend pushes an observability/trust-
  // center cache-invalidation (probe checks). Mirrors the main dashboard's SSE
  // pattern via the global atom (one shared connection).
  const [resetKey, setResetKey] = useState(0);
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant = lastInvalidation.keys.some(
      (k: string) =>
        k === CACHE_KEYS.OBSERVABILITY_DASHBOARD || k === CACHE_KEYS.TRUST_CENTER,
    );
    if (relevant) setResetKey((k) => k + 1);
  }, [lastInvalidation]);

  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'Trust Center', href: '/observability/trust-center' },
        ]}
      />
      <FreshnessDisclaimer
        className="mb-4"
        detail="Trust Center findings are derived from the data warehouse's ACCOUNT_USAGE and security telemetry, which are delayed (typically up to a few hours)."
      />
      <TrustCenterCard key={resetKey} />
    </div>
  );
}
