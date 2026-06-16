'use client';

import Breadcrumb from '@/components/ui/Breadcrumb';
import TrustCenterCard from '@/app/shared/observability/trust-center-card';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';

/**
 * Standalone Trust Center route. Findings/summary are read from
 * /observability/trust-center/*; TrustCenterCard owns its own loading / empty /
 * error states and surfaces backend failures inline.
 */
export default function TrustCenterPage() {
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
      <TrustCenterCard />
    </div>
  );
}
