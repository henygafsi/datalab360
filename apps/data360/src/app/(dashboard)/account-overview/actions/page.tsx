'use client';

/**
 * Account-Overview › Actions — every executive capability surfaced as a
 * governed, verifiable action from the registry-in-tables catalog
 * (GET /command-center/actions): executive KPIs / audit trails / cost
 * intelligence / infrastructure / recommendations / project rollups /
 * cache ops. Read-only sweeps run inline with the caller's real role —
 * ACCOUNTADMIN sees the whole estate. Mirrors the other module action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import CcActionSurface from '@/app/shared/command-center/CcActionSurface';

export default function AccountOverviewActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Account-Overview actions"
          subtitle="Every account capability as a governed action — search, run read-only sweeps inline with your role's real access, open Account Overview for changes. Contracts are verified against real endpoints."
        />
        <CcActionSurface />
      </div>
    </ErrorBoundary>
  );
}
