import ProjectDashboard from '@/app/shared/project-dashboard';

import { metaObject } from '@/config/site.config';
import ProjectDashboardTracker from './page-view-tracker';
import AiBuildLauncher from '@/app/shared/chat/AiBuildLauncher';
import DeploymentBoard from './components/DeploymentBoard';
import ProjectsCockpit from './components/ProjectsCockpit';

export const metadata = {
  ...metaObject('Project Management Dashboard'),
};

export default function ProjectDashboardPage() {
  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1">
        <ProjectDashboardTracker />
        {/* Chat-first creation: opens the docked chat panel on the AI-build view */}
        <AiBuildLauncher />
        <ProjectDashboard />
        {/* Granted-projects deployment overview — read-only lifecycle status
            board. Wrapped in @container so the board's container-query
            breakpoints resolve against this section's width. `id` is the
            cockpit's "Deployment board" jump target. */}
        <section id="deployment-board" className="@container mt-6 scroll-mt-24 3xl:mt-8">
          <DeploymentBoard />
        </section>
      </div>
      {/* Axis right-rail (shared cockpit primitive) — portfolio / deployments /
          activity, all real data (user direction: right bar on every page). */}
      <ProjectsCockpit />
    </div>
  );
}
