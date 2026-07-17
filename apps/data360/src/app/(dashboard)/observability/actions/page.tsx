'use client';

/**
 * Observability › Actions — every operator capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog
 * (GET /observability/actions): pulse / cost (FinOps) / performance /
 * lineage / alerts / compliance / freshness probes, the full observability
 * estate discoverable in one place. Mirrors the AI / E&D / Admin /
 * Governance / Projects / Workflow / Connect / DQ / Catalog action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ObsActionSurface from '../components/ObsActionSurface';

export default function ObservabilityActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Observability actions"
          subtitle="Every observability capability as a governed action — search, run read-only checks inline, open the page for changes. Contracts are verified against real endpoints."
        />
        <ObsActionSurface />
      </div>
    </ErrorBoundary>
  );
}
