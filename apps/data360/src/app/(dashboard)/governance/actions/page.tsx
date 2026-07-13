'use client';

/**
 * Governance › Actions — every steward capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog (GET /gouvernance/
 * actions). This is the "all capabilities as actions" visibility surface: it
 * makes every governance feature discoverable in one place — including the
 * capabilities that had endpoints but no button, and the compliance/consent
 * write-layer that's still on the roadmap (honestly labelled, never a dead
 * button). Mirrors the AI / E&D / Administration action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import GovernanceActionSurface from '../components/GovernanceActionSurface';

export default function GovernanceActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Governance actions"
          subtitle="Every governance capability as a governed action — search, run read-only checks inline, open the page for changes. Live capabilities are verified against real endpoints; roadmap ones are labelled honestly."
        />
        <GovernanceActionSurface />
      </div>
    </ErrorBoundary>
  );
}
