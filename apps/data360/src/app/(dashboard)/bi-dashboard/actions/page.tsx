'use client';

/**
 * BI-Dashboard › Actions — every dashboard capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog
 * (GET /bi-dashboard/actions): build / data / manage / publish & share, the
 * full BI estate discoverable in one place. Mirrors the other module action
 * pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import BiActionSurface from '../components/BiActionSurface';

export default function BiDashboardActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="BI Dashboard actions"
          subtitle="Every dashboard capability as a governed action — search, run read-only checks inline, open the builder for changes. Contracts are verified against real endpoints."
        />
        <BiActionSurface />
      </div>
    </ErrorBoundary>
  );
}
