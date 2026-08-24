'use client';

/**
 * Sources › Actions — every curator capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog
 * (GET /catalog/actions): explore / object intelligence / smart panel /
 * data products / KPI registry / operations, the full catalog estate
 * discoverable in one place. Mirrors the AI / E&D / Admin / Governance /
 * Projects / Workflow / Connect / DQ action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import CatalogActionSurface from '../components/CatalogActionSurface';

export default function CatalogActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Catalog actions"
          subtitle="Every catalog capability as a governed action — search, run read-only checks inline, open the Sources page for changes. Contracts are verified against real endpoints."
        />
        <CatalogActionSurface />
      </div>
    </ErrorBoundary>
  );
}
