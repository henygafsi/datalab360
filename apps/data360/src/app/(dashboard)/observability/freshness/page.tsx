'use client';

import Breadcrumb from '@/components/ui/Breadcrumb';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import FreshnessProbePanel from './FreshnessProbePanel';

/**
 * Standalone Freshness Probes route. Surfaces the /observability/probes/* row-
 * timestamp endpoints (table / schema / platform / changes) plus the org-accounts
 * CDC enable/status hook as a data-steward control. Unlike lineage/dependencies,
 * row-timestamp probes read METADATA$ROW_LAST_MODIFIED_AT live (not ACCESS_HISTORY),
 * so they are near-real-time — the disclaimer below clarifies that distinction.
 */
export default function FreshnessProbesPage() {
  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'Freshness Probes', href: '/observability/freshness' },
        ]}
      />
      <FreshnessDisclaimer
        className="mb-4"
        detail="Row-timestamp probes read METADATA$ROW_LAST_MODIFIED_AT directly, so they reflect the latest committed write (near real-time) — unlike lineage, which lags via ACCOUNT_USAGE. Change tracking must be enabled on a table for its row timestamp to be available."
      />
      <FreshnessProbePanel />
    </div>
  );
}
