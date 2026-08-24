'use client';

/**
 * Data Quality › Actions — every steward capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog
 * (GET /data-quality/actions): checks / metric lifecycle / monitors /
 * anomalies / reports, the full quality estate discoverable in one place.
 * Mirrors the AI / E&D / Admin / Governance / Projects / Workflow / Connect
 * action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import DataQualityActionSurface from '../components/DataQualityActionSurface';

export default function DataQualityActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Data Quality actions"
          subtitle="Every quality capability as a governed action — search, run read-only checks inline, open the DQ page for changes. Contracts are verified against real endpoints."
        />
        <DataQualityActionSurface />
      </div>
    </ErrorBoundary>
  );
}
