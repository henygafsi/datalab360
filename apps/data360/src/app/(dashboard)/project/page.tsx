import ProjectDashboard from '@/app/shared/project-dashboard';

import { metaObject } from '@/config/site.config';
import ProjectDashboardTracker from './page-view-tracker';
import AiBuildLauncher from '@/app/shared/chat/AiBuildLauncher';

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
    </>
  );
}
