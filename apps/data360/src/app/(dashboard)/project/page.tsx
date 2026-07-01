import ProjectDashboard from '@/app/shared/project-dashboard';

import { metaObject } from '@/config/site.config';
import ProjectDashboardTracker from './page-view-tracker';

export const metadata = {
  ...metaObject('Project Management Dashboard'),
};

export default function ProjectDashboardPage() {
  return (
    <>
      <ProjectDashboardTracker />
      <ProjectDashboard />
    </>
  );
}
