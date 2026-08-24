'use client';

/**
 * Connect › Actions — every ingestion capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog (GET /connect/actions).
 * This is the "all capabilities as actions" visibility surface for Connect:
 * discover / stages / cloud storage / databases / lakehouse / APIs /
 * pipelines, the full ingestion estate discoverable in one place. Mirrors the
 * AI / E&D / Admin / Governance / Projects / Workflow action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ConnectActionSurface from '../ConnectActionSurface';

export default function ConnectActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Connect actions"
          subtitle="Every ingestion capability as a governed action — search, run read-only checks inline, open the cockpit for changes. Contracts are verified against real endpoints."
        />
        <ConnectActionSurface />
      </div>
    </ErrorBoundary>
  );
}
