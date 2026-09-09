'use client';

/**
 * StudioShell — the Studio's OWN light chrome (Iteration A shell rule).
 *
 * One compact top bar, nothing else: no platform sidebar, no stacked
 * headers, no permanent AI panel, no footer. Navigation is the Studio's
 * three surfaces — Applications, Sources, Administration (admin-gated) —
 * and one quiet way back to the full platform for the expert modules.
 * Content owns the rest of the viewport and scrolls itself.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import StudioCostChip from '@/app/shared/studio/StudioCostChip';
import { isAdminRole } from '@/config/constants';
import { routes } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: routes.studio, label: 'Applications', exactish: true },
  { href: routes.studioSource, label: 'Sources', exactish: false },
] as const;

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const { username, role } = useAuth();
  const admin = isAdminRole(role);

  const isActive = (href: string, exactish: boolean) =>
    exactish
      ? pathname === href || pathname.startsWith('/studio/apps') || pathname === '/studio/new'
      : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-white/95 px-4 py-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <Link
          href={routes.studio}
          className="shrink-0 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
        >
          DATA<span className="text-accent-600">360</span>{' '}
          <span className="font-normal text-slate-400 dark:text-slate-500">Studio</span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Studio">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href, n.exactish) ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                isActive(n.href, n.exactish)
                  ? 'bg-accent-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {n.label}
            </Link>
          ))}
          {admin && (
            <Link
              href={routes.studioAdmin}
              aria-current={pathname.startsWith(routes.studioAdmin) ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                pathname.startsWith(routes.studioAdmin)
                  ? 'bg-accent-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Administration
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <StudioCostChip />
          <Link
            href={routes.accountOverview ?? '/account-overview'}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            title="The expert platform modules stay one click away."
          >
            Full platform
            <ArrowUpRight aria-hidden className="h-3 w-3" />
          </Link>
          <span
            aria-label={`Signed in as ${username || 'user'}`}
            title={username || undefined}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-xs font-semibold uppercase text-white"
          >
            {(username || '?').slice(0, 1)}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
