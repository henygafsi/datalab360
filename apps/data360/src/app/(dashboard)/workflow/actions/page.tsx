'use client';

/**
 * Workflow › Actions — every builder capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog (GET /workflow/actions).
 * This is the "all capabilities as actions" visibility surface for the
 * Workflow builder: build / validate / run / observe / schedule / govern, the
 * full pipeline lifecycle discoverable in one place. Mirrors the AI / E&D /
 * Admin / Governance / Projects action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import WorkflowActionSurface from '../components/WorkflowActionSurface';

export default function WorkflowActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Workflow actions"
          subtitle="Every builder capability as a governed action — search, run read-only checks inline, open the builder for changes. Contracts are verified against real endpoints."
        />
        <WorkflowActionSurface />
      </div>
    </ErrorBoundary>
  );
}
