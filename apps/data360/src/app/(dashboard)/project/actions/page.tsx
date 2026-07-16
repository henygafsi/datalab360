'use client';

/**
 * Project › Actions — every project-lifecycle capability surfaced as a governed,
 * verifiable action from the registry-in-tables catalog (GET /projects/actions).
 * This is the "all capabilities as actions" visibility surface for Projects: it
 * makes every project feature discoverable in one place — including the ones
 * that had endpoints but no button (contributors, deployment approve/reject/
 * execute/rollback, RLS bind/unbind, data-product publish/subscribe/refresh)
 * and the data-product edit/delete the audit flagged (honestly labelled as
 * roadmap, never a dead button). Mirrors the AI / E&D / Admin / Governance
 * action pages.
 */

import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ProjectsActionSurface from '../components/ProjectsActionSurface';

export default function ProjectActionsPage() {
  return (
    <ErrorBoundary>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Project actions"
          subtitle="Every project capability as a governed action — search, run read-only checks inline, open the dashboard for changes. Live capabilities are verified against real endpoints; roadmap ones are labelled honestly."
        />
        <ProjectsActionSurface />
      </div>
    </ErrorBoundary>
  );
}
