import Link from 'next/link';
import { Zap, ArrowRight } from 'lucide-react';

import ProjectDashboard from '@/app/shared/project-dashboard';

import { metaObject } from '@/config/site.config';
import { routes } from '@/config/routes';
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
        {/* "All capabilities as actions" — every project action discoverable in
            one governed, verifiable surface (registry-in-tables). */}
        <Link
          href={routes.project.actions}
          className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 transition hover:border-[hsl(var(--primary))]/40 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Zap className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
          <span className="font-medium text-slate-800 dark:text-slate-100">All project actions</span>
          <span className="hidden text-xs text-slate-400 sm:inline">— lifecycle, deployments, contributors, RLS, data products, as governed actions</span>
          <ArrowRight className="ml-auto h-4 w-4 text-slate-400" aria-hidden />
        </Link>
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
