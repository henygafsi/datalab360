import ProjectDashboard from '@/app/shared/project-dashboard';

import { metaObject } from '@/config/site.config';
import ProjectDashboardTracker from './page-view-tracker';
import AiBuildLauncher from '@/app/shared/chat/AiBuildLauncher';
import DeploymentBoard from './components/DeploymentBoard';

export const metadata = {
  ...metaObject('Project Management Dashboard'),
};

export default function ProjectDashboardPage() {
  return (
    <>
      <ProjectDashboardTracker />
      {/* Chat-first creation: opens the docked chat panel on the AI-build view */}
      <AiBuildLauncher />
      <ProjectDashboard />
      {/* All-projects deployment overview — read-only lifecycle status board.
          Wrapped in @container so the board's container-query breakpoints
          resolve against this section's width. */}
      <section className="@container mt-6 3xl:mt-8">
        <DeploymentBoard />
      </section>
    </>
  );
}
