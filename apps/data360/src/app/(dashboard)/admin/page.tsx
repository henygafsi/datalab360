/**
 * Administration landing index (`/admin`).
 *
 * `/admin` had no page of its own, so navigating to it (breadcrumbs, stray
 * deep-links, the route registry) returned a 404. The card grid routes into
 * the real `/admin/*` sub-pages; below it, the live platform-usage panel
 * (per-module success rates + most active users) gives the landing real
 * operational data instead of links alone.
 *
 * Server component shell; ActivityDashboard is a self-contained client panel
 * with its own loading/empty/error states.
 */
import Link from 'next/link';
import {
  ArrowRight,
  Settings2,
  Gauge,
  SlidersHorizontal,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { routes } from '@/config/routes';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ActivityDashboard from './ActivityDashboard';

interface AdminCard {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const ADMIN_CARDS: AdminCard[] = [
  {
    label: 'Config Data360',
    description: 'Metadata, tables, date columns, cache & refresh',
    href: routes.data360Config.view,
    icon: Settings2,
  },
  {
    label: 'Performance',
    description: 'Per-account drill-down: endpoints, users, cache, modules, errors',
    href: routes.adminPerformance.view,
    icon: Gauge,
  },
  {
    label: 'Platform Settings',
    description: 'Platform-wide configuration entries, refresh & reset controls',
    href: routes.adminPlatformSettings.view,
    icon: SlidersHorizontal,
  },
  {
    label: 'API Health',
    description: 'Live route prober — endpoint reachability & response health',
    href: routes.adminApiHealth.view,
    icon: Activity,
  },
];

export default function AdminLandingPage() {
  return (
    <AdminRouteGuard surface="The Administration area">
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
          Administration
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Platform configuration and operational health. Pick a surface below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ADMIN_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[hsl(var(--primary))]/40 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-[hsl(var(--primary))]/10 group-hover:text-[hsl(var(--primary))] dark:bg-slate-800 dark:text-slate-400">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {c.label}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{c.description}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 transition-colors group-hover:text-[hsl(var(--primary))]">
                Open
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>

      <ActivityDashboard />
    </div>
    </AdminRouteGuard>
  );
}
